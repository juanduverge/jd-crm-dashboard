-- =============================================================
-- 0012_messages_inbox_module.sql — Ajustes para módulos Mensajes / Bandeja
-- (frontend ya migrado a Supabase: messagesService.ts / inboxService.ts)
-- NOTA: no aplicada aún — solo escrita, pendiente de revisión.
-- =============================================================

-- La hoja de Sheets "inbox" traía "De Nombre" separado de "De Email"
-- (remitente). inbox_messages solo tiene `remitente` (email). Se agrega
-- una columna opcional para el nombre para mostrar en el hilo sin perder
-- el dato cuando n8n lo tenga disponible en la cabecera IMAP.
alter table inbox_messages
  add column if not exists remitente_nombre text;

-- Índice para filtrar rápido "solo no leídos" en la Bandeja (usa la
-- columna leido + orden por fecha, patrón de acceso real de InboxPage).
create index if not exists idx_inbox_unread
  on inbox_messages (leido, created_at desc)
  where leido = false;

-- El módulo Mensajes construye el hilo por lead uniendo outreach_messages
-- (salida) + inbox_messages (entrada). Un índice por lead_id agiliza esa
-- consulta en ambas tablas (antes solo existía el índice parcial de la cola).
create index if not exists idx_outreach_lead on outreach_messages (lead_id, created_at desc);
create index if not exists idx_inbox_lead on inbox_messages (lead_id, created_at desc);
