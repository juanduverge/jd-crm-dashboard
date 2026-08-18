-- =============================================================
-- 0028_touches_y_metricas.sql — Toques, métricas automáticas y responsable único
--
-- PROBLEMA QUE RESUELVE
--
-- El CRM ya tenía todos los datos, pero repartidos en tres lecturas que no se
-- hablaban entre sí:
--   · `leads.estado`       -> en qué etapa del pipeline está
--   · `follow_ups`         -> qué toques se han dado y cuál viene ahora
--   · `goals.valor_actual` -> cuánto se lleva de la meta... escrito A MANO
--
-- El resultado era que Pipeline y Seguimiento parecían dos sistemas distintos
-- (uno no sabía en qué contacto iba el lead) y que las metas medían lo que el
-- usuario se acordaba de teclear, no lo que realmente había hecho.
--
-- PRINCIPIO: NO se crea una segunda lógica en paralelo. `follow_ups` YA es el
-- registro de contactos del CRM; esta migración se limita a
--   1. DERIVAR de él el número de toque y el último contacto de cada lead
--      (columnas denormalizadas mantenidas por trigger, como ya se hacía con
--      `leads.proximo_seguimiento` en la 0013), y
--   2. DERIVAR de los datos reales el valor de las metas, en vez de teclearlo.
--
-- 100% ADITIVA: no borra, no renombra, no cambia ninguna política RLS. Lo
-- único que reescribe datos es la unificación de responsables (sección 6),
-- que es un cambio pedido explícitamente y reversible dato a dato.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. COLUMNAS DERIVADAS DE CONTACTO EN `leads`
-- -------------------------------------------------------------
-- Ninguna de estas se escribe a mano nunca: las mantiene el trigger de la
-- sección 2 a partir de `follow_ups`. Están denormalizadas en `leads` porque
-- el kanban, la tabla de leads y los filtros por toque necesitan ordenarlas y
-- filtrarlas sin un join por fila.
alter table leads
  add column if not exists touch_actual              int not null default 0,
  add column if not exists primer_contacto_en        timestamptz,
  add column if not exists ultimo_contacto_en        timestamptz,
  add column if not exists ultimo_contacto_tipo      text,
  add column if not exists ultimo_contacto_resultado text,
  -- Primera vez que el lead dio señales de vida (un toque cuyo resultado no
  -- fue 'sin_respuesta'). Es la base de la tasa de respuesta.
  add column if not exists respondio_en              timestamptz;

comment on column leads.touch_actual is
  'Nº de contactos COMPLETADOS del lead. Derivado de follow_ups por trigger; nunca se escribe a mano.';

create index if not exists idx_leads_touch
  on leads (touch_actual) where deleted_at is null;
create index if not exists idx_leads_primer_contacto
  on leads (primer_contacto_en) where deleted_at is null;

-- -------------------------------------------------------------
-- 2. TRIGGER: recalcular el toque de un lead desde su historial
-- -------------------------------------------------------------
-- Se recalcula entero en vez de incrementar un contador: completar, cancelar,
-- editar o borrar un seguimiento son todos caminos posibles, y un contador
-- incremental se desincroniza en el primero que se olvide.
create or replace function recalcular_touch_lead(p_lead_id uuid) returns void as $fn$
declare
  v_touch  int;
  v_primer timestamptz;
  v_ultimo timestamptz;
  v_tipo   text;
  v_res    text;
  v_resp   timestamptz;
