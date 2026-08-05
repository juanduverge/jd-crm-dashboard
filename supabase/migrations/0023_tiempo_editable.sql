-- =============================================================
-- 0023_tiempo_editable.sql — Corregir las horas de un tramo ya registrado
--
-- CAUSA DEL PROBLEMA: el cronómetro se arranca cuando uno se acuerda, no
-- cuando empieza a trabajar. Si empezaste a las 9:00 y le diste al play a
-- las 9:30, el registro miente en media hora y no había forma de tocarlo:
-- `timeService.actualizar()` sólo dejaba cambiar texto y enlaces.
--
-- La restricción era del CLIENTE, no de la base de datos: la RLS ya permite
-- a admin/vendedor actualizar cualquier columna de `time_entries`, y
-- `time_entry_touch()` recalcula `duracion_seg` en cada update. Es decir,
-- el UPDATE directo funcionaría — pero dejaría la puerta abierta a cerrar
-- un cronómetro en marcha por accidente, a fechas que no cuadran con las
-- horas, o a dos tramos abiertos a la vez.
--
-- Por eso se añade un RPC con las mismas garantías que `iniciar_tiempo` /
-- `parar_tiempo`, en vez de abrir el update genérico. La duración NO es un
-- parámetro: siempre se deriva de inicio/fin, como en el resto del módulo.
-- =============================================================

begin;

create or replace function editar_tiempo(
  p_id          uuid,
  p_descripcion text        default null,
  p_fecha       date        default null,
  p_inicio      timestamptz default null,
  p_fin         timestamptz default null,
  p_goal_id     uuid        default null,
  p_notas       text        default null,
  p_categoria   text        default null,
  -- Los `null` significan "no tocar", así que hacen falta banderas para
  -- poder VACIAR de verdad un enlace o una nota.
  p_limpiar_goal      boolean default false,
  p_limpiar_categoria boolean default false
) returns void as $$
declare
  v_row      time_entries%rowtype;
  v_inicio   timestamptz;
  v_fin      timestamptz;
  v_fecha    date;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  select * into v_row from time_entries
   where id = p_id and deleted_at is null
   for update;

  if not found then
    raise exception 'la entrada no existe o fue eliminada';
  end if;

  -- Valores efectivos: lo que llega, o lo que ya había.
  v_inicio := coalesce(p_inicio, v_row.inicio);
  v_fin    := coalesce(p_fin,    v_row.fin);
  v_fecha  := coalesce(p_fecha,  v_row.fecha);

  -- Un tramo ABIERTO se puede corregir en su hora de inicio (el caso de
  -- "empecé a las 9:00, no a las 9:30"), pero no se cierra desde aquí:
  -- para eso está `parar_tiempo`, que es quien libera el cronómetro.
  if v_row.fin is null and p_fin is not null then
    raise exception 'para cerrar un tramo en marcha usa el botón de parar';
  end if;

  if v_fin is not null and v_fin <= v_inicio then
    raise exception 'la hora de fin tiene que ser posterior a la de inicio';
  end if;

  -- Un tramo abierto no puede empezar en el futuro: dejaría el cronómetro
  -- contando en negativo hasta que llegase esa hora.
  if v_row.fin is null and v_inicio > now() then
    raise exception 'la hora de inicio no puede estar en el futuro';
  end if;

  -- La jornada tiene que corresponderse con el tramo. Sin esto, mover la
  -- hora sin mover la fecha descuadra las métricas diarias (`v_tiempo_diario`
  -- agrupa por `fecha`, no por `inicio`).
  --
  -- Se tolera un día de diferencia a propósito, por dos motivos legítimos:
  -- el desfase de zona horaria entre el navegador y el servidor, y el turno
  -- que cruza la medianoche y se imputa a la jornada en que empezó.
  if abs(v_fecha - v_inicio::date) > 1 then
    raise exception
      'la jornada (%) no cuadra con el inicio del tramo (%)', v_fecha, v_inicio::date;
  end if;

  update time_entries set
    descripcion = coalesce(nullif(trim(coalesce(p_descripcion, '')), ''), descripcion),
    fecha       = v_fecha,
    inicio      = v_inicio,
    fin         = v_fin,
    goal_id     = case when p_limpiar_goal then null
                       else coalesce(p_goal_id, goal_id) end,
    notas       = coalesce(p_notas, notas),
    categoria   = case when p_limpiar_categoria then null
                       else coalesce(p_categoria, categoria) end
  where id = p_id;
  -- `duracion_seg` no se toca a propósito: la reescribe `time_entry_touch()`.
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function editar_tiempo(uuid, text, date, timestamptz, timestamptz, uuid, text, text, boolean, boolean) from anon;
grant execute on function editar_tiempo(uuid, text, date, timestamptz, timestamptz, uuid, text, text, boolean, boolean) to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Corregir el inicio de un tramo cerrado y comprobar que la duración se
--    recalcula sola:
--
--   select id, inicio, fin, duracion_seg from time_entries order by inicio desc limit 1;
--   select editar_tiempo(
--     p_id     => '<id>',
--     p_inicio => '<inicio> - interval ''30 minutes'''
--   );
--   -- duracion_seg debe haber crecido 1800 exactamente.
--
-- 2) Debe FALLAR al intentar cerrar un tramo en marcha:
--
--   select editar_tiempo(p_id => '<id abierto>', p_fin => now());
--   -- ERROR: para cerrar un tramo en marcha usa el botón de parar
--
-- 3) Debe FALLAR si la jornada no cuadra con el inicio:
--
--   select editar_tiempo(p_id => '<id>', p_fecha => current_date + 5);
--   -- ERROR: la jornada (...) no coincide con la fecha de inicio del tramo
