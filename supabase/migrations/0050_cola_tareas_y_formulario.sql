-- =============================================================
-- 0050_cola_tareas_y_formulario.sql — Fase 1 del plan de arquitectura
-- («Supabase guarda, n8n trabaja»).
--
-- 1. COLA `tareas` con Supabase Queues (pgmq) y su cola de fallidos. Lo que
--    haya que hacer despues de guardar algo (avisar, enriquecer, enviar) se
--    apunta aqui; n8n lo recoge cuando puede. Si la casa esta apagada, las
--    tareas esperan.
--
-- 2. `recibir_formulario_web(jsonb)`: guarda el contacto del formulario de
--    jddeveloper.com y encola su aviso EN LA MISMA TRANSACCION: o las dos
--    cosas o ninguna. La llama la Edge Function `recibir-formulario`.
--    Duplicados: la clave de la 0044 (email + mensaje + dia). El workflow de
--    n8n nunca llego a mandarla, asi que la 0044 no estaba protegiendo nada.
--
-- 3. Funciones del trabajador (n8n): leer, marcar hecha, marcar fallo. A los
--    5 intentos la tarea pasa a `tareas_fallidas` y el CRM la muestra.
--
-- pgmq vive en su propio esquema, que PostgREST no expone: todo se hace por
-- estas funciones. Las del trabajador solo las puede llamar service_role.
-- =============================================================

begin;

create extension if not exists pgmq;

do $do$ begin
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'tareas') then
    perform pgmq.create('tareas');
  end if;
  if not exists (select 1 from pgmq.list_queues() where queue_name = 'tareas_fallidas') then
    perform pgmq.create('tareas_fallidas');
  end if;
end $do$;

-- ---------------------------------------------------------------
-- Encolar (uso interno y, en la fase 2, desde el CRM)
-- ---------------------------------------------------------------
create or replace function tareas_encolar(p_tipo text, p_datos jsonb default '{}'::jsonb)
returns bigint
language sql security definer set search_path = public, pg_temp as $fn$
  select pgmq.send('tareas', jsonb_build_object('tipo', p_tipo, 'datos', coalesce(p_datos, '{}'::jsonb)));
$fn$;