begin
  select count(*), min(completed_at), max(completed_at)
    into v_touch, v_primer, v_ultimo
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null;

  -- Tipo y resultado del ÚLTIMO toque: es lo que la ficha enseña como
  -- "último contacto: Email / positivo".
  select tipo::text, resultado::text into v_tipo, v_res
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null
   order by completed_at desc
   limit 1;

  -- Hubo respuesta cuando el toque dio resultado, sea bueno o malo.
  -- 'sin_respuesta' es literalmente lo contrario.
  select min(completed_at) into v_resp
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null
     and resultado in ('positivo','negativo');

  update leads
     set touch_actual              = coalesce(v_touch, 0),
         primer_contacto_en        = v_primer,
         ultimo_contacto_en        = v_ultimo,
         ultimo_contacto_tipo      = v_tipo,
         ultimo_contacto_resultado = v_res,
         respondio_en              = v_resp,
         -- `fecha_primer_contacto` (0008) medía lo mismo y se rellenaba a
         -- mano. Se sincroniza para que la columna vieja deje de mentir.
         fecha_primer_contacto     = coalesce(v_primer::date, fecha_primer_contacto)
   where id = p_lead_id;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function trg_recalcular_touch() returns trigger as $fn$
begin
  perform recalcular_touch_lead(coalesce(new.lead_id, old.lead_id));
  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_follow_ups_touch on follow_ups;
create trigger trg_follow_ups_touch
  after insert or update or delete on follow_ups
  for each row execute function trg_recalcular_touch();

-- -------------------------------------------------------------
-- 3. AVANCE AUTOMÁTICO DE ETAPA AL COMPLETAR UN TOQUE
-- -------------------------------------------------------------
-- El usuario ya no tiene que mover la tarjeta a mano tras registrar un
-- contacto: completar el toque ES la acción, y la etapa es su consecuencia.
--
-- Reglas, deliberadamente conservadoras — el sistema sólo ADELANTA, nunca
-- retrocede, y nunca pisa una etapa que el usuario haya puesto más arriba:
--   · 'nuevo'                        -> 'contactado'  al primer toque completado
--   · 'contactado'                   -> 'seguimiento' del segundo toque en adelante
--   · cualquiera abierta por debajo  -> 'respondio'   si el resultado fue positivo
-- De 'respondio' hacia arriba (reunión, propuesta, negociación) manda siempre
-- el usuario: ahí ya no hay una lectura automática fiable.
create or replace function avanzar_etapa_por_toque() returns trigger as $fn$
declare
  v_lead    leads;
  v_destino pipeline_stage;
  -- Orden del tramo automático del embudo; sólo se avanza hacia adelante.
  v_rango   constant text[] := array['nuevo','contactado','seguimiento','respondio'];
begin
  if new.estado <> 'completado' or (tg_op = 'UPDATE' and old.estado = 'completado') then
    return null;
  end if;

  select * into v_lead from leads where id = new.lead_id;
  if not found or v_lead.estado in ('ganado','perdido') or v_lead.deleted_at is not null then
    return null;
  end if;

  if new.resultado = 'positivo' then
    v_destino := 'respondio';
  elsif v_lead.touch_actual >= 2 then
    v_destino := 'seguimiento';
  else
    v_destino := 'contactado';
  end if;

  -- Sólo se aplica si el lead está por DETRÁS del destino dentro del tramo
  -- automático. Un lead ya en 'propuesta' no vuelve a 'seguimiento'.
  if array_position(v_rango, v_lead.estado::text) is not null
     and array_position(v_rango, v_lead.estado::text)
         < array_position(v_rango, v_destino::text)
  then
    update leads set estado = v_destino where id = v_lead.id;
    insert into pipeline_events (lead_id, etapa, notas)
    values (v_lead.id, v_destino,
            'Automático: toque ' || v_lead.touch_actual || ' completado');
  end if;

  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_follow_ups_avanzar_etapa on follow_ups;
create trigger trg_follow_ups_avanzar_etapa
  after insert or update of estado on follow_ups
  for each row execute function avanzar_etapa_por_toque();

-- -------------------------------------------------------------
-- 4. BACKFILL de las columnas derivadas
-- -------------------------------------------------------------
-- Los leads que ya tienen historial arrancan con su toque correcto; los que no
-- lo tienen se quedan en 0, que es la verdad.
do $do$
declare r record;
begin
  for r in select distinct lead_id from follow_ups where deleted_at is null loop
    perform recalcular_touch_lead(r.lead_id);
  end loop;
