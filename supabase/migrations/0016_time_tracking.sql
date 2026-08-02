-- =============================================================
-- 0016_time_tracking.sql — Productividad: registro de tiempo
--
-- Añade `time_entries`: en qué se va el tiempo. Es el dato que alimentará
-- el dashboard de Métricas (fase 8); aquí sólo se empieza a registrar.
--
-- PRINCIPIO: 100% ADITIVA. No toca `goals`, `horario_bloques`,
-- `horario_completions` ni `tasks`. Ninguna política RLS existente cambia.
--
-- Decisiones de diseño:
--
-- 1. EL TIEMPO MIDE, NO PUNTÚA. Parar un cronómetro NO llama a
--    `registrar_avance`. El avance de una meta ya entra por dos puertas
--    (los +/− de la meta diaria y `completar_bloque`); si el cronómetro
--    fuese una tercera, media hora trabajada en un bloque contaría dos
--    veces. La pregunta que responde esta tabla es "¿en qué se me fue el
--    día?", no "¿cuánto llevo hecho?".
--
-- 2. `fecha` es una columna propia, no `inicio::date`. La jornada la decide
--    el cliente, igual que en `completar_bloque(p_bloque_id, p_fecha)`: el
--    servidor está en UTC y a las 21:00 de Santo Domingo ya es mañana. Así
--    una entrada empezada a las 23:30 puede imputarse al día que el usuario
--    considera suyo, y el agregado por día no depende de ninguna zona
--    horaria escrita a fuego.
--
-- 3. Sólo puede haber UN cronómetro abierto por responsable (índice único
--    parcial). Iniciar uno nuevo cierra el anterior en la misma transacción
--    en vez de fallar: es lo que espera quien salta de tarea sin parar la
--    anterior, y deja el dato consistente igualmente.
--
-- 4. `duracion_seg` se materializa al cerrar (trigger), no se calcula en
--    cada consulta. El dashboard de la fase 8 agrega meses enteros; que la
--    suma sea `sum(duracion_seg)` sobre una columna indexable importa.
--
-- 5. Los enlaces (`goal_id`, `bloque_id`, `task_id`) son todos opcionales e
--    independientes: se puede cronometrar algo que no cuelga de nada. Van
--    con `on delete set null` — borrar una meta no borra la historia de en
--    qué se fue el tiempo.
--
-- 6. `responsable` es texto libre, como en `goals` y `follow_ups` (y a
--    diferencia de `tasks.responsable`, que es uuid -> profiles). Se sigue
--    la convención del módulo, no la de 0001.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. ENUM
-- -------------------------------------------------------------
-- De dónde salió la entrada: del cronómetro en vivo o escrita a mano
-- después. Importa para las métricas: lo escrito a mano es una estimación.
do $$ begin
  create type time_entry_fuente as enum ('cronometro','manual');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- 2. TABLA time_entries
-- -------------------------------------------------------------
create table if not exists time_entries (
  id            uuid primary key default gen_random_uuid(),
  descripcion   text not null,
  -- Jornada a la que se imputa (la decide el cliente, ver decisión 2).
  fecha         date not null,
  inicio        timestamptz not null default now(),
  fin           timestamptz,
  -- Se materializa al cerrar; null mientras el cronómetro corre.
  duracion_seg  int,
  fuente        time_entry_fuente not null default 'cronometro',
  goal_id       uuid references goals(id)           on delete set null,
  bloque_id     uuid references horario_bloques(id) on delete set null,
  task_id       uuid references tasks(id)           on delete set null,
  responsable   text,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint ck_time_entry_rango    check (fin is null or fin > inicio),
  constraint ck_time_entry_duracion check (duracion_seg is null or duracion_seg >= 0),
  -- Una entrada abierta no tiene duración, y una cerrada siempre la tiene.
  constraint ck_time_entry_cierre   check ((fin is null) = (duracion_seg is null))
);

-- Un solo cronómetro abierto por responsable. `coalesce` porque en Postgres
-- dos NULL no colisionan en un índice único, y sin responsable seguimos
-- queriendo un único cronómetro.
create unique index if not exists uq_time_entry_abierta
  on time_entries (coalesce(responsable, ''))
  where fin is null and deleted_at is null;

