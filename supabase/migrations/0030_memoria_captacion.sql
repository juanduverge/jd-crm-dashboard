-- =============================================================
-- 0030_memoria_captacion.sql — Memoria permanente de captación
--
-- SÍNTOMA: la búsqueda "arquitectura / New york" (ejecución n8n 6491) trajo 20
-- negocios de Apify y sólo apareció 1 lead. Los otros 19 se contaron como
-- "actualizados" y desaparecieron sin explicación: `detalle` volvió vacío,
-- porque hasta ahora sólo se anotaba el motivo de los DESCARTADOS. Desde el
-- CRM sólo se veía "1 lead" y ninguna pista.
--
-- Comprobado en n8n: esos 20 `placeId` no coinciden con ninguno de los 93 de
-- las 5 búsquedas anteriores. Así que "ya existían" era una explicación falsa:
-- casaron con filas de `leads` que habían llegado por otra vía (importación
-- manual de un dataset de Apify) o directamente por un falso positivo.
--
-- QUÉ ARREGLA ESTA MIGRACIÓN, en dos frentes:
--
--   A) TRANSPARENCIA. `detalle` pasa a llevar una entrada por CADA item que no
--      terminó siendo un lead nuevo, con `resultado` + `motivo` + `lead_id`.
--      Nunca más un lote se evapora en silencio: si 19 no aparecen, el resumen
--      de la lista de leads dice cuáles y por qué.
--
--   B) MEMORIA COMPLETA. La deduplicación miraba sólo la tabla `leads`. Eso
--      deja dos agujeros:
--        - un negocio que borraste Y luego vaciaste de la Papelera vuelve a
--          entrar en cada búsqueda, porque ya no queda rastro de él;
--        - un item que Apify devolvió pero que nunca llegó a ser lead (se
--          descartó, o se perdió) no queda registrado en ninguna parte.
--      `captacion_vistos` guarda la huella de TODO lo que Apify ha devuelto
--      alguna vez, con la búsqueda y la fecha en que se vio. Se rellena hacia
--      atrás con el historial entero de `lead_imports`, así que arranca ya
--      sabiendo todo lo capturado desde el primer día.
--
-- Los borrados de la Papelera (soft delete) los sigue interceptando la 0027
-- mirando `leads.deleted_at`; esta migración cubre el borrado DEFINITIVO, con
-- un trigger que marca la huella como omitible antes de que la fila se vaya.
--
-- PARTE DE LA 0029 (perfil_url y fuentes sociales). Aplícalas en orden.
-- =============================================================

begin;

-- --- 1. La huella de un item de Apify --------------------------
/**
 * huella_captacion — clave de negocio canónica de un item de Apify.
 *
 * Es la MISMA prioridad que usa `importar_leads` para buscar en `leads`
 * (place_id > perfil > URL de Maps > nombre+ciudad), extraída a una función
 * para que el relleno histórico y el importador no puedan divergir: si mañana
 * cambia la prioridad, cambia en un solo sitio.
 *
 * El prefijo (`place:`, `perfil:`…) evita que un place_id y una URL que por
 * casualidad coincidan como texto se den por el mismo negocio.
 */
create or replace function huella_captacion(it jsonb, p_fuente text default 'google_maps')
returns text as $$
declare
  v_place  text;
  v_maps   text;
  v_perfil text;
  v_nombre text;
begin
  v_place  := apify_txt(it, 'placeId', 'place_id', 'placeID');
  v_maps   := apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl');
  v_perfil := apify_txt(it, 'profileUrl', 'perfil_url', 'pageUrl', 'profile_url');

  -- `url` es la ficha de Maps en Google Places y el perfil en los actores de
  -- redes. Igual que en `importar_leads`, decide la fuente del lote.
  if coalesce(p_fuente, 'google_maps') = 'google_maps' then
    v_maps := coalesce(v_maps, apify_txt(it, 'url'));
  else
    v_perfil := coalesce(v_perfil, apify_txt(it, 'url'));
  end if;

  if v_place  is not null then return 'place:'  || v_place; end if;
  if v_perfil is not null then return 'perfil:' || lower(trim(v_perfil)); end if;
  if v_maps   is not null then return 'maps:'   || lower(trim(v_maps)); end if;

  v_nombre := apify_txt(it, 'title', 'name', 'empresa', 'businessName',
                            'fullName', 'companyName', 'username');
  if v_nombre is null then return null; end if;

  return 'nom:' || lower(trim(v_nombre)) || '|' ||
         coalesce(lower(trim(apify_txt(it, 'city', 'ciudad', 'locality'))), '');
