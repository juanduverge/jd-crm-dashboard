-- =============================================================
-- 0021_tareas_editables.sql — Enlaces y duración en las tareas
-- =============================================================
--
-- Qué resuelve
-- ------------
-- Una tarea planificada era prácticamente inmutable desde la UI: para cambiarle
-- el título o la fecha había que borrarla y crearla de nuevo, lo que además
-- perdía su `created_at` y cualquier tiempo imputado a ella.
--
-- La mayor parte del arreglo es de interfaz (`tasksService.updateTarea` ya
-- aceptaba casi todos los campos; simplemente no había formulario). Lo único
-- que faltaba en la base de datos son estas dos columnas.
--
-- Decisiones
-- ----------
-- 1. `enlaces` es `text[]`, no una tabla aparte: son referencias sueltas (un
--    documento, un diseño, un ticket), no entidades con vida propia. Una tabla
--    obligaría a un join en la vista de tareas para no ganar nada.
--
-- 2. `duracion_min` es la duración ESTIMADA, y por eso vive aquí y no se
--    calcula desde `time_entries`. Son dos preguntas distintas: cuánto creo que
--    me llevará (planificación) y cuánto me llevó (`time_entries`, migración
--    0016). Confundirlas rompería la doctrina del módulo: el tiempo mide, no
--    puntúa.
--
-- ARCHIVOS ADJUNTOS: fuera de esta migración a propósito. Subir ficheros exige
-- un bucket de Supabase Storage con sus políticas, que es infraestructura nueva
-- y depende del despliegue. Mientras tanto, `enlaces` cubre el caso real
-- (pegar el enlace de Drive/Notion). Ver docs/MODULO_TAREAS.md → Pendiente.
--
-- 100% aditiva.
-- =============================================================

begin;

alter table tasks
  add column if not exists enlaces      text[],
  add column if not exists duracion_min int;

comment on column tasks.enlaces is
  'Referencias externas (documentos, diseños, tickets). Array simple: no son entidades propias.';
comment on column tasks.duracion_min is
  'Duración ESTIMADA en minutos. Lo realmente dedicado vive en time_entries (0016).';

-- Una estimación negativa o absurda no es un dato, es un error de tecleo. El
-- tope de 24 h evita que un cero de más convierta una tarea en un mes de
-- trabajo en los cálculos de carga.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_tasks_duracion_min') then
    alter table tasks
      add constraint ck_tasks_duracion_min
      check (duracion_min is null or (duracion_min > 0 and duracion_min <= 1440));
  end if;
end $$;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
--   -- Debe devolver 2:
--   select count(*) from information_schema.columns
--    where table_name = 'tasks' and column_name in ('enlaces','duracion_min');
--
--   -- Ninguna tarea existente se ha tocado (ambas columnas nulas):
--   select count(*) from tasks where enlaces is not null or duracion_min is not null;
-- =============================================================
