-- =============================================================
-- 0019_tiempo_categorias.sql — Productividad: el cronómetro deja de necesitar
-- una frase escrita a mano para saber en qué se fue el tiempo.
--
-- EL PROBLEMA QUE RESUELVE
--
-- El cronómetro de la 0016 ya arrancaba sin tarea: la descripción es texto
-- libre y la meta es opcional. Lo que no existía era una forma de AGRUPAR ese
-- tiempo. "Reunión con Marta", "reunión equipo" y "call cliente" son tres
-- textos distintos y para las Métricas son tres actividades distintas, aunque
-- las tres sean reuniones.
--
-- `categoria` responde a "¿en qué TIPO de trabajo se me va el mes?", que es
-- una pregunta distinta de "¿en qué meta?" (goal_id) y de "¿en qué cosa
-- concreta?" (descripcion). Las tres conviven: una entrada puede ser
-- categoría 'reuniones', meta 'Cerrar 10 clientes' y descripción 'call con
-- Acme'.
--
-- PRINCIPIO: 100% ADITIVA sobre los datos. Ninguna fila existente cambia;
-- `categoria` queda a null en todo lo ya registrado, que es la verdad: no se
-- sabe de qué categoría eran.
--
-- Decisiones:
--
-- 1. `categoria text` libre con una lista sugerida en el cliente, y NO un
--    enum. Un enum obliga a una migración cada vez que aparezca un tipo de
--    trabajo nuevo, y el módulo entero ya trata `responsable` como texto.
--    El índice de abajo es lo que hace que agrupar por categoría sea barato.
--
-- 2. `iniciar_tiempo` y `registrar_tiempo_manual` ganan un parámetro al final.
--    Se DEJA CAER la firma antigua a propósito: mantener las dos convertiría
--    cualquier llamada con parámetros nombrados en ambigua, y PostgreSQL
--    fallaría con "function is not unique" justo en producción. El cliente ya
--    llama siempre con parámetros nombrados, así que el parámetro nuevo con
--    default no rompe ninguna llamada existente.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. COLUMNA
-- -------------------------------------------------------------
alter table time_entries add column if not exists categoria text;

comment on column time_entries.categoria is
  'Tipo de trabajo (reuniones, desarrollo, ventas...). Agrupa el tiempo; no '
  'sustituye ni a goal_id ni a la descripción.';

-- Agrupar por categoría dentro de un rango de fechas es LA consulta de
-- Métricas. Parcial porque las filas sin categoría nunca se agrupan.
create index if not exists idx_time_entries_categoria
  on time_entries (categoria, fecha)
  where categoria is not null and deleted_at is null;

-- -------------------------------------------------------------
-- 2. iniciar_tiempo — misma lógica, un parámetro más
-- -------------------------------------------------------------
create or replace function iniciar_tiempo(
  p_descripcion text,
  p_fecha       date    default null,   -- null = el día del servidor
  p_goal_id     uuid    default null,
  p_bloque_id   uuid    default null,
  p_task_id     uuid    default null,
  p_responsable text    default null,
  p_categoria   text    default null
) returns uuid as $$
declare
  v_id     uuid;
  v_ahora  timestamptz := now();
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'la entrada necesita una descripción';
  end if;

  -- `greatest` y no `v_ahora` a secas: ver el comentario de la 0016.
  update time_entries
     set fin = greatest(v_ahora, inicio + interval '1 second')
   where fin is null
     and deleted_at is null
     and coalesce(responsable, '') = coalesce(p_responsable, '');

  insert into time_entries (descripcion, fecha, inicio, fuente,
                            goal_id, bloque_id, task_id, responsable, categoria)
  values (trim(p_descripcion), coalesce(p_fecha, current_date), v_ahora, 'cronometro',
          p_goal_id, p_bloque_id, p_task_id, p_responsable,
          nullif(trim(coalesce(p_categoria, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Decisión 2: fuera la firma de seis parámetros.
drop function if exists iniciar_tiempo(text, date, uuid, uuid, uuid, text);

-- -------------------------------------------------------------
-- 3. registrar_tiempo_manual — igual
-- -------------------------------------------------------------
create or replace function registrar_tiempo_manual(
  p_descripcion text,
  p_fecha       date,
  p_inicio      timestamptz,
  p_fin         timestamptz,
  p_goal_id     uuid default null,
  p_bloque_id   uuid default null,
  p_task_id     uuid default null,
  p_responsable text default null,
  p_notas       text default null,
  p_categoria   text default null
) returns uuid as $$
declare v_id uuid;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'la entrada necesita una descripción';
  end if;
  if p_fin <= p_inicio then
    raise exception 'la hora de fin tiene que ser posterior a la de inicio';
  end if;

  insert into time_entries (descripcion, fecha, inicio, fin, fuente,
                            goal_id, bloque_id, task_id, responsable, notas, categoria)
  values (trim(p_descripcion), p_fecha, p_inicio, p_fin, 'manual',
          p_goal_id, p_bloque_id, p_task_id, p_responsable, p_notas,
          nullif(trim(coalesce(p_categoria, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop function if exists registrar_tiempo_manual(
  text, date, timestamptz, timestamptz, uuid, uuid, uuid, text, text);

-- -------------------------------------------------------------
-- 4. VISTA — tiempo por categoría
-- -------------------------------------------------------------
-- Vive en la BD y no en el cliente por lo mismo que `v_tiempo_diario`: un
-- trimestre son miles de tramos y aquí caben en una docena de filas.
-- `security_invoker` para que respete las RLS de quien consulta.
create or replace view v_tiempo_categoria
with (security_invoker = true) as
select
  t.fecha,
  t.responsable,
  coalesce(t.categoria, 'sin categoría') as categoria,
  count(*)            as entradas,
  sum(t.duracion_seg) as segundos
from time_entries t
where t.deleted_at is null
  and t.fin is not null
group by t.fecha, t.responsable, coalesce(t.categoria, 'sin categoría');

-- -------------------------------------------------------------
-- 5. Endurecimiento (la lección de la 0014)
-- -------------------------------------------------------------
revoke execute on function iniciar_tiempo(text, date, uuid, uuid, uuid, text, text) from anon;
grant  execute on function iniciar_tiempo(text, date, uuid, uuid, uuid, text, text) to authenticated;

revoke execute on function registrar_tiempo_manual(
  text, date, timestamptz, timestamptz, uuid, uuid, uuid, text, text, text) from anon;
grant  execute on function registrar_tiempo_manual(
  text, date, timestamptz, timestamptz, uuid, uuid, uuid, text, text, text) to authenticated;

revoke all on v_tiempo_categoria from anon;
grant select on v_tiempo_categoria to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Sólo debe quedar UNA versión de cada función:
--
--   select proname, pronargs from pg_proc
--    where proname in ('iniciar_tiempo','registrar_tiempo_manual');
--   -- iniciar_tiempo 7 / registrar_tiempo_manual 10, una fila cada una
--
-- 2) La categoría se guarda y el cronómetro sigue sin necesitar tarea:
--
--   select iniciar_tiempo('Prueba 0019', p_categoria => 'reuniones');
--   select descripcion, categoria, task_id from time_entries
--    where descripcion = 'Prueba 0019';   -- reuniones, null
--   select parar_tiempo();
--
-- 3) La vista agrupa:
--
--   select * from v_tiempo_categoria where categoria = 'reuniones';
--   delete from time_entries where descripcion = 'Prueba 0019';
-- =============================================================
