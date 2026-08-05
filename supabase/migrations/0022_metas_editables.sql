-- =============================================================
-- 0022_metas_editables.sql — La meta se puede corregir después de crearla
--
-- Hasta ahora una meta se creaba y se quedaba como estaba: el modal de
-- edición sólo tocaba nombre / descripción / objetivo / unidad, y la vista
-- del DÍA (la de entrada por defecto) no tenía ni lápiz ni papelera.
--
-- Faltaban además dos datos que el usuario da por hechos en cualquier
-- objetivo: su PRIORIDAD y su ESTADO. No estaban en `goals` — sólo en
-- `tasks` — así que no era un problema de pantalla, era que la columna no
-- existía. Se añaden aquí.
--
-- Las FECHAS ya existían (`fecha_inicio` / `fecha_fin`); lo que faltaba era
-- dejarlas editar. No hace falta SQL para eso: `goal_check_jerarquia()` ya
-- valida que el rango de una hija quepa en el de su madre, así que un
-- update de fechas es seguro y el error lo devuelve la propia BD.
-- =============================================================

-- --- Prioridad ------------------------------------------------
-- Mismos tres valores que `tasks.prioridad`, para que el CRM hable un solo
-- idioma. Nullable: una meta sin prioridad marcada es lo normal.
alter table goals
  add column if not exists prioridad text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_goal_prioridad'
  ) then
    alter table goals
      add constraint ck_goal_prioridad
      check (prioridad is null or prioridad in ('alta', 'media', 'baja'));
  end if;
end $$;

-- --- Estado ---------------------------------------------------
-- 'activa' por defecto para no romper las metas ya creadas.
--
-- OJO: el estado es DECLARATIVO, no derivado. "Completada" aquí significa
-- "la doy por cerrada", no "llegó al 100%" — eso ya lo dice el progreso.
-- Sirve para pausar o cancelar un objetivo sin borrarlo y perder su
-- historial de avance.
alter table goals
  add column if not exists estado text not null default 'activa';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_goal_estado'
  ) then
    alter table goals
      add constraint ck_goal_estado
      check (estado in ('activa', 'pausada', 'completada', 'cancelada'));
  end if;
end $$;

-- Las vistas de metas filtran por rango de fechas y, ahora, por estado.
-- Índice parcial: el 99% de las consultas piden sólo las activas.
create index if not exists idx_goals_activas
  on goals (fecha_inicio, fecha_fin)
  where estado = 'activa' and deleted_at is null;

comment on column goals.prioridad is
  'alta | media | baja. Nullable. Mismo vocabulario que tasks.prioridad.';
comment on column goals.estado is
  'activa | pausada | completada | cancelada. Declarativo: no lo deriva el progreso.';
