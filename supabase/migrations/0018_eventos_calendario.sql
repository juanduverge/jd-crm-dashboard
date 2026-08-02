-- =============================================================
-- 0018_eventos_calendario.sql — Productividad: el calendario deja de ser
-- una vista de solo lectura y pasa a tener datos propios.
--
-- EL PROBLEMA QUE RESUELVE
--
-- Hasta ahora el calendario sólo PINTABA lo que ya existía en otras tablas
-- (`goals`, `horario_bloques`, `tasks`, `follow_ups`). Ninguna de ellas
-- sirve para "el martes a las 10:30 tengo una reunión de 45 minutos":
--
--   - `goals` son objetivos con periodo (día/semana/mes), sin hora.
--   - `horario_bloques` es una PLANTILLA semanal recurrente, no fechas.
--   - `tasks` tiene vencimiento (una fecha), no un tramo con hora.
--   - `follow_ups` es una fecha de contacto de un lead, no una agenda.
--
-- Meter horas en cualquiera de ellas las convertiría en otra cosa. Por eso
-- se añade `eventos`: lo que vive en el calendario POR DERECHO PROPIO —
-- eventos, reuniones y recordatorios— con inicio y fin reales.
--
-- LA REGLA QUE ORDENA TODO EL MÓDULO
--
-- El calendario tiene UNA tabla propia y CUATRO fuentes prestadas. No se
-- duplica nada: una tarea sigue viviendo en `tasks` y el calendario la
-- pinta leyéndola. `eventos` es sólo para lo que hoy no tiene dónde vivir.
-- Crear "una tarea" desde el calendario escribe en `tasks`, no aquí.
--
-- PRINCIPIO: 100% ADITIVA. No toca ninguna tabla ni política existente.
--
-- Decisiones:
--
-- 1. `inicio`/`fin` son `timestamptz` y NO se guarda `fecha` aparte (al
--    revés que `time_entries`). Un evento SÍ es un instante absoluto: una
--    reunión a las 10:00 es a las 10:00 aunque quien la mire esté en otro
--    huso. La jornada de `time_entries` era una decisión del usuario; aquí
--    la hora es el dato.
--
-- 2. `todo_el_dia`: un evento de día completo no tiene hora real. Se
--    guarda igual en `inicio`/`fin` (00:00 a 23:59:59 locales) con la
--    bandera puesta, para no partir la tabla en dos formas de leerla.
--
-- 3. `tipo` distingue evento / reunión / recordatorio. Los otros tipos que
--    el calendario ofrece crear (tarea, meta, bloque) NO viven aquí: van a
--    su tabla de siempre. Ver la regla de arriba.
--
-- 4. Enlaces opcionales a `goal_id`, `task_id` y `lead_id`, todos con
--    `on delete set null`: una reunión puede colgar de una meta o de un
--    lead sin dejar de existir si aquéllos se borran.
--
-- 5. Campos de Google Calendar (`google_event_id`, `google_calendar_id`,
--    `google_etag`, `sincronizado_en`) desde el primer día, aunque la
--    sincronización no esté hecha. Añadirlos después obligaría a una
--    migración de datos justo cuando haya eventos que migrar; vacíos no
--    molestan a nadie. El índice único parcial impide que un mismo evento
--    de Google entre dos veces, que es el fallo clásico de toda
--    sincronización bidireccional.
--
-- 6. `etiquetas text[]` en vez de una tabla de etiquetas. En este módulo
--    `responsable` ya es texto libre; una tabla de etiquetas con su join
--    sería más máquina de la que el problema pide. Si algún día hacen
--    falta colores por etiqueta, se sube entonces.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. ENUMS
-- -------------------------------------------------------------
do $$ begin
  create type evento_tipo as enum ('evento','reunion','recordatorio');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evento_estado as enum ('pendiente','confirmado','hecho','cancelado');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- 2. TABLA eventos
-- -------------------------------------------------------------
create table if not exists eventos (
  id                 uuid primary key default gen_random_uuid(),
  titulo             text not null check (btrim(titulo) <> ''),
  descripcion        text,
  notas              text,
  tipo               evento_tipo   not null default 'evento',
  estado             evento_estado not null default 'pendiente',

  inicio             timestamptz not null,
  fin                timestamptz not null,
  todo_el_dia        boolean not null default false,

  -- Color e importancia son cosas distintas: el color es organización
  -- visual (qué área de la vida), la prioridad es urgencia. Google mezcla
  -- las dos en el color y por eso nadie sabe qué significa el amarillo.
  color              text,
  prioridad          text check (prioridad in ('baja','media','alta','urgente')),
  categoria          text,
  etiquetas          text[] not null default '{}',
  enlace             text,
  ubicacion          text,

  goal_id            uuid references goals(id)  on delete set null,
  task_id            uuid references tasks(id)  on delete set null,
  lead_id            uuid references leads(id)  on delete set null,
  responsable        text,

  google_event_id    text,
  google_calendar_id text,
  google_etag        text,
  sincronizado_en    timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,

  -- Un evento que acaba antes de empezar no es un evento. Se permite
  -- fin = inicio: un recordatorio es un instante, no un tramo.
  constraint eventos_rango_valido check (fin >= inicio)
);

comment on table eventos is
  'Lo que vive en el calendario por derecho propio. Tareas, metas y bloques '
  'siguen en su tabla: el calendario los lee, no los copia.';

