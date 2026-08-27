-- =============================================================
-- 0029_importar_leads_multifuente.sql — Captación desde redes sociales
--
-- CONTEXTO: la 0025 construyó `importar_leads` pensando en un único actor de
-- Apify (Google Places). Su clave de negocio es `place_id` y, en su defecto,
-- la URL de Google Maps. Las fuentes que ahora abre el CRM —LinkedIn,
-- Instagram, Facebook y la búsqueda web— NO devuelven ninguna de las dos.
--
-- Sin esta migración, importar de esas fuentes cae al último recurso de la
-- 0025: casar por (empresa + ciudad). Eso significa que un perfil de
-- Instagram sin ciudad se duplica en cada búsqueda, y que dos negocios
-- homónimos de la misma ciudad se fusionan en uno. Es decir: la captación
-- desde redes "funciona" pero ensucia la base a cada pasada.
--
-- QUÉ HACE:
--   1. `perfil_url`: la URL del perfil de origen (instagram.com/x,
--      facebook.com/x, linkedin.com/company/x, o la web encontrada en
--      Google). Es la clave de negocio natural de esas fuentes: única,
--      estable y presente siempre.
--   2. Índice único parcial sobre ella, con el mismo criterio que la 0025
--      (`where deleted_at is null`, para no bloquear recaptar un archivado).
--   3. Reescribe `importar_leads` para usarla como clave y para mapear los
--      campos que sí traen las redes (seguidores, bio, handle).
--
-- Compatible hacia atrás: Google Maps sigue entrando exactamente igual.
-- =============================================================

begin;

-- --- 1. La clave de negocio de las fuentes sociales ------------
alter table leads
  add column if not exists perfil_url  text,
  add column if not exists seguidores  int,
  add column if not exists bio         text;

comment on column leads.perfil_url is
  'URL del perfil de origen (IG/FB/LinkedIn/web). Clave de negocio para importar desde fuentes sin place_id.';
comment on column leads.seguidores is
  'Seguidores del perfil social, cuando la fuente los expone. Señal de tamaño del negocio.';
comment on column leads.bio is
  'Biografía/descripción del perfil social. Suele contener el email de contacto.';

-- Deduplicar antes de crear el índice: si ya se importó algo con perfil_url
-- por otra vía, el índice fallaría. Misma convención que la 0025: se archiva
-- el más nuevo y se conserva el original con su historial.
with dup as (
  select id,
         row_number() over (
           partition by lower(trim(perfil_url))
           order by created_at asc, id asc
         ) as n
    from leads
   where deleted_at is null
     and perfil_url is not null
     and trim(perfil_url) <> ''
)
update leads l
   set deleted_at = now(),
       notas = coalesce(l.notas || E'\n', '') ||
               '[0029] Duplicado por perfil de origen repetido; se conserva el registro original.'
  from dup
 where dup.id = l.id
   and dup.n > 1;

create unique index if not exists uq_leads_perfil_url
  on leads (lower(trim(perfil_url)))
  where perfil_url is not null and trim(perfil_url) <> '' and deleted_at is null;

-- --- 2. El importador, ahora multifuente -----------------------
/**
 * importar_leads — inserta o actualiza un lote completo de prospectos.
 *
 * Sin cambios en el contrato con n8n:
 *   { "p_lote": <array>, "p_fuente": "instagram", "p_consulta": "..." }
 *
 * Lo que cambia respecto a la 0025:
 *   - Acepta `profileUrl` / `perfil_url` como clave de negocio, con
 *     prioridad place_id > perfil_url > URL de Maps > (empresa+ciudad).
 *   - Mapea los alias que usan los actores de redes: `username`/`handle`
 *     para el perfil, `fullName` para el nombre, `biography`/`bio`,
 *     `externalUrl`/`websiteUrl` para la web, `businessEmail` y
 *     `businessPhoneNumber` (Instagram sólo los da en cuentas de empresa).
 *
 * Sigue siendo idempotente y sigue sin pisar nunca lo escrito a mano.
 */
create or replace function importar_leads(
  p_lote     jsonb,
  p_fuente   text default 'google_maps',
  p_consulta text default null
) returns jsonb as $$
declare
  it            jsonb;
  v_recibidos   int := 0;
  v_insertados  int := 0;
  v_actualizados int := 0;
  v_descartados int := 0;
  v_detalle     jsonb := '[]'::jsonb;
  v_import_id   uuid;
  v_empresa     text;
  v_place       text;
  v_maps        text;
  v_perfil      text;
  v_emails      text[];
  v_telefonos   text[];
  v_id          uuid;
  v_nueva       boolean;
