-- =============================================================
-- 0007_leads_module.sql — Ajustes de esquema para migrar el módulo
-- Leads (leads + contacts + notes) de Sheets a Supabase.
-- =============================================================

-- CONTACTS: la UI de Leads permite clasificar el contacto (tipo) y anotar
-- observaciones libres (notas), igual que la hoja "contactos" original.
alter table contacts add column if not exists tipo text not null default 'otro'
  check (tipo in ('principal','ventas','soporte','facturacion','personal','otro'));
alter table contacts add column if not exists notas text;

-- NOTES: soporte de edición (autor + marca de editado) y soft-delete, igual
-- que la hoja "notas" original (Autor / Editado / Fecha edicion / Eliminado).
alter table notes add column if not exists autor text;
alter table notes add column if not exists updated_at timestamptz;
alter table notes add column if not exists deleted_at timestamptz;

-- Las notas ahora se pueden editar/soft-eliminar (antes solo select/insert/delete-admin).
create policy "notes_update" on notes for update
  using (auth_role() in ('admin','vendedor'));

-- select de notas debía respetar el soft-delete recién agregado.
drop policy if exists "notes_select" on notes;
create policy "notes_select" on notes for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
