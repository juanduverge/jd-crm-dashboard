-- =============================================================
-- 0017_descripciones_y_cumplimiento.sql — Productividad: contexto y balance
--
-- Dos cosas que faltaban para que Métricas diga algo útil:
--
-- A) DESCRIPCIÓN en metas y bloques de horario. Un título cabe en una línea
--    y por eso no explica nada: "Prospección" no dice a quién, ni cómo, ni
--    qué cuenta como hecho. `tasks.descripcion` ya existe desde la 0001 —
--    esto sólo la iguala en `goals` y `horario_bloques`.
--
-- B) `tasks.completada_en`: CUÁNDO se completó una tarea. Hasta ahora sólo
--    había `completada` (booleano) y `updated_at`, que se mueve con
--    cualquier edición — con eso no se puede responder "¿cuántas tareas
--    cerré en julio?" sin mentir. Lo pone el mismo trigger que ya mantiene
--    `completada` en sincronía con `estado`, así que no depende de que el
--    cliente se acuerde.
--
-- PRINCIPIO: 100% ADITIVA. No borra ni renombra nada, no toca ninguna
-- política RLS existente y las columnas nuevas son todas nullable — las
-- filas que ya están siguen siendo válidas.
--
-- Decisiones:
--
-- 1. `descripcion` es texto libre y sin límite de longitud. No se valida
--    nada: es una nota para la persona que la escribe, no un campo del que
--    dependa ninguna lógica.
--
-- 2. `completada_en` se BORRA al reabrir una tarea. Si alguien marca hecha
--    una tarea y luego la devuelve a pendiente, la fecha vieja sería una
--    mentira en el recuento del mes.
--
-- 3. El backfill usa `updated_at` como aproximación para las tareas que ya
--    están hechas. Es la mejor pista disponible y sólo afecta al pasado;
--    a partir de aquí la marca es exacta.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. DESCRIPCIONES
-- -------------------------------------------------------------
alter table goals            add column if not exists descripcion text;
alter table horario_bloques  add column if not exists descripcion text;

comment on column goals.descripcion is
  'Contexto libre de la meta: qué cuenta como avance y por qué existe.';
comment on column horario_bloques.descripcion is
  'Qué se hace exactamente en este bloque. El título es la etiqueta; esto, el guion.';

-- La cascada hereda la descripción de la mensual: las semanales y diarias
-- las genera la BD, y una hija sin contexto obliga a subir a la madre para
-- entender qué se supone que hay que hacer ese día.
create or replace function heredar_descripcion_goal() returns trigger as $$
begin
  if new.descripcion is null and new.parent_id is not null then
    select descripcion into new.descripcion from goals where id = new.parent_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_goals_heredar_descripcion on goals;
create trigger trg_goals_heredar_descripcion
  before insert on goals
  for each row execute function heredar_descripcion_goal();

-- La mensual se crea por RPC (`crear_meta_mensual`), que genera la cascada en
-- la misma transacción: cuando se escribe la descripción, las hijas ya
-- existen y el trigger de arriba no las alcanza. Esta función baja el texto a
-- toda la rama de una vez, y sirve igual para editar la descripción después.
-- No se cambia la firma de `crear_meta_mensual` a propósito: añadirle un
-- parámetro crearía una sobrecarga y PostgREST tendría que adivinar cuál.
create or replace function set_descripcion_cascada(
  p_goal_id     uuid,
  p_descripcion text
) returns int as $$
declare v_n int;
begin
  -- `security definer` salta la RLS, así que el permiso se comprueba aquí
  -- mismo, igual que en el resto de RPCs del módulo (0015).
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  with rama as (
    select id from goals where id = p_goal_id
    union all
    select h.id from goals h
      join goals s on h.parent_id = s.id
     where s.id = p_goal_id or s.parent_id = p_goal_id
  )
  update goals set descripcion = nullif(btrim(coalesce(p_descripcion, '')), '')
   where id in (select id from rama) and deleted_at is null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 2. CUÁNDO SE COMPLETÓ UNA TAREA
-- -------------------------------------------------------------
alter table tasks add column if not exists completada_en timestamptz;

comment on column tasks.completada_en is
  'Instante en que la tarea pasó a hecha. Null si no lo está. Lo pone el trigger.';

-- Reemplaza la versión de la 0010 añadiendo el sello de completado. El resto
-- del comportamiento es idéntico, para no romper lo que ya lee `completada`.
create or replace function sync_task_completada() returns trigger as $$
begin
  new.completada = (new.estado = 'hecha');

  if new.completada then
    -- Sólo la primera vez: reeditar una tarea ya hecha no mueve la fecha.
    if new.completada_en is null then new.completada_en = now(); end if;
  else
    -- Reabrir borra el sello (decisión 2).
    new.completada_en = null;
  end if;

  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Backfill de lo ya hecho (decisión 3). Con el trigger desactivado: si no,
-- pisaría `updated_at` con `now()` en cada tarea ya cerrada y perderíamos
-- justo el dato del que estamos deduciendo la fecha.
alter table tasks disable trigger trg_tasks_sync_completada;

update tasks
   set completada_en = coalesce(updated_at, created_at)
 where estado = 'hecha' and completada_en is null;

alter table tasks enable trigger trg_tasks_sync_completada;

-- Índice para el recuento mensual de Métricas.
create index if not exists idx_tasks_completada_en
  on tasks (completada_en) where completada_en is not null and deleted_at is null;

-- -------------------------------------------------------------
-- 3. Endurecimiento (la lección de la 0014)
-- -------------------------------------------------------------
revoke execute on function heredar_descripcion_goal() from anon, authenticated;
revoke execute on function sync_task_completada()     from anon, authenticated;

-- Ésta sí la llama el cliente, pero nunca el público anónimo.
revoke execute on function set_descripcion_cascada(uuid, text) from anon;
grant  execute on function set_descripcion_cascada(uuid, text) to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Las columnas existen:
--
--   select count(*) filter (where table_name = 'goals')           as goals,
--          count(*) filter (where table_name = 'horario_bloques') as bloques,
--          count(*) filter (where table_name = 'tasks')           as tasks
--     from information_schema.columns
--    where column_name in ('descripcion','completada_en')
--      and table_name in ('goals','horario_bloques','tasks');
--   -- goals 1, bloques 1, tasks 2 (descripcion ya venía de la 0001)
--
-- 2) El sello se pone y se quita:
--
--   insert into tasks (titulo, estado) values ('Prueba 0017','pendiente');
--   select completada_en from tasks where titulo = 'Prueba 0017';   -- null
--   update tasks set estado = 'hecha' where titulo = 'Prueba 0017';
--   select completada_en is not null from tasks where titulo = 'Prueba 0017';  -- t
--   update tasks set estado = 'pendiente' where titulo = 'Prueba 0017';
--   select completada_en from tasks where titulo = 'Prueba 0017';   -- null
--   delete from tasks where titulo = 'Prueba 0017';
--
-- 3) La cascada hereda la descripción:
--
--   select crear_meta_mensual('Prueba herencia','contador',20,'uds',current_date);
--   update goals set descripcion = 'Contexto de prueba' where nombre = 'Prueba herencia';
--   -- (las hijas ya creadas no cambian: la herencia es al insertar)
--   select count(*) from goals where descripcion = 'Contexto de prueba';
--   delete from goals where nombre like 'Prueba herencia%';
-- =============================================================
