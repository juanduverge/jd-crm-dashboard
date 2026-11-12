-- =============================================================
-- 0064 — Proyectos: lo que pasa después de «Cerrado ganado»
--
-- PROBLEMA QUE RESUELVE
--
-- Ganar un lead era el final del camino en el CRM: se iba al Archivo y ahí
-- se quedaba. Pero es justo donde empieza la otra mitad del trabajo: qué se
-- va a hacer, en qué fase va, qué falta pedirle al cliente, dónde está el
-- diseño, cuánto se ha cobrado.
--
-- POR QUÉ UNA TABLA APARTE Y NO MÁS ETAPAS EN EL PIPELINE
--
-- Es como lo hacen HubSpot o Pipedrive: la venta termina en ganado y no se
-- toca, para que «¿cuánto vendí?» siga midiendo ventas. El proyecto tiene su
-- propio recorrido (diseño, desarrollo, entrega…) que no es una venta.
--
-- QUÉ VA EN JSONB Y QUÉ NO
--
-- Páginas, funcionalidades, checklist, accesos, enlaces y referencias son
-- listas pequeñas que siempre se leen y se guardan con el proyecto entero:
-- jsonb evita cinco tablas hijas sin ganar nada. Los PAGOS sí van en tabla
-- propia, porque el panel de cobros (fase 2) los consultará entre proyectos
-- (vencidos, por cobrar este mes) y eso se hace bien con filas.
--
-- ACCESOS SIN CONTRASEÑAS, A PROPÓSITO: aquí se apunta qué acceso hace falta
-- y si ya se tiene, nunca la clave. Para eso está un gestor de contraseñas.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. PROYECTOS
-- -------------------------------------------------------------
create table if not exists proyectos (
  id                      uuid primary key default gen_random_uuid(),
  lead_id                 uuid references leads(id) on delete set null,
  nombre                  text not null,
  etapa                   text not null default 'por_arrancar'
                          check (etapa in ('por_arrancar','recopilando','diseno','revision',
                                           'desarrollo','pruebas','entregado','mantenimiento')),
  en_pausa                boolean not null default false,
  etapa_desde             timestamptz not null default now(),

  -- Alcance
  tipo                    text,
  plataforma              text,
  num_paginas             int check (num_paginas is null or num_paginas >= 0),
  paginas                 jsonb not null default '[]'::jsonb,
  funcionalidades         jsonb not null default '[]'::jsonb,
  alcance                 text,
  fuera_alcance           text,
  rondas_incluidas        int not null default 2 check (rondas_incluidas >= 0),
  rondas_usadas           int not null default 0 check (rondas_usadas >= 0),

  -- Dinero y fechas
  precio                  numeric(12,2),
  moneda                  text not null default 'USD',
  fecha_inicio            date,
  fecha_entrega_prevista  date,
  fecha_entregado         date,

  -- Recopilación y enlaces
  checklist               jsonb not null default '[]'::jsonb,
  accesos                 jsonb not null default '[]'::jsonb,
  enlaces                 jsonb not null default '{}'::jsonb,
  referencias             jsonb not null default '[]'::jsonb,

  notas                   text,
  responsable             text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  deleted_at              timestamptz
);

comment on table proyectos is
  'Seguimiento del proyecto tras ganar un lead: alcance, fase, cobros, recopilación y enlaces.';

-- Un lead, un proyecto vivo. Si se borra, se puede volver a crear.
create unique index if not exists uq_proyectos_lead
  on proyectos (lead_id) where lead_id is not null and deleted_at is null;
create index if not exists idx_proyectos_etapa
  on proyectos (etapa) where deleted_at is null;

drop trigger if exists trg_proyectos_updated on proyectos;
create trigger trg_proyectos_updated before update on proyectos
  for each row execute function set_updated_at();

-- Cuánto lleva en la fase: se usa para avisar de proyectos parados.
create or replace function proyectos_etapa_desde() returns trigger as $$
begin
  if new.etapa is distinct from old.etapa then
    new.etapa_desde := now();
    -- Llegar a «entregado» sin fecha la pone sola: es el dato que más se olvida.
    if new.etapa = 'entregado' and new.fecha_entregado is null then
      new.fecha_entregado := dia_crm(now());
    end if;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists trg_proyectos_etapa_desde on proyectos;
create trigger trg_proyectos_etapa_desde before update of etapa on proyectos
  for each row execute function proyectos_etapa_desde();

-- -------------------------------------------------------------
-- 2. PAGOS
-- -------------------------------------------------------------
create table if not exists proyecto_pagos (
  id             uuid primary key default gen_random_uuid(),
  proyecto_id    uuid not null references proyectos(id) on delete cascade,
  concepto       text not null,
  monto          numeric(12,2) not null default 0 check (monto >= 0),
  fecha_prevista date,
  cobrado_en     date,
  metodo         text,
  orden          int not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_proyecto_pagos_proyecto on proyecto_pagos (proyecto_id, orden);
create index if not exists idx_proyecto_pagos_pendientes
  on proyecto_pagos (fecha_prevista) where cobrado_en is null;

-- -------------------------------------------------------------
-- 3. PERMISOS: mismo criterio que el resto del CRM
-- -------------------------------------------------------------
alter table proyectos      enable row level security;
alter table proyecto_pagos enable row level security;

drop policy if exists proyectos_select on proyectos;
create policy proyectos_select on proyectos for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));
drop policy if exists proyectos_insert on proyectos;
create policy proyectos_insert on proyectos for insert
  with check (auth_role() in ('admin','vendedor'));