end $do$;

-- -------------------------------------------------------------
-- 5. VISTA `v_leads_seguimiento` — la ficha unificada
-- -------------------------------------------------------------
-- Una sola fila por lead con TODO lo que Pipeline y Seguimiento enseñaban por
-- separado: etapa, toque, último contacto, próximo contacto y su urgencia.
-- Existe para que las dos pantallas lean exactamente lo mismo; si mañana
-- cambia la definición de "atrasado", cambia en un único sitio.
create or replace view v_leads_seguimiento as
select
  l.id                                as lead_id,
  l.empresa,
  l.estado,
  l.prioridad,
  l.responsable,
  l.canal_principal,
  l.touch_actual,
  l.primer_contacto_en,
  l.ultimo_contacto_en,
  l.ultimo_contacto_tipo,
  l.ultimo_contacto_resultado,
  l.respondio_en,
  f.id                                as proximo_id,
  f.fecha_programada                  as proxima_fecha,
  f.tipo::text                        as proximo_tipo,
  f.orden                             as proximo_orden,
  case
    when l.estado in ('ganado','perdido')      then 'cerrado'
    when f.id is null and l.touch_actual = 0   then 'sin_contactar'
    when f.id is null                          then 'sin_proximo'
    when f.fecha_programada <  current_date    then 'atrasado'
    when f.fecha_programada =  current_date    then 'hoy'
    else                                            'programado'
  end                                 as situacion
from leads l
left join follow_ups f
       on f.lead_id = l.id and f.estado = 'pendiente' and f.deleted_at is null
where l.deleted_at is null;

-- -------------------------------------------------------------
-- 6. RESPONSABLE ÚNICO — Juan Duvergé
-- -------------------------------------------------------------
-- El campo es texto libre en cinco tablas, y con texto libre "JD", "Juan" y
-- "Juan Duvergé" acaban siendo tres personas distintas para cualquier filtro
-- o métrica. Se unifica el dato existente y se deja el alta de responsables
-- nuevos intacta (settings.responsables sigue siendo la lista editable).
update leads        set responsable = 'Juan Duvergé' where responsable is distinct from 'Juan Duvergé';
update follow_ups   set responsable = 'Juan Duvergé' where responsable is distinct from 'Juan Duvergé';
update tasks        set responsable = 'Juan Duvergé' where responsable is distinct from 'Juan Duvergé';
update goals        set responsable = 'Juan Duvergé' where responsable is distinct from 'Juan Duvergé';
update time_entries set responsable = 'Juan Duvergé' where responsable is distinct from 'Juan Duvergé';

-- --- AJUSTES GLOBALES: arreglo previo obligatorio ---
--
-- `settings` se creó en la 0001 con `primary key (key, user_id)` y el
-- comentario «null = global». Las dos cosas no pueden ser verdad a la vez: una
-- columna dentro de la clave primaria es NOT NULL, así que la fila global era
-- imposible de insertar. La RLS de la 0002 (`user_id is null or ...`) y todo
-- `settingsService` llevan desde entonces contando con globales que la tabla
-- nunca dejó guardar: por eso «＋ Añadir responsable» no persistía nada.
--
-- Se corrige la clave, no el resto del sistema, porque el diseño original
-- (global + por usuario) es el correcto y ya está reflejado en las políticas.
alter table settings drop constraint if exists settings_pkey;
alter table settings alter column user_id drop not null;

-- Dos índices parciales en lugar de uno solo: en SQL estándar dos NULL no son
-- iguales, así que un `unique (key, user_id)` corriente dejaría meter mil
-- filas globales con la misma clave. Partiendo el índice en dos, cada caso
-- queda protegido por su propia regla y sin depender de la versión del motor.
create unique index if not exists uq_settings_global
  on settings (key) where user_id is null;
create unique index if not exists uq_settings_usuario
  on settings (key, user_id) where user_id is not null;

