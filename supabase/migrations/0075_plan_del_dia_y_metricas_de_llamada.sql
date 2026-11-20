-- 0075 · El plan de hoy sale de las metas, y las llamadas se cuentan solas
--
-- Juan (20-nov): el «Plan de hoy» del Resumen no puede ser un 20 fijo. Cada
-- mañana escribe su plan («20 llamadas», «5 leads», «terminar la web de X») y
-- lo reparte en mañana / tarde. Eso ya existe: son metas de un día (goals con
-- periodo 'dia'), de número o de casilla. Faltaban dos cosas:
--
--   1. `goals.momento`: en qué parte del día lo piensa hacer. Opcional.
--   2. Métricas para que «20 llamadas» o «15 mensajes» se cuenten solas con
--      lo que registra en la ficha del lead, igual que ya pasa con las demás:
--        - llamadas_realizadas   llamadas (normal, WhatsApp o video) hechas
--        - llamadas_contestadas  de esas, las que no quedaron «sin respuesta»
--        - minutos_llamada       minutos hablando (duracion_seg, 0073)
--        - mensajes_enviados     WhatsApp, correo, SMS, Instagram y LinkedIn
--
-- metrica_valor y metricas_crm se reescriben enteras (create or replace no
-- permite añadir un caso suelto); el resto de casos es idéntico a la 0041.

begin;

alter table goals add column if not exists momento text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_goal_momento') then
    alter table goals
      add constraint ck_goal_momento check (momento is null or momento in ('manana', 'tarde', 'noche'));
  end if;
end $$;

-- ---------------------------------------------------------------
-- metrica_valor
-- ---------------------------------------------------------------
create or replace function metrica_valor(p_metrica text, p_desde date, p_hasta date)
returns numeric
language plpgsql
stable security definer
set search_path = public, pg_temp
as $function$
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

    -- --- LLAMADAS (0075) ---
    when 'llamadas_realizadas' then
      select count(*) into v from v_toques
       where canal in ('llamada', 'llamada_whatsapp', 'videollamada')
         and dia_crm(completed_at) between p_desde and p_hasta;

    when 'llamadas_contestadas' then
      select count(*) into v from v_toques
       where canal in ('llamada', 'llamada_whatsapp', 'videollamada')
         and resultado is distinct from 'sin_respuesta'
         and dia_crm(completed_at) between p_desde and p_hasta;

    when 'minutos_llamada' then
      select coalesce(sum(duracion_seg), 0) / 60 into v from follow_ups
       where deleted_at is null and estado = 'completado'
         and tipo in ('llamada', 'llamada_whatsapp', 'videollamada')
         and dia_crm(completed_at) between p_desde and p_hasta;

    when 'mensajes_enviados' then
      select count(*) into v from v_toques
       where canal in ('whatsapp', 'email', 'sms', 'instagram', 'linkedin')
         and dia_crm(completed_at) between p_desde and p_hasta;

    -- --- ACTIVIDAD POR CANAL (0038, corregida en 0039) ---
    when 'contactos_whatsapp' then
      select count(*) into v from v_contactos_canal
       where canal = 'whatsapp' and dia between p_desde and p_hasta;

    when 'contactos_email' then
      select count(*) into v from v_contactos_canal
       where canal = 'email' and dia between p_desde and p_hasta;

    when 'respuestas_whatsapp' then
      select count(*) into v from v_toques
       where canal = 'whatsapp' and dia_crm(respondido_en) between p_desde and p_hasta;

    when 'respuestas_email' then
      select count(*) into v from v_toques
       where canal = 'email' and dia_crm(respondido_en) between p_desde and p_hasta;

    -- --- RESULTADO ---
    when 'respuestas_recibidas' then
      select count(*) into v from v_toques
       where dia_crm(respondido_en) between p_desde and p_hasta;

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
$function$;

