-- =============================================================
-- 0039 — Contar el contacto donde ocurre de verdad
--
-- PROBLEMA QUE RESUELVE
--
-- La 0038 añadió métricas por canal leyendo `follow_ups`, y salían todas a
-- cero. No era un fallo de cálculo: era que el trabajo NO está ahí.
--
-- El CRM tiene la actividad comercial repartida en tres sitios, y el motor de
-- métricas sólo miraba uno:
--
--   · `follow_ups`        -> toques completados A MANO, desde el modal de
--                            «Completar seguimiento». Lo único que se medía.
--   · `outreach_messages` -> los correos y WhatsApp que SALEN de verdad, los
--                            escriba el CRM o n8n. Nunca se miraron.
--   · `pipeline_events`   -> cada vez que se mueve una tarjeta de etapa. Sólo
--                            se miraba para reuniones y propuestas.
--
-- Comprobado en producción el 4-sep-2026: 8 mensajes en `enviado` (el último
-- ese mismo día) y 11 en `seguimiento_enviado`, mientras el panel del mes
-- enseñaba «0 contactos realizados». El dato estaba; nadie preguntaba por él.
--
-- QUÉ CAMBIA
--
-- 1. Mover una tarjeta de etapa pasa a registrar el toque que implica. No se
--    inventa una métrica nueva: se rellena `follow_ups`, que ya era el
--    registro de contactos del CRM. Así el kanban deja de ser una vía muerta
--    para las métricas y todo lo que ya se derivaba de los toques (número de
--    toque, insistencia, último contacto, respuestas) se alimenta solo.
--
-- 2. Las métricas de canal cuentan los ENVÍOS REALES de `outreach_messages`
--    además de los toques. El canal no hay que adivinarlo: la 0037 dejó por
--    escrito que `whatsapp_enviado` es WhatsApp y que `enviado` y
--    `seguimiento_enviado` son correo.
--
-- POR QUÉ SE DEDUPLICA POR LEAD + DÍA + CANAL
--
-- Las dos fuentes se solapan: mandar el correo por n8n Y registrar el toque
-- a mano es el mismo contacto contado dos veces, y con el punto 1 el solape
-- se vuelve lo normal, no la excepción. Sumar a pelo inflaría la actividad
-- justo cuando el CRM se usa bien, que es el peor momento para mentir.
--
-- La regla es «un lead, un canal, un día = un contacto». No es perfecta —dos
-- correos de verdad al mismo lead el mismo día cuentan uno— pero se equivoca
-- por defecto, y para decidir dónde meter las horas de la semana es mucho
-- mejor quedarse corto que inflado.
--
-- LO QUE NO SE TOCA
--
-- `contactos_realizados` y los `touch_N` siguen contando toques de
-- `follow_ups` y sólo eso. Miden insistencia sobre la secuencia de contacto,
-- que es una pregunta distinta de «por dónde salgo». Con el punto 1 se
-- llenarán solos de todas formas.
--
-- Los 8 registros en `draft` con `sent_at` puesto quedan FUERA: un borrador
-- con fecha de envío es el rastro del fallo que documenta la 0037 (el correo
-- salía y el status no se actualizaba), y no se puede afirmar que salieran.
-- Si mañana se limpian, entrarán solos al pasar a `enviado`.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. MOVER LA TARJETA REGISTRA EL TOQUE
-- -------------------------------------------------------------
-- Sólo para los movimientos que IMPLICAN un contacto. Mover a reunión,
-- propuesta o ganado son consecuencias de un contacto anterior, no contactos
-- nuevos: registrarlos inflaría la cuenta con trabajo que no se hizo.
--
--   · -> 'contactado' / 'seguimiento' -> hubo un toque, aún sin respuesta
--   · -> 'respondio'                  -> hubo un toque Y contestaron
--
-- El canal sale de `leads.canal_principal`, que es lo que declara por dónde
-- se trabaja ese lead. Sin él, 'llamada' — el mismo criterio que ya usa
-- `programar_follow_up_desde_lead()` en la 0013, para no inventar un segundo.
create or replace function registrar_toque_por_etapa() returns trigger as $fn$
declare
  v_tipo      follow_up_tipo;
  v_resultado follow_up_resultado;
  v_orden     int;