end;
$$ language plpgsql immutable set search_path = public, pg_temp;

-- --- 2. La memoria ---------------------------------------------
create table if not exists captacion_vistos (
  huella       text primary key,
  empresa      text,
  fuente       text,
  consulta     text,
  lead_id      uuid references leads(id) on delete set null,
  -- `omitir` = "no lo vuelvas a meter aunque no esté en `leads`".
  -- Sólo se pone a true cuando consta que el negocio llegó a tu lista y
  -- después se borró para siempre. Un item que Apify devolvió pero que nunca
  -- llegó a ser lead se queda en false: nunca lo viste, así que merece otra
  -- oportunidad de entrar.
  omitir       boolean not null default false,
  primera_vez  timestamptz not null default now(),
  ultima_vez   timestamptz not null default now(),
  veces        int not null default 1
);

comment on table captacion_vistos is
  'Huella de todo lo que Apify ha devuelto alguna vez, aunque el lead ya no exista. Es el historial que consulta importar_leads para no repetir capturas.';
comment on column captacion_vistos.omitir is
  'true = ya estuvo en la lista y se borró definitivamente; no debe volver. Bórrale la fila para permitir que vuelva a entrar.';

create index if not exists ix_captacion_vistos_lead on captacion_vistos (lead_id);

alter table captacion_vistos enable row level security;
-- Sólo la función (security definer) y el service_role escriben aquí; la app
-- lo lee para poder explicar "esto ya lo viste el día X".
drop policy if exists captacion_vistos_lectura on captacion_vistos;
create policy captacion_vistos_lectura on captacion_vistos for select to authenticated using (true);

-- --- 3. Relleno con el historial entero ------------------------
-- Recorre TODOS los lotes guardados en `lead_imports` desde el primer día, del
-- más antiguo al más nuevo, para que `primera_vez` y `consulta` queden en la
-- búsqueda que de verdad lo vio primero.
with historico as (
  select li.created_at,
         li.fuente,
         li.consulta,
         jsonb_array_elements(li.payload) as it
    from lead_imports li
   where jsonb_typeof(li.payload) = 'array'
   order by li.created_at asc
),
huellas as (
  select huella_captacion(it, fuente) as huella,
         apify_txt(it, 'title', 'name', 'empresa', 'businessName',
                       'fullName', 'companyName', 'username') as empresa,
         fuente, consulta, created_at
    from historico
   where huella_captacion(it, fuente) is not null
),
agrupadas as (
  select huella,
         (array_agg(empresa  order by created_at asc))[1] as empresa,
         (array_agg(fuente   order by created_at asc))[1] as fuente,
         (array_agg(consulta order by created_at asc))[1] as consulta,
         min(created_at) as primera_vez,
         max(created_at) as ultima_vez,
         count(*)::int   as veces
    from huellas
   group by huella
)
insert into captacion_vistos (huella, empresa, fuente, consulta, lead_id, omitir, primera_vez, ultima_vez, veces)
select a.huella, a.empresa, a.fuente, a.consulta,
       l.id,
       -- Nunca `true` en el relleno: no hay forma de saber si un item huérfano
       -- se borró de verdad o si es víctima del fallo que motiva esta
       -- migración. Ante la duda, se le deja volver a entrar.
       false,
       a.primera_vez, a.ultima_vez, a.veces
  from agrupadas a
  -- LATERAL con `limit 1` y no un LEFT JOIN a secas: si una huella casara con
  -- dos leads (un activo y uno en la Papelera, por ejemplo) el join duplicaría
  -- la fila y el `on conflict` elegiría al azar cuál se queda. Aquí se elige a
  -- propósito: gana el activo, y entre iguales el más antiguo.
  left join lateral (
    select l.id
      from leads l
     where (a.huella like 'place:%'  and l.place_id = substring(a.huella from 7))
        or (a.huella like 'perfil:%' and lower(trim(l.perfil_url))  = substring(a.huella from 8))
        or (a.huella like 'maps:%'   and lower(trim(l.google_maps)) = substring(a.huella from 6))
     order by l.deleted_at nulls first, l.created_at asc
     limit 1
  ) l on true