-- ---------------------------------------------------------------
-- Formulario web
-- ---------------------------------------------------------------
create or replace function recibir_formulario_web(p jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_email   text := lower(btrim(coalesce(p->>'email', '')));
  v_nombre  text := btrim(coalesce(p->>'nombre', ''));
  v_mensaje text := btrim(coalesce(p->>'mensaje', p->>'detalle', ''));
  v_clave   text;
  v_id      uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_nombre = '' then
    raise exception 'formulario incompleto: hacen falta nombre y email valido';
  end if;

  v_clave := 'WL-' || md5(v_email || '|' || v_mensaje || '|' || dia_crm(now())::text);

  insert into web_leads (
    nombre, email, telefono, mensaje, empresa, asunto, pagina, url, referrer,
    utm_source, utm_medium, utm_campaign, ip, user_agent, fuente, formulario,
    estado, prioridad, etiquetas, dedup_key
  ) values (
    left(v_nombre, 200), left(v_email, 320),
    nullif(left(btrim(coalesce(p->>'telefono', '')), 60), ''),
    left(v_mensaje, 5000),
    nullif(left(btrim(coalesce(p->>'empresa', '')), 200), ''),
    nullif(left(btrim(coalesce(p->>'asunto', '')), 300), ''),
    nullif(left(p->>'pagina', 500), ''), nullif(left(p->>'url', 1000), ''),
    nullif(left(p->>'referrer', 1000), ''),
    nullif(left(p->>'utm_source', 200), ''), nullif(left(p->>'utm_medium', 200), ''),
    nullif(left(p->>'utm_campaign', 200), ''),
    nullif(left(p->>'ip', 100), ''), nullif(left(p->>'user_agent', 500), ''),
    coalesce(nullif(p->>'fuente', ''), 'web'), nullif(left(p->>'formulario', 200), ''),
    'nuevo', 'media', '{}', v_clave
  )
  on conflict (dedup_key) do nothing
  returning id into v_id;

  if v_id is null then
    -- Doble clic o reenvio el mismo dia: ya estaba guardado y avisado.
    return jsonb_build_object('ok', true, 'nuevo', false);
  end if;

  perform tareas_encolar('avisar_formulario', jsonb_build_object('web_lead_id', v_id));
  return jsonb_build_object('ok', true, 'nuevo', true, 'id', v_id);
end $fn$;

-- ---------------------------------------------------------------
-- Trabajador (n8n)
-- ---------------------------------------------------------------
-- Lee hasta p_cantidad tareas y las oculta p_segundos: si n8n se cae a mitad,
-- reaparecen solas. Las que ya se intentaron 5 veces pasan a fallidas aqui
-- mismo, antes de entregarse otra vez.
create or replace function tareas_leer(p_cantidad int default 10, p_segundos int default 300)
returns table (id bigint, intentos int, tipo text, datos jsonb, encolada timestamptz)
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare r record;
begin
  for r in select * from pgmq.read('tareas', p_segundos, p_cantidad) loop
    if r.read_ct > 5 then
      perform pgmq.send('tareas_fallidas', r.message || jsonb_build_object('id_original', r.msg_id, 'intentos', r.read_ct - 1));
      perform pgmq.delete('tareas', r.msg_id);
    else
      id := r.msg_id; intentos := r.read_ct; tipo := r.message->>'tipo';
      datos := coalesce(r.message->'datos', '{}'::jsonb); encolada := r.enqueued_at;
      return next;
    end if;
  end loop;
end $fn$;

-- Hecha: se archiva (queda rastro en pgmq.a_tareas) en vez de borrarse.
create or replace function tareas_hecha(p_id bigint)
returns boolean
language sql security definer set search_path = public, pg_temp as $fn$
  select pgmq.archive('tareas', p_id);
$fn$;

-- Fallo: se guarda el motivo en el propio mensaje y se reintenta en
-- p_reintentar_en segundos. El paso a fallidas lo hace tareas_leer.
create or replace function tareas_fallo(p_id bigint, p_error text, p_reintentar_en int default 300)
returns void
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  update pgmq.q_tareas
     set message = message || jsonb_build_object('ultimo_error', left(coalesce(p_error, ''), 1000),
                                                 'ultimo_error_en', now())
   where msg_id = p_id;
  perform pgmq.set_vt('tareas', p_id, p_reintentar_en);
end $fn$;

-- Para la campana del CRM: lo que fallo 5 veces.
create or replace function tareas_fallidas_lista()
returns table (id bigint, tipo text, datos jsonb, ultimo_error text, fallida_en timestamptz)
language sql security definer stable set search_path = public, pg_temp as $fn$
  select msg_id, message->>'tipo', coalesce(message->'datos', '{}'::jsonb),
         message->>'ultimo_error', enqueued_at
    from pgmq.q_tareas_fallidas
   where auth_role() in ('admin', 'vendedor', 'viewer') or auth.role() = 'service_role'
   order by enqueued_at desc
   limit 50;
$fn$;

-- Descartar una fallida desde el CRM (ya atendida a mano).
create or replace function tareas_fallida_descartar(p_id bigint)
returns boolean
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if auth_role() not in ('admin', 'vendedor') then
    raise exception 'sin permiso';
  end if;
  return pgmq.archive('tareas_fallidas', p_id);
end $fn$;

-- ---------------------------------------------------------------
-- Permisos: por defecto nadie; luego solo quien lo necesita.
-- ---------------------------------------------------------------
revoke execute on function
  tareas_encolar(text, jsonb), recibir_formulario_web(jsonb),
  tareas_leer(int, int), tareas_hecha(bigint), tareas_fallo(bigint, text, int),
  tareas_fallidas_lista(), tareas_fallida_descartar(bigint)
from public, anon, authenticated;

grant execute on function
  tareas_encolar(text, jsonb), recibir_formulario_web(jsonb),
  tareas_leer(int, int), tareas_hecha(bigint), tareas_fallo(bigint, text, int),
  tareas_fallidas_lista(), tareas_fallida_descartar(bigint)
to service_role;

grant execute on function tareas_fallidas_lista(), tareas_fallida_descartar(bigint) to authenticated;

commit;
