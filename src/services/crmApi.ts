import axios from 'axios'
import { config } from '@/lib/config'

/**
 * CRM API — cliente de los webhooks de n8n que actúan como proxy de Google Sheets.
 *
 * Evita necesitar una Google API key en el frontend: n8n usa su credencial
 * "Google Sheets account" para leer/escribir y expone webhooks REST.
 *
 * Workflows que lo respaldan (n8n):
 *   - "CRM API - Leer Sheets"     GET  /webhook/crm-sheets-read?sheet=:tab
 *   - "CRM API - Escribir Sheets" POST /webhook/crm-sheets-write  { action, leadId, ... }
 *
 * No hay fallback a datos de ejemplo: si el webhook no responde, el método
 * lanza y el llamador debe propagar el error a la UI (estado de error / vacío).
 */

const http = axios.create({
  baseURL: config.n8n.hookBase,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    ...(config.n8n.hookToken ? { 'X-CRM-TOKEN': config.n8n.hookToken } : {}),
  },
})

export type SheetTab = 'prospects' | 'outreach' | 'pipeline' | 'messages' | 'config' | 'inbox' | 'campaigns' | 'search_log' | 'web_leads' | 'tareas' | 'contactos'

export interface PipelineUpdatePayload {
  leadId: string
  empresa?: string
  estado?: string
  prioridad?: string
  canalPrincipal?: string
  fechaPrimerContacto?: string
  proximoSeguimiento?: string
  valorEstimado?: number
  responsable?: string
  notas?: string
}

export interface LeadCreatePayload {
  leadId?: string
  empresa: string
  nicho?: string
  ciudad?: string
  pais?: string
  direccion?: string
  telefono?: string
  email?: string
  web?: string
  emailContacto?: string
  whatsapp?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  googleMaps?: string
  ratingGoogle?: number
  numResenas?: number
  pageSpeedMovil?: number
  pageSpeedDesktop?: number
  tieneSSL?: string
  diagnosticoIA?: string
  score?: number
  fuente?: string
  notas?: string
  screenshotUrl?: string
}

export interface LeadUpdatePayload {
  leadId: string
  empresa?: string
  cargo?: string
  nicho?: string
  ciudad?: string
  pais?: string
  direccion?: string
  telefono?: string
  email?: string
  web?: string
  emailContacto?: string
  whatsapp?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  googleMaps?: string
  ratingGoogle?: number
  numResenas?: number
  pageSpeedMovil?: number
  pageSpeedDesktop?: number
  tieneSSL?: string
  diagnosticoIA?: string
  score?: number
  fuente?: string
  notas?: string
  etiquetas?: string
  screenshotUrl?: string
}

export interface OutreachUpdatePayload {
  leadId: string
  asuntoEmail?: string
  cuerpoEmail?: string
  estado?: string
  fechaEnvio?: string
}

export interface CampaignCreatePayload {
  id?: string
  nombre: string
  nicho?: string
  idioma?: 'es' | 'en'
  estado?: string
  tipoMensaje?: string
  template?: string
  leadIds?: string[]
  totalLeads?: number
  notas?: string
}