on conflict (huella) do nothing;

-- --- 4. El borrado definitivo deja rastro ----------------------
/**
 * Cuando una fila de `leads` se borra de verdad (vaciar Papelera), el
 * `on delete set null` de arriba dejaría la huella sin dueño y con
 * `omitir = false`: el negocio volvería a entrar en la siguiente búsqueda,
 * que es justo lo que no se quiere. Este trigger lo marca antes.
 */
create or replace function marcar_visto_borrado() returns trigger as $$
begin
  update captacion_vistos set omitir = true, lead_id = null
   where lead_id = old.id;
  return old;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_marcar_visto_borrado on leads;
create trigger trg_marcar_visto_borrado
  before delete on leads
  for each row execute function marcar_visto_borrado();

-- --- 5. Anotar en la memoria -----------------------------------
/**
 * anotar_visto — deja constancia de que este negocio pasó por una búsqueda.
 *
 * Se llama para TODOS los items recorridos, entren o no en `leads`: la gracia
 * de la memoria es precisamente recordar también lo que no entró.
 *
 * `omitir` no se toca aquí nunca: sólo lo pone a true el trigger de borrado
 * definitivo. Y `lead_id` se conserva si ya lo había — un descarte posterior
 * no debe borrar el vínculo con el lead que sí llegó a crearse.
 */
