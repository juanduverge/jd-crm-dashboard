import { supabase } from '@/lib/supabaseClient'
import type { InboxMessage } from '@/types'

/**
 * inboxService — lectura y gestión (marcar leído) del módulo Bandeja contra
 * Supabase (tabla `inbox_messages`).
 *
 * La inserción sigue siendo responsabilidad de n8n (vía service_role, tras
 * leer IMAP): la tabla no tiene política de INSERT/DELETE para usuarios
 * regulares (ver 0002_rls.sql), así que este servicio solo lee y actualiza
 * el flag `leido`.
 */

interface InboxRow {
  id: string
  lead_id: string | null
  remitente: string | null
  asunto: string | null
  cuerpo: string | null
  adjunto_path: string | null
  leido: boolean
  created_at: string
}

function rowToInboxMessage(row: InboxRow): InboxMessage {
  return {
    id: row.id,
    fecha: row.created_at,
    deEmail: row.remitente ?? '',
    deNombre: undefined,
    asunto: row.asunto ?? '',
    cuerpo: row.cuerpo ?? '',
    idLead: row.lead_id ?? undefined,
    leido: row.leido,
  }
}

export const inboxService = {
  /** Correos recibidos vía IMAP, más recientes primero. */
  async getInbox(): Promise<InboxMessage[]> {
    const { data, error } = await supabase
      .from('inbox_messages')
      .select('id, lead_id, remitente, asunto, cuerpo, adjunto_path, leido, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return ((data ?? []) as InboxRow[]).map(rowToInboxMessage)
  },

  /** Marca un correo como leído (persistido en Supabase, no solo local). */
  async markAsRead(id: string): Promise<void> {
    const { error } = await supabase.from('inbox_messages').update({ leido: true }).eq('id', id)
    if (error) throw error
  },
}

export default inboxService