export interface CampaignUpdatePayload {
  id: string
  nombre?: string
  nicho?: string
  idioma?: 'es' | 'en'
  estado?: string
  tipoMensaje?: string
  template?: string
  leadIds?: string[]
  fechaInicio?: string
  fechaFin?: string
  totalLeads?: number
  enviados?: number
  respondidos?: number
  notas?: string
}

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

  /** Actualiza (o crea si no existe) la fila de un lead en la hoja pipeline. */
  async updatePipeline(payload: PipelineUpdatePayload) {
    const { data } = await http.post('/crm-sheets-write', { action: 'pipeline_update', ...payload })
    return data
  },

  /** Escribe SOLO Probabilidad y Fecha cierre estimada (celdas aisladas, no toca el resto de la fila). */
  async updatePipelineExtra(payload: { leadId: string; probabilidad?: number; fechaCierreEstimada?: string }) {
    const { data } = await http.post('/crm-sheets-write', { action: 'pipeline_extra', ...payload })
    return data
  },

  /** Crea un lead nuevo (append en prospects). */
  async createLead(payload: LeadCreatePayload) {
    const { data } = await http.post('/crm-sheets-write', { action: 'lead_create', ...payload })
    return data
  },

  /** Edita campos de un lead existente en prospects. */
  async updateLead(payload: LeadUpdatePayload) {
    const { data } = await http.post('/crm-sheets-write', { action: 'lead_update', ...payload })
    return data
  },

  /** Edita campos de un lead existente en outreach. */
  async updateOutreach(payload: OutreachUpdatePayload) {
    const { data } = await http.post('/crm-sheets-write', { action: 'outreach_update', ...payload })
    return data
  },

  /** Crea una campaña nueva (append en campaigns). */
  async createCampaign(payload: CampaignCreatePayload) {
    const { data } = await http.post('/crm-sheets-write', { action: 'campaign_create', ...payload })
    return data
  },

  /** Edita campos de una campaña existente. */
  async updateCampaign(payload: CampaignUpdatePayload) {
    const { data } = await http.post('/crm-sheets-write', { action: 'campaign_update', leadId: payload.id, ...payload })
    return data
  },

  /** Elimina (soft-delete, estado=eliminada) una campaña. */
  async deleteCampaign(id: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'campaign_delete', id, leadId: id })
    return data
  },

  /** Restaura una campaña eliminada (estado=activa). */
  async restoreCampaign(id: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'campaign_restore', id, leadId: id })
    return data
  },

  /** Elimina definitivamente (purga lógica, estado=purgada) una campaña ya eliminada. No borra la fila física. */
  async purgeCampaign(id: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'campaign_update', id, leadId: id, estado: 'purgada' })
    return data
  },

  /** Elimina (soft-delete) un lead en prospects. */
  async deleteLead(leadId: string, eliminadoPor?: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'lead_delete', leadId, eliminadoPor })
    return data
  },

  /** Restaura un lead eliminado en prospects. */
  async restoreLead(leadId: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'lead_restore', leadId })
    return data
  },

  /** Elimina (soft-delete) la fila de un lead en pipeline. */
  async deletePipeline(leadId: string, eliminadoPor?: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'pipeline_delete', leadId, eliminadoPor })
    return data
  },

  /** Restaura la fila de un lead en pipeline. */
  async restorePipeline(leadId: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'pipeline_restore', leadId })
    return data
  },

  /** Elimina definitivamente (purga lógica) un lead ya eliminado en prospects. No borra la fila física. */
  async purgeLead(leadId: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'lead_purge', leadId })
    return data
  },

  /** Elimina definitivamente (purga lógica) la fila de un lead ya eliminado en pipeline. No borra la fila física. */
  async purgePipeline(leadId: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'pipeline_purge', leadId })
    return data
  },

  /** Actualiza (o crea) un par clave/valor en la hoja config. */
  async updateConfig(clave: string, valor: string) {
    const { data } = await http.post('/crm-sheets-write', { action: 'config_update', leadId: clave, clave, valor })
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

  /** Crea un contacto nuevo para un lead (append en contactos). */
  async createContact(payload: { leadId: string; nombre: string; cargo?: string; email?: string; telefono?: string; tipo?: string; notas?: string }) {
    const { data } = await http.post('/crm-sheets-write', { action: 'contacto_create', ...payload })
    return data as { ok: boolean; id: string }
  },

  /** Edita campos de un contacto existente. */
  async updateContact(payload: { leadId: string; id: string; nombre?: string; cargo?: string; email?: string; telefono?: string; tipo?: string; notas?: string }) {
    const { data } = await http.post('/crm-sheets-write', { action: 'contacto_update', ...payload })
    return data
  },

  /** Elimina (soft-delete) un contacto. */
  async deleteContact(payload: { leadId: string; id: string }) {
    const { data } = await http.post('/crm-sheets-write', { action: 'contacto_delete', ...payload })
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

  /** Actualiza gestión de una solicitud web (estado/responsable/notas) vía "CRM API - Web Lead". */
  async updateWebLead(payload: { id: string; estado?: string; responsable?: string; notas_internas?: string; prioridad?: string; etiquetas?: string }) {
    const { data } = await http.post('/crm-web-lead', { action: 'update', ...payload })
    return data
  },

  /** Elimina (soft-delete) una solicitud web. */
  async deleteWebLead(id: string, eliminadoPor?: string) {
    const { data } = await http.post('/crm-web-lead', { action: 'delete', id, eliminadoPor })
    return data
  },

  /** Restaura una solicitud web eliminada. */
  async restoreWebLead(id: string) {
    const { data } = await http.post('/crm-web-lead', { action: 'restore', id })
    return data
  },

  /** Elimina definitivamente (purga lógica) una solicitud web ya eliminada. No borra la fila física. */
  async purgeWebLead(id: string) {
    const { data } = await http.post('/crm-web-lead', { action: 'purge', id })
    return data
  },

  /** Crea una tarea/seguimiento manual (workflow "CRM API - Tareas"). */
  async createTarea(payload: { titulo: string; tipo?: string; leadId?: string; leadNombre?: string; fechaVencimiento?: string; prioridad?: string; responsable?: string; notas?: string }) {
    const { data } = await http.post('/crm-tarea', {
      titulo: payload.titulo, tipo: payload.tipo, lead_id: payload.leadId, lead_nombre: payload.leadNombre,
      fecha_vencimiento: payload.fechaVencimiento, prioridad: payload.prioridad, responsable: payload.responsable, notas: payload.notas,
    })
    return data
  },

  /** Actualiza una tarea (estado/fecha/etc). */
  async updateTarea(payload: { id: string; estado?: string; titulo?: string; fecha_vencimiento?: string; prioridad?: string; notas?: string; responsable?: string }) {
    const { data } = await http.post('/crm-tarea', { action: 'update', ...payload })
    return data
  },

  /** Elimina (soft-delete) una tarea. */
  async deleteTarea(id: string, eliminadoPor?: string) {
    const { data } = await http.post('/crm-tarea', { action: 'delete', id, eliminadoPor })
    return data
  },

  /** Restaura una tarea eliminada. */
  async restoreTarea(id: string) {
    const { data } = await http.post('/crm-tarea', { action: 'restore', id })
    return data
  },

  /** Elimina definitivamente (purga lógica) una tarea ya eliminada. No borra la fila física. */
  async purgeTarea(id: string) {
    const { data } = await http.post('/crm-tarea', { action: 'purge', id })
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
