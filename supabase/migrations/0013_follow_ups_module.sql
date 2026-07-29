-- =============================================================
-- 0013_follow_ups_module.sql — Módulo Seguimientos (follow_ups)
--
-- Convierte el seguimiento, hoy un simple `leads.proximo_seguimiento`
-- (una fecha suelta que nadie revisa), en una entidad propia con historial,
-- estado, resultado y secuencia de toques.
--
-- PRINCIPIO DE ESTA MIGRACIÓN: es 100% ADITIVA. No borra ni renombra ninguna
-- columna, no toca `tasks` (el módulo Tareas sigue igual), no altera políticas
-- RLS existentes. Todo lo que ya funciona sigue funcionando sin cambios.
--
-- Decisiones de diseño:
--
-- 1. `leads.proximo_seguimiento` NO se elimina. Pasa a ser una columna
--    DERIVADA, mantenida por trigger: siempre refleja la fecha del follow-up
--    pendiente del lead (o null si no hay). Así la UI actual (KanbanCard,
--    LeadDrawer, OpportunityForm) y cualquier consumidor externo siguen
--    leyendo lo mismo de siempre, sin tocar una línea de su código.
--
-- 2. NO se agrega un campo `activo/ganado/perdido` al lead: `leads.estado`
--    (enum pipeline_stage) YA contiene 'ganado' y 'perdido'. Un segundo campo
--    para el mismo hecho se desincroniza tarde o temprano. Lo que faltaba era
--    el CONTEXTO del cierre — cuándo, por qué, y desde qué etapa — y eso son
--    las tres columnas nuevas: cerrado_en / motivo_cierre / etapa_previa.
--      · activo    = estado not in ('ganado','perdido')
--      · archivado = estado in ('ganado','perdido')
--
-- 3. "Un solo pendiente por lead" se garantiza en la BD con un índice único
--    parcial, no confiando en la UI.
--
-- 4. `follow_ups` tiene `deleted_at` por coherencia con el resto del CRM, pero
--    NO se cablea al módulo Papelera (eso implicaría modificar código que hoy
--    funciona). Queda disponible para el futuro.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. ENUMS
-- -------------------------------------------------------------
-- `tipo` refleja los canales que ya usa el CRM (leads.canal_principal y
-- tasks.tipo), más 'otro' como cajón de sastre para instagram/linkedin/etc.
do $$ begin
  create type follow_up_tipo as enum ('llamada','email','whatsapp','reunion','otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type follow_up_estado as enum ('pendiente','completado','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type follow_up_resultado as enum ('positivo','negativo','sin_respuesta');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- 2. TABLA follow_ups
-- -------------------------------------------------------------
create table if not exists follow_ups (
  id                uuid primary key default gen_random_uuid(),
  lead_id           uuid not null references leads(id) on delete cascade,
  fecha_programada  date not null,
  tipo              follow_up_tipo   not null default 'llamada',
  nota              text,
  estado            follow_up_estado not null default 'pendiente',
  resultado         follow_up_resultado,       -- solo cuando estado = 'completado'
  orden             int  not null default 1,   -- toque nº de la secuencia (1,2,3,4...)
  responsable       text,                      -- texto libre, igual que leads.responsable
  created_at        timestamptz not null default now(),
  completed_at      timestamptz,
  deleted_at        timestamptz,

  -- Un follow-up completado SIEMPRE lleva resultado y fecha de completado;
  -- uno pendiente o cancelado NUNCA los lleva. Invariante a nivel de BD.
  constraint ck_follow_up_resultado_coherente check (
    (estado = 'completado' and resultado is not null and completed_at is not null)
    or
    (estado <> 'completado' and resultado is null and completed_at is null)
  )
);

-- REGLA CLAVE: un lead puede tener muchos follow-ups en su historial,
-- pero solo UNO pendiente a la vez.
create unique index if not exists uq_follow_up_pendiente_por_lead
  on follow_ups (lead_id)
  where estado = 'pendiente' and deleted_at is null;

-- Índice de la vista "Seguimientos de hoy" (vencidos / hoy / próximos 7 días).
create index if not exists idx_follow_ups_agenda
  on follow_ups (fecha_programada)
  where estado = 'pendiente' and deleted_at is null;

-- Índice del timeline por lead (historial completo, más reciente primero).
create index if not exists idx_follow_ups_lead_hist
  on follow_ups (lead_id, fecha_programada desc);

-- -------------------------------------------------------------
-- 3. COLUMNAS DE CIERRE EN leads (aditivas)
-- -------------------------------------------------------------
alter table leads
  add column if not exists cerrado_en    timestamptz,     -- cuándo pasó a ganado/perdido
  add column if not exists motivo_cierre text,            -- por qué se cerró
  add column if not exists etapa_previa  pipeline_stage;  -- etapa antes de cerrar, para reactivar

-- La vista Archivo lista leads cerrados por fecha de cierre.
create index if not exists idx_leads_archivados
  on leads (cerrado_en desc)
  where estado in ('ganado','perdido') and deleted_at is null;

-- -------------------------------------------------------------
-- 4. RLS — mismo patrón que 0002_rls.sql (auth_role())
-- -------------------------------------------------------------
alter table follow_ups enable row level security;

drop policy if exists "follow_ups_select" on follow_ups;
create policy "follow_ups_select" on follow_ups for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));

