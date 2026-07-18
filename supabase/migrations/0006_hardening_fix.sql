-- El REVOKE ... FROM anon de 0005 no bastó: Postgres otorga EXECUTE a PUBLIC
-- por defecto en funciones nuevas, y ese grant heredado seguía activo para
-- anon. Se revoca de PUBLIC explícitamente y se re-otorga solo a authenticated.
revoke execute on function auth_role() from public;
revoke execute on function soft_delete_lead(uuid) from public;
revoke execute on function restore_lead(uuid) from public;
revoke execute on function purge_lead(uuid) from public;
revoke execute on function convert_web_lead(uuid) from public;
revoke execute on function handle_new_user() from public;

grant execute on function auth_role() to authenticated;
grant execute on function soft_delete_lead(uuid) to authenticated;
grant execute on function restore_lead(uuid) to authenticated;
grant execute on function purge_lead(uuid) to authenticated;
grant execute on function convert_web_lead(uuid) to authenticated;
-- handle_new_user: sin grant (solo se invoca vía trigger, dueño postgres)
