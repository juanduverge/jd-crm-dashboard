import axios, { isAxiosError } from 'axios'
import { config } from '@/lib/config'
import { supabase } from '@/lib/supabaseClient'

/**
 * CRM API — cliente de los webhooks de n8n que cubren lo que Supabase no hace:
 * integración con servicios externos (email SMTP/IMAP, IA de Claude y búsqueda
 * de prospectos). NO es la base de datos: el CRUD del negocio vive en Supabase
 * (ver los `*Service` que importan `@/lib/supabaseClient`).
 *
 * Superficie viva:
 *   - generateWithAI / puntuarLead / analizarLead   IA vía Claude
 *   - sendReply                 envío de email (SMTP)
 *   - buscarLeads               captación de prospectos (Apify)
 *   - ping / enabled            diagnóstico de conectividad
 *
 * Si el webhook no responde, el método lanza y el llamador debe propagar el
 * error a la UI (estado de error / vacío). No hay fallback a datos de ejemplo.
 *
 * EXCEPCIÓN (fase 2 del plan de arquitectura, migración 0051): enviar correo,
 * puntuar/analizar con IA y buscar prospectos, si n8n está caído, dejan el
 * trabajo en la cola `tareas` de Supabase y devuelven `{ encolado: true }`.
 * El «Trabajador de tareas» de n8n lo hace al volver. La generación de texto
 * con IA no se encola: el texto hace falta en el momento.
 */

/**
 * n8n no está: no hubo respuesta (red) o el proxy del CRM devolvió 502/503.
 * Un TIMEOUT no cuenta, y tampoco un 504: el trabajo pudo haberse hecho (un
 * correo ya enviado) y encolarlo lo repetiría.
 */
function n8nCaido(e: unknown): boolean {
  if (!isAxiosError(e)) return false
  if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') return false
  if (!e.response) return true
  return e.response.status === 502 || e.response.status === 503
}

async function encolar(tipo: string, datos: object): Promise<number> {
  const { data, error } = await supabase.rpc('encolar_desde_crm', { p_tipo: tipo, p_datos: datos })
  if (error) throw error
  return data as number
}

/** Lo que devuelven los métodos que pueden encolar cuando n8n está caído. */
export interface EnCola {
  encolado?: boolean
}

const http = axios.create({
  baseURL: config.n8n.hookBase,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    ...(config.n8n.hookToken ? { 'X-CRM-TOKEN': config.n8n.hookToken } : {}),
  },
})

export interface GenerateAIPayload {
  nicho: string
  idioma: 'es' | 'en'
  tipoMensaje?: string
  contextoLead?: string
  nombreEmpresa?: string
}

export interface GenerateAIResult {
  ok: boolean
  asunto?: string
  cuerpo?: string
  error?: string
}

export interface SendReplyPayload {
  to: string
  subject: string
  body: string
  from?: string
  leadId?: string
  attachmentName?: string
  attachmentBase64?: string
  attachmentMimeType?: string
}

/** Alias de remitente disponibles para responder desde el CRM. */
export const REPLY_ALIASES = [
  { email: 'sales@jddeveloper.com', label: 'Ventas' },
  { email: 'info@jddeveloper.com', label: 'Info' },
] as const

export type LeadSourceKey = 'google_maps' | 'google_web' | 'linkedin' | 'instagram' | 'facebook'

export interface BuscarLeadsPayload {
  tipo_negocio: string
  ciudad: string
  max?: number
  fuente?: LeadSourceKey
}

export const crmApi = {
  enabled() {
    return !!config.n8n.hookBase
  },

  /** Puntuación IA bajo demanda: Claude califica la oportunidad de venta (0-100) y la guarda. Independiente del análisis. */
  async puntuarLead(payload: {
    leadId: string; empresa?: string; nicho?: string; web?: string
    pageSpeedMovil?: number; pageSpeedDesktop?: number; tieneSSL?: boolean
    ratingGoogle?: number; numResenas?: number
  }): Promise<{ ok: boolean; scoreIA: number | null } & EnCola> {
    try {
      const { data } = await http.post('/crm-lead-ia', { action: 'puntuar_lead', ...payload }, { timeout: 60000 })
      return data
    } catch (e) {
      if (!n8nCaido(e)) throw e
      await encolar('puntuar_lead', { action: 'puntuar_lead', ...payload })
      return { ok: true, scoreIA: null, encolado: true }
    }
  },

  /** Analiza un lead con IA bajo demanda: score, observaciones, recomendaciones, oportunidades y errores. */
  async analizarLead(payload: {
    leadId: string; empresa?: string; nicho?: string; web?: string; score?: number
    pageSpeedMovil?: number; pageSpeedDesktop?: number; tieneSSL?: boolean
    ratingGoogle?: number; numResenas?: number; diagnosticoIA?: string; notas?: string
  }): Promise<{ ok: boolean; scoreIA: number | null; observaciones: string; recomendaciones: string; oportunidades: string; errores: string } & EnCola> {
    try {
      const { data } = await http.post('/crm-lead-ia', { action: 'analizar_lead', ...payload }, { timeout: 60000 })
      return data
    } catch (e) {
      if (!n8nCaido(e)) throw e
      await encolar('analizar_lead', { action: 'analizar_lead', ...payload })
      return { ok: true, scoreIA: null, observaciones: '', recomendaciones: '', oportunidades: '', errores: '', encolado: true }
    }
  },

  /** Genera asunto+cuerpo de outreach vía Claude (workflow n8n). */
  async generateWithAI(payload: GenerateAIPayload): Promise<GenerateAIResult> {
    const { data } = await http.post('/crm-generate-ai', payload, { timeout: 60000 })
    return data
  },

  /** Envía una respuesta de email (SMTP), con adjunto opcional (base64). */
  async sendReply(payload: SendReplyPayload): Promise<{ success?: boolean; messageId?: string } & EnCola> {
    try {
      const { data } = await http.post('/crm-send-reply', payload, { timeout: 45000 })
      return data
    } catch (e) {
      if (!n8nCaido(e)) throw e
      await encolar('enviar_correo', payload)
      return { success: true, encolado: true }
    }
  },

  /** Dispara la búsqueda de prospectos en Apify (workflow "Fase 1 - Captación"). */
  async buscarLeads(payload: BuscarLeadsPayload): Promise<Record<string, unknown> & EnCola> {
    try {
      const { data } = await http.post('/crm-buscar-leads', payload, { timeout: 30000 })
      return data
    } catch (e) {
      if (!n8nCaido(e)) throw e
      await encolar('buscar_leads', payload)
      return { encolado: true }
    }
  },

  /** Comprueba si el CRM API (webhooks) responde. Endpoint dedicado sin efectos
   *  secundarios: workflow "CRM API - Ping", que solo devuelve { ok: true }. */
  async ping(): Promise<boolean> {
    try {
      await http.get('/crm-ping', { timeout: 6000 })
      return true
    } catch {
      return false
    }
  },
}

export default crmApi