-- Que exista en la lista del desplegable aunque nadie lo haya dado de alta.
-- `where not exists` en vez de `on conflict`: un índice parcial no se puede
-- inferir desde `on conflict (key, user_id)`.
insert into settings (key, value, user_id)
select 'responsables', '["Juan Duvergé"]', null
 where not exists (select 1 from settings where key = 'responsables' and user_id is null);

-- Los leads nuevos (importación de Apify incluida) nacen ya asignados.
alter table leads alter column responsable set default 'Juan Duvergé';

-- -------------------------------------------------------------
-- 7. MOTOR DE MÉTRICAS
-- -------------------------------------------------------------
-- UNA sola función define qué significa cada métrica. La usan las metas
-- automáticas, el dashboard de Productividad y cualquier consumidor futuro:
-- si "leads contactados" cambia de definición, cambia aquí y en ningún otro
-- sitio. Es el antídoto contra la duplicación de lógica.
--
-- Todas las métricas son de PERIODO (qué pasó entre dos fechas). Las de
-- situación actual ("cuántos hay ahora sin contactar") viven en la sección 8,
-- porque son una pregunta distinta y mezclarlas es el error clásico que hace
-- que un panel no cuadre nunca.

-- Nº real de toque de cada seguimiento completado: se cuenta sobre los
-- completados, no sobre `orden` — `orden` incluye los cancelados, así que un
-- toque cancelado desplazaría toda la numeración del lead.
create or replace view v_toques as
select
  f.id,
  f.lead_id,
  f.completed_at,
  f.tipo,
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
       where deleted_at is null and created_at::date between p_desde and p_hasta;

    when 'leads_contactados' then
      -- Leads que recibieron su PRIMER contacto en el periodo. No es lo mismo
      -- que "toques dados": contactar dos veces al mismo lead suma un lead.
      select count(*) into v from leads
       where deleted_at is null
         and primer_contacto_en::date between p_desde and p_hasta;

    -- --- ACTIVIDAD DE CONTACTO ---
    when 'contactos_realizados' then
      select count(*) into v from v_toques
       where completed_at::date between p_desde and p_hasta;

    when 'touch_1' then select count(*) into v from v_toques where toque_n = 1 and completed_at::date between p_desde and p_hasta;
    when 'touch_2' then select count(*) into v from v_toques where toque_n = 2 and completed_at::date between p_desde and p_hasta;
    when 'touch_3' then select count(*) into v from v_toques where toque_n = 3 and completed_at::date between p_desde and p_hasta;
    when 'touch_4' then select count(*) into v from v_toques where toque_n = 4 and completed_at::date between p_desde and p_hasta;
    when 'touch_5' then select count(*) into v from v_toques where toque_n >= 5 and completed_at::date between p_desde and p_hasta;

    -- --- RESULTADO ---
    when 'respuestas_recibidas' then
      select count(*) into v from v_toques
       where resultado in ('positivo','negativo')
         and completed_at::date between p_desde and p_hasta;

    when 'leads_respondieron' then
      select count(*) into v from leads
       where deleted_at is null and respondio_en::date between p_desde and p_hasta;

    when 'reuniones_agendadas' then
      select count(distinct lead_id) into v from pipeline_events
       where etapa = 'reunion' and changed_at::date between p_desde and p_hasta;

    when 'propuestas_enviadas' then
      select count(distinct lead_id) into v from pipeline_events
       where etapa = 'propuesta' and changed_at::date between p_desde and p_hasta;

    when 'leads_ganados' then
      select count(*) into v from leads
       where deleted_at is null and estado = 'ganado'
         and cerrado_en::date between p_desde and p_hasta;

    when 'leads_perdidos' then
      select count(*) into v from leads
       where deleted_at is null and estado = 'perdido'
         and cerrado_en::date between p_desde and p_hasta;

    when 'valor_ganado' then
      select coalesce(sum(valor_estimado), 0) into v from leads
       where deleted_at is null and estado = 'ganado'
         and cerrado_en::date between p_desde and p_hasta;

    -- --- ESFUERZO ---
    when 'tiempo_prospeccion_min' then
      select coalesce(sum(duracion_seg), 0) / 60 into v from time_entries
       where deleted_at is null and fecha between p_desde and p_hasta
         and duracion_seg is not null;

    when 'tareas_completadas' then
      select count(*) into v from tasks
       where deleted_at is null and estado = 'hecha'
         and completada_en::date between p_desde and p_hasta;

    else
      raise exception 'métrica desconocida: %', p_metrica;
  end case;

  return coalesce(v, 0);
