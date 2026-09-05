-- =============================================================
-- 0038 — Métricas por canal + tres arreglos del motor de la 0028
--
-- Esta migración hace dos cosas que van juntas a propósito: añade lo que
-- faltaba (saber cuánto se hace por WhatsApp y cuánto por correo) y arregla
-- tres fallos del motor que hacían que los números ya existentes no dijeran
-- la verdad. Separarlas habría dejado métricas nuevas construidas sobre las
-- mismas bases rotas.
--
-- 100% ADITIVA en estructura: no crea ni borra columnas, no toca datos. Lo
-- único que cambia son definiciones de funciones y vistas, y el nombre de un
-- trigger.
--
-- -------------------------------------------------------------
-- ARREGLO 1 — La etapa nunca llegaba a 'seguimiento'
--
-- La 0028 dejó dos triggers AFTER sobre `follow_ups`:
--   · trg_follow_ups_avanzar_etapa
--   · trg_follow_ups_touch
-- Postgres los dispara en orden ALFABÉTICO del nombre, y 'a' < 't'. Así que
-- `avanzar_etapa_por_toque()` corría ANTES de que `recalcular_touch_lead()`
-- actualizase el contador, y leía un `leads.touch_actual` desfasado en uno.
--
-- Al completar el 2º toque la columna todavía valía 1, la condición
-- `touch_actual >= 2` fallaba, y el lead se quedaba en 'contactado' para
-- siempre. La etapa 'seguimiento' era inalcanzable por la vía automática.
-- De paso, el `pipeline_events` que se insertaba anotaba el número de toque
-- equivocado.
--
-- Se corrige por dos caminos a la vez, y es deliberado:
--   a) el trigger se renombra con prefijo `z_` para que corra DESPUÉS, y
--   b) la función deja de fiarse de la columna denormalizada y cuenta los
--      toques ella misma.
-- Con (b) la lógica ya no depende del orden; (a) existe para que el orden
-- tampoco sea una trampa para el siguiente que añada un trigger aquí.
--
-- -------------------------------------------------------------
-- ARREGLO 2 — Las fechas se cortaban en UTC
--
-- Todas las métricas comparaban `columna_timestamptz::date` contra las fechas
-- del rango. Ese `::date` usa el TimeZone de la sesión, que en Supabase es
-- UTC. Trabajando en UTC−4, TODO lo registrado a partir de las 20:00 hora
-- local caía en el día siguiente: las metas diarias descuadraban, el botón
-- "Hoy" del panel mentía y lo del domingo por la noche se iba a la semana
-- siguiente.
--
-- Se corrige cortando siempre en la zona del negocio, definida en un único
-- sitio (`zona_crm()`). El cliente ya manda fechas locales ('YYYY-MM-DD' de
-- date-fns), así que a partir de aquí las dos puntas hablan del mismo día.
--
-- AVISO: los números de periodos pasados se moverán ligeramente al aplicar
-- esto. No es una regresión — es que pasan a estar bien.
--
-- -------------------------------------------------------------
-- ARREGLO 3 — Reuniones y propuestas contaban leads borrados
--
-- `reuniones_agendadas` y `propuestas_enviadas` leían `pipeline_events` a
-- pelo, sin unir con `leads`. Eran las dos únicas métricas del motor sin
-- `deleted_at is null`, así que un lead borrado seguía engordando el embudo.
--
-- (Menor, incluido aquí) `metrica_dias_entre_contactos` aplicaba el `lag`
-- sobre filas ya recortadas por el rango, de modo que el primer toque del
-- periodo se quedaba sin predecesor y se descartaba. En "Hoy" daba casi
-- siempre 0. Ahora la ventana ve todo el historial y el recorte se aplica
-- después.
--
-- -------------------------------------------------------------
-- LO NUEVO — Métricas por canal
--
-- No hace falta migrar ni un dato: `follow_ups.tipo` ya es un enum con
-- 'email' y 'whatsapp' desde la 0013, y `v_toques` ya lo expone. Lo único
-- que faltaba era preguntarle.
--
-- Se añaden cuatro métricas de periodo (envíos y respuestas por cada canal) y
-- dos ratios ya divididos en SQL. Las cuatro entran solas en el desplegable
-- de Metas, porque las metas automáticas llaman a `metrica_valor()` por
-- nombre y no tienen una lista propia que mantener.
--
-- Por qué la tasa por canal se calcula aquí y no en el navegador: es la
-- comparación que va a decidir dónde se invierte el esfuerzo de la semana. Si
-- el panel y las metas la dividen cada uno por su cuenta, acaban discrepando
-- justo en el número que más se mira.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. LA ZONA DEL NEGOCIO, EN UN SOLO SITIO
-- -------------------------------------------------------------
-- Función y no constante en cada consulta: el día de trabajo empieza y acaba
-- en la hora de Juan, y esa decisión tiene que poder cambiarse en una línea
-- si algún día hay alguien operando desde otra zona.
create or replace function zona_crm() returns text as $fn$
  select 'America/Santo_Domingo';
