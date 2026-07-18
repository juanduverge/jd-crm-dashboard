import axios from 'axios'
import { config } from '@/lib/config'

/**
 * CRM API — cliente de los webhooks de n8n que cubren lo que Supabase no hace:
 * integración con servicios externos (email SMTP/IMAP, IA de Claude y búsqueda
 * de prospectos). NO es la base de datos: el CRUD del negocio vive en Supabase
 * (ver los `*Service` que importan `@/lib/supabaseClient`).
 *
 * Superficie viva:
 *   - readSheet('search_log')  historial de búsquedas (única hoja aún leída)
 *   - generateWithAI / puntuarLead / analizarLead   IA vía Claude
 *   - sendReply                 envío de email (SMTP)
 *   - buscarLeads               captación de prospectos (Apify)
 *   - ping / enabled            diagnóstico de conectividad
 *
 * Si el webhook no responde, el método lanza y el llamador debe propagar el
 * error a la UI (estado de error / vacío). No hay fallback a datos de ejemplo.
 */

const http = axios.create({
  baseURL: config.n8n.hookBase,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    ...(config.n8n.hookToken ? { 'X-CRM-TOKEN': config.n8n.hookToken } : {}),
  },
})

/** Hojas aún leídas vía webhook (el resto migró a tablas Supabase). */
export type SheetTab = 'search_log' | 'config'

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

/** Normaliza la respuesta del webhook de lectura ({rows: [...]}). */
function rowsFromResponse(data: any): Record<string, string>[] {
  if (!data) return []
  if (Array.isArray(data.rows)) return data.rows
  if (Array.isArray(data)) return data as Record<string, string>[]
  return []
}

export const crmApi = {
  enabled() {
    return !!config.n8n.hookBase
  },

  /** Lee una hoja completa como objetos. Lanza si el webhook no responde. */
  async readSheet(tab: SheetTab): Promise<Record<string, string>[]> {
    const { data } = await http.get('/crm-sheets-read', { params: { sheet: tab } })
    return rowsFromResponse(data)
  },

  /** Puntuación IA bajo demanda: Claude califica la oportunidad de venta (0-100) y la guarda. Independiente del análisis. */
  async puntuarLead(payload: {
    leadId: string; empresa?: string; nicho?: string; web?: string
    pageSpeedMovil?: number; pageSpeedDesktop?: number; tieneSSL?: boolean
    ratingGoogle?: number; numResenas?: number
  }): Promise<{ ok: boolean; scoreIA: number }> {
    const { data } = await http.post('/crm-sheets-write', { action: 'puntuar_lead', ...payload }, { timeout: 60000 })
    return data
  },

  /** Analiza un lead con IA bajo demanda: score, observaciones, recomendaciones, oportunidades y errores. */
  async analizarLead(payload: {
    leadId: string; empresa?: string; nicho?: string; web?: string; score?: number
    pageSpeedMovil?: number; pageSpeedDesktop?: number; tieneSSL?: boolean
    ratingGoogle?: number; numResenas?: number; diagnosticoIA?: string; notas?: string
  }): Promise<{ ok: boolean; scoreIA: number; observaciones: string; recomendaciones: string; oportunidades: string; errores: string }> {
    const { data } = await http.post('/crm-sheets-write', { action: 'analizar_lead', ...payload }, { timeout: 60000 })
    return data
  },

  /** Genera asunto+cuerpo de outreach vía Claude (workflow n8n). */
  async generateWithAI(payload: GenerateAIPayload): Promise<GenerateAIResult> {
    const { data } = await http.post('/crm-generate-ai', payload, { timeout: 60000 })
    return data
  },

  /** Envía una respuesta de email (SMTP), con adjunto opcional (base64). */
  async sendReply(payload: SendReplyPayload) {
    const { data } = await http.post('/crm-send-reply', payload, { timeout: 45000 })
    return data
  },

  /** Dispara la búsqueda de prospectos en Apify (workflow "Fase 1 - Captación"). */
  async buscarLeads(payload: BuscarLeadsPayload) {
    const { data } = await http.post('/crm-buscar-leads', payload, { timeout: 30000 })
    return data
  },

  /** Comprueba si el CRM API (webhooks) responde. */
  async ping(): Promise<boolean> {
    try {
      await http.get('/crm-sheets-read', { params: { sheet: 'config' }, timeout: 6000 })
      return true
    } catch {
      return false
    }
  },
}

export default crmApi