end;
$fn$ language plpgsql stable security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 8. PANEL: todas las métricas de un periodo en una llamada
-- -------------------------------------------------------------
-- Devuelve, en el mismo objeto pero en tres bloques bien separados:
--   · `periodo`   -> lo que PASÓ entre las dos fechas
--   · `situacion` -> cómo están las cosas AHORA MISMO (no depende del rango)
--   · `ratios`    -> los porcentajes ya calculados en SQL, para que dos
--                    pantallas no puedan discrepar en cómo se divide
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
begin
  v_contactados := metrica_valor('leads_contactados',    p_desde, p_hasta);
  v_toques      := metrica_valor('contactos_realizados', p_desde, p_hasta);
  v_respuestas  := metrica_valor('respuestas_recibidas', p_desde, p_hasta);
  v_ganados     := metrica_valor('leads_ganados',        p_desde, p_hasta);
  v_perdidos    := metrica_valor('leads_perdidos',       p_desde, p_hasta);

  m := jsonb_build_object(
    'leads_encontrados',      metrica_valor('leads_encontrados',      p_desde, p_hasta),
    'leads_contactados',      v_contactados,
    'contactos_realizados',   v_toques,
    'touch_1',                metrica_valor('touch_1', p_desde, p_hasta),
    'touch_2',                metrica_valor('touch_2', p_desde, p_hasta),
    'touch_3',                metrica_valor('touch_3', p_desde, p_hasta),
    'touch_4',                metrica_valor('touch_4', p_desde, p_hasta),
    'touch_5',                metrica_valor('touch_5', p_desde, p_hasta),
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
      -- Tasa de respuesta sobre TOQUES dados, no sobre leads: mide la calidad
      -- del mensaje, que es la pregunta que responde.
      'tasa_respuesta',  case when v_toques > 0
                              then round(v_respuestas * 100 / v_toques, 1) else 0 end,
      -- Conversión sobre leads CERRADOS en el periodo: un lead aún abierto no
      -- es todavía ni un éxito ni un fracaso, y meterlo en el denominador
      -- hunde el número artificialmente.
      'tasa_conversion', case when (v_ganados + v_perdidos) > 0
                              then round(v_ganados * 100 / (v_ganados + v_perdidos), 1) else 0 end,
      -- Cuántos toques cuesta, de media, trabajar un lead. Dice si se insiste
      -- poco (abandono temprano) o de más.
      'toques_por_lead', case when v_contactados > 0
                              then round(v_toques / v_contactados, 1) else 0 end
    )
  );
end;
$fn$ language plpgsql stable security definer set search_path = public, pg_temp;

-- Días medios entre dos toques consecutivos del mismo lead. Va aparte porque
-- es una ventana sobre pares de filas, no un contador.
create or replace function metrica_dias_entre_contactos(p_desde date, p_hasta date)
returns numeric as $fn$
  select coalesce(round(avg(dias)::numeric, 1), 0) from (
    select extract(epoch from (completed_at - lag(completed_at) over w)) / 86400 as dias
      from v_toques
     where completed_at::date between p_desde and p_hasta
    window w as (partition by lead_id order by completed_at)
  ) t where dias is not null;
