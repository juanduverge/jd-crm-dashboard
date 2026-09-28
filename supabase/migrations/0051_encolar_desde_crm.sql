-- =============================================================
-- 0051_encolar_desde_crm.sql — Fase 2 del plan de arquitectura.
--
-- Los botones del CRM que dependen de n8n (enviar correo, puntuar y analizar
-- con IA, buscar prospectos) llaman primero a n8n directo. Si n8n no responde
-- (la casa apagada, n8n reiniciando), en vez de fallar dejan el trabajo en la
-- cola `tareas` (0050) y el «Trabajador de tareas» lo hace al volver.
--
-- Solo usuarios con sesion y rol admin/vendedor, solo estos tipos, y con un
-- tope de tamano: un correo puede llevar un adjunto en base64 y la cola no es
-- sitio para ficheros enormes.
-- =============================================================

begin;

create or replace function encolar_desde_crm(p_tipo text, p_datos jsonb)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if auth_role() not in ('admin', 'vendedor') then
    raise exception 'sin permiso para encolar trabajos';
  end if;
  if p_tipo not in ('enviar_correo', 'puntuar_lead', 'analizar_lead', 'buscar_leads') then
    raise exception 'tipo de trabajo no admitido: %', p_tipo;
  end if;
  if octet_length(coalesce(p_datos, '{}'::jsonb)::text) > 12 * 1024 * 1024 then
    raise exception 'el trabajo es demasiado grande para la cola (adjunto de mas de ~8 MB)';
  end if;
  return tareas_encolar(p_tipo, coalesce(p_datos, '{}'::jsonb) || jsonb_build_object('encolado_por', auth.uid()));
end $fn$;

revoke execute on function encolar_desde_crm(text, jsonb) from public, anon;
grant execute on function encolar_desde_crm(text, jsonb) to authenticated, service_role;

commit;
