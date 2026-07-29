-- =============================================================
-- 0014_follow_ups_hardening.sql — endurecer lo que introdujo la 0013
--
-- La 0013 dejó tres avisos del linter de seguridad de Supabase. Ninguno
-- rompe nada, pero el primero es de nivel ERROR y no debe quedarse así.
-- Esta migración no cambia ningún comportamiento del módulo: mismos datos,
-- mismas funciones, mismos resultados.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. La vista de agenda debe respetar el RLS de QUIEN CONSULTA
-- -------------------------------------------------------------
-- Por defecto una vista se ejecuta con los permisos de quien la creó
-- (SECURITY DEFINER implícito), saltándose las políticas del usuario real.
-- Con security_invoker las políticas de follow_ups y leads se aplican como
-- corresponde. La vista ya filtra archivados y papelera, así que el
-- resultado visible no cambia.
alter view follow_ups_agenda set (security_invoker = on);

-- -------------------------------------------------------------
-- 2. search_path fijo en las funciones de la 0013
-- -------------------------------------------------------------
-- Sin esto, el search_path lo hereda quien llama, y una función
-- SECURITY DEFINER puede acabar resolviendo una tabla o un operador
-- suplantado. Se fija explícitamente en las nueve.
alter function sync_lead_proximo_seguimiento()   set search_path = public, pg_temp;
alter function programar_follow_up_desde_lead()  set search_path = public, pg_temp;
alter function sync_lead_cierre()                set search_path = public, pg_temp;
alter function cancelar_follow_ups_al_archivar() set search_path = public, pg_temp;
alter function completar_follow_up(uuid, follow_up_resultado, text)              set search_path = public, pg_temp;
alter function programar_follow_up(uuid, date, follow_up_tipo, text, text)       set search_path = public, pg_temp;
alter function reprogramar_follow_up(uuid, date)                                 set search_path = public, pg_temp;
alter function cerrar_lead(uuid, pipeline_stage, text)                           set search_path = public, pg_temp;
alter function reactivar_lead(uuid)                                              set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 3. Las funciones de trigger salen del API REST
-- -------------------------------------------------------------
-- PostgREST las expone en /rest/v1/rpc/ aunque no tenga sentido llamarlas
-- (Postgres rechaza invocar una función de trigger fuera de un trigger).
-- Aun así no deben estar publicadas: superficie de API innecesaria.
revoke execute on function sync_lead_proximo_seguimiento()   from anon, authenticated;
revoke execute on function programar_follow_up_desde_lead()  from anon, authenticated;
revoke execute on function sync_lead_cierre()                from anon, authenticated;
revoke execute on function cancelar_follow_ups_al_archivar() from anon, authenticated;

-- -------------------------------------------------------------
-- 4. Los RPCs del módulo no se llaman sin sesión
-- -------------------------------------------------------------
-- Todos comprueban auth_role() y lanzan 'no autorizado', así que ya estaban
-- protegidos; esto simplemente evita que `anon` llegue siquiera a ejecutarlos.
revoke execute on function completar_follow_up(uuid, follow_up_resultado, text)        from anon;
revoke execute on function programar_follow_up(uuid, date, follow_up_tipo, text, text) from anon;
revoke execute on function reprogramar_follow_up(uuid, date)                           from anon;
revoke execute on function cerrar_lead(uuid, pipeline_stage, text)                     from anon;
revoke execute on function reactivar_lead(uuid)                                        from anon;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- Debe seguir devolviendo 17 / 0, igual que después de la 0013:
--
--   select
--     (select count(*) from follow_ups_agenda) as en_agenda,
--     (select count(*) from leads l
--        left join follow_ups f on f.lead_id = l.id
--         and f.estado='pendiente' and f.deleted_at is null
--       where l.deleted_at is null
--         and l.proximo_seguimiento is distinct from f.fecha_programada) as descuadres;
-- =============================================================