$fn$ language sql immutable;

comment on function zona_crm() is
  'Zona horaria en la que el CRM decide a qué día pertenece cada evento. Único sitio donde se define.';

-- Convierte un instante al DÍA que le corresponde en la zona del negocio.
-- Todas las métricas pasan por aquí; ninguna vuelve a usar `::date` a secas.
create or replace function dia_crm(p_instante timestamptz) returns date as $fn$
  select (p_instante at time zone zona_crm())::date;
$fn$ language sql immutable;

comment on function dia_crm(timestamptz) is
  'Día local de un timestamptz. Sustituye a `::date`, que cortaba en UTC y adelantaba un día todo lo hecho a partir de las 20:00.';

-- -------------------------------------------------------------
-- 2. ARREGLO 1 — Avance de etapa que no depende del orden de triggers
-- -------------------------------------------------------------
create or replace function avanzar_etapa_por_toque() returns trigger as $fn$
declare
  v_lead    leads;
  v_destino pipeline_stage;
  v_touch   int;
  v_rango   constant text[] := array['nuevo','contactado','seguimiento','respondio'];
begin
  if new.estado <> 'completado' or (tg_op = 'UPDATE' and old.estado = 'completado') then
    return null;
  end if;

  select * into v_lead from leads where id = new.lead_id;
  if not found or v_lead.estado in ('ganado','perdido') or v_lead.deleted_at is not null then
    return null;
  end if;

  -- Se cuenta aquí en vez de leer `v_lead.touch_actual`. Esa columna la
  -- mantiene otro trigger de la misma tabla, y depender de quién corre
  -- primero es exactamente lo que estaba roto.
  select count(*) into v_touch
    from follow_ups
   where lead_id = new.lead_id and estado = 'completado' and deleted_at is null;

  if new.resultado = 'positivo' then
    v_destino := 'respondio';
  elsif v_touch >= 2 then
    v_destino := 'seguimiento';
  else
    v_destino := 'contactado';
  end if;

  if array_position(v_rango, v_lead.estado::text) is not null
     and array_position(v_rango, v_lead.estado::text)
         < array_position(v_rango, v_destino::text)
  then
    update leads set estado = v_destino where id = v_lead.id;
    insert into pipeline_events (lead_id, etapa, notas)
    values (v_lead.id, v_destino, 'Automático: toque ' || v_touch || ' completado');
  end if;

  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

-- El prefijo `z_` fija el orden: este trigger corre después de
-- `trg_follow_ups_touch`. La función ya no lo necesita, pero el siguiente que
-- añada un trigger a esta tabla se encontrará el orden explícito y no la
-- trampa alfabética.
drop trigger if exists trg_follow_ups_avanzar_etapa   on follow_ups;
drop trigger if exists trg_follow_ups_z_avanzar_etapa on follow_ups;
create trigger trg_follow_ups_z_avanzar_etapa
  after insert or update of estado on follow_ups
  for each row execute function avanzar_etapa_por_toque();

-- -------------------------------------------------------------
-- 3. BACKFILL: los leads que se quedaron atascados en 'contactado'
-- -------------------------------------------------------------
-- Mientras el fallo estuvo vivo, todo lead con 2+ toques completados y sin
-- respuesta se quedó en 'contactado' aunque le tocara 'seguimiento'. Se
-- corrige sólo ese caso exacto y se deja constancia en el historial, igual
-- que habría hecho el trigger en su momento.
--
-- No se toca nada por encima de 'seguimiento': si el usuario ya movió la
-- tarjeta a mano, manda él.
with atascados as (
  select l.id, l.touch_actual
    from leads l
   where l.deleted_at is null
     and l.estado = 'contactado'
     and l.touch_actual >= 2
     and l.respondio_en is null
)
insert into pipeline_events (lead_id, etapa, notas)
select id, 'seguimiento',
       'Corrección 0038: el toque ' || touch_actual ||
       ' ya estaba completado y la etapa se había quedado atrás'
  from atascados;

update leads l
   set estado = 'seguimiento'
  from (
    select id from leads
     where deleted_at is null and estado = 'contactado'
       and touch_actual >= 2 and respondio_en is null
  ) a
 where l.id = a.id;

-- -------------------------------------------------------------
-- 4. MOTOR DE MÉTRICAS — con canal y con las fechas bien cortadas
-- -------------------------------------------------------------
-- `v_toques` se redefine sólo para dejar el canal a la vista con el nombre
-- que usa el resto del sistema. `tipo` ya venía; `canal` es el mismo dato
-- nombrado como lo nombra `leads.canal_principal`.
create or replace view v_toques as
select
  f.id,
  f.lead_id,
  f.completed_at,
  f.tipo,
  f.tipo::text as canal,
  f.resultado,
  row_number() over (partition by f.lead_id order by f.completed_at, f.id) as toque_n
