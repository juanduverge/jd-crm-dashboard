-- =============================================================
-- 0002_rls.sql — Row Level Security y roles
-- Roles: admin (todo) · vendedor (lee todo, escribe negocio) · viewer (solo lectura)
-- =============================================================

-- Helper: rol del usuario actual
create or replace function auth_role() returns user_role as $$
  select role from profiles where id = auth.uid();
$$ language sql stable security definer;

alter table profiles enable row level security;
alter table leads enable row level security;
alter table pipeline_events enable row level security;
alter table contacts enable row level security;
alter table notes enable row level security;
alter table tasks enable row level security;
alter table campaigns enable row level security;
alter table campaign_leads enable row level security;
alter table outreach_messages enable row level security;
alter table inbox_messages enable row level security;
alter table web_leads enable row level security;
alter table settings enable row level security;
alter table search_logs enable row level security;

-- -------------------------------------------------------------
-- PROFILES: cada quien ve su fila; admin ve/gestiona todas
-- -------------------------------------------------------------
create policy "profiles_select" on profiles for select
  using (id = auth.uid() or auth_role() = 'admin');
create policy "profiles_admin_write" on profiles for all
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- -------------------------------------------------------------
-- LEADS
-- -------------------------------------------------------------
create policy "leads_select" on leads for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
create policy "leads_insert" on leads for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "leads_update" on leads for update
  using (auth_role() in ('admin','vendedor'));
create policy "leads_delete_admin_only" on leads for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- PIPELINE_EVENTS (append-only para vendedor; borrado solo admin)
-- -------------------------------------------------------------
create policy "pipeline_select" on pipeline_events for select
  using (auth_role() in ('admin','vendedor','viewer'));
create policy "pipeline_insert" on pipeline_events for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "pipeline_delete_admin_only" on pipeline_events for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- CONTACTS
-- -------------------------------------------------------------
create policy "contacts_select" on contacts for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
create policy "contacts_insert" on contacts for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "contacts_update" on contacts for update
  using (auth_role() in ('admin','vendedor'));
create policy "contacts_delete_admin_only" on contacts for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- NOTES
-- -------------------------------------------------------------
create policy "notes_select" on notes for select
  using (auth_role() in ('admin','vendedor','viewer'));
create policy "notes_insert" on notes for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "notes_delete_admin_only" on notes for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- TASKS
-- -------------------------------------------------------------
create policy "tasks_select" on tasks for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
create policy "tasks_insert" on tasks for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "tasks_update" on tasks for update
  using (auth_role() in ('admin','vendedor'));
create policy "tasks_delete_admin_only" on tasks for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- CAMPAIGNS
-- -------------------------------------------------------------
create policy "campaigns_select" on campaigns for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
create policy "campaigns_insert" on campaigns for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "campaigns_update" on campaigns for update
  using (auth_role() in ('admin','vendedor'));
create policy "campaigns_delete_admin_only" on campaigns for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- CAMPAIGN_LEADS (tabla puente)
-- -------------------------------------------------------------
create policy "campaign_leads_select" on campaign_leads for select
  using (auth_role() in ('admin','vendedor','viewer'));
create policy "campaign_leads_write" on campaign_leads for all
  using (auth_role() in ('admin','vendedor')) with check (auth_role() in ('admin','vendedor'));

-- -------------------------------------------------------------
-- OUTREACH_MESSAGES
-- -------------------------------------------------------------
create policy "outreach_select" on outreach_messages for select
  using (auth_role() in ('admin','vendedor','viewer'));
create policy "outreach_insert" on outreach_messages for insert
  with check (auth_role() in ('admin','vendedor'));
create policy "outreach_update" on outreach_messages for update
  using (auth_role() in ('admin','vendedor'));
create policy "outreach_delete_admin_only" on outreach_messages for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- INBOX_MESSAGES (escritura solo service_role / n8n; usuarios solo leen)
-- -------------------------------------------------------------
create policy "inbox_select" on inbox_messages for select
  using (auth_role() in ('admin','vendedor','viewer'));
create policy "inbox_update_read_flag" on inbox_messages for update
  using (auth_role() in ('admin','vendedor'));
-- INSERT/DELETE quedan sin política -> solo service_role los puede hacer

-- -------------------------------------------------------------
-- WEB_LEADS (inserción anónima va por Edge Function con service_role)
-- -------------------------------------------------------------
create policy "web_leads_select" on web_leads for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
create policy "web_leads_update" on web_leads for update
  using (auth_role() in ('admin','vendedor'));
create policy "web_leads_delete_admin_only" on web_leads for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- SETTINGS (globales visibles a todos; propias por usuario)
-- -------------------------------------------------------------
create policy "settings_select" on settings for select
  using (user_id is null or user_id = auth.uid() or auth_role() = 'admin');
create policy "settings_write_own" on settings for all
  using (user_id = auth.uid() or (user_id is null and auth_role() = 'admin'))
  with check (user_id = auth.uid() or (user_id is null and auth_role() = 'admin'));

-- -------------------------------------------------------------
-- SEARCH_LOGS (escritura solo service_role / n8n; usuarios solo leen)
-- -------------------------------------------------------------
create policy "search_logs_select" on search_logs for select
  using (auth_role() in ('admin','vendedor','viewer'));
-- INSERT/DELETE quedan sin política -> solo service_role