create or replace function anotar_visto(
  p_huella   text,
  p_empresa  text,
  p_fuente   text,
  p_consulta text,
  p_lead_id  uuid
) returns void as $$
begin
  if p_huella is null then return; end if;

  insert into captacion_vistos (huella, empresa, fuente, consulta, lead_id)
  values (p_huella, p_empresa, p_fuente, p_consulta, p_lead_id)
  on conflict (huella) do update set
    ultima_vez = now(),
    veces      = captacion_vistos.veces + 1,
    empresa    = coalesce(captacion_vistos.empresa, excluded.empresa),
    lead_id    = coalesce(captacion_vistos.lead_id, excluded.lead_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- --- 6. El importador, con memoria y con explicaciones ---------
/**
 * importar_leads — inserta o actualiza un lote completo de prospectos.
 *
 * Contrato con n8n sin cambios:
 *   { "p_lote": <array>, "p_fuente": "instagram", "p_consulta": "..." }
 *
 * Cambios respecto a la 0029:
 *   - Consulta `captacion_vistos` cuando el negocio NO está en `leads`: si
 *     consta que estuvo y se borró definitivamente, se omite y se dice cuándo
 *     se vio por primera vez y en qué búsqueda.
 *   - `detalle` lleva una entrada por cada item que no acabó siendo un lead
 *     nuevo, con `resultado` ('actualizado' | 'omitido' | 'descartado') además
 *     del `motivo` de siempre.
 *   - Cada item recorrido queda anotado en `captacion_vistos`.
 *
 * Intacto lo demás: borrados de la 0027, mapeo social y `*_source` de la 0026,
 * `perfil_url` y alias de redes de la 0029.
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
  v_huella      text;
  v_visto       captacion_vistos%rowtype;
  v_emails      text[];
  v_telefonos   text[];
  v_ig          text;
  v_fb          text;
  v_li          text;
  v_yt          text;
  v_tt          text;
  v_tw          text;
  v_pi          text;
  v_tiene_redes boolean;
  v_id          uuid;
  v_borrado     boolean;
  v_nueva       boolean;
begin
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' then
    raise exception 'importar_leads espera un array JSON (recibido: %)',
      coalesce(jsonb_typeof(p_lote), 'null');
  end if;

  for it in select * from jsonb_array_elements(p_lote) loop
    v_recibidos := v_recibidos + 1;

    -- En redes el nombre puede venir como `fullName` (perfil) o `username`
    -- (si no hay nombre real): se acepta el handle antes que descartar.
    v_empresa := apify_txt(it, 'title', 'name', 'empresa', 'businessName',
                               'fullName', 'companyName', 'username');
    if v_empresa is null then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object(
        'resultado', 'descartado',
        'motivo', 'sin nombre de empresa',
        'item', it);
      continue;
    end if;

    v_place  := apify_txt(it, 'placeId', 'place_id', 'placeID');
    v_maps   := apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl');
    v_perfil := apify_txt(it, 'profileUrl', 'perfil_url', 'pageUrl', 'profile_url');

    -- `url` es ambiguo entre actores: en Google Places es la ficha de Maps,
    -- en los de redes es el perfil. Se decide por la fuente del lote.
    if coalesce(p_fuente, 'google_maps') = 'google_maps' then
      v_maps := coalesce(v_maps, apify_txt(it, 'url'));
    else
      v_perfil := coalesce(v_perfil, apify_txt(it, 'url'));
    end if;

    v_huella := huella_captacion(it, p_fuente);

    -- Con `scrapeContacts` estos llegan en plural; sin él, sólo el escalar.
    v_emails    := apify_lista(it, 'emails', 'email', 'emailContacto', 'businessEmail');
    v_telefonos := apify_lista(it, 'phones', 'phone', 'telefono', 'phoneUnformatted', 'businessPhoneNumber');

    v_ig := (apify_lista(it, 'instagrams', 'instagram', 'instagramUrl'))[1];
    v_fb := (apify_lista(it, 'facebooks', 'facebook', 'facebookUrl'))[1];
    v_li := (apify_lista(it, 'linkedIns', 'linkedIn', 'linkedin', 'linkedinUrl'))[1];
    v_yt := (apify_lista(it, 'youtubes', 'youtube', 'youtubeUrl'))[1];
    v_tt := (apify_lista(it, 'tiktoks', 'tiktok', 'tiktokUrl'))[1];
    v_tw := (apify_lista(it, 'twitters', 'twitter', 'twitterUrl', 'x'))[1];
    v_pi := (apify_lista(it, 'pinterests', 'pinterest'))[1];
    v_tiene_redes := coalesce(v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi) is not null;

    -- 0027: la búsqueda NO filtra por deleted_at, porque el índice único
    -- tampoco los ve. Si hay un activo y un borrado, gana el activo.
    select l.id, (l.deleted_at is not null)
      into v_id, v_borrado
      from leads l
     where ( (v_place  is not null and l.place_id = v_place)
          or (v_perfil is not null and lower(trim(l.perfil_url)) = lower(trim(v_perfil)))
          or (v_maps   is not null and lower(trim(l.google_maps)) = lower(trim(v_maps)))
          or (v_place is null and v_perfil is null and v_maps is null
              and lower(l.empresa) = lower(v_empresa)
              and coalesce(lower(l.ciudad), '') = coalesce(lower(apify_txt(it, 'city', 'ciudad')), '')) )
     order by l.deleted_at nulls first, l.created_at asc
     limit 1;

    -- RESUCITAR: para que un lead borrado vuelva al reencontrarlo, sustituye
    -- este bloque por:  update leads set deleted_at = null where id = v_id;
    -- y deja que siga al UPDATE de abajo.
    if v_id is not null and v_borrado then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object(
        'resultado', 'descartado',
        'motivo', 'borrado previamente',
        'lead_id', v_id,
        'empresa', v_empresa);
      perform anotar_visto(v_huella, v_empresa, p_fuente, p_consulta, null);
      continue;
    end if;

    -- No está en `leads`. Antes de darlo por nuevo, la memoria: puede que
    -- estuviera y lo vaciaras de la Papelera.
    if v_id is null and v_huella is not null then
      select * into v_visto from captacion_vistos where huella = v_huella;
      if found and v_visto.omitir then
        v_descartados := v_descartados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'resultado', 'descartado',
          'motivo', 'borrado definitivamente el ' || to_char(v_visto.ultima_vez, 'DD/MM/YYYY') ||
                    coalesce(' (búsqueda: ' || v_visto.consulta || ')', ''),
          'empresa', v_empresa);
        perform anotar_visto(v_huella, v_empresa, p_fuente, p_consulta, null);
        continue;
      end if;
    end if;

    v_nueva := v_id is null;

    if v_nueva then
      insert into leads (
        empresa, place_id, google_maps, perfil_url, nicho, categoria, ciudad, pais, codigo_pais,
        direccion, telefono, telefono_2, telefonos, email, emails, web,
        instagram, facebook, linkedin, youtube, tiktok, twitter, pinterest,
        rating_google, num_resenas, latitud, longitud, horario, seguidores, bio, fuente,
        email_source, phone_source, social_source
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
        v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi,
        apify_num(it, 'totalScore', 'rating', 'ratingGoogle'),
        coalesce(apify_num(it, 'reviewsCount', 'numResenas', 'userRatingCount'), 0)::int,
        apify_num(it, 'lat', 'latitude'),
        apify_num(it, 'lng', 'longitude'),
        it -> 'openingHours',
        apify_num(it, 'followersCount', 'followers', 'seguidores')::int,
        apify_txt(it, 'biography', 'bio', 'description', 'descripcion'),
        coalesce(p_fuente, 'google_maps'),
        case when v_emails[1] is not null then 'apify_contacts' end,
        case when v_telefonos[1] is not null then 'apify_places' end,
        case when v_tiene_redes then 'apify_contacts' end
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
        instagram     = coalesce(l.instagram, v_ig),
        facebook      = coalesce(l.facebook, v_fb),
        linkedin      = coalesce(l.linkedin, v_li),
        youtube       = coalesce(l.youtube,   v_yt),
        tiktok        = coalesce(l.tiktok,    v_tt),
        twitter       = coalesce(l.twitter,   v_tw),
        pinterest     = coalesce(l.pinterest, v_pi),
        bio           = coalesce(l.bio, apify_txt(it, 'biography', 'bio', 'description', 'descripcion')),
        -- Datos vivos: se refrescan en cada pasada.
        rating_google = coalesce(apify_num(it, 'totalScore', 'rating'), l.rating_google),
        num_resenas   = coalesce(apify_num(it, 'reviewsCount', 'userRatingCount')::int, l.num_resenas),
        seguidores    = coalesce(apify_num(it, 'followersCount', 'followers')::int, l.seguidores),
        latitud       = coalesce(l.latitud, apify_num(it, 'lat', 'latitude')),
        longitud      = coalesce(l.longitud, apify_num(it, 'lng', 'longitude')),
        horario       = coalesce(l.horario, it -> 'openingHours'),
        email_source  = case when l.email is null and l.email_contacto is null and v_emails[1] is not null
                             then 'apify_contacts' else l.email_source end,
        phone_source  = case when l.telefono is null and v_telefonos[1] is not null
                             then 'apify_places' else l.phone_source end,
        social_source = case when coalesce(l.instagram, l.facebook, l.linkedin) is null and v_tiene_redes
                             then 'apify_contacts' else l.social_source end,
        updated_at    = now()
      where l.id = v_id;
      v_actualizados := v_actualizados + 1;

      -- ÉSTE es el agujero que hacía invisible el caso "20 encontrados, 1
      -- lead": un actualizado no crea fila nueva en la lista, así que sin
      -- esta anotación el usuario no tiene forma de saber dónde fue a parar.
      v_detalle := v_detalle || jsonb_build_object(
        'resultado', 'actualizado',
        'motivo', 'ya estaba en tu lista',
        'lead_id', v_id,
        'empresa', v_empresa);
    end if;

    perform anotar_visto(v_huella, v_empresa, p_fuente, p_consulta, v_id);
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