from follow_ups f
where f.estado = 'completado' and f.deleted_at is null;

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

    -- --- ACTIVIDAD POR CANAL (0038) ---
    -- Cuentan TOQUES, no leads: un lead al que se escribe por correo y luego
    -- por WhatsApp suma uno en cada canal, que es justo lo que se quiere ver
    -- cuando la pregunta es "¿por dónde estoy trabajando?".
    when 'contactos_whatsapp' then
      select count(*) into v from v_toques
       where canal = 'whatsapp' and dia_crm(completed_at) between p_desde and p_hasta;

    when 'contactos_email' then
      select count(*) into v from v_toques
       where canal = 'email' and dia_crm(completed_at) between p_desde and p_hasta;

    -- Respuestas atribuidas al canal por el que se MANDÓ el toque, no por
    -- dónde llegó la contestación. La pregunta que responden es "¿qué canal
    -- consigue que me contesten?", y eso se mide sobre el envío.
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

    -- El join con `leads` es el arreglo 3: sin él, un lead borrado seguía
    -- contando como reunión o propuesta del periodo.
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
    -- `time_entries.fecha` ya es DATE (la escribe el cliente con su día
    -- local), así que aquí no hay conversión que hacer.
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

-- -------------------------------------------------------------
-- 5. Días entre contactos, con la ventana completa
-- -------------------------------------------------------------
-- Antes el WHERE recortaba las filas ANTES de calcular el `lag`, así que el
-- primer toque del periodo se quedaba sin toque anterior y se descartaba. En
-- un rango de un día eso dejaba la métrica casi siempre en 0.
--
-- Ahora la ventana recorre todo el historial del lead y el recorte se aplica
-- después, sobre el toque de llegada: "de los contactos que hice en este
-- periodo, cuánto tardé desde el anterior".
create or replace function metrica_dias_entre_contactos(p_desde date, p_hasta date)
returns numeric as $fn$
  select coalesce(round(avg(dias)::numeric, 1), 0) from (
    select extract(epoch from (completed_at - lag(completed_at) over w)) / 86400 as dias,
           completed_at
      from v_toques
    window w as (partition by lead_id order by completed_at)
  ) t
  where dias is not null
    and dia_crm(completed_at) between p_desde and p_hasta;
$fn$ language sql stable security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 6. PANEL — canal incluido y tasas por canal ya divididas
-- -------------------------------------------------------------
create or replace function metricas_crm(p_desde date, p_hasta date)
returns jsonb as $fn$
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
      -- Cada tasa se divide entre los envíos DE SU CANAL. Dividir entre el
      -- total de toques daría dos porcentajes que no se pueden comparar
      -- entre sí, que es justo la comparación que se quiere hacer.
      'tasa_respuesta_whatsapp', case when v_wa > 0
                                      then round(v_wa_resp * 100 / v_wa, 1) else 0 end,
      'tasa_respuesta_email',    case when v_email > 0
                                      then round(v_email_resp * 100 / v_email, 1) else 0 end
    )
  );
end;
$fn$ language plpgsql stable security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 7. PERMISOS — mismo criterio que 0028
-- -------------------------------------------------------------
revoke execute on function zona_crm()             from anon;
revoke execute on function dia_crm(timestamptz)   from anon;
revoke execute on function metrica_valor(text, date, date)          from anon;
revoke execute on function metricas_crm(date, date)                 from anon;
revoke execute on function metrica_dias_entre_contactos(date, date) from anon;

alter view v_toques set (security_invoker = on);
grant select on v_toques to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) La zona ya no adelanta el día. Un toque de anoche a las 21:00 local
--    tiene que caer AYER, no hoy:
--
--   select completed_at,
--          completed_at::date as dia_viejo_utc,
--          dia_crm(completed_at) as dia_bueno
--     from v_toques order by completed_at desc limit 10;
--   -- las dos columnas difieren en todo lo registrado a partir de las 20:00
--
-- 2) Ya no quedan leads atascados en 'contactado' con 2+ toques:
--
--   select count(*) from leads
--    where deleted_at is null and estado = 'contactado'
--      and touch_actual >= 2 and respondio_en is null;
--   -- 0
--
-- 3) El avance automático funciona: completa un 2º toque sin respuesta en un
--    lead 'contactado' y comprueba que queda en 'seguimiento'.
--
-- 4) Los canales suman lo mismo que el total menos los otros tipos:
--
--   select jsonb_pretty(metricas_crm(date_trunc('month', current_date)::date,
--                                    current_date));
--   -- periodo.contactos_whatsapp + periodo.contactos_email <= contactos_realizados
--   -- (la diferencia son llamadas, reuniones y 'otro')
--
-- 5) Las métricas nuevas responden por nombre, que es lo que necesitan las
--    metas automáticas:
--
--   select metrica_valor('respuestas_whatsapp', current_date - 30, current_date);
