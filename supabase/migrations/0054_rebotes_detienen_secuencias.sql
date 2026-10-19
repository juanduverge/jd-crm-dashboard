-- =============================================================
-- 0054_rebotes_detienen_secuencias.sql — Un rebote detiene la secuencia
-- (19-oct-2026).
--
-- PROBLEMA
--
-- El primer envío programado a AR1 Roofing rebotó: «550 5.1.1 Address does
-- not exist». El dominio tenía MX, el buzón no existía. Sin esto, el
-- workflow habría mandado también el toque 2 y el 3 a una dirección muerta,
-- y cada rebote resta reputación al dominio.
--
-- QUÉ HACE
--
-- 1. `emails_invalidos`: las direcciones que rebotaron de forma permanente.
--    `tomar_correos_programados` (0053) ya excluye `optout_emails`; aquí se
--    añade esta lista a la misma regla vía cancelar_secuencias_caducadas.
-- 2. Trigger en `inbox_messages`: cuando n8n mete un aviso del
--    MAILER-DAEMON (o «Undelivered…», «Delivery Status Notification
--    (Failure)»), saca las direcciones del cuerpo, las apunta como inválidas
--    y cancela lo que quede por salir hacia ellas.
-- 3. Repasa los rebotes que ya estaban en la bandeja.
--
-- Solo cuenta como rebote un error 5xx (permanente). Un 4xx (buzón lleno,
-- servidor ocupado) no invalida la dirección.
--
-- APLICAR: pegar este archivo entero en el SQL Editor de Supabase.
-- =============================================================

begin;

create table if not exists emails_invalidos (
  email      text primary key,
  motivo     text,
  created_at timestamptz not null default now()
);
alter table emails_invalidos enable row level security;
drop policy if exists "emails_invalidos_select" on emails_invalidos;
create policy "emails_invalidos_select" on emails_invalidos for select
  using (auth_role() in ('admin', 'vendedor', 'viewer'));

-- ¿Es un aviso de rebote? Mismo criterio en el trigger y en el repaso.
create or replace function es_rebote(p_remitente text, p_asunto text)
returns boolean language sql immutable set search_path = public, pg_temp as $fn$
  select coalesce(p_remitente, '') ~* '(mailer-daemon|postmaster|mail delivery)'
      or coalesce(p_asunto, '') ~* '(undeliver|returned to sender|delivery status notification|delivery failure|failure notice|no se pudo entregar)';
$fn$;

-- Apunta las direcciones del rebote y cancela lo pendiente hacia ellas.
-- Devuelve cuántas direcciones nuevas quedaron marcadas.
create or replace function registrar_rebote(p_cuerpo text)
returns int language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_txt   text := regexp_replace(coalesce(p_cuerpo, ''), '<[^>]+>', ' ', 'g');
  v_motivo text;
  v_n     int := 0;
  r       record;
begin
  -- Sin un 5xx no es permanente.
  v_motivo := substring(v_txt from '(5[0-9][0-9][ -][0-9]\.[0-9]+\.[0-9]+[^\n]{0,120})');
  if v_motivo is null then return 0; end if;

  for r in
    select distinct lower(m[1]) as email
      from regexp_matches(v_txt, '([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})', 'g') as m
  loop
    -- Fuera las nuestras y las de los propios servidores de correo.
    continue when r.email ~ '(@jddeveloper\.com$|mailer-daemon|postmaster|@mailchannels\.net$|@hostinger)';
    -- Solo direcciones a las que de verdad escribimos.
    continue when not exists (select 1 from outreach_messages o where lower(o.destinatario) = r.email);

    insert into emails_invalidos (email, motivo) values (r.email, left(v_motivo, 200))
    on conflict (email) do nothing;
    if found then v_n := v_n + 1; end if;

    update outreach_messages
       set status = 'cancelado', cancelado_en = now(),
           motivo_cancelacion = 'rebote: ' || left(v_motivo, 120)
     where lower(destinatario) = r.email and status in ('por_aprobar', 'programado');
  end loop;
  return v_n;
end $fn$;

create or replace function trg_inbox_rebote() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  if es_rebote(new.remitente, new.asunto) then
    perform registrar_rebote(new.cuerpo);
  end if;
  return null;
end $fn$;

drop trigger if exists trg_inbox_rebote on inbox_messages;
create trigger trg_inbox_rebote after insert on inbox_messages
  for each row execute function trg_inbox_rebote();

-- La regla general (0053) también mira la lista: cubre los rebotes que
-- llegan por otra vía y las secuencias cargadas después.
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
             when exists (select 1 from emails_invalidos i where i.email = lower(o.destinatario)) then 'rebote: la dirección no existe'
             else 'dado de baja' end
      from leads l
     where l.id = o.lead_id
       and o.status in ('por_aprobar', 'programado')
       and (l.deleted_at is not null or l.descartado
            or l.whatsapp_estado = 'confirmado'
            or l.respondio_en is not null
            or l.estado not in ('nuevo', 'contactado', 'seguimiento')
            or exists (select 1 from optout_emails x where lower(x.email) = lower(o.destinatario))
            or exists (select 1 from emails_invalidos i where i.email = lower(o.destinatario)))
    returning 1)
  select count(*) into n from c;
  return n;
end $fn$;

revoke execute on function registrar_rebote(text) from public, anon;
grant execute on function registrar_rebote(text) to service_role;

-- Ya conocidos: el de hoy (AR1 Roofing, leído en el buzón de Hostinger) y
-- los rebotes que ya estaban en la bandeja.
insert into emails_invalidos (email, motivo)
values ('admin@ar1roofing.com', '550 5.1.1 Address does not exist')
on conflict (email) do nothing;

select registrar_rebote(cuerpo) from inbox_messages where es_rebote(remitente, asunto);

commit;

-- Comprobación:
--   select * from emails_invalidos order by created_at desc;
