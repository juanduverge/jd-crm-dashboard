-- =============================================================
-- 0071_ficha_maps.sql — El robot de contactos también lee la ficha de
-- Google Maps.
--
-- PROBLEMA. Sin la API de Google (pide facturación y no hay presupuesto),
-- «Desde Google Maps» solo sacaba la dirección de OpenStreetMap: ni
-- teléfono, ni web, ni estrellas, ni reseñas. Y sin web el robot no
-- arrancaba, así que el lead se quedaba casi vacío.
--
-- ARREGLO. El robot del servidor de casa abre la ficha una vez, como una
-- persona, y lee teléfono, web, estrellas, reseñas, categoría y dirección.
-- Si encuentra web, sigue en el mismo trabajo con los correos y las redes.
-- Solo para enlaces pegados a mano, de uno en uno: nunca en masa.
--
-- 1. Los trabajos de `contactos_web` pueden llevar `maps` (el enlace de la
--    ficha). Un trabajo con ficha se hace aunque el lead aún no tenga web.
-- 2. `contactos_web_encolar_maps(lead, enlace)`.
-- 3. `ficha_maps_guardar(lead, item)`: lo leído, en formato Apify, entra por
--    `importar_leads` (rellena huecos y no pisa) emparejado con la clave del
--    propio lead. Además: nicho desde la categoría si estaba en «otros», y la
--    dirección de Google en vez de la de OSM, que es menos precisa.
-- =============================================================

begin;

-- Cambia lo que devuelve: hay que borrarla y crearla de nuevo.
drop function if exists contactos_web_leer(int, int);

create function contactos_web_leer(p_cantidad int default 1, p_segundos int default 300)
returns table (id bigint, intentos int, lead_id uuid, empresa text, web text, maps text)
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  r record;
  l record;
  v_maps text;
begin
  for r in select * from pgmq.read('contactos_web', p_segundos, p_cantidad) loop
    v_maps := nullif(btrim(coalesce(r.message->>'maps', '')), '');
    select x.id, x.empresa, nullif(btrim(x.web), '') as web
      into l
      from leads x
     where x.id = (r.message->>'lead_id')::uuid and x.deleted_at is null;

    if l.id is null or (l.web is null and v_maps is null) then
      -- Borrado, o sin web ni ficha que leer: no hay nada que hacer.
      perform pgmq.archive('contactos_web', r.msg_id);
    elsif r.read_ct > 3 then
      perform pgmq.archive('contactos_web', r.msg_id);
      update leads set enrichment_status = 'error', last_enriched_at = now() where leads.id = l.id;
    else
      id := r.msg_id; intentos := r.read_ct; lead_id := l.id; empresa := l.empresa;
      web := l.web; maps := v_maps;
      return next;
    end if;
  end loop;
end $fn$;

create or replace function contactos_web_encolar_maps(p_lead_id uuid, p_enlace text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_id bigint;
begin
  if auth.role() <> 'service_role' and coalesce(auth_role()::text, '') not in ('admin', 'vendedor') then
    raise exception 'sin permiso';
  end if;
  if nullif(btrim(coalesce(p_enlace, '')), '') is null then
    raise exception 'falta el enlace de la ficha';
  end if;
  if not exists (select 1 from leads where id = p_lead_id and deleted_at is null) then
    raise exception 'el lead no existe';
  end if;

  -- Ya pendiente con ficha: no se lee dos veces.
  select msg_id into v_id from pgmq.q_contactos_web
   where message->>'lead_id' = p_lead_id::text and message ? 'maps' limit 1;
  if v_id is not null then
    return v_id;
  end if;

  return pgmq.send('contactos_web', jsonb_build_object('lead_id', p_lead_id, 'maps', btrim(p_enlace)));
end $fn$;

create or replace function ficha_maps_guardar(p_lead_id uuid, p_item jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  l leads%rowtype;
  v_item jsonb;
begin
  select * into l from leads where id = p_lead_id and deleted_at is null;
  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'no existe');
  end if;
  -- Sin clave propia, importar_leads emparejaría por nombre + ciudad y podría
  -- tocar otro lead. Mejor no guardar nada.
  if l.place_id is null and l.google_maps is null then
    return jsonb_build_object('ok', false, 'motivo', 'el lead no tiene enlace de Maps');
  end if;

  v_item := coalesce(p_item, '{}'::jsonb) - 'placeId' - 'url' - 'title'
    || jsonb_build_object('title', l.empresa)
    || case when l.place_id    is not null then jsonb_build_object('placeId', l.place_id)  else '{}'::jsonb end
    || case when l.google_maps is not null then jsonb_build_object('url', l.google_maps)   else '{}'::jsonb end;

  perform importar_leads(jsonb_build_array(v_item), 'google_maps', null);

  update leads x set
    nicho = case
              when (x.nicho is null or x.nicho = 'otros') and nullif(p_item->>'categoryName', '') is not null
              then normalizar_nicho(p_item->>'categoryName', null)
              else x.nicho
            end,
    -- La de Google trae número y edificio; la de OSM solo la calle.
    direccion = case
                  when x.google_maps like '%ftid=%' and nullif(p_item->>'address', '') is not null
                  then p_item->>'address'
                  else x.direccion
                end
  where x.id = p_lead_id;

  return jsonb_build_object('ok', true, 'web', (select nullif(btrim(web), '') from leads where id = p_lead_id));
end $fn$;

revoke execute on function
  contactos_web_leer(int, int), contactos_web_encolar_maps(uuid, text), ficha_maps_guardar(uuid, jsonb)
from public, anon, authenticated;

grant execute on function
  contactos_web_leer(int, int), contactos_web_encolar_maps(uuid, text), ficha_maps_guardar(uuid, jsonb)
to service_role;

grant execute on function contactos_web_encolar_maps(uuid, text) to authenticated;

commit;

-- Rellenar los leads que ya se pegaron con enlace (los de `?ftid=`):
--   select contactos_web_encolar_maps(id, google_maps || '&hl=en')
--     from leads where deleted_at is null and google_maps like '%ftid=%';
