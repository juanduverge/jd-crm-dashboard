-- =============================================================
-- 0037 — Deja por escrito los estados que ACEPTA `outreach_messages`
--
-- Esta migración no cambia la base de datos: la documenta.
--
-- QUÉ PASÓ
-- La 0001 declara `status text ... check (status in ('draft','queued',
-- 'sent','failed'))`. La base de producción NO acepta esos valores: acepta
-- otros, en español, que corresponden al flujo real de las fases de n8n.
-- Alguien cambió la restricción directamente en Supabase y no dejó
-- migración, así que el repo lleva tiempo mintiendo sobre esta columna.
--
-- LO QUE COSTÓ
-- Cualquiera que se fiara del repo insertaba `status = 'sent'` y recibía un
-- 400 con `outreach_messages_status_check`. Es lo que le pasaba al nodo de
-- n8n que registra los envíos y a `messagesService.logSentMessage`: el
-- correo salía por SMTP, le llegaba al cliente, y el registro reventaba. Con
-- el `onError` del nodo tragándose el fallo, el CRM decía «Mensaje enviado»
-- y no guardaba nada. Diagnosticar eso costó un día entero.
--
-- ESTADO REAL, comprobado con:
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'outreach_messages_status_check';
--
--   draft · nota_generada · listo_envio · enviado · error ·
--   whatsapp_enviado · seguimiento_enviado
--
-- El equivalente de «se envió» es `enviado`, no `sent`.
--
-- Se vuelve a declarar la restricción tal cual está, de forma idempotente,
-- para que a partir de ahora el repo y la base digan lo mismo y una
-- reconstrucción desde cero salga igual que producción.
-- =============================================================

begin;

alter table outreach_messages
  drop constraint if exists outreach_messages_status_check;

alter table outreach_messages
  add constraint outreach_messages_status_check
  check (status in (
    'draft',                -- redactado, sin generar ni enviar
    'nota_generada',        -- la IA ya escribió la nota / cuerpo
    'listo_envio',          -- en cola para salir
    'enviado',              -- salió por SMTP  ← el que usa el CRM al enviar
    'error',                -- falló el envío; el motivo va en `error`
    'whatsapp_enviado',     -- la fase 4 lo mandó por WhatsApp
    'seguimiento_enviado'   -- correo de seguimiento de la fase 4
  ));

commit;
