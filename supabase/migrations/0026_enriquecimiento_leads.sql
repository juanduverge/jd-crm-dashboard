-- =============================================================
-- 0026_enriquecimiento_leads.sql — Enriquecimiento de prospectos
--
-- CONTEXTO (ver docs/AUDITORIA_ENRIQUECIMIENTO_LEADS.md):
--
-- La 0025 creó el sitio donde guardar lo que Apify entrega (`emails[]`,
-- `telefonos[]`, `telefono_2`, `latitud`…) y el punto de entrada único
-- `importar_leads`. Esas columnas siguen vacías por una razón que NO estaba
-- en la base de datos: el nodo de Apify de la Fase 1 nunca pide los
-- contactos. El body que envía es
--
--     { searchStringsArray, locationQuery, maxCrawledPlacesPerSearch, language }
--
-- y el actor `compass~crawler-google-places` sólo devuelve emails y perfiles
-- sociales si recibe `scrapeContacts: true`. No es un fallo de mapeo: el dato
-- no existe en la respuesta. Con ese flag activo el actor pasa a devolver
-- `emails[]`, `phones[]`, `instagrams[]`, `facebooks[]`, `linkedIns[]`,
-- `youtubes[]`, `tiktoks[]`, `twitters[]` y `pinterests[]` — todos en PLURAL
-- y como arrays, que es lo que esta migración enseña a leer.
--
-- QUÉ HACE:
--
--  1. Añade las redes que faltaban (youtube, tiktok, twitter, pinterest) y
--     `redes_extra` para lo que no encaje en una columna.
--  2. Añade procedencia por dato (`*_source`, `last_enriched_at`,
--     `enrichment_status`): saber de dónde salió un email es la diferencia
--     entre confiar en él y volver a comprobarlo a mano.
--  3. Enseña a `importar_leads` a leer los arrays plurales de `scrapeContacts`.
--  4. Crea `enriquecer_lead`, la hermana de `importar_leads` para la segunda
--     pasada (n8n descarga la web del negocio y extrae lo que Apify no vio).
--     Misma regla: SÓLO rellena huecos. Un resultado vacío jamás borra un dato
--     existente — el fallo que hoy tiene el workflow de Fase 2, que escribe ""
--     sobre el Facebook y el WhatsApp que ya había.
--  5. Crea `leads_para_enriquecer`, para que n8n no tenga que decidir a quién
--     le toca: pregunta y recibe la lista.
--
-- NOTA SOBRE WHATSAPP: no se infiere NUNCA. No existe forma legítima de saber
-- si un número tiene WhatsApp (la API oficial no lo ofrece y sondear wa.me
-- viola los TOS). Sólo se guarda cuando la empresa lo publica ella misma en su
-- web (enlace wa.me / chat.whatsapp.com / wa.link), y queda registrado en
-- `whatsapp_source` de dónde se sacó. Sin enlace público, el campo se queda
-- vacío.
-- =============================================================

begin;

-- --- 1. Redes que faltaban -------------------------------------
alter table leads
  add column if not exists youtube     text,
  add column if not exists tiktok      text,
  add column if not exists twitter     text,
  add column if not exists pinterest   text,
  add column if not exists redes_extra jsonb;

comment on column leads.redes_extra is
  'Perfiles sociales que no tienen columna propia. {"threads":"https://…"}.';

-- --- 2. Procedencia y estado del enriquecimiento ---------------
-- Sin esto, un email vacío y un email que se buscó y no se encontró son
-- indistinguibles, y el enriquecimiento reintenta eternamente los mismos.
alter table leads
  add column if not exists email_source      text,
  add column if not exists phone_source      text,
  add column if not exists social_source     text,
  add column if not exists whatsapp_source   text,
  add column if not exists last_enriched_at  timestamptz,
  add column if not exists enrichment_status text;

comment on column leads.whatsapp_source is
  'Cómo se supo del WhatsApp: wa_link_web | apify_contacts | manual. '
  'Nunca inferido a partir del teléfono.';
comment on column leads.enrichment_status is
  'ok | sin_datos | error. `sin_datos` = se buscó y la web no tenía nada; '
  'no es lo mismo que no haberlo intentado (last_enriched_at null).';

-- Para «dame los siguientes N que tocan». Los ya enriquecidos quedan al final.
create index if not exists idx_leads_enriquecer
  on leads (last_enriched_at nulls first)
  where deleted_at is null;

