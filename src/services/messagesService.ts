import { supabase } from '@/lib/supabaseClient'
import type { Message } from '@/types'

/**
 * messagesService — lectura del módulo Mensajes contra Supabase.
 *
 * No hay una única tabla "messages" en Supabase: el hilo por lead se arma
 * combinando `outreach_messages` (outbox de salida, patrón outbox que n8n
 * consume vía status='queued'/'sent') e `inbox_messages` (respuestas entrantes
 * vía IMAP, insertadas por n8n con service_role — ver 0001_schema.sql /
 * 0002_rls.sql). El envío real (SMTP) sigue siendo responsabilidad de n8n
 * (`crmApi.sendReply` / `crmApi.generateWithAI`), fuera del alcance de este
 * servicio.
 */

interface OutreachRow {
  id: string
  lead_id: string | null
  campaign_id: string | null
  asunto: string | null
  cuerpo: string | null
  status: string
  error: string | null
  next_send_at: string | null
  sent_at: string | null
  created_at: string
}

interface InboxRow {
  id: string
  lead_id: string | null
  remitente: string | null
  asunto: string | null
  cuerpo: string | null
  created_at: string
}

function outreachToMessage(row: OutreachRow): Message {
  return {
    idLead: row.lead_id ?? '',
    fecha: row.sent_at ?? row.created_at,
    canal: 'email',
    tipo: row.status,
    contenido: row.cuerpo ?? '',
    estadoEnvio: row.status,
    direccion: 'enviado',
  }
}

function inboxToMessage(row: InboxRow): Message {
  return {
    idLead: row.lead_id ?? '',
    fecha: row.created_at,
    canal: 'email',
    tipo: 'respuesta',
    contenido: row.cuerpo ?? '',
    respuestaRecibida: row.cuerpo ?? '',
    direccion: 'recibido',
  }
}

export const messagesService = {
  /** Historial combinado (outreach + respuestas de inbox) agrupable por lead. Solo filas con lead_id asociado. */
  async getMessages(): Promise<Message[]> {
    const [{ data: outreach, error: outErr }, { data: inbox, error: inErr }] = await Promise.all([
      supabase
        .from('outreach_messages')
        .select('id, lead_id, campaign_id, asunto, cuerpo, status, error, next_send_at, sent_at, created_at')
        .not('lead_id', 'is', null)
        .order('created_at', { ascending: false }),
      supabase
        .from('inbox_messages')
        .select('id, lead_id, remitente, asunto, cuerpo, created_at')
        .not('lead_id', 'is', null)
        .order('created_at', { ascending: false }),
    ])
    if (outErr) throw outErr
    if (inErr) throw inErr

    return [
      ...((outreach ?? []) as OutreachRow[]).map(outreachToMessage),
      ...((inbox ?? []) as InboxRow[]).map(inboxToMessage),
    ]
  },

  /**
   * Registra en el outbox (`outreach_messages`, status='sent') una respuesta
   * ya despachada por SMTP vía n8n (`crmApi.sendReply`). No dispara ningún
   * envío: es solo el registro histórico para que aparezca en el hilo de
   * Mensajes. Si no hay leadId asociado (destinatario libre sin lead), no se
   * registra nada — el outbox es por-lead.
   */
  async logSentMessage(payload: { leadId?: string; asunto: string; cuerpo: string }): Promise<void> {
    if (!payload.leadId) return
    const { error } = await supabase.from('outreach_messages').insert({
      lead_id: payload.leadId,
      asunto: payload.asunto,
      cuerpo: payload.cuerpo,
      status: 'sent',
      sent_at: new Date().toISOString(),
    })
    if (error) throw error
  },
}

export default messagesService