-- El calendario siempre pregunta por un rango de fechas, nunca por un id.
create index if not exists idx_eventos_inicio
  on eventos (inicio) where deleted_at is null;
create index if not exists idx_eventos_rango
  on eventos (inicio, fin) where deleted_at is null;
create index if not exists idx_eventos_goal on eventos (goal_id) where goal_id is not null;
create index if not exists idx_eventos_task on eventos (task_id) where task_id is not null;

-- Decisión 5: la misma cita de Google no puede entrar dos veces.
create unique index if not exists idx_eventos_google
  on eventos (google_calendar_id, google_event_id)
  where google_event_id is not null and deleted_at is null;

-- -------------------------------------------------------------
-- 3. updated_at
-- -------------------------------------------------------------
create or replace function evento_touch() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_eventos_touch on eventos;
create trigger trg_eventos_touch
  before update on eventos
  for each row execute function evento_touch();

-- -------------------------------------------------------------
-- 4. Mover / redimensionar (el drag & drop del calendario)
-- -------------------------------------------------------------
-- Arrastrar un evento cambia inicio y fin a la vez y debe conservar la
-- duración salvo que se esté estirando el borde. Hacerlo aquí evita que el
-- cliente mande dos updates y deje el evento medio movido si falla el
-- segundo.
create or replace function mover_evento(
  p_id     uuid,
  p_inicio timestamptz,
  p_fin    timestamptz default null   -- null = conservar la duración
) returns void as $$
declare v_dur interval;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select fin - inicio into v_dur from eventos where id = p_id and deleted_at is null;
  if v_dur is null then raise exception 'evento no encontrado'; end if;

  update eventos
     set inicio = p_inicio,
         fin    = coalesce(p_fin, p_inicio + v_dur)
   where id = p_id and deleted_at is null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 5. Duplicar
-- -------------------------------------------------------------
-- Se copia todo menos la identidad y el rastro de Google: un duplicado es
-- un evento NUEVO, y heredar `google_event_id` lo convertiría en un intento
-- de sobrescribir la cita original en la próxima sincronización.
create or replace function duplicar_evento(
  p_id     uuid,
  p_inicio timestamptz default null   -- null = mismo día y hora
) returns uuid as $$
declare v_nuevo uuid; v_dur interval;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select fin - inicio into v_dur from eventos where id = p_id and deleted_at is null;
  if v_dur is null then raise exception 'evento no encontrado'; end if;

  insert into eventos (
    titulo, descripcion, notas, tipo, estado, inicio, fin, todo_el_dia,
    color, prioridad, categoria, etiquetas, enlace, ubicacion,
    goal_id, task_id, lead_id, responsable
  )
  select titulo, descripcion, notas, tipo, 'pendiente', coalesce(p_inicio, inicio),
         coalesce(p_inicio, inicio) + v_dur, todo_el_dia,
         color, prioridad, categoria, etiquetas, enlace, ubicacion,
         goal_id, task_id, lead_id, responsable
    from eventos where id = p_id
  returning id into v_nuevo;

  return v_nuevo;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 6. RLS — mismo patrón que 0015 y 0016
-- -------------------------------------------------------------
alter table eventos enable row level security;

drop policy if exists "eventos_select" on eventos;
create policy "eventos_select" on eventos for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));

drop policy if exists "eventos_insert" on eventos;
create policy "eventos_insert" on eventos for insert
  with check (auth_role() in ('admin','vendedor'));

drop policy if exists "eventos_update" on eventos;
create policy "eventos_update" on eventos for update
  using (auth_role() in ('admin','vendedor')) with check (auth_role() in ('admin','vendedor'));

-- Borrado físico sólo para admin y sólo sobre lo ya archivado, como el
-- resto del CRM: el borrado normal es `deleted_at`.
drop policy if exists "eventos_delete" on eventos;
create policy "eventos_delete" on eventos for delete
  using (auth_role() = 'admin' and deleted_at is not null);

-- -------------------------------------------------------------
-- 7. Endurecimiento (la lección de la 0014)
-- -------------------------------------------------------------
revoke execute on function evento_touch() from anon, authenticated;

revoke execute on function mover_evento(uuid, timestamptz, timestamptz) from anon;
grant  execute on function mover_evento(uuid, timestamptz, timestamptz) to authenticated;

revoke execute on function duplicar_evento(uuid, timestamptz) from anon;
grant  execute on function duplicar_evento(uuid, timestamptz) to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) La tabla y sus restricciones:
--
--   insert into eventos (titulo, inicio, fin)
--     values ('Prueba 0018', now(), now() + interval '1 hour');
--   -- debe fallar (fin < inicio):
--   insert into eventos (titulo, inicio, fin)
--     values ('Mal', now(), now() - interval '1 hour');
--
-- 2) Mover conserva la duración:
--
--   select mover_evento(
--     (select id from eventos where titulo = 'Prueba 0018'),
--     now() + interval '1 day');
--   select fin - inicio from eventos where titulo = 'Prueba 0018';  -- 01:00:00
--
-- 3) Duplicar no arrastra el rastro de Google:
--
--   select duplicar_evento((select id from eventos where titulo = 'Prueba 0018'));
--   select count(*) from eventos where titulo = 'Prueba 0018';      -- 2
--   delete from eventos where titulo = 'Prueba 0018';
-- =============================================================