begin
  -- Corta la recursión: insertar el toque dispara `avanzar_etapa_por_toque`
  -- (0038), que puede volver a mover el estado del lead y reentrar aquí. Sólo
  -- se reacciona a cambios que vienen de una mano, no de otro trigger.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.deleted_at is not null then
    return null;
  end if;

  v_resultado := case new.estado
                   when 'respondio' then 'positivo'::follow_up_resultado
                   when 'contactado' then 'sin_respuesta'::follow_up_resultado
                   when 'seguimiento' then 'sin_respuesta'::follow_up_resultado
                 end;
  if v_resultado is null then
    return null;
  end if;

  v_tipo := case new.canal_principal
              when 'email'    then 'email'::follow_up_tipo
              when 'whatsapp' then 'whatsapp'::follow_up_tipo
              else 'llamada'::follow_up_tipo
            end;

  -- Si ya hay un toque completado hoy para este lead, el contacto ya está
  -- registrado —a mano, o por un movimiento anterior del mismo día— y no se
  -- duplica. Es también la segunda red contra el bucle de triggers.
  if exists (
    select 1 from follow_ups
     where lead_id = new.id and estado = 'completado' and deleted_at is null
       and dia_crm(completed_at) = dia_crm(now())
  ) then
    return null;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = new.id and deleted_at is null;

  insert into follow_ups (
    lead_id, fecha_programada, tipo, estado, resultado, orden,
    responsable, completed_at, nota
  ) values (
    new.id, dia_crm(now()), v_tipo, 'completado', v_resultado, v_orden,
    new.responsable, now(),
    'Registrado al mover el lead a ' || new.estado::text
  );

  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

comment on function registrar_toque_por_etapa() is
  'Mover una tarjeta a contactado/seguimiento/respondio deja el toque en follow_ups. Sin esto el kanban era una vía muerta para las métricas.';

drop trigger if exists trg_leads_registrar_toque on leads;
create trigger trg_leads_registrar_toque
  after update of estado on leads
  for each row
  when (old.estado is distinct from new.estado)
  execute function registrar_toque_por_etapa();

-- -------------------------------------------------------------
-- 2. LOS ENVÍOS REALES, CON SU CANAL
-- -------------------------------------------------------------
-- El canal no se infiere: lo dice el `status`, tal como lo dejó por escrito
-- la 0037 tras comprobarlo contra la restricción real de producción.
create or replace view v_envios as
select
  o.id,
  o.lead_id,
  o.destinatario,
  o.sent_at,
  case
    when o.status = 'whatsapp_enviado' then 'whatsapp'
    else 'email'
  end as canal
from outreach_messages o
where o.sent_at is not null
  and o.status in ('enviado', 'seguimiento_enviado', 'whatsapp_enviado');

comment on view v_envios is
  'Mensajes que SALIERON, con su canal deducido del status (0037). Los draft con sent_at quedan fuera: no consta que salieran.';

alter view v_envios set (security_invoker = on);
grant select on v_envios to authenticated;

-- -------------------------------------------------------------
-- 3. CONTACTOS POR CANAL — las dos fuentes, sin contar dos veces
-- -------------------------------------------------------------
-- Un lead, un canal y un día son UN contacto, venga de un envío registrado
-- por n8n o de un toque completado en el CRM. La unión de los dos conjuntos
-- con `union` (que deduplica) es literalmente esa regla.
--
-- Los envíos sin `lead_id` —correos sueltos a una dirección, que la 0024
-- dejó registrar— entran igual: son contacto aunque no haya ficha detrás. Se
-- distinguen por el id del propio mensaje para que no colapsen entre sí.
create or replace view v_contactos_canal as
  select
    coalesce(e.lead_id::text, 'suelto:' || e.id::text) as sujeto,
    e.canal,
    dia_crm(e.sent_at) as dia
  from v_envios e
union
  select
    t.lead_id::text,
    t.canal,
    dia_crm(t.completed_at) as dia
  from v_toques t
  where t.canal in ('whatsapp', 'email');

comment on view v_contactos_canal is
  'Un lead + un canal + un día = un contacto. Une envíos reales y toques registrados, deduplicando el solape entre ambos.';

alter view v_contactos_canal set (security_invoker = on);
grant select on v_contactos_canal to authenticated;

