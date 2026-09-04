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
  destinatario: string | null
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

/**
 * Clave del hilo. Si la fila tiene lead, el hilo es del lead; si no, es la
 * dirección de correo en minúsculas.
 *
 * Esta es la convención que MessagesPage ya daba por hecha («el idLead del
 * hilo ES el email destino») pero que el servicio contradecía filtrando esas
 * filas. Se unifica aquí para que sólo haya una definición de hilo.
 */
function claveHilo(leadId: string | null, email: string | null): string {
  if (leadId) return leadId
  return (email ?? '').trim().toLowerCase()
}

function outreachToMessage(row: OutreachRow): Message {
  return {
    idLead: claveHilo(row.lead_id, row.destinatario),
    fecha: row.sent_at ?? row.created_at,
    canal: 'email',
    tipo: row.status,
    // El asunto se conservaba en la BD y se tiraba aquí: sin él, el hilo no
    // se puede leer (todo eran cuerpos sueltos sin decir de qué iban).
    asunto: row.asunto ?? undefined,
    contenido: row.cuerpo ?? '',
    estadoEnvio: row.status,
    // Un envío fallido tiene que decir por qué; antes el error se quedaba en
    // la tabla y la pantalla sólo mostraba "failed".
    error: row.error ?? undefined,
    direccion: 'enviado',
  }
}

function inboxToMessage(row: InboxRow): Message {
  return {
    idLead: claveHilo(row.lead_id, row.remitente),
    fecha: row.created_at,
    canal: 'email',
    tipo: 'respuesta',
    asunto: row.asunto ?? undefined,
    remitente: row.remitente ?? undefined,
    contenido: row.cuerpo ?? '',
    respuestaRecibida: row.cuerpo ?? '',
    direccion: 'recibido',
  }
}

export const messagesService = {
  /**
   * Historial combinado (envíos + respuestas), agrupable por hilo.
   *
   * NO se filtra por `lead_id is not null`. Ese filtro era la causa de que
   * «el seguimiento de emails no funcionase»: precisamente las respuestas
   * que n8n no supo emparejar con un lead —las que hay que revisar a mano—
   * eran las que se ocultaban, y también todo envío a una dirección suelta.
   * Se veía un hilo vacío y parecía que no había llegado nada.
   *
   * Ahora esas filas entran con la dirección de correo como clave de hilo
   * (ver `claveHilo`). La migración 0024 además intenta emparejarlas en la
   * propia BD antes de que lleguen aquí.
   */
  async getMessages(): Promise<Message[]> {
    const [{ data: outreach, error: outErr }, { data: inbox, error: inErr }] = await Promise.all([
      supabase
        .from('outreach_messages')
        .select('id, lead_id, campaign_id, destinatario, asunto, cuerpo, status, error, next_send_at, sent_at, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('inbox_messages')
        .select('id, lead_id, remitente, asunto, cuerpo, created_at')
        .order('created_at', { ascending: false }),
    ])
    if (outErr) throw outErr
    if (inErr) throw inErr

    return [
      ...((outreach ?? []) as OutreachRow[]).map(outreachToMessage),
      ...((inbox ?? []) as InboxRow[]).map(inboxToMessage),
    ]
      // Una fila sin lead NI dirección no se puede colgar de ningún hilo.
      .filter((m) => m.idLead)
  },

  /**
   * Registra en el outbox (`outreach_messages`, status='sent') una respuesta
   * ya despachada por SMTP vía n8n (`crmApi.sendReply`). No dispara ningún
   * envío: es solo el registro histórico para que aparezca en el hilo de
   * Mensajes.
   *
   * ANTES hacía `if (!leadId) return`: un correo a una dirección suelta se
   * enviaba de verdad y no dejaba NINGÚN rastro en el CRM. Ahora siempre se
   * registra — con `destinatario`, que es la columna que faltaba (migración
   * 0024) y que además permite emparejar la respuesta cuando llegue.
   */
  async logSentMessage(payload: {
    leadId?: string
    /** Dirección a la que se envió. Es lo que cuelga el hilo si no hay lead. */
    destinatario?: string
    asunto: string
    cuerpo: string
  }): Promise<void> {
    if (!payload.leadId && !payload.destinatario) return

    const { error } = await supabase.from('outreach_messages').insert({
      lead_id: payload.leadId ?? null,
      destinatario: payload.destinatario ?? null,
      asunto: payload.asunto,
      cuerpo: payload.cuerpo,
      // 'enviado', en espanol. La restriccion real de la columna acepta
      // draft / nota_generada / listo_envio / enviado / error /
      // whatsapp_enviado / seguimiento_enviado. Las migraciones del repo
      // dicen otra cosa porque la base de produccion se toco por fuera:
      // insertar 'sent' revienta el insert con un 400 y el envio se quedaba
      // sin registrar.
      status: 'enviado',
      sent_at: new Date().toISOString(),
    })
    if (error) throw error
  },
}

export default messagesService
