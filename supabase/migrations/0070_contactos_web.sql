-- =============================================================
-- 0070_contactos_web.sql — Robot de contactos propio (sustituye a Apify
-- en la parte de sacar correos, teléfonos y redes de la web del negocio).
--
-- 1. Cola `contactos_web` (pgmq), separada de `tareas`: la de `tareas` la
--    recoge n8n («Trabajador de tareas») y no sabría qué hacer con estos
--    trabajos. El robot vive en el servidor de casa (contactos-web/) y solo
--    lee esta cola. Si la casa está apagada, los trabajos esperan.
--
-- 2. Encolar: un lead (botón del CRM, o la Edge Function que importa desde
--    un enlace de Google Maps) o un lote de los que tienen web y nunca se
--    enriquecieron (para recuperar lo que Apify dejó a medias).
--
-- 3. Funciones del robot: leer y marcar hecha. Los resultados se guardan con
--    `enriquecer_lead` (0047), que ya suma sin pisar lo que haya.
--
-- No toca `leads` ni ninguna función existente. Idempotente.
-- =============================================================

begin;

create extension if not exists pgmq;

do $do$ begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'contactos_web') then
    perform pgmq.create('contactos_web');
  end if;
end $do$;

-- ---------------------------------------------------------------
-- Encolar un lead
-- ---------------------------------------------------------------
-- Desde el CRM (admin/vendedor) o con la clave de servicio. Si ya hay un
-- trabajo pendiente para ese lead no se duplica: pulsar dos veces el botón
-- no debe leer la misma web dos veces.
create or replace function contactos_web_encolar(p_lead_id uuid)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_web text;
  v_id  bigint;
begin
  if auth.role() <> 'service_role' and coalesce(auth_role()::text, '') not in ('admin', 'vendedor') then
    raise exception 'sin permiso';
  end if;

  select nullif(btrim(web), '') into v_web from leads where id = p_lead_id and deleted_at is null;
  if v_web is null then
    raise exception 'el lead no tiene web';
  end if;

  select msg_id into v_id from pgmq.q_contactos_web where message->>'lead_id' = p_lead_id::text limit 1;
  if v_id is not null then
    return v_id;
  end if;

  return pgmq.send('contactos_web', jsonb_build_object('lead_id', p_lead_id));
end $fn$;

-- ---------------------------------------------------------------
-- Encolar un lote: los que tienen web y nunca se enriquecieron
-- ---------------------------------------------------------------
-- Solo admin. El robot va de uno en uno, así que un lote grande simplemente
-- tarda más; no carga el servidor.
create or replace function contactos_web_encolar_pendientes(p_max int default 200)
returns int
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  r   record;
  v_n int := 0;
begin
  if auth.role() <> 'service_role' and coalesce(auth_role()::text, '') <> 'admin' then
    raise exception 'sin permiso';
  end if;

  for r in
    select l.id
      from leads l
     where l.deleted_at is null
       and nullif(btrim(l.web), '') is not null
       and l.last_enriched_at is null
       and not exists (select 1 from pgmq.q_contactos_web q where q.message->>'lead_id' = l.id::text)
     order by l.created_at desc
     limit greatest(1, least(coalesce(p_max, 200), 2000))
  loop
    perform pgmq.send('contactos_web', jsonb_build_object('lead_id', r.id));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $fn$;

-- ---------------------------------------------------------------
-- Robot
-- ---------------------------------------------------------------
-- Lee hasta p_cantidad trabajos y los oculta p_segundos: si el robot se cae a
-- mitad, reaparecen solos. A partir del 4º intento se dan por perdidos: se
-- archivan y el lead queda marcado `error` para que el CRM lo diga.
create or replace function contactos_web_leer(p_cantidad int default 1, p_segundos int default 300)
returns table (id bigint, intentos int, lead_id uuid, empresa text, web text)
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  r record;
  l record;
begin
  for r in select * from pgmq.read('contactos_web', p_segundos, p_cantidad) loop
    select x.id, x.empresa, nullif(btrim(x.web), '') as web
      into l
      from leads x
     where x.id = (r.message->>'lead_id')::uuid and x.deleted_at is null;

    if l.id is null or l.web is null then
      -- Borrado o sin web desde que se encoló: no hay nada que hacer.
      perform pgmq.archive('contactos_web', r.msg_id);
    elsif r.read_ct > 3 then
      perform pgmq.archive('contactos_web', r.msg_id);
      update leads set enrichment_status = 'error', last_enriched_at = now() where leads.id = l.id;
    else
      id := r.msg_id; intentos := r.read_ct; lead_id := l.id; empresa := l.empresa; web := l.web;
      return next;
    end if;
  end loop;
end $fn$;

create or replace function contactos_web_hecha(p_id bigint)
returns boolean
language sql security definer set search_path = public, pg_temp as $fn$
  select pgmq.archive('contactos_web', p_id);
$fn$;

-- Cuántos esperan, para que el CRM pueda decir «en cola».
create or replace function contactos_web_pendientes()
returns int
language sql security definer stable set search_path = public, pg_temp as $fn$
  select count(*)::int from pgmq.q_contactos_web;
$fn$;

-- ---------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------
revoke execute on function
  contactos_web_encolar(uuid), contactos_web_encolar_pendientes(int),
  contactos_web_leer(int, int), contactos_web_hecha(bigint), contactos_web_pendientes()
from public, anon, authenticated;

grant execute on function
  contactos_web_encolar(uuid), contactos_web_encolar_pendientes(int),
  contactos_web_leer(int, int), contactos_web_hecha(bigint), contactos_web_pendientes()
to service_role;

grant execute on function
  contactos_web_encolar(uuid), contactos_web_encolar_pendientes(int), contactos_web_pendientes()
to authenticated;

commit;

-- VERIFICACIÓN
--   select contactos_web_pendientes();
--   select * from pgmq.a_contactos_web order by archived_at desc limit 10;