drop policy if exists "follow_ups_insert" on follow_ups;
create policy "follow_ups_insert" on follow_ups for insert
  with check (auth_role() in ('admin','vendedor'));

drop policy if exists "follow_ups_update" on follow_ups;
create policy "follow_ups_update" on follow_ups for update
  using (auth_role() in ('admin','vendedor'));

drop policy if exists "follow_ups_delete_admin_only" on follow_ups;
create policy "follow_ups_delete_admin_only" on follow_ups for delete
  using (auth_role() = 'admin');

-- -------------------------------------------------------------
-- 5. TRIGGER: mantener leads.proximo_seguimiento sincronizado
-- -------------------------------------------------------------
-- Compatibilidad hacia atrás: la UI actual sigue leyendo esa columna tal cual.
-- Se recalcula desde el follow-up pendiente del lead afectado.
create or replace function sync_lead_proximo_seguimiento() returns trigger as $$
declare
  v_lead_id uuid := coalesce(new.lead_id, old.lead_id);
begin
  update leads
     set proximo_seguimiento = (
       select f.fecha_programada
         from follow_ups f
        where f.lead_id = v_lead_id
          and f.estado = 'pendiente'
          and f.deleted_at is null
        order by f.fecha_programada
        limit 1
     )
   where id = v_lead_id;
  return null;  -- AFTER trigger, el valor de retorno se ignora
end;
$$ language plpgsql security definer;

drop trigger if exists trg_follow_ups_sync_lead on follow_ups;
create trigger trg_follow_ups_sync_lead
  after insert or update or delete on follow_ups
  for each row execute function sync_lead_proximo_seguimiento();

-- -------------------------------------------------------------
-- 5a-bis. TRIGGER INVERSO: escribir la fecha en el lead PROGRAMA un seguimiento
-- -------------------------------------------------------------
-- Esto es imprescindible, no un extra. La forma habitual de programar un
-- seguimiento en este CRM es el modal "Editar oportunidad" del pipeline
-- (OpportunityForm), que escribe directamente `leads.proximo_seguimiento`.
-- Sin este trigger, esa fecha NO generaría ningún follow_up: no saldría en la
-- agenda, ni en el banner, ni en el badge — exactamente el problema que este
-- módulo viene a resolver. Y además el trigger 5a la sobrescribiría luego.
--
-- Con esto, poner una fecha ahí (o desde n8n, o desde cualquier sitio) crea o
-- reprograma el seguimiento pendiente de verdad. Borrarla lo cancela.
--
-- Sin recursión con el trigger 5a: 5a escribe en el lead exactamente la fecha
-- del pendiente, así que la condición de abajo (IS DISTINCT FROM) es falsa y
-- la cadena se corta sola en el primer paso.
create or replace function programar_follow_up_desde_lead() returns trigger as $$
declare
  v_pendiente_id    uuid;
  v_pendiente_fecha date;
  v_tipo            follow_up_tipo;
  v_orden           int;