-- -------------------------------------------------------------
-- 4. LAS MÉTRICAS DE CANAL, APUNTANDO A LA FUENTE BUENA
-- -------------------------------------------------------------
-- Se reemplaza sólo el tramo de canal de `metrica_valor`. El resto queda
-- exactamente como lo dejó la 0038.
--
-- Las RESPUESTAS siguen saliendo de `follow_ups`: es la única tabla que
-- registra si contestaron o no. `outreach_messages` sabe que algo salió,
-- nunca si sirvió de algo. Con el trigger del punto 1 esa tabla se llena
-- sola, así que la asimetría se corrige con el uso.
create or replace function metrica_valor(
  p_metrica text,
  p_desde   date,
  p_hasta   date
) returns numeric as $fn$
declare v numeric := 0;
begin
  case p_metrica

    -- --- PROSPECCIÓN ---
    when 'leads_encontrados' then
      select count(*) into v from leads
       where deleted_at is null and dia_crm(created_at) between p_desde and p_hasta;

    when 'leads_contactados' then
      select count(*) into v from leads
       where deleted_at is null
         and dia_crm(primer_contacto_en) between p_desde and p_hasta;

    -- --- ACTIVIDAD DE CONTACTO ---
    when 'contactos_realizados' then
      select count(*) into v from v_toques
       where dia_crm(completed_at) between p_desde and p_hasta;

    when 'touch_1' then select count(*) into v from v_toques where toque_n = 1 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_2' then select count(*) into v from v_toques where toque_n = 2 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_3' then select count(*) into v from v_toques where toque_n = 3 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_4' then select count(*) into v from v_toques where toque_n = 4 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_5' then select count(*) into v from v_toques where toque_n >= 5 and dia_crm(completed_at) between p_desde and p_hasta;

    -- --- ACTIVIDAD POR CANAL (0038, corregida en 0039) ---
    when 'contactos_whatsapp' then
      select count(*) into v from v_contactos_canal
       where canal = 'whatsapp' and dia between p_desde and p_hasta;

    when 'contactos_email' then
      select count(*) into v from v_contactos_canal
       where canal = 'email' and dia between p_desde and p_hasta;

    when 'respuestas_whatsapp' then
      select count(*) into v from v_toques
       where canal = 'whatsapp' and resultado in ('positivo','negativo')
         and dia_crm(completed_at) between p_desde and p_hasta;

    when 'respuestas_email' then
      select count(*) into v from v_toques
       where canal = 'email' and resultado in ('positivo','negativo')
         and dia_crm(completed_at) between p_desde and p_hasta;

    -- --- RESULTADO ---
    when 'respuestas_recibidas' then
      select count(*) into v from v_toques
       where resultado in ('positivo','negativo')
         and dia_crm(completed_at) between p_desde and p_hasta;

    when 'leads_respondieron' then
      select count(*) into v from leads
       where deleted_at is null and dia_crm(respondio_en) between p_desde and p_hasta;

    when 'reuniones_agendadas' then
      select count(distinct e.lead_id) into v
        from pipeline_events e
        join leads l on l.id = e.lead_id and l.deleted_at is null
       where e.etapa = 'reunion' and dia_crm(e.changed_at) between p_desde and p_hasta;

    when 'propuestas_enviadas' then
      select count(distinct e.lead_id) into v
        from pipeline_events e
        join leads l on l.id = e.lead_id and l.deleted_at is null
       where e.etapa = 'propuesta' and dia_crm(e.changed_at) between p_desde and p_hasta;

    when 'leads_ganados' then
      select count(*) into v from leads
       where deleted_at is null and estado = 'ganado'
         and dia_crm(cerrado_en) between p_desde and p_hasta;

    when 'leads_perdidos' then
      select count(*) into v from leads
       where deleted_at is null and estado = 'perdido'
         and dia_crm(cerrado_en) between p_desde and p_hasta;

    when 'valor_ganado' then
      select coalesce(sum(valor_estimado), 0) into v from leads
       where deleted_at is null and estado = 'ganado'
         and dia_crm(cerrado_en) between p_desde and p_hasta;

    -- --- ESFUERZO ---
    when 'tiempo_prospeccion_min' then
      select coalesce(sum(duracion_seg), 0) / 60 into v from time_entries
       where deleted_at is null and fecha between p_desde and p_hasta
         and duracion_seg is not null;

    when 'tareas_completadas' then
      select count(*) into v from tasks
       where deleted_at is null and estado = 'hecha'
         and dia_crm(completada_en) between p_desde and p_hasta;

    else
      raise exception 'métrica desconocida: %', p_metrica;
  end case;

  return coalesce(v, 0);
end;
$fn$ language plpgsql stable security definer set search_path = public, pg_temp;

revoke execute on function metrica_valor(text, date, date) from anon;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Los envíos que ya existían aparecen ahora en las métricas. Con los datos
--    del 4-sep-2026 (8 'enviado' + 11 'seguimiento_enviado') esto tiene que
--    dejar de ser cero:
--
--   select metrica_valor('contactos_email', '2026-01-01', current_date);
--
-- 2) La deduplicación funciona: los contactos por canal nunca superan a la
--    suma de las dos fuentes por separado.
--
--   select (select count(*) from v_envios)                      as envios,
--          (select count(*) from v_toques
--            where canal in ('whatsapp','email'))               as toques_canal,
--          (select count(*) from v_contactos_canal)             as contactos;
--   -- contactos <= envios + toques_canal
--
-- 3) Mover una tarjeta deja el toque. Coge un lead en 'nuevo', muévelo a
--    'contactado' desde el kanban y comprueba que aparece su seguimiento:
--
--   select lead_id, tipo, estado, resultado, nota, completed_at
--     from follow_ups order by completed_at desc nulls last limit 5;
--
-- 4) Y que no se duplica: muévelo otra vez a 'seguimiento' el mismo día. No
--    debe crear un segundo toque (ya hay uno hoy).
--
-- 5) El panel del mes, entero:
--
--   select jsonb_pretty(metricas_crm(date_trunc('month', current_date)::date,
--                                    current_date));
