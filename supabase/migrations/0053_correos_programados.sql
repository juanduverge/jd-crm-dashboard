-- =============================================================
-- 0053_correos_programados.sql — Secuencias de correo con aprobación y
-- envío por horario (19-oct-2026).
--
-- QUÉ RESUELVE
--
-- ChatGPT redacta tres correos por lead (día 0, 4 y 9). Juan los aprueba en
-- el panel «Por aprobar» del CRM y un workflow de n8n («Envío programado de
-- correos») los manda poco a poco, dentro de un horario y con tope por hora.
--
-- REUTILIZA `outreach_messages`, no crea otra tabla: así los envíos caen en
-- el mismo historial, en las métricas y en el trigger de la 0040 que deja el
-- toque en `follow_ups`. Estados nuevos:
--
--   por_aprobar  redactado, esperando a Juan. NUNCA sale de aquí.
--   programado   aprobado; sale cuando le toque (ver tomar_correos_programados)
--   enviando     reservado por el workflow, para no mandarlo dos veces
--   cancelado    no se manda: Juan lo rechazó, o el lead respondió / tiene
--                WhatsApp / se descartó.
--
-- Se evita `listo_envio` a propósito: «Fase 3 - Envio de Emails» manda TODO
-- lo que está en `listo_envio` de golpe cuando se crea una campaña.
--
-- REGLAS DEL ENVÍO (en tomar_correos_programados, una sola fuente de verdad)
--
--   · Solo si `envio_auto_activo` = 'true' (interruptor general) y hay
--     `direccion_fisica` (la exige CAN-SPAM en el pie de cada correo).
--   · Solo dentro del horario: días y horas de `envio_*`, en la zona horaria
--     de `envio_zona` (los leads son de EE. UU.).
--   · Nunca a un lead con WhatsApp: regla de Juan. Solo sale si el
--     verificador lo dejó en 'no_aparece'. Si sale 'confirmado', la
--     secuencia se cancela; si aún no se verificó, espera.
--   · Nunca si el lead respondió, se descartó, se borró o dejó la etapa
--     de prospección, ni a una dirección dada de baja (optout_emails).
--   · Toque 2 solo 4 días después de enviado el 1; toque 3, 5 días después
--     del 2.
--   · Tope `envio_max_hora` en los últimos 60 minutos y `envio_max_dia` en
--     el día. Si a este ritmo no se llegaría a `envio_min_dia` antes del
--     cierre del horario, sube el ritmo lo justo para alcanzarlo.
--
-- APLICAR: pegar este archivo entero en el SQL Editor de Supabase.
-- No toca filas existentes de outreach_messages.
-- =============================================================

begin;

-- 1 ------------------------------------------------------------
-- Estados y columnas
alter table outreach_messages
  drop constraint if exists outreach_messages_status_check;

alter table outreach_messages
  add constraint outreach_messages_status_check
  check (status in (
    'draft', 'nota_generada', 'listo_envio', 'enviado', 'error',
    'whatsapp_enviado', 'seguimiento_enviado',
    'por_aprobar', 'programado', 'enviando', 'cancelado'
  ));

alter table outreach_messages
  add column if not exists toque         smallint,
  add column if not exists remitente     text,
  add column if not exists origen        text,
  add column if not exists revisar       boolean not null default false,
  add column if not exists nota_revision text,
  add column if not exists aprobado_en   timestamptz,
  add column if not exists cancelado_en  timestamptz,
  add column if not exists motivo_cancelacion text;

-- Un lead no puede tener dos veces el mismo toque vivo en una secuencia.
create unique index if not exists uq_outreach_toque_vivo
  on outreach_messages (lead_id, toque)
  where toque is not null and status <> 'cancelado';

create index if not exists idx_outreach_programado
  on outreach_messages (status, toque) where status in ('programado', 'por_aprobar', 'enviando');

-- Si la tabla de bajas no existía en esta base, la crea vacía.
create table if not exists optout_emails (
  email      text primary key,
  created_at timestamptz not null default now()
);
alter table optout_emails enable row level security;