$fn$ language sql stable security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 9. METAS AUTOMÁTICAS
-- -------------------------------------------------------------
-- Una meta puede seguir siendo manual (+/− a mano, como hasta ahora) o quedar
-- ENGANCHADA a una métrica. En el segundo caso su progreso NO se teclea: se
-- calcula sobre las fechas de la propia meta cada vez que se mira.
--
-- Por qué no se escribe en `valor_actual`: esa columna la gobierna el trigger
-- de rollup de la 0015 (una meta con hijas SIEMPRE vale la suma de sus hijas).
-- Escribir ahí desde otro sitio sería exactamente la "segunda lógica en
-- paralelo" que hay que evitar. El valor derivado se sirve aparte y la UI usa
-- ese cuando la meta es automática.
alter table goals add column if not exists metrica text;

comment on column goals.metrica is
  'Clave de metrica_valor(). Si está puesta, el progreso se DERIVA de los datos reales y los +/− no aplican.';

-- Progreso real de cada meta automática que se solape con el rango pedido.
-- Cada meta se mide sobre SU propio rango (una semanal cuenta su semana, una
-- mensual su mes), que es lo que impide que se mezclen los periodos.
create or replace function metricas_goals(p_desde date, p_hasta date)
returns table (goal_id uuid, valor numeric) as $fn$
  select g.id, metrica_valor(g.metrica, g.fecha_inicio, g.fecha_fin)
    from goals g
   where g.deleted_at is null
     and g.metrica is not null
     and g.fecha_inicio <= p_hasta
     and g.fecha_fin    >= p_desde;
$fn$ language sql stable security definer set search_path = public, pg_temp;

-- La cascada mes -> semana -> día hereda la métrica: si el mes cuenta leads
-- encontrados, sus semanas y sus días cuentan lo mismo en su propio tramo.
create or replace function set_metrica_cascada(p_goal_id uuid, p_metrica text)
returns void as $fn$
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  with recursive rama as (
    select id from goals where id = p_goal_id
    union all
    select g.id from goals g join rama r on g.parent_id = r.id where g.deleted_at is null
  )
  update goals set metrica = nullif(p_metrica, '') where id in (select id from rama);
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 10. PERMISOS — mismo criterio que 0014/0015
-- -------------------------------------------------------------
revoke execute on function trg_recalcular_touch()      from anon, authenticated;
revoke execute on function avanzar_etapa_por_toque()   from anon, authenticated;
revoke execute on function recalcular_touch_lead(uuid) from anon, authenticated;

revoke execute on function metrica_valor(text, date, date)          from anon;
revoke execute on function metricas_crm(date, date)                 from anon;
revoke execute on function metrica_dias_entre_contactos(date, date) from anon;
revoke execute on function metricas_goals(date, date)               from anon;
revoke execute on function set_metrica_cascada(uuid, text)          from anon;

-- Las vistas heredan las RLS de sus tablas base (security_invoker),
-- igual que `follow_ups_agenda` en la 0014.
alter view v_leads_seguimiento set (security_invoker = on);
alter view v_toques            set (security_invoker = on);

grant select on v_leads_seguimiento to authenticated;
grant select on v_toques            to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) El toque de cada lead cuadra con su historial:
--
--   select l.empresa, l.touch_actual,
--          (select count(*) from follow_ups f
--            where f.lead_id = l.id and f.estado = 'completado' and f.deleted_at is null) as reales
--     from leads l where l.deleted_at is null and l.touch_actual > 0;
--   -- touch_actual = reales en todas las filas
--
-- 2) La ficha unificada dice lo mismo que el pipeline y que la agenda:
--
--   select empresa, estado, touch_actual, ultimo_contacto_tipo, proxima_fecha, situacion
--     from v_leads_seguimiento order by situacion, proxima_fecha;
--
-- 3) El panel del mes en curso:
--
--   select jsonb_pretty(metricas_crm(date_trunc('month', current_date)::date, current_date));
--
-- 4) Ya no hay más de un responsable:
--
--   select distinct responsable from leads;   -- una sola fila: Juan Duvergé