-- El acceso natural es "el día de hoy" y "el mes para las métricas".
create index if not exists idx_time_entries_fecha
  on time_entries (fecha, inicio) where deleted_at is null;
create index if not exists idx_time_entries_goal
  on time_entries (goal_id, fecha) where deleted_at is null and goal_id is not null;

-- -------------------------------------------------------------
-- 3. TRIGGER — duración y updated_at
-- -------------------------------------------------------------
-- La duración no se acepta del cliente: se deriva siempre de inicio/fin,
-- venga de un cronómetro o de una entrada escrita a mano.
create or replace function time_entry_touch() returns trigger as $$
begin
  new.updated_at := now();
  new.duracion_seg := case
    when new.fin is null then null
    else greatest(extract(epoch from (new.fin - new.inicio))::int, 0)
  end;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- En CUALQUIER update, no sólo al tocar inicio/fin: así un cliente no puede
-- escribir una `duracion_seg` inventada por la vía de actualizar sólo esa
-- columna. La duración se deriva siempre.
drop trigger if exists trg_time_entries_touch on time_entries;
create trigger trg_time_entries_touch
  before insert or update on time_entries
  for each row execute function time_entry_touch();

-- -------------------------------------------------------------
-- 4. RPCs
-- -------------------------------------------------------------

-- 4.1 Arranca el cronómetro. Si ya había uno abierto del mismo responsable,
--     lo cierra a la hora de arranque de este (decisión 3): el tiempo no se
--     solapa y no se pierde el tramo anterior.
create or replace function iniciar_tiempo(
  p_descripcion text,
  p_fecha       date    default null,   -- null = el día del servidor
  p_goal_id     uuid    default null,
  p_bloque_id   uuid    default null,
  p_task_id     uuid    default null,
  p_responsable text    default null
) returns uuid as $$
declare
  v_id     uuid;
  v_ahora  timestamptz := now();
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_descripcion), '') = '' then
    raise exception 'la entrada necesita una descripción';
  end if;

  -- `greatest` y no `v_ahora` a secas: cerrar en el mismo instante en que se
  -- arrancó dejaría un rango vacío que `ck_time_entry_rango` rechaza, y el
  -- insert de abajo chocaría con el índice de "un solo cronómetro abierto".
  -- Se le da el segundo mínimo y el tramo queda cerrado igual.
  update time_entries
     set fin = greatest(v_ahora, inicio + interval '1 second')
   where fin is null
     and deleted_at is null
     and coalesce(responsable, '') = coalesce(p_responsable, '');

  insert into time_entries (descripcion, fecha, inicio, fuente,
                            goal_id, bloque_id, task_id, responsable)
  values (trim(p_descripcion), coalesce(p_fecha, current_date), v_ahora, 'cronometro',
          p_goal_id, p_bloque_id, p_task_id, p_responsable)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 4.2 Para el cronómetro. Sin id, para el que esté abierto del responsable.
--     Devuelve los segundos registrados (0 si no había nada que parar).
create or replace function parar_tiempo(
  p_id          uuid default null,
  p_responsable text default null
) returns int as $$
declare
  e time_entries;
  v_ahora timestamptz := now();
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  if p_id is not null then
    select * into e from time_entries where id = p_id and deleted_at is null;
  else
    select * into e from time_entries
     where fin is null and deleted_at is null
       and coalesce(responsable, '') = coalesce(p_responsable, '')
     order by inicio desc limit 1;
  end if;

  if not found then return 0; end if;
  if e.fin is not null then return coalesce(e.duracion_seg, 0); end if;

  -- Parar en el mismo segundo en que se arrancó dejaría un rango vacío;
  -- se le da el segundo mínimo en vez de fallar delante del usuario.
  if v_ahora <= e.inicio then v_ahora := e.inicio + interval '1 second'; end if;

  update time_entries set fin = v_ahora where id = e.id;

  return greatest(extract(epoch from (v_ahora - e.inicio))::int, 0);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 4.3 Entrada escrita a mano (se olvidó el cronómetro). Queda marcada como
