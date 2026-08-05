-- =============================================================
-- 0025_import_leads.sql — Importación de prospectos (Apify) fiable y auditable
--
-- SÍNTOMAS: «pido 10 leads, Apify muestra 10, el CRM guarda 1» y «no se
-- guardan los emails ni los teléfonos que Apify sí trae».
--
-- QUÉ SE HA COMPROBADO (sin suposiciones):
--
--  * El frontend NO participa en la importación. `LeadSearchModal` hace UNA
--    llamada (`crmApi.buscarLeads` -> POST /crm-buscar-leads) y termina. No
--    mapea campos ni inserta filas. Por tanto el registro NO se pierde en el
--    cliente.
--  * En la BD, `leads` no tiene NINGUNA restricción única sobre una clave de
--    negocio: sólo la PK `id` (uuid generado). Ver 0001_schema.sql. Es decir:
--      - un `insert ... on conflict (google_maps) do update` desde n8n falla
--        siempre con «there is no unique or exclusion constraint matching the
--        ON CONFLICT specification» (SQLSTATE 42P10). Si n8n manda el lote en
--        UNA petición, el error tumba las 10 filas; si manda item a item y
--        para al primer fallo, se guarda lo que hubiera entrado antes. Ambos
--        comportamientos son compatibles con «llegó 1».
--      - y sin clave única, repetir la misma búsqueda DUPLICA los leads.
--  * El punto exacto dentro del workflow «Fase 1 - Captación de Prospectos
--    (Apify)» no se ha podido confirmar: la API de n8n responde 401 con la
--    clave disponible. Lo que sí es verificable es que la BD, tal como
--    estaba, no admitía una inserción idempotente de un lote.
--
-- QUÉ HACE ESTA MIGRACIÓN:
--
--  1. Da a `leads` una clave de negocio real (`place_id` de Google + la URL
--     de Maps) con índices únicos, tras deduplicar lo ya existente.
--  2. Añade las columnas que Apify entrega y no tenían destino
--     (`telefono_2`, `telefonos`, `emails`, `place_id`, `categoria`,
--     `codigo_pais`, `horario`, `latitud`, `longitud`).
--  3. Sustituye el mapeo disperso de n8n por UN punto de entrada:
--     `importar_leads(jsonb)`. n8n pasa el array COMPLETO de Apify en una
--     sola llamada y Postgres hace el resto. Así deja de existir la clase de
--     fallo «n8n perdió items por el camino»: o entra el lote entero o falla
--     el lote entero, y en cualquier caso queda registrado.
--  4. Registra cada importación en `lead_imports` (recibidos / insertados /
--     actualizados / descartados + payload). La próxima vez que Apify diga
--     10 y el CRM muestre 1, esta tabla dice exactamente en qué paso se cayó,
--     sin tener que adivinar.
-- =============================================================

begin;

-- --- 1. Columnas que faltaban para lo que Apify entrega -------
-- Apify (compass~crawler-google-places) devuelve `phone` y
-- `phoneUnformatted`, y varias direcciones en `emails[]`. El esquema sólo
-- tenía `telefono` y `email` (singulares): todo lo demás se perdía en el
-- mapeo aunque el scraper lo trajera.
alter table leads
  add column if not exists place_id     text,   -- id estable de Google Places
  add column if not exists telefono_2   text,   -- phoneUnformatted / 2º teléfono
  add column if not exists emails       text[], -- todas las direcciones detectadas
  add column if not exists telefonos    text[], -- todos los teléfonos detectados
  add column if not exists categoria    text,   -- categoryName
  add column if not exists codigo_pais  text,   -- countryCode
  add column if not exists horario      jsonb,  -- openingHours
  add column if not exists latitud      numeric,
  add column if not exists longitud     numeric;

comment on column leads.place_id is
  'Google Place ID. Clave de negocio para importar sin duplicar.';
