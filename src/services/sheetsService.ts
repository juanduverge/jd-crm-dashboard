import type { Lead, Message, ActivityEvent, InboxMessage, Campaign } from '@/types'
import { crmApi, type SheetTab } from './crmApi'

/**
 * Lectura/escritura de Google Sheets, exclusivamente vía el CRM API (webhooks
 * de n8n). No hay fallback a datos de ejemplo ni a lectura directa: si el
 * webhook no responde, los métodos lanzan y el llamador debe mostrar un
 * estado de error o vacío en la UI. Nunca se muestran datos inventados.
 */

async function getRows(tab: SheetTab): Promise<Record<string, string>[]> {
  return crmApi.readSheet(tab)
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
    const [prospects, pipelineRowObjs] = await Promise.all([
      getRows('prospects'),
      getRows('pipeline'),
    ])

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
  },

  async getMessages(): Promise<Message[]> {
    const rows = await getRows('messages')
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
  },

  /** Emails recibidos vía IMAP (hoja "inbox"), sin marcar como leídos en el servidor. */
  async getInbox(): Promise<InboxMessage[]> {
    const rows = await getRows('inbox')
    return rows
      .filter((r) => r['Fecha'])
      .map((r): InboxMessage => ({
        id: r['ID Msg'] || `${r['Fecha']}-${r['De Email']}`,
        fecha: r['Fecha'],
        deEmail: r['De Email'],
        deNombre: r['De Nombre'],
        asunto: r['Asunto'],
        cuerpo: r['Cuerpo'],
        idLead: r['ID Lead'] || undefined,
        leido: /^(true|si|sí|1)$/i.test(r['Leido'] || ''),
      }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  },

  /** Lee la hoja campaigns (feature con persistencia real en Sheets). */
  async getCampaigns(): Promise<Campaign[]> {
    const rows = await getRows('campaigns')
    return rows
      .filter((r) => r['id'] && r['estado'] !== 'eliminada')
      .map((r): Campaign => ({
        id: r['id'],
        nombre: r['nombre'] || '(sin nombre)',
        nicho: r['nicho'] || 'otros',
        idioma: (r['idioma'] as Campaign['idioma']) || 'es',
        estado: (r['estado'] as Campaign['estado']) || 'borrador',
        totalLeads: num(r['total_leads']),
        enviados: num(r['enviados']),
        respondieron: num(r['respondidos']),
        conversion: num(r['enviados']) ? Math.round((num(r['respondidos']) / num(r['enviados'])) * 1000) / 10 : 0,
        valorGenerado: 0,
        templateId: r['template'] || undefined,
        createdAt: r['fecha_creacion'],
        leadIds: r['leads_ids'] ? r['leads_ids'].split(',').filter(Boolean) : [],
        events: [],
      }))
      .sort((a, b) => (a.createdAt && b.createdAt ? (a.createdAt < b.createdAt ? 1 : -1) : 0))
  },

  /** Lee la hoja config (clave/valor) vía el CRM API. */
  async getConfig(): Promise<Record<string, string>> {
    const rows = await getRows('config')
    return Object.fromEntries(rows.map((r) => [r['Clave'], r['Valor']]))
  },

  /** Actividad reciente derivada de mensajes enviados/recibidos reales. */
  async getActivity(): Promise<ActivityEvent[]> {
    const rows = await getRows('messages')
    return rows
      .filter((m) => m['Fecha'])
      .map((m, i): ActivityEvent => {
        const canal = (m['Canal'] || '').toLowerCase()
        const recibido = !!m['Respuesta recibida']
        const type: ActivityEvent['type'] = recibido
          ? (canal === 'whatsapp' ? 'whatsapp' : 'email')
          : (canal === 'whatsapp' ? 'whatsapp' : 'email')
        return {
          id: `msg-${i}-${m['ID Lead']}`,
          type,
          title: recibido
            ? `Respuesta recibida (${m['Nombre empresa'] || m['ID Lead']})`
            : `${m['Tipo de mensaje'] || 'Mensaje'} enviado a ${m['Nombre empresa'] || m['ID Lead']}`,
          detail: m['Estado envio'] || m['Estado envío'],
          timestamp: m['Fecha'],
        }
      })
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 12)
  },

  /** Persiste el cambio de etapa de un lead en Sheets vía n8n. */
  async movePipeline(lead: Lead): Promise<boolean> {
    try {
      await crmApi.updatePipeline({
        leadId: lead.id,
        empresa: lead.empresa,
        estado: lead.estado,
        valorEstimado: lead.valorEstimado,
        prioridad: lead.prioridad,
        canalPrincipal: lead.canalPrincipal,
        responsable: lead.responsable,
        proximoSeguimiento: lead.proximoSeguimiento,
      })
      return true
    } catch {
      return false
    }
  },

  isLive() {
    return crmApi.enabled()
  },
}

export default sheetsService