begin
  -- Los leads archivados o en papelera no llevan agenda.
  if new.estado in ('ganado','perdido') or new.deleted_at is not null then
    return null;
  end if;

  select id, fecha_programada into v_pendiente_id, v_pendiente_fecha
    from follow_ups
   where lead_id = new.id and estado = 'pendiente' and deleted_at is null
   limit 1;

  -- Ya coinciden: viene del trigger 5a. Cortar aquí evita el bucle.
  if new.proximo_seguimiento is not distinct from v_pendiente_fecha then
    return null;
  end if;

  -- Se borró la fecha -> se cancela el seguimiento pendiente (queda en historial).
  if new.proximo_seguimiento is null then
    update follow_ups set estado = 'cancelado' where id = v_pendiente_id;
    return null;
  end if;

  -- Ya había uno pendiente -> se reprograma, conservando su nº de toque.
  if v_pendiente_id is not null then
    update follow_ups
       set fecha_programada = new.proximo_seguimiento
     where id = v_pendiente_id;
    return null;
  end if;

  -- No había ninguno -> se crea el siguiente toque de la secuencia.
  v_tipo := case new.canal_principal
              when 'email'    then 'email'::follow_up_tipo
              when 'whatsapp' then 'whatsapp'::follow_up_tipo
              else 'llamada'::follow_up_tipo
            end;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = new.id and deleted_at is null;

  insert into follow_ups (lead_id, fecha_programada, tipo, orden, responsable)
  values (new.id, new.proximo_seguimiento, v_tipo, v_orden, new.responsable);

  return null;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_leads_programar_follow_up on leads;
create trigger trg_leads_programar_follow_up
  after update of proximo_seguimiento on leads
  for each row
  when (old.proximo_seguimiento is distinct from new.proximo_seguimiento)
  execute function programar_follow_up_desde_lead();

-- Mismo criterio al CREAR un lead que ya trae fecha de seguimiento.
drop trigger if exists trg_leads_programar_follow_up_ins on leads;
create trigger trg_leads_programar_follow_up_ins
  after insert on leads
  for each row
  when (new.proximo_seguimiento is not null)
  execute function programar_follow_up_desde_lead();

-- -------------------------------------------------------------
-- 5b. TRIGGER: red de seguridad al archivar/reactivar por cualquier vía
-- -------------------------------------------------------------
-- El RPC cerrar_lead() es el camino "bueno" (pide motivo), pero `leads.estado`
-- también se puede cambiar desde el selector de etapa de la ficha, arrastrando
-- en el kanban, o desde un workflow externo. Este trigger garantiza que, venga
-- de donde venga el cambio, un lead que entra en ganado/perdido queda bien
-- archivado (con fecha y etapa previa) y sin seguimientos pendientes colgando,
-- y que al volver a una etapa abierta se limpia el cierre.
create or replace function sync_lead_cierre() returns trigger as $$
begin
  -- se archiva
  if new.estado in ('ganado','perdido') and old.estado not in ('ganado','perdido') then
    new.etapa_previa  := old.estado;
    new.cerrado_en    := coalesce(new.cerrado_en, now());

  -- se reactiva
  elsif new.estado not in ('ganado','perdido') and old.estado in ('ganado','perdido') then
    new.cerrado_en    := null;
    new.motivo_cierre := null;
    new.etapa_previa  := null;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_sync_cierre on leads;
create trigger trg_leads_sync_cierre
  before update of estado on leads
  for each row
  when (old.estado is distinct from new.estado)
  execute function sync_lead_cierre();

-- Los seguimientos pendientes de un lead recién archivado se cancelan (no se
-- borran: siguen en su historial). Va en AFTER porque toca otra tabla.
create or replace function cancelar_follow_ups_al_archivar() returns trigger as $$
begin
  if new.estado in ('ganado','perdido') and old.estado not in ('ganado','perdido') then
    update follow_ups
       set estado = 'cancelado'
     where lead_id = new.id and estado = 'pendiente' and deleted_at is null;
  end if;
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_leads_cancelar_follow_ups on leads;
create trigger trg_leads_cancelar_follow_ups
  after update of estado on leads
  for each row
  when (old.estado is distinct from new.estado)
  execute function cancelar_follow_ups_al_archivar();

-- -------------------------------------------------------------
-- 6. RPCs — mutaciones compuestas atómicas (patrón de 0003_functions.sql)
-- -------------------------------------------------------------

-- Completar un follow-up: marca resultado + fecha. El trigger de arriba deja
-- leads.proximo_seguimiento en null, liberando el hueco para programar el
-- siguiente toque de la secuencia.
create or replace function completar_follow_up(
  p_id        uuid,
  p_resultado follow_up_resultado,
  p_nota      text default null
) returns void as $$
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  update follow_ups
     set estado       = 'completado',
         resultado    = p_resultado,
         completed_at = now(),
         nota         = coalesce(p_nota, nota)
   where id = p_id
     and estado = 'pendiente'
     and deleted_at is null;

  if not found then
    raise exception 'seguimiento no encontrado o no está pendiente';
  end if;
end;
$$ language plpgsql security definer;

