-- =============================================================
-- 0031_arreglar_searchpageurl.sql — La URL de la búsqueda no es un negocio
--
-- SÍNTOMA: "Contratistas de techos / miami" (ejecución n8n 6514) trajo 20
-- negocios y sólo entraron 2. Los otros 18 se contaron como "actualizados", y
-- el `detalle` de la 0030 destapó el porqué: cuatro empresas distintas —AR1
-- Roofing, United Roofing Contractors, ROOFING DEL PINAR…— apuntaban todas al
-- MISMO `lead_id`. No eran repetidos: se estaban fusionando.
--
-- CAUSA, y es un fallo que metí yo en la 0029. La clave de negocio de Google
-- Maps se calcula así:
--
--   0025/0027:  apify_txt(it, 'url', 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl')
--   0029:       apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl')
--               ... y sólo después, coalesce(v_maps, apify_txt(it, 'url'))
--
-- Al reordenar los alias para poder distinguir `url` entre Maps y redes, dejé
-- `searchPageUrl` por delante de `url`. Y `searchPageUrl` NO identifica a un
-- negocio: es la página de resultados, idéntica para todo el lote —
--
--   https://www.google.com/maps/search/Contratistas%20de%20techos/@25.78,-80.22,14z
--
-- Los 20 items del lote traían el mismo valor. El primero se insertó y grabó
-- esa URL en `leads.google_maps`; a partir de ahí, el `or lower(trim(
-- l.google_maps)) = lower(trim(v_maps))` del importador hacía que TODOS los
-- demás casaran con él. De ahí "20 encontrados, 2 leads".
--
-- Lo mismo pasó con "arquitectura / New york" (20 items, 1 solo
-- `searchPageUrl`, 1 insertado y 19 "actualizados"). Aquella búsqueda no era
-- ninguna repetición: tenías razón desde el principio.
--
-- QUÉ HACE:
--   1. `searchPageUrl` desaparece como clave de negocio, en el importador y en
--      la huella. `url` recupera la prioridad que tenía en la 0027.
--   2. Limpia las URLs de página de búsqueda que quedaron en `leads`.
--   3. Devuelve a cada lead contaminado sus propios teléfonos y emails, que se
--      habían mezclado con los de las otras empresas fusionadas.
--   4. Recupera los negocios perdidos reprocesando los lotes ya guardados en
--      `lead_imports`. No cuesta ni un crédito de Apify: los datos ya están.
-- =============================================================

begin;

-- --- 1. La huella, sin la página de búsqueda -------------------
-- Nota sobre el orden de alias, para que no se vuelva a romper:
--   `url`          -> la ficha del negocio        SÍ es clave
--   `placeUrl`     -> idem, en otros actores      SÍ
--   `searchPageUrl`-> la página de resultados     NO, es del LOTE, no del item
create or replace function huella_captacion(it jsonb, p_fuente text default 'google_maps')
returns text as $$
declare
  v_place  text;
  v_maps   text;
  v_perfil text;
  v_nombre text;
begin
  v_place  := apify_txt(it, 'placeId', 'place_id', 'placeID');
  v_maps   := apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl');
  v_perfil := apify_txt(it, 'profileUrl', 'perfil_url', 'pageUrl', 'profile_url');

  -- `url` es la ficha de Maps en Google Places y el perfil en los actores de
  -- redes. Igual que en `importar_leads`, decide la fuente del lote.
  if coalesce(p_fuente, 'google_maps') = 'google_maps' then
    v_maps := coalesce(apify_txt(it, 'url'), v_maps);
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

-- --- 2. El importador, con la misma corrección -----------------
-- Sólo cambian las dos líneas de `v_maps`; el resto es la 0030 intacta.
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
    -- 0031: fuera `searchPageUrl`. Es la página de resultados, la misma para
    -- todo el lote: usarla como clave fusionaba 20 negocios en uno.
    v_maps   := apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl');
    v_perfil := apify_txt(it, 'profileUrl', 'perfil_url', 'pageUrl', 'profile_url');

    if coalesce(p_fuente, 'google_maps') = 'google_maps' then
      -- `url` PRIMERO, como en la 0027: es la ficha del negocio concreto.
      v_maps := coalesce(apify_txt(it, 'url'), v_maps);
    else
      v_perfil := coalesce(v_perfil, apify_txt(it, 'url'));
    end if;

    v_huella := huella_captacion(it, p_fuente);

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

    if v_id is null and v_huella is not null then
      select * into v_visto from captacion_vistos where huella = v_huella;
      if found and v_visto.omitir then
        v_descartados := v_descartados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'resultado', 'descartado',
          'motivo', 'ya lo capturaste el ' || to_char(v_visto.primera_vez, 'DD/MM/YYYY') ||
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

-- --- 3. Borrar las URLs de página de búsqueda ------------------
-- La ficha de un negocio siempre lleva `query_place_id=`; la página de
-- resultados, nunca. Ese es el discriminante exacto, no una heurística.
update leads
   set google_maps = null,
       notas = coalesce(notas || E'\n', '') ||
               '[0031] Se quitó el enlace de Google Maps: apuntaba a la página de resultados de la búsqueda, no a la ficha de este negocio.'
 where google_maps like '%/maps/search/%'
   and google_maps not like '%query_place_id=%';

-- Y las huellas equivalentes, que bloquearían lotes enteros en el futuro.
delete from captacion_vistos
 where huella like 'maps:%/maps/search/%'
   and huella not like '%query_place_id=%';

-- --- 4. Devolver a cada lead lo suyo ---------------------------
-- Los leads que absorbieron a los demás tienen `telefonos` y `emails` con los
-- datos de todas las empresas fusionadas: el `array_agg` del UPDATE los fue
-- acumulando. No hay forma de saber de quién era cada uno mirando el lead, así
-- que se reconstruyen desde su propio item del lote, buscado por `place_id`.
with propio as (
  select distinct on (l.id)
         l.id,
         it as item
    from leads l
    join lead_imports li on jsonb_typeof(li.payload) = 'array'
    join lateral jsonb_array_elements(li.payload) it on it ->> 'placeId' = l.place_id
   where l.place_id is not null
     and array_length(l.telefonos, 1) > 1
   order by l.id, li.created_at desc
)
update leads l set
  telefonos = apify_lista(p.item, 'phones', 'phone', 'telefono', 'phoneUnformatted'),
  emails    = apify_lista(p.item, 'emails', 'email', 'emailContacto'),
  telefono  = coalesce(apify_txt(p.item, 'phone', 'telefono'),
                       (apify_lista(p.item, 'phones', 'phone'))[1]),
  email     = (apify_lista(p.item, 'emails', 'email', 'emailContacto'))[1],
  notas     = coalesce(l.notas || E'\n', '') ||
              '[0031] Teléfonos y emails reconstruidos desde su propio resultado de Apify: se habían mezclado con los de otras empresas por el fallo de searchPageUrl.'
  from propio p
 where p.id = l.id;

-- --- 5. Recuperar los negocios perdidos ------------------------
-- Todo lo que Apify devolvió alguna vez está guardado en `lead_imports.payload`.
-- Los que se fusionaron nunca llegaron a tener fila propia, así que se
-- reconocen por no existir ningún lead con su `placeId`. Se reprocesan con la
-- función ya corregida. Cero créditos de Apify: los datos ya están aquí.
create temp table reparar_0031 on commit drop as
select li.created_at, li.fuente, li.consulta, it
  from lead_imports li
  join lateral jsonb_array_elements(li.payload) it on true
 where jsonb_typeof(li.payload) = 'array'
   and it ? 'placeId'
   -- Acotado a las importaciones del 27/08, que son las únicas afectadas: las
   -- de agosto anteriores insertaron bien (20/20, 16+4…). Sin este límite, un
   -- negocio que hubieras borrado DEFINITIVAMENTE hace semanas reviviría aquí,
   -- que es justo lo contrario de lo que pediste.
   and li.created_at >= date '2026-08-27'
   -- Ojo: esto respeta lo que borraste. Un lead en la Papelera SÍ tiene fila
   -- (con `deleted_at`), así que no entra aquí; y si aun así llegara, la
   -- comprobación de "borrado previamente" de la 0027 lo pararía.
   and not exists (select 1 from leads l where l.place_id = it ->> 'placeId');

-- Sus huellas quedaron marcadas como "ya capturado" apuntando al lead
-- equivocado. Hay que soltarlas o el reproceso las descartaría a todas.
delete from captacion_vistos cv
 using reparar_0031 r
 where cv.huella = 'place:' || (r.it ->> 'placeId');

do $$
declare r record;
begin
  for r in
    select fuente, consulta, jsonb_agg(it) as lote
      from reparar_0031
     group by fuente, consulta
  loop
    perform importar_leads(r.lote, r.fuente,
                           coalesce(r.consulta, 'sin consulta') || ' · recuperados (0031)');
  end loop;
end $$;

commit;
