-- =============================================================
-- 0010_tasks_module.sql — Migración del módulo Tareas (Sheets -> tasks)
-- =============================================================
-- La tabla `tasks` (0001_schema.sql) ya cubre lead_id/titulo/descripcion/
-- vencimiento/prioridad/responsable/completada/created_at/deleted_at.
-- Faltan columnas que la UI (TareasPage) necesita: tipo de tarea, estado
-- de 3 valores (pendiente/en_progreso/hecha — `completada` sólo cubre 2),
-- notas libres separadas de `descripcion`, y updated_at para "actualizado".
-- `responsable` se mantiene como en `leads`/`web_leads`: texto libre (nombre
-- visible), no uuid — así el módulo no depende de que exista un `profiles`
-- por cada vendedor.

alter table tasks
  add column if not exists tipo text not null default 'seguimiento',
  add column if not exists estado text not null default 'pendiente'
    check (estado in ('pendiente','en_progreso','hecha')),
  add column if not exists notas text,
  add column if not exists updated_at timestamptz not null default now();

-- `responsable` era uuid references profiles(id); lo convertimos a texto
-- libre para alinearlo con el resto del CRM (leads.responsable, etc.).
alter table tasks alter column responsable drop not null;
alter table tasks alter column responsable type text using responsable::text;

-- Mantener `completada` sincronizada con `estado` para no romper índices o
-- integraciones existentes que aún la lean.
create or replace function sync_task_completada() returns trigger as $$
begin
  new.completada = (new.estado = 'hecha');
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_sync_completada on tasks;
create trigger trg_tasks_sync_completada
  before insert or update on tasks
  for each row execute function sync_task_completada();

create index if not exists idx_tasks_estado on tasks (estado, vencimiento) where deleted_at is null;
