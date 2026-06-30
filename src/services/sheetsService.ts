import axios from 'axios'
import { config } from '@/lib/config'
import type { Lead, Message } from '@/types'
import { mockLeads, mockMessages } from './mockData'
import { crmApi, type SheetTab } from './crmApi'

/**
 * Lectura de Google Sheets.
 *
 * Estrategia:
 *  - Si hay VITE_GOOGLE_API_KEY, lee directo de la API v4 (la hoja debe ser
 *    "cualquiera con el enlace puede ver" para que la API key funcione).
 *  - Si no, devuelve datos de ejemplo (mockData) para no bloquear la UI.
 *
 * Escritura: en producción se hace vía n8n (webhook) para usar la credencial
 * "Google Sheets account". En v1 las mutaciones se simulan en el store local.
 */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

async function readRange(tab: string): Promise<string[][]> {
  if (!config.sheets.apiKey || !config.sheets.id) return []
  const url = `${SHEETS_API}/${config.sheets.id}/values/${encodeURIComponent(tab)}`
  const { data } = await axios.get(url, { params: { key: config.sheets.apiKey } })
  return (data?.values ?? []) as string[][]
}

function rowsToObjects(rows: string[][]): Record<string, string>[] {
  if (!rows.length) return []
  const [header, ...body] = rows
  return body
    .filter((r) => r.some((c) => c?.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])))
}

/**
 * Lee una hoja como objetos, priorizando el CRM API (webhooks n8n) y cayendo
 * a la lectura directa con Google API key. Si ambos fallan devuelve [].
 */
async function getRows(tab: SheetTab): Promise<Record<string, string>[]> {
  try {
    const rows = await crmApi.readSheet(tab)
    if (rows.length) return rows
  } catch {
    /* webhook no disponible -> fallback API directa */
  }
  return rowsToObjects(await readRange(tab))
}

const num = (v?: string) => {
  const n = parseFloat((v ?? '').replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

const ESTADO_MAP: Record<string, Lead['estado']> = {
  nuevo: 'nuevo', contactado: 'contactado', seguimiento: 'seguimiento',
  respondio: 'respondio', 'respondió': 'respondio', reunion: 'reunion',
  'reunión': 'reunion', propuesta: 'propuesta', negociacion: 'negociacion',
  'negociación': 'negociacion', ganado: 'ganado', perdido: 'perdido',
}
const mapEstado = (s?: string): Lead['estado'] =>
  ESTADO_MAP[(s ?? '').toLowerCase().trim()] ?? 'nuevo'

export const sheetsService = {
  /** Lee prospects + pipeline y los combina en objetos Lead. */
  async getLeads(): Promise<Lead[]> {
    try {
      const [prospects, pipelineRowObjs] = await Promise.all([
        getRows('prospects'),
        getRows('pipeline'),
      ])
      if (!prospects.length) return mockLeads

      const pipelineByLead = new Map(
        pipelineRowObjs.map((p) => [p['ID Lead'], p]),
      )

      return prospects.map((p): Lead => {
        const pl = pipelineByLead.get(p['ID Lead']) ?? {}
        return {
          id: p['ID Lead'] || crypto.randomUUID(),
          fechaCaptura: p['Fecha captura'],
          empresa: p['Nombre empresa'] || '(sin nombre)',
          nicho: p['Categoria / nicho'] || p['Categoría / nicho'],
          ciudad: p['Ciudad'],
          pais: p['Pais'] || p['País'],
          direccion: p['Direccion'] || p['Dirección'],
          telefono: p['Telefono'] || p['Teléfono'],
          email: p['Email Contacto'] || p['Email'],
          web: p['Sitio web'],
          whatsapp: p['WhatsApp'],
          instagram: p['Instagram'],
          facebook: p['Facebook'],
          linkedin: p['LinkedIn'],
          googleMaps: p['Google Maps URL'],
          ratingGoogle: num(p['Rating Google']),
          numResenas: num(p['N. resenas'] || p['N. reseñas']),
          pageSpeedMovil: num(p['PageSpeed movil'] || p['PageSpeed Movil']),
          pageSpeedDesktop: num(p['PageSpeed desktop'] || p['PageSpeed Desktop']),
          tieneSSL: /si|sí|true|1/i.test(p['Tiene SSL'] || ''),
          diagnosticoIA: p['Diagnostico IA'] || p['Diagnóstico IA'],
          score: num(p['Score Final Combinado'] || p['Score lead (0-100)']),
          fuente: p['Fuente Apify'],
          notas: p['Notas'],
          screenshotUrl: p['Screenshot URL'],
          estado: mapEstado(pl['Estado']),
          prioridad: (pl['Prioridad']?.toLowerCase() as Lead['prioridad']) || 'media',
          canalPrincipal: (pl['Canal principal']?.toLowerCase() as Lead['canalPrincipal']) || 'email',
          valorEstimado: num(pl['Valor estimado (USD)']),
          responsable: pl['Responsable'] || 'JD',
          proximoSeguimiento: pl['Proximo seguimiento'] || pl['Próximo seguimiento'],
          ultimaAccion: pl['Fecha ultimo contacto'] || pl['Fecha último contacto'],
        }
      })
    } catch (e) {
      console.warn('[sheets] usando datos de ejemplo:', (e as Error).message)
      return mockLeads
    }
  },

  async getMessages(): Promise<Message[]> {
    try {
      const rows = await getRows('messages')
      if (!rows.length) return mockMessages
      return rows.map((m) => ({
        idLead: m['ID Lead'],
        fecha: m['Fecha'],
        canal: (m['Canal']?.toLowerCase() as Message['canal']) || 'email',
        tipo: m['Tipo de mensaje'],
        contenido: m['Mensaje generado'],
        estadoEnvio: m['Estado envio'] || m['Estado envío'],
        respuestaRecibida: m['Respuesta recibida'],
        direccion: m['Respuesta recibida'] ? 'recibido' : 'enviado',
      }))
    } catch {
      return mockMessages
    }
  },

  /** Lee la hoja config (clave/valor). */
  async getConfig(): Promise<Record<string, string>> {
    try {
      const rows = await readRange('config')
      return Object.fromEntries(rows.slice(1).map((r) => [r[0], r[1]]))
    } catch {
      return {}
    }
  },

  /** Persiste el cambio de etapa de un lead en Sheets vía n8n (best-effort). */
  async movePipeline(lead: Lead): Promise<boolean> {
    try {
      await crmApi.updatePipeline({
        idLead: lead.id,
        estado: lead.estado,
        valorEstimado: lead.valorEstimado,
        prioridad: lead.prioridad,
        responsable: lead.responsable,
      })
      return true
    } catch {
      return false
    }
  },

  isLive() {
    return !!config.sheets.apiKey || crmApi.enabled()
  },
}

export default sheetsService