-- Programar el siguiente toque. Calcula `orden` solo (último + 1) y falla
-- limpio si ya hay uno pendiente (el índice único lo impide de todos modos).
create or replace function programar_follow_up(
  p_lead_id     uuid,
  p_fecha       date,
  p_tipo        follow_up_tipo,
  p_nota        text default null,
  p_responsable text default null
) returns uuid as $$
declare
  v_id    uuid;
  v_orden int;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  if exists (
    select 1 from follow_ups
     where lead_id = p_lead_id and estado = 'pendiente' and deleted_at is null
  ) then
    raise exception 'el lead ya tiene un seguimiento pendiente';
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = p_lead_id and deleted_at is null;

  insert into follow_ups (lead_id, fecha_programada, tipo, nota, orden, responsable)
  values (p_lead_id, p_fecha, p_tipo, p_nota, v_orden,
          coalesce(p_responsable, (select responsable from leads where id = p_lead_id)))
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer;

-- Reprogramar: mover la fecha de un pendiente sin perder el toque.
create or replace function reprogramar_follow_up(p_id uuid, p_fecha date)
returns void as $$
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  update follow_ups set fecha_programada = p_fecha
   where id = p_id and estado = 'pendiente' and deleted_at is null;

  if not found then
    raise exception 'seguimiento no encontrado o no está pendiente';
  end if;
end;
$$ language plpgsql security definer;

-- Cerrar un lead (ganado/perdido) — lo saca del pipeline y de la agenda de
-- seguimientos, SIN borrar nada:
--   · recuerda la etapa previa (para poder reactivar exactamente ahí)
--   · sella cuándo y por qué se cerró
--   · CANCELA el follow-up pendiente (no lo borra: queda en el historial)
--   · deja rastro en pipeline_events, como cualquier cambio de etapa
create or replace function cerrar_lead(
  p_id     uuid,
  p_estado pipeline_stage,   -- 'ganado' | 'perdido'
  p_motivo text default null
) returns void as $$
declare
  v_etapa_actual pipeline_stage;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;
  if p_estado not in ('ganado','perdido') then
    raise exception 'cerrar_lead solo acepta ganado o perdido';
  end if;

  select estado into v_etapa_actual from leads where id = p_id and deleted_at is null;
  if not found then raise exception 'lead no encontrado'; end if;

  update leads
     set etapa_previa  = case
                           when v_etapa_actual in ('ganado','perdido') then etapa_previa
                           else v_etapa_actual
                         end,
         estado        = p_estado,
         cerrado_en    = now(),
         motivo_cierre = p_motivo
   where id = p_id;

  update follow_ups
     set estado = 'cancelado'
   where lead_id = p_id and estado = 'pendiente' and deleted_at is null;

  insert into pipeline_events (lead_id, etapa, notas, changed_by)
  values (p_id, p_estado, p_motivo, auth.uid());
end;
$$ language plpgsql security definer;

-- Reactivar un lead archivado: vuelve a su etapa previa con TODO su historial
-- de seguimientos intacto (nunca se tocó). El motivo del cierre anterior queda
-- registrado para siempre en pipeline_events.
create or replace function reactivar_lead(p_id uuid) returns void as $$
declare
  v_destino pipeline_stage;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  select coalesce(etapa_previa, 'seguimiento') into v_destino
    from leads
   where id = p_id and estado in ('ganado','perdido') and deleted_at is null;

  if not found then raise exception 'el lead no está archivado'; end if;

  update leads
     set estado        = v_destino,
         cerrado_en    = null,
         motivo_cierre = null,
         etapa_previa  = null
   where id = p_id;

  insert into pipeline_events (lead_id, etapa, notas, changed_by)
  values (p_id, v_destino, 'Lead reactivado desde archivo', auth.uid());
end;
$$ language plpgsql security definer;

-- -------------------------------------------------------------
-- 7. VISTA de agenda — alimenta /seguimientos y el banner de aviso
-- -------------------------------------------------------------
-- Los leads archivados (ganado/perdido) y los de papelera quedan fuera por
-- construcción: no hay forma de que ensucien la agenda.
create or replace view follow_ups_agenda as
select
  f.id, f.lead_id, f.fecha_programada, f.tipo, f.nota, f.estado,
  f.orden, f.responsable, f.created_at,
  l.empresa      as lead_empresa,
  l.estado       as lead_estado,
  l.prioridad    as lead_prioridad,
  l.telefono     as lead_telefono,
  l.email        as lead_email,
  l.whatsapp     as lead_whatsapp,
  case
    when f.fecha_programada <  current_date then 'vencido'
    when f.fecha_programada =  current_date then 'hoy'
    else 'proximo'
  end as urgencia,
  (current_date - f.fecha_programada) as dias_vencido
