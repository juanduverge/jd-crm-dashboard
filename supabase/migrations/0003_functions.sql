-- =============================================================
-- 0003_functions.sql — RPCs para mutaciones compuestas (atómicas)
-- Nota: son SECURITY DEFINER (saltan RLS), por eso validan el rol
-- del llamante explícitamente donde corresponde.
-- =============================================================

-- Convertir un web_lead en lead + evento de pipeline + marcar cerrado.
-- Reemplaza el patrón actual de 3 llamadas sueltas (createLead+updatePipeline+updateWebLead).
create or replace function convert_web_lead(p_web_lead_id uuid)
returns uuid as $$
declare
  v_lead_id uuid;
  v_web record;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  select * into v_web from web_leads where id = p_web_lead_id;
  if not found then raise exception 'web_lead not found'; end if;

  insert into leads (empresa, email, telefono, notas, fuente)
  values (coalesce(v_web.nombre,'Sin nombre'), v_web.email, v_web.telefono, v_web.mensaje, 'web_form')
  returning id into v_lead_id;

  insert into pipeline_events (lead_id, etapa, probabilidad, changed_by)
  values (v_lead_id, 'nuevo', 0.05, auth.uid());

  update web_leads set lead_id = v_lead_id, estado = 'cerrado' where id = p_web_lead_id;

  return v_lead_id;
end;
$$ language plpgsql security definer;

-- Soft-delete: admin o vendedor
create or replace function soft_delete_lead(p_id uuid) returns void as $$
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;
  update leads set deleted_at = now() where id = p_id;
end;
$$ language plpgsql security definer;

-- Restaurar: solo admin
create or replace function restore_lead(p_id uuid) returns void as $$
begin
  if auth_role() <> 'admin' then
    raise exception 'solo admin puede restaurar';
  end if;
  update leads set deleted_at = null where id = p_id;
end;
$$ language plpgsql security definer;

-- Purgar (borrado físico): solo admin, y solo si ya está en papelera
create or replace function purge_lead(p_id uuid) returns void as $$
begin
  if auth_role() <> 'admin' then
    raise exception 'solo admin puede purgar';
  end if;
  delete from leads where id = p_id and deleted_at is not null;
end;
$$ language plpgsql security definer;