drop policy if exists proyectos_update on proyectos;
create policy proyectos_update on proyectos for update
  using (auth_role() in ('admin','vendedor'));
drop policy if exists proyectos_delete on proyectos;
create policy proyectos_delete on proyectos for delete
  using (auth_role() = 'admin');

-- Un pago mal apuntado se borra y se vuelve a poner: no es historial que
-- haya que proteger como un toque, así que el vendedor también puede.
drop policy if exists proyecto_pagos_select on proyecto_pagos;
create policy proyecto_pagos_select on proyecto_pagos for select
  using (auth_role() in ('admin','vendedor','viewer'));
drop policy if exists proyecto_pagos_write on proyecto_pagos;
create policy proyecto_pagos_write on proyecto_pagos for all
  using (auth_role() in ('admin','vendedor'))
  with check (auth_role() in ('admin','vendedor'));

-- -------------------------------------------------------------
-- 4. AL GANAR, NACE EL PROYECTO
-- -------------------------------------------------------------
-- Se rellena lo que ya se sabe (nombre, precio, responsable) y lo que se
-- repite en todos los proyectos (checklist, accesos, plan 50/50). Así el
-- proyecto aparece listo para trabajar y no como una ficha vacía.
create or replace function proyecto_desde_lead(p_lead_id uuid) returns uuid as $fn$
declare
  v_lead   leads;
  v_id     uuid;
  v_precio numeric(12,2);
begin
  select * into v_lead from leads where id = p_lead_id;
  if not found then
    return null;
  end if;

  select id into v_id from proyectos where lead_id = p_lead_id and deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  v_precio := nullif(v_lead.valor_estimado, 0);

  insert into proyectos (
    lead_id, nombre, precio, responsable, fecha_inicio, checklist, accesos
  ) values (
    v_lead.id, trim(v_lead.empresa), v_precio, v_lead.responsable, dia_crm(now()),
    '[
      {"id":"logo","label":"Logo en buena calidad","estado":"pendiente"},
      {"id":"colores","label":"Colores y tipografías de marca","estado":"pendiente"},
      {"id":"textos","label":"Textos de cada página","estado":"pendiente"},
      {"id":"fotos","label":"Fotos e imágenes","estado":"pendiente"},
      {"id":"servicios","label":"Lista de servicios o productos","estado":"pendiente"},
      {"id":"contacto","label":"Datos de contacto, horario y dirección","estado":"pendiente"},
      {"id":"referencias","label":"Webs de referencia que le gustan","estado":"pendiente"}
    ]'::jsonb,
    '[
      {"id":"dominio","label":"Dominio","estado":"pendiente","donde":""},
      {"id":"hosting","label":"Hosting","estado":"pendiente","donde":""},
      {"id":"correo","label":"Correo corporativo","estado":"pendiente","donde":""},
      {"id":"redes","label":"Redes sociales","estado":"pendiente","donde":""},
      {"id":"analytics","label":"Google Analytics / Search Console","estado":"pendiente","donde":""}
    ]'::jsonb
  ) returning id into v_id;

  insert into proyecto_pagos (proyecto_id, concepto, monto, fecha_prevista, orden) values
    (v_id, 'Anticipo (50 %)', coalesce(round(v_precio * 0.5, 2), 0), dia_crm(now()), 1),
    (v_id, 'Entrega (50 %)',  coalesce(v_precio - round(v_precio * 0.5, 2), 0), null, 2);

  return v_id;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function proyecto_desde_lead(uuid) from public, anon;
grant execute on function proyecto_desde_lead(uuid) to authenticated;

create or replace function crear_proyecto_al_ganar() returns trigger as $fn$
begin
  if new.estado = 'ganado' and new.deleted_at is null then
    perform proyecto_desde_lead(new.id);
  end if;
  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function crear_proyecto_al_ganar() from public, anon, authenticated;

drop trigger if exists trg_leads_crear_proyecto on leads;
create trigger trg_leads_crear_proyecto
  after insert or update of estado on leads
  for each row when (new.estado = 'ganado')
  execute function crear_proyecto_al_ganar();

-- -------------------------------------------------------------
-- 5. LOS QUE YA ESTÁN GANADOS
-- -------------------------------------------------------------
select proyecto_desde_lead(id)
  from leads
 where estado = 'ganado' and deleted_at is null;

commit;

-- VERIFICACIÓN:
--   select p.nombre, p.etapa, p.precio, count(g.*) pagos
--     from proyectos p left join proyecto_pagos g on g.proyecto_id = p.id
--    group by p.id;