comment on column leads.emails is
  'Todas las direcciones detectadas por el scraper. `email` es la elegida.';
comment on column leads.telefonos is
  'Todos los teléfonos detectados. `telefono` es el principal.';

-- --- 2. Deduplicar lo ya importado ----------------------------
-- No se borra nada: se marca como eliminado (soft delete, la convención de
-- todo el esquema) el duplicado MÁS NUEVO y se conserva el original, que es
-- el que ya tiene historial de pipeline, notas y seguimientos colgando.
with dup as (
  select id,
         row_number() over (
           partition by lower(trim(google_maps))
           order by created_at asc, id asc
         ) as n
    from leads
   where deleted_at is null
     and google_maps is not null
     and trim(google_maps) <> ''
)
update leads l
   set deleted_at = now(),
       notas = coalesce(l.notas || E'\n', '') ||
               '[0025] Duplicado por importación repetida; se conserva el registro original.'
  from dup
 where dup.id = l.id
   and dup.n > 1;

-- --- 3. La clave única que faltaba -----------------------------
-- Parciales (`where deleted_at is null`) para que un lead archivado no
-- bloquee volver a captar el mismo negocio más adelante.
create unique index if not exists uq_leads_place_id
  on leads (place_id)
  where place_id is not null and deleted_at is null;

create unique index if not exists uq_leads_google_maps
  on leads (lower(trim(google_maps)))
  where google_maps is not null and trim(google_maps) <> '' and deleted_at is null;

-- --- 4. Bitácora de importaciones ------------------------------
-- Sin esto, «Apify dice 10 y el CRM muestra 1» sólo se puede investigar
-- mirando ejecuciones de n8n. Con esto, la respuesta está en la BD.
create table if not exists lead_imports (
  id           uuid primary key default gen_random_uuid(),
  fuente       text,
  consulta     text,           -- "restaurantes / Madrid", para poder buscarla
  recibidos    int not null default 0,
  insertados   int not null default 0,
  actualizados int not null default 0,
  descartados  int not null default 0,
  detalle      jsonb,          -- por qué se descartó cada uno
  payload      jsonb,          -- lote crudo tal cual llegó de Apify
  created_at   timestamptz not null default now()
);

create index if not exists idx_lead_imports_fecha
  on lead_imports (created_at desc);

alter table lead_imports enable row level security;

drop policy if exists lead_imports_select on lead_imports;
create policy lead_imports_select on lead_imports
  for select using (auth_role() in ('admin','vendedor','viewer'));

-- Sólo escribe el importador (service_role, que salta RLS). Ningún rol de
-- usuario debe poder falsear la bitácora.
drop policy if exists lead_imports_insert on lead_imports;
create policy lead_imports_insert on lead_imports
  for insert with check (auth_role() = 'admin');

-- --- 5. El punto de entrada único ------------------------------
-- Helpers: Apify no es consistente con los nombres entre actores ni entre
-- versiones, así que cada campo acepta varios alias. Es preferible a que el
-- mapeo viva en un nodo Code de n8n donde un renombrado silencioso deja la
-- columna vacía sin que nadie se entere (ése es el síntoma 2).
create or replace function apify_txt(p jsonb, variadic claves text[]) returns text as $$
declare k text; v text;
begin
  foreach k in array claves loop
    v := nullif(btrim(coalesce(p ->> k, '')), '');
    if v is not null then return v; end if;
  end loop;
  return null;
end;
$$ language plpgsql immutable;

create or replace function apify_num(p jsonb, variadic claves text[]) returns numeric as $$
declare v text;
begin
  v := apify_txt(p, variadic claves);
  if v is null then return null; end if;
  begin return v::numeric; exception when others then return null; end;
end;
$$ language plpgsql immutable;