-- 2 ------------------------------------------------------------
-- Configuración (Ajustes). Editable desde el panel.
insert into settings (key, value, user_id)
select k, v, null from (values
  ('envio_auto_activo', 'false'),
  ('envio_max_hora',    '5'),
  ('envio_min_dia',     '10'),
  ('envio_max_dia',     '25'),
  ('envio_hora_inicio', '9'),
  ('envio_hora_fin',    '17'),
  ('envio_dias',        '1,2,3,4,5'),
  ('envio_zona',        'America/New_York'),
  ('envio_remitente',   'sales@jddeveloper.com'),
  -- CAN-SPAM: todo correo comercial a EE. UU. lleva la dirección postal del
  -- remitente. Vacía = el workflow no manda nada.
  ('direccion_fisica',  '')
) as t(k, v)
where not exists (select 1 from settings s where s.key = t.k and s.user_id is null);

create or replace function envio_cfg(p_key text, p_def text)
returns text language sql stable security definer set search_path = public, pg_temp as $fn$
  select coalesce((select value from settings where key = p_key and user_id is null), p_def);
$fn$;

-- 3 ------------------------------------------------------------
-- Cancela lo que ya no debe salir. Lo llama tomar_correos_programados en
-- cada vuelta y el panel al abrirse, así lo que se ve está al día.
create or replace function cancelar_secuencias_caducadas()
returns int language plpgsql security definer set search_path = public, pg_temp as $fn$
declare n int;
begin
  with c as (
    update outreach_messages o
       set status = 'cancelado', cancelado_en = now(),
           motivo_cancelacion = case
             when l.id is null or l.deleted_at is not null then 'lead borrado'
             when l.descartado then 'lead descartado'
             when l.whatsapp_estado = 'confirmado' then 'tiene WhatsApp'
             when l.respondio_en is not null then 'el lead respondió'
             when l.estado not in ('nuevo', 'contactado', 'seguimiento') then 'lead en etapa ' || l.estado
             else 'dado de baja' end
      from leads l
     where l.id = o.lead_id
       and o.status in ('por_aprobar', 'programado')
       and (l.deleted_at is not null or l.descartado
            or l.whatsapp_estado = 'confirmado'
            or l.respondio_en is not null
            or l.estado not in ('nuevo', 'contactado', 'seguimiento')
            or exists (select 1 from optout_emails x where lower(x.email) = lower(o.destinatario)))
    returning 1)
  select count(*) into n from c;
  return n;
end $fn$;

-- 4 ------------------------------------------------------------
-- El workflow pide la siguiente tanda. Reserva las filas (status 'enviando')
-- para que dos vueltas seguidas nunca manden el mismo correo.
create or replace function tomar_correos_programados(p_tanda int default 2)
returns table (id uuid, lead_id uuid, toque smallint, destinatario text,
               remitente text, asunto text, cuerpo text)
language plpgsql security definer set search_path = public, pg_temp as $fn$
#variable_conflict use_column
declare
  v_zona  text := envio_cfg('envio_zona', 'America/New_York');
  v_local  timestamp := now() at time zone v_zona;
  v_ini    int := envio_cfg('envio_hora_inicio', '9')::int;
  v_fin    int := envio_cfg('envio_hora_fin', '17')::int;
  v_dias   int[] := string_to_array(envio_cfg('envio_dias', '1,2,3,4,5'), ',')::int[];
  v_max_h  int := envio_cfg('envio_max_hora', '5')::int;
  v_min_d  int := envio_cfg('envio_min_dia', '10')::int;
  v_max_d  int := envio_cfg('envio_max_dia', '25')::int;
  v_hora   int; v_ult_h int; v_hoy int; v_cupo int; v_horas_rest numeric;