-- ---------------------------------------------------------------
-- metricas_crm: igual que antes + las cuatro nuevas en `periodo`, para que
-- «Mi día» y el Resumen sepan cuánto se hizo hoy de cada una.
-- ---------------------------------------------------------------
create or replace function metricas_crm(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable security definer
set search_path = public, pg_temp
as $function$
declare
  m jsonb;
  s jsonb;
  v_contactados numeric;
  v_toques      numeric;
  v_respuestas  numeric;
  v_ganados     numeric;
  v_perdidos    numeric;
  v_wa          numeric;
  v_email       numeric;
  v_wa_resp     numeric;
  v_email_resp  numeric;
begin
  v_contactados := metrica_valor('leads_contactados',    p_desde, p_hasta);
  v_toques      := metrica_valor('contactos_realizados', p_desde, p_hasta);
  v_respuestas  := metrica_valor('respuestas_recibidas', p_desde, p_hasta);
  v_ganados     := metrica_valor('leads_ganados',        p_desde, p_hasta);
  v_perdidos    := metrica_valor('leads_perdidos',       p_desde, p_hasta);
  v_wa          := metrica_valor('contactos_whatsapp',   p_desde, p_hasta);
  v_email       := metrica_valor('contactos_email',      p_desde, p_hasta);
  v_wa_resp     := metrica_valor('respuestas_whatsapp',  p_desde, p_hasta);
  v_email_resp  := metrica_valor('respuestas_email',     p_desde, p_hasta);

  m := jsonb_build_object(
    'leads_encontrados',      metrica_valor('leads_encontrados',      p_desde, p_hasta),
    'leads_contactados',      v_contactados,
    'contactos_realizados',   v_toques,
    'touch_1',                metrica_valor('touch_1', p_desde, p_hasta),
    'touch_2',                metrica_valor('touch_2', p_desde, p_hasta),
    'touch_3',                metrica_valor('touch_3', p_desde, p_hasta),
    'touch_4',                metrica_valor('touch_4', p_desde, p_hasta),
    'touch_5',                metrica_valor('touch_5', p_desde, p_hasta),
    'llamadas_realizadas',    metrica_valor('llamadas_realizadas',    p_desde, p_hasta),
    'llamadas_contestadas',   metrica_valor('llamadas_contestadas',   p_desde, p_hasta),
    'minutos_llamada',        metrica_valor('minutos_llamada',        p_desde, p_hasta),
    'mensajes_enviados',      metrica_valor('mensajes_enviados',      p_desde, p_hasta),
    'contactos_whatsapp',     v_wa,
    'contactos_email',        v_email,
    'respuestas_whatsapp',    v_wa_resp,
    'respuestas_email',       v_email_resp,
    'respuestas_recibidas',   v_respuestas,
    'leads_respondieron',     metrica_valor('leads_respondieron',     p_desde, p_hasta),
    'reuniones_agendadas',    metrica_valor('reuniones_agendadas',    p_desde, p_hasta),
    'propuestas_enviadas',    metrica_valor('propuestas_enviadas',    p_desde, p_hasta),
    'leads_ganados',          v_ganados,
    'leads_perdidos',         v_perdidos,
    'valor_ganado',           metrica_valor('valor_ganado',           p_desde, p_hasta),
    'tiempo_prospeccion_min', metrica_valor('tiempo_prospeccion_min', p_desde, p_hasta),
    'tareas_completadas',     metrica_valor('tareas_completadas',     p_desde, p_hasta),
    'dias_entre_contactos',   metrica_dias_entre_contactos(p_desde, p_hasta)
  );

  select jsonb_build_object(
    'total_activos',   count(*) filter (where estado not in ('ganado','perdido')),
    'sin_contactar',   count(*) filter (where estado not in ('ganado','perdido') and touch_actual = 0),
    'en_curso',        count(*) filter (where estado not in ('ganado','perdido') and touch_actual > 0),
    'interesados',     count(*) filter (where estado = 'respondio'),
    'reunion',         count(*) filter (where estado = 'reunion'),
    'propuesta',       count(*) filter (where estado = 'propuesta'),
    'negociacion',     count(*) filter (where estado = 'negociacion'),
    'seg_pendientes',  count(*) filter (where situacion in ('programado','hoy')),
    'seg_hoy',         count(*) filter (where situacion = 'hoy'),
    'seg_atrasados',   count(*) filter (where situacion = 'atrasado'),
    'sin_proximo',     count(*) filter (where situacion = 'sin_proximo')
  ) into s from v_leads_seguimiento;

  return jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'periodo', m,
    'situacion', s,
    'ratios', jsonb_build_object(
      'tasa_respuesta',  case when v_toques > 0
                              then round(v_respuestas * 100 / v_toques, 1) else 0 end,
      'tasa_conversion', case when (v_ganados + v_perdidos) > 0
                              then round(v_ganados * 100 / (v_ganados + v_perdidos), 1) else 0 end,
      'toques_por_lead', case when v_contactados > 0
                              then round(v_toques / v_contactados, 1) else 0 end,
      'tasa_respuesta_whatsapp', case when v_wa > 0
                                      then round(v_wa_resp * 100 / v_wa, 1) else 0 end,
      'tasa_respuesta_email',    case when v_email > 0
                                      then round(v_email_resp * 100 / v_email, 1) else 0 end
    )
  );
end;
$function$;

commit;