begin
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' then
    raise exception 'importar_leads espera un array JSON (recibido: %)',
      coalesce(jsonb_typeof(p_lote), 'null');
  end if;

  for it in select * from jsonb_array_elements(p_lote) loop
    v_recibidos := v_recibidos + 1;

    -- `empresa` es not null: sin nombre no hay lead. En redes el nombre
    -- puede venir como `fullName` (perfil) o `username` (si no hay nombre
    -- real); se acepta el handle antes que descartar el prospecto.
    v_empresa := apify_txt(it, 'title', 'name', 'empresa', 'businessName',
                               'fullName', 'companyName', 'username');
    if v_empresa is null then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object('motivo', 'sin nombre de empresa', 'item', it);
      continue;
    end if;

    v_place  := apify_txt(it, 'placeId', 'place_id', 'placeID');
    v_maps   := apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl');
    v_perfil := apify_txt(it, 'profileUrl', 'perfil_url', 'pageUrl', 'linkedinUrl', 'profile_url');

    -- `url` es ambiguo entre actores: en Google Places es la ficha de Maps,
    -- en los de redes es el perfil. Se asigna según la fuente en vez de
    -- meterlo a ciegas en `google_maps` (que dispararía el enlace "ver en
    -- Maps" de la ficha hacia una URL de Instagram).
    if p_fuente = 'google_maps' then
      v_maps := coalesce(v_maps, apify_txt(it, 'url'));
    else
      v_perfil := coalesce(v_perfil, apify_txt(it, 'url'));
    end if;

    select array_agg(distinct lower(e)) into v_emails
      from (
        select jsonb_array_elements_text(coalesce(it -> 'emails', '[]'::jsonb)) as e
        union
        select apify_txt(it, 'email', 'emailContacto', 'businessEmail')
         where apify_txt(it, 'email', 'emailContacto', 'businessEmail') is not null
      ) s where e is not null and e <> '';

    select array_agg(distinct t) into v_telefonos
      from (
        select jsonb_array_elements_text(coalesce(it -> 'phones', '[]'::jsonb)) as t
        union select apify_txt(it, 'phone', 'telefono', 'businessPhoneNumber')
               where apify_txt(it, 'phone', 'telefono', 'businessPhoneNumber') is not null
        union select apify_txt(it, 'phoneUnformatted')
               where apify_txt(it, 'phoneUnformatted') is not null
      ) s where t is not null and t <> '';

    -- Clave de negocio, por orden de fiabilidad.
    select l.id into v_id
      from leads l
     where l.deleted_at is null
       and ( (v_place  is not null and l.place_id = v_place)
          or (v_perfil is not null and lower(trim(l.perfil_url)) = lower(trim(v_perfil)))
          or (v_maps   is not null and lower(trim(l.google_maps)) = lower(trim(v_maps)))
          or (v_place is null and v_perfil is null and v_maps is null
              and lower(l.empresa) = lower(v_empresa)
              and coalesce(lower(l.ciudad), '') = coalesce(lower(apify_txt(it, 'city', 'ciudad')), '')) )
     order by l.created_at asc
     limit 1;

    v_nueva := v_id is null;

    if v_nueva then
      insert into leads (
        empresa, place_id, google_maps, perfil_url, nicho, categoria, ciudad, pais, codigo_pais,
        direccion, telefono, telefono_2, telefonos, email, emails, web,
        instagram, facebook, linkedin, rating_google, num_resenas,
        latitud, longitud, horario, seguidores, bio, fuente
      ) values (
        v_empresa, v_place, v_maps, v_perfil,
        apify_txt(it, 'nicho', 'categoryName', 'category', 'industry'),
        apify_txt(it, 'categoryName', 'category', 'industry'),
        apify_txt(it, 'city', 'ciudad', 'locality'),
        apify_txt(it, 'country', 'pais', 'countryCode'),
        apify_txt(it, 'countryCode'),
        apify_txt(it, 'address', 'direccion', 'street', 'location'),
        coalesce(apify_txt(it, 'phone', 'telefono', 'businessPhoneNumber'), v_telefonos[1]),
        apify_txt(it, 'phoneUnformatted'),
        v_telefonos,
        v_emails[1],
        v_emails,
        apify_txt(it, 'website', 'web', 'url_website', 'externalUrl', 'websiteUrl'),
        apify_txt(it, 'instagram', 'instagramUrl'),
        apify_txt(it, 'facebook', 'facebookUrl'),
        apify_txt(it, 'linkedIn', 'linkedin', 'linkedinUrl'),
        apify_num(it, 'totalScore', 'rating', 'ratingGoogle'),
        coalesce(apify_num(it, 'reviewsCount', 'numResenas', 'userRatingCount'), 0)::int,
        apify_num(it, 'lat', 'latitude'),
        apify_num(it, 'lng', 'longitude'),
        it -> 'openingHours',
        apify_num(it, 'followersCount', 'followers', 'seguidores')::int,
        apify_txt(it, 'biography', 'bio', 'description', 'descripcion'),
        coalesce(p_fuente, 'google_maps')
      )
      returning id into v_id;
      v_insertados := v_insertados + 1;
    else
      update leads l set
        place_id      = coalesce(l.place_id, v_place),
        google_maps   = coalesce(l.google_maps, v_maps),
        perfil_url    = coalesce(l.perfil_url, v_perfil),
        categoria     = coalesce(l.categoria, apify_txt(it, 'categoryName', 'category', 'industry')),
        ciudad        = coalesce(l.ciudad, apify_txt(it, 'city', 'ciudad', 'locality')),
        pais          = coalesce(l.pais, apify_txt(it, 'country', 'pais', 'countryCode')),
        codigo_pais   = coalesce(l.codigo_pais, apify_txt(it, 'countryCode')),
        direccion     = coalesce(l.direccion, apify_txt(it, 'address', 'direccion', 'street', 'location')),
        telefono      = coalesce(l.telefono, apify_txt(it, 'phone', 'telefono', 'businessPhoneNumber'), v_telefonos[1]),
        telefono_2    = coalesce(l.telefono_2, apify_txt(it, 'phoneUnformatted')),
        telefonos     = (select array_agg(distinct x) from unnest(coalesce(l.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) x),
        email         = coalesce(l.email, v_emails[1]),
        emails        = (select array_agg(distinct x) from unnest(coalesce(l.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) x),
        web           = coalesce(l.web, apify_txt(it, 'website', 'web', 'externalUrl', 'websiteUrl')),
        instagram     = coalesce(l.instagram, apify_txt(it, 'instagram', 'instagramUrl')),
        facebook      = coalesce(l.facebook, apify_txt(it, 'facebook', 'facebookUrl')),
        linkedin      = coalesce(l.linkedin, apify_txt(it, 'linkedIn', 'linkedin', 'linkedinUrl')),
        bio           = coalesce(l.bio, apify_txt(it, 'biography', 'bio', 'description', 'descripcion')),
        -- Datos vivos: se refrescan en cada pasada.
        rating_google = coalesce(apify_num(it, 'totalScore', 'rating'), l.rating_google),
        num_resenas   = coalesce(apify_num(it, 'reviewsCount', 'userRatingCount')::int, l.num_resenas),
        seguidores    = coalesce(apify_num(it, 'followersCount', 'followers')::int, l.seguidores),
        latitud       = coalesce(l.latitud, apify_num(it, 'lat', 'latitude')),
        longitud      = coalesce(l.longitud, apify_num(it, 'lng', 'longitude')),
        horario       = coalesce(l.horario, it -> 'openingHours'),
        updated_at    = now()
      where l.id = v_id;
      v_actualizados := v_actualizados + 1;
    end if;
  end loop;

  insert into lead_imports (fuente, consulta, recibidos, insertados, actualizados, descartados, detalle, payload)
  values (p_fuente, p_consulta, v_recibidos, v_insertados, v_actualizados, v_descartados, v_detalle, p_lote)
  returning id into v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'recibidos', v_recibidos,
    'insertados', v_insertados,
    'actualizados', v_actualizados,
    'descartados', v_descartados,
    'detalle', v_detalle
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function importar_leads(jsonb, text, text) from public, anon;
grant execute on function importar_leads(jsonb, text, text) to authenticated, service_role;

commit;