begin
  perform cancelar_secuencias_caducadas();

  if envio_cfg('envio_auto_activo', 'false') <> 'true' then return; end if;
  if btrim(envio_cfg('direccion_fisica', '')) = '' then return; end if;
  v_hora := extract(hour from v_local);
  if not (extract(isodow from v_local)::int = any (v_dias)) or v_hora < v_ini or v_hora >= v_fin then
    return;
  end if;

  -- Cuenta todo correo enviado, venga de donde venga: el tope protege el
  -- dominio, no solo esta secuencia.
  select count(*) into v_ult_h from outreach_messages
   where status in ('enviado', 'seguimiento_enviado') and sent_at > now() - interval '60 minutes';
  select count(*) into v_hoy from outreach_messages
   where status in ('enviado', 'seguimiento_enviado')
     and (sent_at at time zone v_zona)::date = v_local::date;

  v_cupo := v_max_h - v_ult_h;
  -- Mínimo diario: si a este ritmo no se llega, se sube lo justo.
  v_horas_rest := greatest(v_fin - (v_hora + extract(minute from v_local) / 60.0), 0.25);
  if v_min_d - v_hoy > v_max_h * v_horas_rest then
    v_cupo := greatest(v_cupo, ceil((v_min_d - v_hoy) / v_horas_rest)::int - v_ult_h);
  end if;
  v_cupo := least(v_cupo, v_max_d - v_hoy, p_tanda);
  if v_cupo <= 0 then return; end if;

  return query
  with cand as (
    select o.id
      from outreach_messages o
      join leads l on l.id = o.lead_id
     where o.status = 'programado'
       and o.destinatario is not null
       and l.deleted_at is null and not l.descartado
       and l.whatsapp_estado = 'no_aparece'
       and l.respondio_en is null
       and l.estado in ('nuevo', 'contactado', 'seguimiento')
       and not exists (select 1 from optout_emails x where lower(x.email) = lower(o.destinatario))
       and (o.toque = 1 or exists (
             select 1 from outreach_messages p
              where p.lead_id = o.lead_id and p.toque = o.toque - 1
                and p.status = 'enviado'
                and p.sent_at <= now() - case when o.toque = 2 then interval '4 days' else interval '5 days' end))
       -- un lead, un correo por día
       and not exists (select 1 from outreach_messages h
                        where h.lead_id = o.lead_id and h.status in ('enviado', 'enviando')
                          and h.sent_at > now() - interval '20 hours')
     order by o.toque desc, o.aprobado_en, o.created_at
     limit v_cupo
     for update of o skip locked
  )
  update outreach_messages o
     set status = 'enviando', sent_at = now()
    from cand where o.id = cand.id
  returning o.id, o.lead_id, o.toque, o.destinatario,
            coalesce(o.remitente, envio_cfg('envio_remitente', 'sales@jddeveloper.com')),
            o.asunto, o.cuerpo;
end $fn$;

-- Si n8n se cae a mitad de un envío, la fila se queda en 'enviando'. A los
-- 30 minutos vuelve a 'programado' para no perderla. (Si el SMTP sí llegó a
-- mandarlo, Juan lo verá en Enviados de Hostinger: es el caso raro.)
create or replace function liberar_envios_colgados()
returns int language sql security definer set search_path = public, pg_temp as $fn$
  with r as (
    update outreach_messages set status = 'programado', sent_at = null
     where status = 'enviando' and sent_at < now() - interval '30 minutes'
    returning 1)
  select count(*)::int from r;
$fn$;

-- 5 ------------------------------------------------------------
-- Permisos: el workflow usa service_role; el panel, la sesión del CRM.
revoke execute on function tomar_correos_programados(int), liberar_envios_colgados(),
                           cancelar_secuencias_caducadas(), envio_cfg(text, text)
  from public, anon;
grant execute on function tomar_correos_programados(int), liberar_envios_colgados()
  to service_role;
grant execute on function cancelar_secuencias_caducadas(), envio_cfg(text, text)
  to authenticated, service_role;

commit;

-- Comprobación tras aplicar (debe devolver las 9 claves envio_* y la dirección):
--   select key, value from settings
--    where key like 'envio_%' or key = 'direccion_fisica' order by key;
