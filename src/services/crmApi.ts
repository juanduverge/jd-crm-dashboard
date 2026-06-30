import axios from 'axios'
import { config } from '@/lib/config'

/**
 * CRM API — cliente de los webhooks de n8n que actúan como proxy de Google Sheets.
 *
 * Evita necesitar una Google API key en el frontend: n8n usa su credencial
 * "Google Sheets account" para leer/escribir y expone webhooks REST.
 *
 * Workflows que lo respaldan (importar desde /n8n):
 *   - "CRM API - Leer Sheets"     GET  /webhook/crm/sheets/:tab
 *   - "CRM API - Escribir Sheets" POST /webhook/crm/sheets/:action
 *
 * Si los webhooks no están desplegados (404/timeout), cada método lanza y el
 * llamador hace fallback a lectura directa (sheetsService) o a datos de ejemplo.
 */

const http = axios.create({
  baseURL: config.n8n.hookBase,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    ...(config.n8n.hookToken ? { 'X-CRM-TOKEN': config.n8n.hookToken } : {}),
  },
})

export type SheetTab = 'prospects' | 'outreach' | 'pipeline' | 'messages' | 'config'

export interface PipelineUpdatePayload {
  idLead: string
  estado: string
  valorEstimado?: number
  prioridad?: string
  responsable?: string
  nota?: string
}

export interface LeadWritePayload {
  id?: string
  empresa: string
  email?: string
  telefono?: string
  ciudad?: string
  nicho?: string
  web?: string
  score?: number
  estado?: string
  valorEstimado?: number
  prioridad?: string
}

/** Normaliza la respuesta de un webhook que puede venir como {values:[[...]]} o como array de objetos. */
function rowsFromResponse(data: any): Record<string, string>[] {
  if (!data) return []
  // Forma 1: { rows: [ {col: val}, ... ] }
  if (Array.isArray(data.rows)) return data.rows
  // Forma 2: array de objetos directo
  if (Array.isArray(data) && data.length && typeof data[0] === 'object' && !Array.isArray(data[0])) {
    return data as Record<string, string>[]
  }
  // Forma 3: { values: [ [header...], [row...] ] }
  const values: string[][] = data.values ?? (Array.isArray(data) ? data : [])
  if (!values.length) return []
  const [header, ...body] = values
  return body
    .filter((r) => r.some((c) => `${c ?? ''}`.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [String(h).trim(), `${r[i] ?? ''}`.trim()])))
}

export const crmApi = {
  enabled() {
    return !!config.n8n.hookBase
  },

  /** Lee una hoja completa como objetos. Lanza si el webhook no responde. */
  async readSheet(tab: SheetTab): Promise<Record<string, string>[]> {
    const { data } = await http.get(`/crm/sheets/${tab}`)
    return rowsFromResponse(data)
  },

  /** Mueve un lead de etapa / actualiza su fila de pipeline. */
  async updatePipeline(payload: PipelineUpdatePayload) {
    const { data } = await http.post('/crm/sheets/pipeline-update', payload)
    return data
  },

  /** Crea un lead nuevo (prospects + pipeline). */
  async createLead(payload: LeadWritePayload) {
    const { data } = await http.post('/crm/sheets/lead-create', payload)
    return data
  },

  /** Edita un lead existente. */
  async updateLead(payload: LeadWritePayload) {
    const { data } = await http.post('/crm/sheets/lead-update', payload)
    return data
  },

  /** Comprueba si el CRM API (webhooks) responde. */
  async ping(): Promise<boolean> {
    try {
      await http.get('/crm/sheets/config', { timeout: 6000 })
      return true
    } catch {
      return false
    }
  },
}

export default crmApi
