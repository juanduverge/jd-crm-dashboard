-- =============================================================
-- 0066 — Las coordenadas de Apify nunca se guardaron
--
-- PROBLEMA
--
-- Comprobado el 13-nov-2026 al estrenar el Mapa: 0 de 1154 leads tenían
-- latitud/longitud. El importador (0025 → 0034) las buscaba en `lat`/`lng`
-- de primer nivel, pero el actor de Google Maps de Apify las entrega
-- anidadas: { "location": { "lat": …, "lng": … } }. `apify_num` devolvía
-- null y las columnas se quedaban vacías en silencio.
--
-- ARREGLO
--
-- 1. `coordenadas_desde_lote(lote)` lee cada item del lote crudo, busca
--    las coordenadas en las dos formas (anidada y plana) y las escribe en
--    el lead con ese mismo place_id, solo donde aún no hay.
-- 2. Un trigger en `lead_imports` lo ejecuta tras cada importación: el
--    importador ya guarda ahí el lote crudo al terminar. Así no hace falta
--    reescribir `importar_leads` entero para cambiar dos líneas.
-- 3. Rescate: se pasa por todos los lotes ya guardados.
--
-- Idempotente: se puede ejecutar más de una vez.
-- =============================================================

begin;

create or replace function coordenadas_desde_lote(p_lote jsonb) returns int as $fn$
declare
  v_n int;
begin
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' then
    return 0;
  end if;

  with items as (
    select
      coalesce(it->>'placeId', it->>'place_id', it->>'placeID') as place_id,
      coalesce(it->'location'->>'lat', it->>'lat', it->>'latitude')   as lat_txt,
      coalesce(it->'location'->>'lng', it->'location'->>'lon', it->>'lng', it->>'longitude') as lng_txt
    from jsonb_array_elements(p_lote) it
  ),
  validos as (
    select distinct on (place_id) place_id, lat_txt::numeric as lat, lng_txt::numeric as lng
      from items
     where place_id is not null
       and lat_txt ~ '^-?[0-9]+(\.[0-9]+)?$'
       and lng_txt ~ '^-?[0-9]+(\.[0-9]+)?$'
  )
  update leads l
     set latitud = v.lat, longitud = v.lng
    from validos v
   where l.place_id = v.place_id
     and (l.latitud is null or l.longitud is null)
     and v.lat between -90 and 90
     and v.lng between -180 and 180
     and not (v.lat = 0 and v.lng = 0);

  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function coordenadas_tras_importar() returns trigger as $fn$
begin
  perform coordenadas_desde_lote(new.payload);
  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_lead_imports_coordenadas on lead_imports;
create trigger trg_lead_imports_coordenadas
  after insert on lead_imports
  for each row execute function coordenadas_tras_importar();

revoke execute on function coordenadas_desde_lote(jsonb)  from anon, authenticated;
revoke execute on function coordenadas_tras_importar()    from anon, authenticated;

-- Rescate: los lotes más recientes primero (solo se rellena donde falta).
do $$
declare
  r record;
  v_total int := 0;
begin
  for r in select payload from lead_imports where payload is not null order by created_at desc loop
    v_total := v_total + coordenadas_desde_lote(r.payload);
  end loop;
  raise notice 'Leads con coordenadas rescatadas: %', v_total;
end $$;

commit;

-- VERIFICACIÓN
--   select count(*) filter (where latitud is not null) as con_coordenadas,
--          count(*) as total
--     from leads where deleted_at is null;
