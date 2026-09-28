-- =============================================================
-- 0048_cerrar_funciones_sin_sesion.sql — lo que el asesor de seguridad de
-- Supabase marcaba el 28-sep-2026.
--
-- 1. FUNCIONES QUE CUALQUIERA PODIA LLAMAR. Postgres da EXECUTE a PUBLIC por
--    defecto, asi que estas siete funciones SECURITY DEFINER se podian llamar
--    por /rest/v1/rpc con la clave anon, sin sesion. Ninguna mira quien llama:
--    las metricas (`metricas_crm` y compania) devolvian los numeros del
--    negocio a quien las pidiera, y `anotar_visto` / `recalcular_touch_lead`
--    escriben. El CRM siempre las llama con sesion iniciada y n8n usa la
--    service key, asi que quitarselas a anon no cambia nada para nadie.
--    Las funciones de trigger no se tocan: PostgREST no las puede ejecutar y
--    el trigger no comprueba EXECUTE al dispararse.
--
-- 2. LA AGENDA VOLVIO A SALTARSE EL RLS. La 0014 puso `security_invoker` en
--    `follow_ups_agenda`, pero la 0020 recreo la vista y la opcion se perdio.
--    Sin ella la vista lee con los permisos de su dueno, no con los de quien
--    consulta.
--
-- 3. SEARCH_PATH SIN FIJAR en ocho funciones auxiliares. Ninguna indexa nada
--    (comprobado en pg_indexes), asi que fijarlo no afecta a ningun indice.
-- =============================================================

begin;

-- 1 -------------------------------------------------------------
revoke execute on function
  anotar_visto(text, text, text, text, uuid),
  goal_dia_de_familia(uuid, date),
  metrica_dias_entre_contactos(date, date),
  metrica_valor(text, date, date),
  metricas_crm(date, date),
  metricas_goals(date, date),
  recalcular_touch_lead(uuid)
from public, anon;

grant execute on function
  anotar_visto(text, text, text, text, uuid),
  goal_dia_de_familia(uuid, date),
  metrica_dias_entre_contactos(date, date),
  metrica_valor(text, date, date),
  metricas_crm(date, date),
  metricas_goals(date, date),
  recalcular_touch_lead(uuid)
to authenticated, service_role;

-- 2 -------------------------------------------------------------
alter view follow_ups_agenda set (security_invoker = on);

-- 3 -------------------------------------------------------------
alter function apify_txt(jsonb, text[])   set search_path = public, pg_temp;
alter function apify_num(jsonb, text[])   set search_path = public, pg_temp;
alter function apify_lista(jsonb, text[]) set search_path = public, pg_temp;
alter function slug_nicho(text)           set search_path = public, pg_temp;
alter function clave_nicho(text)          set search_path = public, pg_temp;
alter function wa_digitos(text)           set search_path = public, pg_temp;
alter function zona_crm()                 set search_path = public, pg_temp;
alter function dia_crm(timestamptz)       set search_path = public, pg_temp;

commit;
