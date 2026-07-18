-- =============================================================
-- 0009_web_leads_module.sql — Ajustes de esquema para migrar el módulo
-- Web Leads (solicitudes del formulario público) de Sheets a Supabase.
--
-- La tabla `web_leads` (0001) sólo tenía las columnas mínimas que la
-- Edge Function del formulario público necesita para insertar
-- (nombre/email/telefono/mensaje/estado/prioridad/etiquetas/lead_id).
-- La UI del CRM (WebLeadsPage/WebLeadDrawer) necesita además los
-- metadatos de origen del formulario (empresa/asunto/pagina/url/UTMs/
-- ip/user_agent/fuente/formulario) y los campos de gestión interna
-- (responsable/notas_internas), que en Sheets vivían en la misma hoja
-- "web_leads". Se agregan aquí como columnas nullable — la Edge Function
-- que inserta desde el formulario público no necesita cambios (sigue
-- escribiendo los mismos campos; los nuevos quedan null hasta que se
-- decida enviarlos también, o se rellenan luego desde la gestión del CRM).
-- =============================================================

alter table web_leads add column if not exists empresa text;
alter table web_leads add column if not exists asunto text;
alter table web_leads add column if not exists pagina text;
alter table web_leads add column if not exists url text;
alter table web_leads add column if not exists referrer text;
alter table web_leads add column if not exists utm_source text;
alter table web_leads add column if not exists utm_medium text;
alter table web_leads add column if not exists utm_campaign text;
alter table web_leads add column if not exists ip text;
alter table web_leads add column if not exists user_agent text;
alter table web_leads add column if not exists fuente text not null default 'web';
alter table web_leads add column if not exists formulario text;
alter table web_leads add column if not exists responsable text;
alter table web_leads add column if not exists notas_internas text;
alter table web_leads add column if not exists updated_at timestamptz not null default now();

-- Mismo trigger genérico que ya usa `leads` (0001) para mantener updated_at
-- al día en cada UPDATE (gestión: estado/responsable/notas/prioridad/etiquetas).
create trigger trg_web_leads_updated_at
  before update on web_leads
  for each row execute function set_updated_at();

create index if not exists idx_web_leads_active on web_leads (id) where deleted_at is null;
