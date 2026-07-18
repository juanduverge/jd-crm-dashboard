-- =============================================================
-- 0001_schema.sql — Esquema base del CRM (Sheets -> Postgres)
-- =============================================================

-- Extensiones requeridas
create extension if not exists pg_trgm;   -- búsqueda por similitud (gin_trgm_ops)
create extension if not exists pg_cron;   -- jobs programados (retención de logs)

-- Enum de etapas del pipeline (fuente única de verdad)
create type pipeline_stage as enum (
  'nuevo','contactado','seguimiento','respondio','reunion',
  'propuesta','negociacion','ganado','perdido'
);

create type user_role as enum ('admin','vendedor','viewer');

-- Perfiles con rol, vinculados a auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role user_role not null default 'vendedor',
  created_at timestamptz not null default now()
);

-- LEADS (fusiona 'prospects')
create table leads (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  nicho text, ciudad text, pais text, direccion text,
  telefono text, email text, web text, email_contacto text,
  whatsapp text, instagram text, facebook text, linkedin text,
  google_maps text, cargo text,
  rating_google numeric, num_resenas int,
  pagespeed_movil int, pagespeed_desktop int, tiene_ssl boolean,
  diagnostico_ia text, score int check (score between 0 and 100),
  score_reasoning text, scored_at timestamptz,
  fuente text, notas text, etiquetas text[], screenshot_url text,
  favorito boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_leads_active on leads (id) where deleted_at is null;
create index idx_leads_search on leads using gin (empresa gin_trgm_ops);

-- PIPELINE: historial append-only + vista de estado actual
create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  etapa pipeline_stage not null,
  probabilidad numeric,
  valor_estimado numeric,
  responsable uuid references profiles(id),
  fecha_cierre_estimada date,
  notas text,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
create index idx_pipeline_lead_time on pipeline_events (lead_id, changed_at desc);

create view pipeline_current as
  select distinct on (lead_id) *
  from pipeline_events
  order by lead_id, changed_at desc;

-- CONTACTOS y NOTAS
create table contacts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  nombre text not null, cargo text, email text, telefono text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  contenido text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- TAREAS
create table tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  titulo text not null, descripcion text,
  vencimiento timestamptz, prioridad text,
  responsable uuid references profiles(id),
  completada boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_tasks_responsable on tasks (responsable, vencimiento);

-- CAMPAÑAS
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, nicho text, idioma text default 'es',
  estado text default 'activa', tipo_mensaje text, template text,
  total_leads int default 0, enviados int default 0, respondidos int default 0,
  fecha_inicio date, fecha_fin date, notas text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table campaign_leads (
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  primary key (campaign_id, lead_id)
);

-- OUTREACH (patrón outbox — n8n consume filas con status='queued')
create table outreach_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  asunto text, cuerpo text,
  status text not null default 'draft' check (status in ('draft','queued','sent','failed')),
  error text,
  next_send_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_outreach_queue on outreach_messages (status, next_send_at) where status = 'queued';

-- INBOX (n8n inserta vía service-role tras leer IMAP)
create table inbox_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id) on delete set null,
  remitente text, asunto text, cuerpo text,
  adjunto_path text, -- ruta en Supabase Storage, no el binario
  leido boolean not null default false,
  created_at timestamptz not null default now()
);
create index idx_inbox_created on inbox_messages (created_at desc);

-- WEB LEADS (insertados por Edge Function del formulario público)
create table web_leads (
  id uuid primary key default gen_random_uuid(),
  nombre text, email text, telefono text, mensaje text,
  estado text default 'nuevo', prioridad text, etiquetas text[],
  lead_id uuid references leads(id), -- se llena al convertir
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- CONFIG y LOGS
create table settings (
  key text not null,
  value text,
  user_id uuid references profiles(id), -- null = global
  primary key (key, user_id)
);

create table search_logs (
  id uuid primary key default gen_random_uuid(),
  tipo_negocio text, ciudad text, resultados int,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Trigger genérico updated_at (leads)
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- Retención automática de logs (>90 días)
select cron.schedule('purge_search_logs', '0 3 * * *', $$
  delete from search_logs where created_at < now() - interval '90 days'
$$);