/**
 * importar_leads — inserta o actualiza un lote completo de prospectos.
 *
 * n8n llama a esto UNA vez con el array entero que devuelve Apify:
 *
 *   POST /rest/v1/rpc/importar_leads
 *   { "p_lote": <array de Apify>, "p_fuente": "google_maps",
 *     "p_consulta": "restaurantes / Madrid" }
 *
 * Devuelve {recibidos, insertados, actualizados, descartados, import_id}.
 * Ese objeto es lo que n8n debe mostrar/loguear: si recibidos=10 e
 * insertados=1, el problema está antes (Apify o el nodo que trocea); si
 * recibidos=1, el lote llegó ya mutilado desde n8n. Deja de haber ambigüedad.
 *
 * Idempotente: el mismo negocio importado dos veces se ACTUALIZA, no se
 * duplica, gracias a los índices únicos de arriba. Y al actualizar sólo
 * rellena huecos (`coalesce(nuevo, viejo)` sobre los campos de scraping):
 * jamás pisa lo que una persona haya escrito a mano, ni toca estado,
 * prioridad, notas ni valor estimado.
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

    -- `empresa` es not null en el esquema: sin nombre no hay lead. Se
    -- descarta ESE item y se sigue con el resto; antes un item malo podía
    -- tumbar la transacción entera y con ella las otras 9 filas.
    v_empresa := apify_txt(it, 'title', 'name', 'empresa', 'businessName');
    if v_empresa is null then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object('motivo', 'sin nombre de empresa', 'item', it);
      continue;
    end if;

    v_place := apify_txt(it, 'placeId', 'place_id', 'placeID');
    v_maps  := apify_txt(it, 'url', 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl');

    -- Emails y teléfonos: Apify los da como array, como escalar, o ambos.
    -- Se recogen TODOS (ésta es la causa directa del síntoma 2: el mapeo
    -- anterior sólo miraba el escalar y los arrays se tiraban).
    select array_agg(distinct lower(e)) into v_emails
      from (
        select jsonb_array_elements_text(coalesce(it -> 'emails', '[]'::jsonb)) as e
        union
        select apify_txt(it, 'email', 'emailContacto') where apify_txt(it, 'email', 'emailContacto') is not null
      ) s where e is not null and e <> '';

    select array_agg(distinct t) into v_telefonos
      from (
        select jsonb_array_elements_text(coalesce(it -> 'phones', '[]'::jsonb)) as t
        union select apify_txt(it, 'phone', 'telefono')       where apify_txt(it, 'phone', 'telefono') is not null
        union select apify_txt(it, 'phoneUnformatted')        where apify_txt(it, 'phoneUnformatted') is not null
      ) s where t is not null and t <> '';

    -- ¿Ya lo tenemos? Se busca por la clave de negocio, en este orden de
    -- fiabilidad: place_id > URL de Maps > (empresa + ciudad).
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
        instagram, facebook, linkedin, rating_google, num_resenas,
        latitud, longitud, horario, fuente
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
        apify_txt(it, 'instagram', 'instagramUrl'),
        apify_txt(it, 'facebook', 'facebookUrl'),
        apify_txt(it, 'linkedIn', 'linkedin', 'linkedinUrl'),
        apify_num(it, 'totalScore', 'rating', 'ratingGoogle'),
        coalesce(apify_num(it, 'reviewsCount', 'numResenas', 'userRatingCount'), 0)::int,
        apify_num(it, 'lat', 'latitude'),
        apify_num(it, 'lng', 'longitude'),
        it -> 'openingHours',
        coalesce(p_fuente, 'google_maps')
      )
      returning id into v_id;
      v_insertados := v_insertados + 1;
    else
      -- Sólo se rellenan huecos. Lo que ya hay escrito manda.
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
        -- Los arrays se fusionan: una segunda pasada del scraper puede haber
        -- encontrado un email que la primera no vio.
        telefonos     = (select array_agg(distinct x) from unnest(coalesce(l.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) x),
        email         = coalesce(l.email, v_emails[1]),
        emails        = (select array_agg(distinct x) from unnest(coalesce(l.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) x),
        web           = coalesce(l.web, apify_txt(it, 'website', 'web')),
        instagram     = coalesce(l.instagram, apify_txt(it, 'instagram', 'instagramUrl')),
        facebook      = coalesce(l.facebook, apify_txt(it, 'facebook', 'facebookUrl')),
        linkedin      = coalesce(l.linkedin, apify_txt(it, 'linkedIn', 'linkedin', 'linkedinUrl')),
        -- Rating y reseñas SÍ se refrescan: son datos vivos, no del usuario.
        rating_google = coalesce(apify_num(it, 'totalScore', 'rating'), l.rating_google),
        num_resenas   = coalesce(apify_num(it, 'reviewsCount', 'userRatingCount')::int, l.num_resenas),
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

comment on function importar_leads(jsonb, text, text) is
  'Punto de entrada único para importar prospectos de Apify. Idempotente por place_id/google_maps. Devuelve el recuento por lote.';

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Duplicados que había y que ya no hay:
--
--   select lower(trim(google_maps)), count(*)
--     from leads where deleted_at is null and google_maps is not null
--    group by 1 having count(*) > 1;   -- debe devolver 0 filas
--
-- 2) La importación es idempotente y no pierde nada. Ejecutar DOS veces:
--
--   select importar_leads('[
--     {"title":"Bar Pepe","placeId":"TEST-1","city":"Madrid",
--      "phone":"+34 600 000 000","phoneUnformatted":"+34600000000",
--      "emails":["a@bar.com","b@bar.com"],"website":"https://bar.com",
--      "totalScore":4.5,"reviewsCount":120,"url":"https://maps.google.com/?cid=1"},
--     {"title":"Bar Manolo","placeId":"TEST-2","city":"Madrid"},
--     {"city":"Madrid"}
--   ]'::jsonb, 'google_maps', 'bares / Madrid');
--
--   1ª -> {"recibidos":3,"insertados":2,"actualizados":0,"descartados":1}
--   2ª -> {"recibidos":3,"insertados":0,"actualizados":2,"descartados":1}
--   (el descartado es el item sin nombre, y NO impide que entren los otros)
--
--   select empresa, telefono, telefono_2, telefonos, email, emails
--     from leads where place_id like 'TEST-%';
--   -- emails y telefonos deben venir COMPLETOS, no sólo el primero.
--
--   delete from leads where place_id like 'TEST-%';
--
-- 3) La bitácora responde «¿dónde se perdieron?»:
--
--   select created_at, consulta, recibidos, insertados, actualizados, descartados
--     from lead_imports order by created_at desc limit 10;
--
-- =============================================================
-- PENDIENTE EN n8n (workflow «Fase 1 - Captación de Prospectos»)
-- =============================================================
-- Hay que sustituir los nodos que insertan en Supabase lead a lead por UNA
-- llamada HTTP a este RPC, pasando el dataset de Apify entero:
--
--   POST  {{SUPABASE_URL}}/rest/v1/rpc/importar_leads
--   Headers: apikey / Authorization: Bearer <service_role>
--            Content-Type: application/json
--            Prefer: params=single-object
--   Body:  { "p_lote": {{ JSON.stringify($items().map(i => i.json)) }},
--            "p_fuente": "google_maps",
--            "p_consulta": "{{ $json.tipo_negocio }} / {{ $json.ciudad }}" }
--
-- IMPORTANTE: el nodo HTTP debe ir en modo «Execute Once» y recibir el array
-- COMPLETO. Si se deja en modo por-item, n8n hará N llamadas de 1 elemento y
-- se vuelve al escenario donde un fallo intermedio pierde el resto del lote.
-- La respuesta ({recibidos, insertados, ...}) debe guardarse en el log del
-- workflow: es la prueba de si el lote llegó completo o ya venía mutilado.
-- =============================================================
