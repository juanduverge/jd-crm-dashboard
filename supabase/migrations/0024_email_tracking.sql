-- =============================================================
-- 0024_email_tracking.sql — Reconectar el seguimiento de emails
--
-- SÍNTOMA: «envío correos y luego no hay rastro; las respuestas no aparecen
-- en el hilo del lead».
--
-- CAUSA (tres fallos encadenados, ninguno era el envío en sí):
--
-- 1. `outreach_messages` NO guarda a quién se escribió. Sólo `lead_id`. Un
--    envío a una dirección suelta (sin lead) no se podía registrar: el
--    servicio hacía `if (!leadId) return` porque no había dónde meter el
--    destinatario. Ese correo desaparecía del CRM por completo.
--
-- 2. Los correos salían SIN identificador de hilo (Message-ID / In-Reply-To).
--    Sin eso, cuando el lector IMAP de n8n mete la respuesta en
--    `inbox_messages` no tiene con qué emparejarla, y la deja con
--    `lead_id = null`.
--
-- 3. Y el cliente filtraba `where lead_id is not null` en las DOS tablas.
--    O sea: justo las filas del punto 2 —las respuestas de verdad— eran las
--    que se ocultaban. Por eso «no llegaba nada»: llegaba y se escondía.
--
-- Esta migración arregla 1 y 2 en la BD y añade la red de seguridad: si n8n
-- no supo emparejar la respuesta, la empareja Postgres por la dirección del
-- remitente. El punto 3 se corrige en `messagesService.ts`.
-- =============================================================

begin;

-- --- 1. A quién se escribió ------------------------------------
-- Nullable porque el histórico ya escrito no lo tiene. A partir de ahora lo
-- rellena siempre `messagesService.logSentMessage`.
alter table outreach_messages
  add column if not exists destinatario text;

-- --- 2. Identificadores de hilo --------------------------------
-- `message_id` es el Message-ID RFC 5322 del correo saliente; `in_reply_to`
-- el del correo al que responde. Con estos dos, n8n puede emparejar una
-- respuesta con total certeza en vez de adivinar por la dirección.
alter table outreach_messages
  add column if not exists message_id text;

alter table inbox_messages
  add column if not exists message_id text,
  add column if not exists in_reply_to text;

-- Búsqueda del hilo padre al ingerir una respuesta.
create index if not exists idx_outreach_message_id
  on outreach_messages (message_id) where message_id is not null;
create index if not exists idx_inbox_in_reply_to
  on inbox_messages (in_reply_to) where in_reply_to is not null;

-- Los hilos "sueltos" (sin lead) se agrupan por dirección, así que hay que
-- poder buscar por ella.
create index if not exists idx_outreach_destinatario
  on outreach_messages (lower(destinatario)) where destinatario is not null;
create index if not exists idx_inbox_remitente
  on inbox_messages (lower(remitente)) where remitente is not null;

-- --- 3. Emparejado automático de las respuestas ----------------
-- La red de seguridad. n8n inserta en `inbox_messages` con service_role; si
-- deja `lead_id` vacío, este trigger intenta resolverlo solo, en dos pasos:
--
--   a) por el hilo: `in_reply_to` apunta a un envío nuestro, que ya sabe de
--      qué lead era. Es el camino fiable.
--   b) por la dirección del remitente contra el email del lead. Menos
--      exacto, pero cubre el histórico y a los clientes de correo que no
--      devuelven las cabeceras de hilo.
--
-- Si ninguno resuelve, la fila se queda con lead_id null y AUN ASÍ se ve:
-- el módulo Mensajes ya no la esconde. Un correo sin emparejar es un dato,
-- no un error que haya que ocultar.
create or replace function inbox_resolver_lead() returns trigger as $$
declare v_lead uuid;
begin
  if new.lead_id is not null then
    return new;
  end if;

  -- a) por hilo
  if new.in_reply_to is not null then
    select o.lead_id into v_lead
      from outreach_messages o
     where o.message_id = new.in_reply_to
       and o.lead_id is not null
     order by o.created_at desc
     limit 1;
  end if;

  -- b) por dirección del remitente
  if v_lead is null and new.remitente is not null then
    select l.id into v_lead
      from leads l
     where l.deleted_at is null
       and (lower(l.email) = lower(new.remitente)
         or lower(l.email_contacto) = lower(new.remitente))
     order by l.created_at asc
     limit 1;
  end if;

  new.lead_id := v_lead;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_inbox_resolver_lead on inbox_messages;
create trigger trg_inbox_resolver_lead
  before insert on inbox_messages
  for each row execute function inbox_resolver_lead();

-- --- 4. Reparar el histórico ya ingerido -----------------------
-- Las respuestas que llegaron mientras el emparejado no existía siguen
-- huérfanas. Se resuelven de una vez por la dirección del remitente.
update inbox_messages i
   set lead_id = l.id
  from leads l
 where i.lead_id is null
   and i.remitente is not null
   and l.deleted_at is null
   and (lower(l.email) = lower(i.remitente)
     or lower(l.email_contacto) = lower(i.remitente));

comment on column outreach_messages.destinatario is
  'Dirección a la que se envió. Permite registrar envíos sin lead asociado.';
comment on column outreach_messages.message_id is
  'Message-ID RFC 5322 del correo saliente. Lo empareja con su respuesta.';
comment on column inbox_messages.in_reply_to is
  'Message-ID del correo al que responde. Lo usa inbox_resolver_lead().';

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Cuántas respuestas seguían huérfanas y cuántas se han emparejado:
--
--   select lead_id is null as huerfano, count(*)
--     from inbox_messages group by 1;
--
-- 2) El trigger empareja por dirección al insertar:
--
--   insert into inbox_messages (remitente, asunto, cuerpo)
--   values ('<email de un lead existente>', 'Prueba', 'Hola');
--   select lead_id from inbox_messages order by created_at desc limit 1;
--   -- debe traer el id del lead, no null.
--
-- =============================================================
-- PENDIENTE EN n8n (no se puede hacer desde SQL)
-- =============================================================
-- El workflow de envío debe guardar el Message-ID que devuelve el nodo SMTP
-- en `outreach_messages.message_id`, y el lector IMAP debe volcar las
-- cabeceras `Message-ID` e `In-Reply-To` en las columnas nuevas de
-- `inbox_messages`. Sin eso funciona sólo el emparejado por dirección (el
-- camino b), que falla cuando el cliente responde desde otra cuenta.
