-- 1) search_path fijo en todas las funciones (evita hijacking vía search_path)
alter function set_updated_at() set search_path = public;
alter function auth_role() set search_path = public;
alter function soft_delete_lead(uuid) set search_path = public;
alter function restore_lead(uuid) set search_path = public;
alter function purge_lead(uuid) set search_path = public;
alter function convert_web_lead(uuid) set search_path = public;
alter function handle_new_user() set search_path = public;

-- 2) pipeline_current no debe ser security definer (debe respetar RLS del usuario)
drop view if exists pipeline_current;
create view pipeline_current with (security_invoker = true) as
  select distinct on (lead_id) *
  from pipeline_events
  order by lead_id, changed_at desc;

-- 3) anon no debe poder invocar las RPCs de negocio (defensa en profundidad)
revoke execute on function soft_delete_lead(uuid) from anon;
revoke execute on function restore_lead(uuid) from anon;
revoke execute on function purge_lead(uuid) from anon;
revoke execute on function convert_web_lead(uuid) from anon;
revoke execute on function auth_role() from anon;
revoke execute on function handle_new_user() from anon, authenticated;