from follow_ups f
join leads l on l.id = f.lead_id
where f.estado = 'pendiente'
  and f.deleted_at is null
  and l.deleted_at is null
  and l.estado not in ('ganado','perdido');

-- -------------------------------------------------------------
-- 8. BACKFILL — ningún lead se pierde, ninguna fecha se inventa
-- -------------------------------------------------------------

-- 8a. Sellar los leads YA cerrados. `updated_at` es una aproximación; se
--     refina en 8b con la fecha real del evento de pipeline si existe.
update leads
   set cerrado_en = coalesce(cerrado_en, updated_at)
 where estado in ('ganado','perdido')
   and cerrado_en is null;

-- 8b. Fecha de cierre REAL y etapa previa, derivadas de pipeline_events
--     (historial append-only que existe desde 0001).
with cierre as (
  select distinct on (lead_id) lead_id, changed_at
    from pipeline_events
   where etapa in ('ganado','perdido')
   order by lead_id, changed_at desc
)
update leads l
   set cerrado_en = c.changed_at
  from cierre c
 where l.id = c.lead_id
   and l.estado in ('ganado','perdido');

with previa as (
  -- último evento NO terminal anterior al cierre = la etapa desde la que se cerró
  select distinct on (pe.lead_id) pe.lead_id, pe.etapa
    from pipeline_events pe
    join leads l on l.id = pe.lead_id
   where l.estado in ('ganado','perdido')
     and pe.etapa not in ('ganado','perdido')
     and (l.cerrado_en is null or pe.changed_at <= l.cerrado_en)
   order by pe.lead_id, pe.changed_at desc
)
update leads l
   set etapa_previa = p.etapa
  from previa p
 where l.id = p.lead_id
   and l.etapa_previa is null;

-- 8c. Cada lead ACTIVO con una fecha en proximo_seguimiento se convierte en su
--     primer follow-up pendiente. El tipo se deriva del canal ya elegido en el
--     lead; instagram/linkedin no tienen equivalente directo -> 'otro'.
--     `on conflict do nothing` protege contra re-ejecución de la migración.
insert into follow_ups (lead_id, fecha_programada, tipo, nota, estado, orden, responsable, created_at)
select
  l.id,
  l.proximo_seguimiento,
  case l.canal_principal
    when 'email'    then 'email'::follow_up_tipo
    when 'whatsapp' then 'whatsapp'::follow_up_tipo
    when 'instagram' then 'otro'::follow_up_tipo
    when 'linkedin'  then 'otro'::follow_up_tipo
    else 'llamada'::follow_up_tipo
  end,
  'Migrado automáticamente desde el campo "próximo seguimiento" del lead.',
  'pendiente',
  1,
  l.responsable,
  coalesce(l.created_at, now())
from leads l
where l.proximo_seguimiento is not null
  and l.deleted_at is null
  and l.estado not in ('ganado','perdido')
  and not exists (
    select 1 from follow_ups f
     where f.lead_id = l.id and f.estado = 'pendiente' and f.deleted_at is null
  );

commit;

-- =============================================================
-- VERIFICACIÓN (ejecutar aparte, después del commit)
-- =============================================================
-- Se esperan: (a) tantos follow-ups pendientes como leads activos que tenían
-- fecha, (b) cero descuadres entre follow_ups y leads.proximo_seguimiento,
-- (c) el total de leads intacto.
--
--   select
--     (select count(*) from leads where deleted_at is null)                        as leads_totales,
--     (select count(*) from leads
--       where deleted_at is null and estado not in ('ganado','perdido')
--         and proximo_seguimiento is not null)                                     as esperados,
--     (select count(*) from follow_ups where estado = 'pendiente')                 as follow_ups_pendientes,
--     (select count(*) from follow_ups_agenda where urgencia = 'vencido')          as vencidos,
--     (select count(*) from leads
--       where estado in ('ganado','perdido') and deleted_at is null)               as archivados;
--
--   -- debe devolver 0 filas: el trigger dejó todo sincronizado
--   select l.id, l.empresa, l.proximo_seguimiento, f.fecha_programada
--     from leads l
--     left join follow_ups f
--       on f.lead_id = l.id and f.estado = 'pendiente' and f.deleted_at is null
--    where l.deleted_at is null
--      and l.proximo_seguimiento is distinct from f.fecha_programada;
-- =============================================================