--     'manual' para poder distinguir lo medido de lo estimado.
create or replace function registrar_tiempo_manual(
  p_descripcion text,
  p_fecha       date,
  p_inicio      timestamptz,
  p_fin         timestamptz,
  p_goal_id     uuid default null,
  p_bloque_id   uuid default null,
  p_task_id     uuid default null,
  p_responsable text default null,
  p_notas       text default null
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
                            goal_id, bloque_id, task_id, responsable, notas)
  values (trim(p_descripcion), p_fecha, p_inicio, p_fin, 'manual',
          p_goal_id, p_bloque_id, p_task_id, p_responsable, p_notas)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 5. VISTA — resumen por día y meta (la base de la fase 8)
-- -------------------------------------------------------------
-- Vive aquí y no en el cliente para que el dashboard traiga agregados y no
-- miles de filas. `security_invoker` para que respete las RLS de quien
-- consulta en vez de las del dueño de la vista.
create or replace view v_tiempo_diario
with (security_invoker = true) as
select
  t.fecha,
  t.responsable,
  t.goal_id,
  g.nombre                          as goal_nombre,
  count(*)                          as entradas,
  sum(t.duracion_seg)               as segundos,
  round(sum(t.duracion_seg) / 3600.0, 2) as horas
from time_entries t
left join goals g on g.id = t.goal_id
where t.deleted_at is null and t.fin is not null
group by t.fecha, t.responsable, t.goal_id, g.nombre;

-- -------------------------------------------------------------
-- 6. RLS — mismo patrón que 0015
-- -------------------------------------------------------------
alter table time_entries enable row level security;

drop policy if exists "time_entries_select" on time_entries;
create policy "time_entries_select" on time_entries for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));

-- Insert/update abiertos a admin/vendedor: el trigger ya impide que la
-- duración se escriba a mano, y editar la descripción o el enlace de una
-- entrada no descuadra ningún contador (el tiempo no puntúa, decisión 1).
drop policy if exists "time_entries_insert" on time_entries;
create policy "time_entries_insert" on time_entries for insert
  with check (auth_role() in ('admin','vendedor'));

drop policy if exists "time_entries_update" on time_entries;
create policy "time_entries_update" on time_entries for update
  using (auth_role() in ('admin','vendedor')) with check (auth_role() in ('admin','vendedor'));

drop policy if exists "time_entries_delete" on time_entries;
create policy "time_entries_delete" on time_entries for delete
  using (auth_role() = 'admin' and deleted_at is not null);

-- -------------------------------------------------------------
-- 7. Endurecimiento (la lección de la 0014)
-- -------------------------------------------------------------
revoke execute on function time_entry_touch() from anon, authenticated;

revoke execute on function iniciar_tiempo(text, date, uuid, uuid, uuid, text)  from anon;
revoke execute on function parar_tiempo(uuid, text)                            from anon;
revoke execute on function registrar_tiempo_manual(text, date, timestamptz, timestamptz, uuid, uuid, uuid, text, text) from anon;

revoke all on v_tiempo_diario from anon;
grant select on v_tiempo_diario to authenticated;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Arrancar, comprobar que está abierta y pararla:
--
--   select iniciar_tiempo('Prueba cronómetro');
--   select descripcion, inicio, fin, duracion_seg from time_entries
--    where descripcion = 'Prueba cronómetro';        -- fin y duración null
--   select parar_tiempo();                            -- segundos > 0
--   select fin is not null, duracion_seg from time_entries
--    where descripcion = 'Prueba cronómetro';         -- t, N
--
-- 2) Un segundo cronómetro cierra el primero (no debe haber dos abiertos):
--
--   select iniciar_tiempo('A'); select iniciar_tiempo('B');
--   select count(*) from time_entries where fin is null and deleted_at is null;  -- 1
--
-- 3) La duración no se puede falsear desde el cliente:
--
--   update time_entries set duracion_seg = 99999
--    where descripcion = 'Prueba cronómetro';
--   select duracion_seg from time_entries where descripcion = 'Prueba cronómetro';
--   -- sigue siendo la real: el trigger la recalcula
--
-- 4) Limpiar:
--   delete from time_entries where descripcion in ('Prueba cronómetro','A','B');
-- =============================================================