-- --- 3. Helper: leer un array de Apify -------------------------
-- `scrapeContacts` devuelve PLURALES en array (`instagrams`, `emails`), pero
-- el mismo actor devuelve singulares escalares (`phone`) según la opción. Y
-- entre versiones cambia cuál manda. Esta función acepta ambas formas para
-- cada clave, así un renombrado en Apify no vacía una columna en silencio.
create or replace function apify_lista(p jsonb, variadic claves text[])
returns text[] as $$
declare
  k text;
  v jsonb;
  out_arr text[] := '{}';
begin
  foreach k in array claves loop
    v := p -> k;
    if v is null then
      continue;
    elsif jsonb_typeof(v) = 'array' then
      out_arr := out_arr || array(
        select btrim(x) from jsonb_array_elements_text(v) x
         where btrim(x) <> ''
      );
    elsif jsonb_typeof(v) = 'string' and btrim(v #>> '{}') <> '' then
      out_arr := out_arr || btrim(v #>> '{}');
    end if;
  end loop;
  -- distinct conservando el orden: el primero que encontró Apify es el bueno.
  return array(select distinct on (x) x from unnest(out_arr) with ordinality t(x, i) order by x, i);
end;
$$ language plpgsql immutable;

comment on function apify_lista(jsonb, text[]) is
  'Recoge una lista de valores de Apify aceptando tanto array como escalar.';

-- --- 4. importar_leads aprende a leer los plurales -------------
-- Sólo cambia el mapeo de redes y contactos; el resto (deduplicación,
-- bitácora, coalesce) es idéntico a la 0025 y se mantiene tal cual.
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
  v_nueva       boolean;
begin
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' then
    raise exception 'importar_leads espera un array JSON (recibido: %)',
      coalesce(jsonb_typeof(p_lote), 'null');
  end if;

  for it in select * from jsonb_array_elements(p_lote) loop
    v_recibidos := v_recibidos + 1;

    v_empresa := apify_txt(it, 'title', 'name', 'empresa', 'businessName');
    if v_empresa is null then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object('motivo', 'sin nombre de empresa', 'item', it);
      continue;
    end if;

    v_place := apify_txt(it, 'placeId', 'place_id', 'placeID');
    v_maps  := apify_txt(it, 'url', 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl');

    -- Con `scrapeContacts` estos llegan en plural; sin él, sólo el escalar.
    v_emails    := apify_lista(it, 'emails', 'email', 'emailContacto');
    v_telefonos := apify_lista(it, 'phones', 'phone', 'telefono', 'phoneUnformatted');

    -- Redes: se guarda la primera de cada plataforma. Apify devuelve arrays
    -- porque una web puede enlazar varios perfiles; el primero es el de la
    -- cabecera/pie, que es el corporativo.
    v_ig := (apify_lista(it, 'instagrams', 'instagram', 'instagramUrl'))[1];
    v_fb := (apify_lista(it, 'facebooks', 'facebook', 'facebookUrl'))[1];
    v_li := (apify_lista(it, 'linkedIns', 'linkedIn', 'linkedin', 'linkedinUrl'))[1];
    v_yt := (apify_lista(it, 'youtubes', 'youtube', 'youtubeUrl'))[1];
    v_tt := (apify_lista(it, 'tiktoks', 'tiktok', 'tiktokUrl'))[1];
    v_tw := (apify_lista(it, 'twitters', 'twitter', 'twitterUrl', 'x'))[1];
    v_pi := (apify_lista(it, 'pinterests', 'pinterest'))[1];
    v_tiene_redes := coalesce(v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi) is not null;

    select l.id into v_id
      from leads l
     where l.deleted_at is null
       and ( (v_place is not null and l.place_id = v_place)
          or (v_maps  is not null and lower(trim(l.google_maps)) = lower(trim(v_maps)))
          or (v_place is null and v_maps is null
              and lower(l.empresa) = lower(v_empresa)
              and coalesce(lower(l.ciudad), '') = coalesce(lower(apify_txt(it, 'city', 'ciudad')), '')) )
     order by l.created_at asc
     limit 1;

    v_nueva := v_id is null;

    if v_nueva then
      insert into leads (
        empresa, place_id, google_maps, nicho, categoria, ciudad, pais, codigo_pais,
        direccion, telefono, telefono_2, telefonos, email, emails, web,
        instagram, facebook, linkedin, youtube, tiktok, twitter, pinterest,
        rating_google, num_resenas, latitud, longitud, horario, fuente,
        email_source, phone_source, social_source
      ) values (
        v_empresa, v_place, v_maps,
        apify_txt(it, 'nicho', 'categoryName', 'category'),
        apify_txt(it, 'categoryName', 'category'),
        apify_txt(it, 'city', 'ciudad'),
        apify_txt(it, 'country', 'pais', 'countryCode'),
        apify_txt(it, 'countryCode'),
        apify_txt(it, 'address', 'direccion', 'street'),
        coalesce(apify_txt(it, 'phone', 'telefono'), v_telefonos[1]),
        apify_txt(it, 'phoneUnformatted'),
        v_telefonos,
        v_emails[1],
        v_emails,
        apify_txt(it, 'website', 'web', 'url_website'),
        v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi,
        -- `totalScore` es la valoración. `rank` (que es lo que mapea hoy el
        -- workflow) es la POSICIÓN en los resultados: por eso el rating está
        -- mal en todos los leads captados hasta ahora.
        apify_num(it, 'totalScore', 'rating', 'ratingGoogle'),
        coalesce(apify_num(it, 'reviewsCount', 'numResenas', 'userRatingCount'), 0)::int,
        apify_num(it, 'lat', 'latitude'),
        apify_num(it, 'lng', 'longitude'),
        it -> 'openingHours',
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
        categoria     = coalesce(l.categoria, apify_txt(it, 'categoryName', 'category')),
        ciudad        = coalesce(l.ciudad, apify_txt(it, 'city', 'ciudad')),
        pais          = coalesce(l.pais, apify_txt(it, 'country', 'pais', 'countryCode')),
        codigo_pais   = coalesce(l.codigo_pais, apify_txt(it, 'countryCode')),
        direccion     = coalesce(l.direccion, apify_txt(it, 'address', 'direccion', 'street')),
        telefono      = coalesce(l.telefono, apify_txt(it, 'phone', 'telefono'), v_telefonos[1]),
        telefono_2    = coalesce(l.telefono_2, apify_txt(it, 'phoneUnformatted')),
        telefonos     = (select array_agg(distinct x) from unnest(coalesce(l.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) x),
        email         = coalesce(l.email, v_emails[1]),
        emails        = (select array_agg(distinct x) from unnest(coalesce(l.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) x),
        web           = coalesce(l.web, apify_txt(it, 'website', 'web')),
        instagram     = coalesce(l.instagram, v_ig),
        facebook      = coalesce(l.facebook, v_fb),
        linkedin      = coalesce(l.linkedin, v_li),
        youtube       = coalesce(l.youtube,   v_yt),
        tiktok        = coalesce(l.tiktok,    v_tt),
        twitter       = coalesce(l.twitter,   v_tw),
        pinterest     = coalesce(l.pinterest, v_pi),
        -- Rating y reseñas SÍ se refrescan: son datos vivos, no del usuario.
        rating_google = coalesce(apify_num(it, 'totalScore', 'rating'), l.rating_google),
        num_resenas   = coalesce(apify_num(it, 'reviewsCount', 'userRatingCount')::int, l.num_resenas),
        latitud       = coalesce(l.latitud, apify_num(it, 'lat', 'latitude')),
        longitud      = coalesce(l.longitud, apify_num(it, 'lng', 'longitude')),
        horario       = coalesce(l.horario, it -> 'openingHours'),
        -- La procedencia sólo se sella si este lote es quien rellenó el hueco.
        email_source  = case when l.email is null and l.email_contacto is null and v_emails[1] is not null
                             then 'apify_contacts' else l.email_source end,
        phone_source  = case when l.telefono is null and v_telefonos[1] is not null
                             then 'apify_places' else l.phone_source end,
        social_source = case when coalesce(l.instagram, l.facebook, l.linkedin) is null and v_tiene_redes
                             then 'apify_contacts' else l.social_source end,
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

-- --- 5. Segunda pasada: enriquecer_lead ------------------------
/**
 * enriquecer_lead — completa un lead con lo que n8n extrajo de su web.
 *
 *   POST /rest/v1/rpc/enriquecer_lead
 *   { "p_id": "<uuid>",
 *     "p_datos": { "emails": ["a@x.com"], "telefonos": ["+34600…"],
 *                  "whatsapp": "+34600…", "whatsapp_source": "wa_link_web",
 *                  "instagram": "https://instagram.com/x", "tiktok": "…" },
 *     "p_fuente": "web_scrape" }
 *
 * REGLA ÚNICA: sólo rellena huecos. Un campo ausente o vacío en `p_datos`
 * NO borra lo que ya hay. Esto es lo que hoy hace mal el workflow de Fase 2,
 * que escribe "" sobre el Facebook y el WhatsApp existentes cuando no los
 * encuentra. Aquí es imposible por construcción.
 *
 * Devuelve qué campos rellenó, para que n8n lo registre.
 */
create or replace function enriquecer_lead(
  p_id     uuid,
  p_datos  jsonb default '{}'::jsonb,
  p_fuente text default 'web_scrape'
) returns jsonb as $$
declare
  l           leads%rowtype;
  v_emails    text[];
  v_telefonos text[];
  v_wa        text;
  v_wa_src    text;
  v_ig text; v_fb text; v_li text; v_yt text; v_tt text; v_tw text; v_pi text;
  v_relleno   text[] := '{}';
begin
  select * into l from leads where id = p_id and deleted_at is null;
  if not found then
    raise exception 'enriquecer_lead: lead % no existe o está en la papelera', p_id;
  end if;

  v_emails    := apify_lista(p_datos, 'emails', 'email');
  v_telefonos := apify_lista(p_datos, 'telefonos', 'phones', 'telefono', 'phone');
  v_ig := (apify_lista(p_datos, 'instagrams', 'instagram'))[1];
  v_fb := (apify_lista(p_datos, 'facebooks',  'facebook'))[1];
  v_li := (apify_lista(p_datos, 'linkedIns',  'linkedin', 'linkedIn'))[1];
  v_yt := (apify_lista(p_datos, 'youtubes',   'youtube'))[1];
  v_tt := (apify_lista(p_datos, 'tiktoks',    'tiktok'))[1];
  v_tw := (apify_lista(p_datos, 'twitters',   'twitter', 'x'))[1];
  v_pi := (apify_lista(p_datos, 'pinterests', 'pinterest'))[1];

  -- WhatsApp: sólo el que la empresa publica. Si no viene fuente explícita se
  -- asume el enlace en la web, que es el único método que usamos.
  v_wa     := apify_txt(p_datos, 'whatsapp', 'whatsappNumber');
  v_wa_src := coalesce(apify_txt(p_datos, 'whatsapp_source'), 'wa_link_web');

  -- Registro de qué se rellenó (sólo cuenta si el campo estaba vacío).
  if l.email is null and l.email_contacto is null and v_emails[1] is not null then v_relleno := v_relleno || 'email'; end if;
  if l.telefono is null and v_telefonos[1] is not null then v_relleno := v_relleno || 'telefono'; end if;
  if l.whatsapp  is null and v_wa is not null then v_relleno := v_relleno || 'whatsapp'; end if;
  if l.instagram is null and v_ig is not null then v_relleno := v_relleno || 'instagram'; end if;
  if l.facebook  is null and v_fb is not null then v_relleno := v_relleno || 'facebook';  end if;
  if l.linkedin  is null and v_li is not null then v_relleno := v_relleno || 'linkedin';  end if;
  if l.youtube   is null and v_yt is not null then v_relleno := v_relleno || 'youtube';   end if;
  if l.tiktok    is null and v_tt is not null then v_relleno := v_relleno || 'tiktok';    end if;
  if l.twitter   is null and v_tw is not null then v_relleno := v_relleno || 'twitter';   end if;
  if l.pinterest is null and v_pi is not null then v_relleno := v_relleno || 'pinterest'; end if;

  update leads x set
    email     = coalesce(x.email, v_emails[1]),
    emails    = (select array_agg(distinct e) from unnest(coalesce(x.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) e),
    telefono  = coalesce(x.telefono, v_telefonos[1]),
    telefonos = (select array_agg(distinct t) from unnest(coalesce(x.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) t),
    whatsapp  = coalesce(x.whatsapp,  v_wa),
    instagram = coalesce(x.instagram, v_ig),
    facebook  = coalesce(x.facebook,  v_fb),
    linkedin  = coalesce(x.linkedin,  v_li),
    youtube   = coalesce(x.youtube,   v_yt),
    tiktok    = coalesce(x.tiktok,    v_tt),
    twitter   = coalesce(x.twitter,   v_tw),
    pinterest = coalesce(x.pinterest, v_pi),
    redes_extra     = coalesce(x.redes_extra, p_datos -> 'redes_extra'),
    email_source    = case when 'email'    = any(v_relleno) then p_fuente else x.email_source end,
    phone_source    = case when 'telefono' = any(v_relleno) then p_fuente else x.phone_source end,
    whatsapp_source = case when 'whatsapp' = any(v_relleno) then v_wa_src else x.whatsapp_source end,
    social_source   = case when v_relleno && array['instagram','facebook','linkedin','youtube','tiktok','twitter','pinterest']
                           then p_fuente else x.social_source end,
    last_enriched_at  = now(),
    -- `sin_datos` distingue «se buscó y no había» de «no se ha intentado».
    enrichment_status = coalesce(apify_txt(p_datos, 'status'),
                                 case when cardinality(v_relleno) > 0 then 'ok' else 'sin_datos' end),
    updated_at = now()
  where x.id = p_id;

  return jsonb_build_object('lead_id', p_id, 'relleno', to_jsonb(v_relleno), 'fuente', p_fuente);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function enriquecer_lead(uuid, jsonb, text) from public, anon;
grant execute on function enriquecer_lead(uuid, jsonb, text) to authenticated, service_role;

comment on function enriquecer_lead(uuid, jsonb, text) is
  'Segunda pasada de enriquecimiento. Sólo rellena huecos: nunca borra ni pisa.';

-- --- 6. A quién le toca ----------------------------------------
-- n8n pregunta en vez de decidir: la política de reintentos vive aquí, en un
-- solo sitio, y no repartida por condiciones de un IF en el workflow.
create or replace function leads_para_enriquecer(
  p_limite    int default 25,
  p_reintento interval default '30 days'
) returns table (id uuid, empresa text, web text) as $$
  select l.id, l.empresa, l.web
    from leads l
   where l.deleted_at is null
     and l.web is not null and btrim(l.web) <> ''
     -- Le falta algo que merezca la pena buscar.
     and (l.email is null or l.whatsapp is null or l.instagram is null)
     -- Nunca intentado, o toca reintentar (una web cambia; un `sin_datos` de
     -- hace un mes puede ya no serlo).
     and (l.last_enriched_at is null or l.last_enriched_at < now() - p_reintento)
   order by l.last_enriched_at asc nulls first, l.created_at desc
   limit greatest(1, least(p_limite, 200));
$$ language sql stable security definer set search_path = public, pg_temp;

revoke all on function leads_para_enriquecer(int, interval) from public, anon;
grant execute on function leads_para_enriquecer(int, interval) to authenticated, service_role;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Los plurales de `scrapeContacts` entran donde deben:
--
--   select importar_leads('[
--     {"title":"Bar Pepe","placeId":"TEST-26","city":"Madrid",
--      "phone":"+34 600 000 000","phoneUnformatted":"+34600000000",
--      "emails":["a@bar.com","b@bar.com"],
--      "instagrams":["https://instagram.com/barpepe"],
--      "tiktoks":["https://tiktok.com/@barpepe"],
--      "totalScore":4.5,"rank":3,"reviewsCount":120}
--   ]'::jsonb, 'google_maps', 'test 0026');
--
--   select empresa, email, emails, instagram, tiktok, rating_google,
--          email_source, social_source
--     from leads where place_id = 'TEST-26';
--   -- rating_google debe ser 4.5 (totalScore), NO 3 (rank).
--   -- instagram y tiktok rellenos; email_source = 'apify_contacts'.
--
-- 2) EL CASO QUE HOY FALLA — un resultado vacío no debe borrar nada:
--
--   update leads set facebook = 'https://facebook.com/barpepe',
--                    whatsapp = '+34600111222'
--    where place_id = 'TEST-26';
--
--   select enriquecer_lead(
--     (select id from leads where place_id = 'TEST-26'),
--     '{"emails":[],"facebook":"","whatsapp":""}'::jsonb, 'web_scrape');
--
--   select facebook, whatsapp, enrichment_status
--     from leads where place_id = 'TEST-26';
--   -- Ambos DEBEN seguir ahí. enrichment_status = 'sin_datos'.
--
-- 3) El enriquecimiento sí rellena lo que falta, y lo sella:
--
--   select enriquecer_lead(
--     (select id from leads where place_id = 'TEST-26'),
--     '{"youtube":"https://youtube.com/@barpepe"}'::jsonb, 'web_scrape');
--   -- -> relleno: ["youtube"], social_source = 'web_scrape'
--
-- 4) La cola de trabajo:
--
--   select * from leads_para_enriquecer(10);
--
--   delete from leads where place_id = 'TEST-26';
--
-- =============================================================
-- PENDIENTE FUERA DE LA BASE DE DATOS
-- =============================================================
-- Esta migración no arregla la captación por sí sola. En n8n, Fase 1:
--
--   1. Añadir al body del nodo de Apify:
--        scrapeContacts: true, scrapePlaceDetailPage: true
--      SIN ESTO, `emails` e `instagrams` no vienen y todo lo de arriba
--      seguirá vacío. Es la causa raíz.
--   2. Sustituir los nodos de Google Sheets por UNA llamada a
--      importar_leads con el lote completo (modo «Execute Once»).
--   3. Dejar de mapear `rank` como rating.
--   4. Conectar o desactivar la rama `google_web`: hoy ejecuta el actor,
--      paga los créditos y tira el resultado (no tiene salida).
--   5. Encadenar el workflow de enriquecimiento al final de la captación,
--      usando leads_para_enriquecer + enriquecer_lead.
-- =============================================================
