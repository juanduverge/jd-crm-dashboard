import { supabase } from '@/lib/supabaseClient'
import type { WebLead, WebLeadPriority, WebLeadStatus } from '@/types'

/**
 * webLeadsService — CRUD del módulo Web Leads (solicitudes del formulario
 * público) contra Supabase (tabla `web_leads`).
 *
 * La inserción sigue siendo responsabilidad de n8n/la Edge Function del
 * formulario público (vía service_role) — fuera del alcance de este
 * servicio. Este servicio sólo lee (RLS) y gestiona (estado/responsable/
 * notas/prioridad/etiquetas) + papelera (soft-delete/restore/purge) +
 * conversión a Lead real (RPC `convert_web_lead`, ver 0003_functions.sql).
 */

interface WebLeadRow {
  id: string
  nombre: string | null
  email: string | null
  telefono: string | null
  mensaje: string | null
  empresa: string | null
  asunto: string | null
  pagina: string | null
  url: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  ip: string | null
  user_agent: string | null
  fuente: string | null
  formulario: string | null
  estado: string | null
  prioridad: string | null
  etiquetas: string[] | null
  responsable: string | null
  notas_internas: string | null
  lead_id: string | null
  created_at: string
  updated_at: string | null
  deleted_at: string | null
}

/** Convierte una fila `web_leads` de Supabase en un WebLead completo. */
function rowToWebLead(row: WebLeadRow): WebLead {
  return {
    id: row.id,
    fechaHora: row.created_at,
    nombre: row.nombre ?? '',
    email: row.email ?? '',
    empresa: row.empresa ?? undefined,
    telefono: row.telefono ?? undefined,
    asunto: row.asunto ?? undefined,
    mensaje: row.mensaje ?? '',
    pagina: row.pagina ?? undefined,
    url: row.url ?? undefined,
    referrer: row.referrer ?? undefined,
    utmSource: row.utm_source ?? undefined,
    utmMedium: row.utm_medium ?? undefined,
    utmCampaign: row.utm_campaign ?? undefined,
    ip: row.ip ?? undefined,
    userAgent: row.user_agent ?? undefined,
    fuente: row.fuente || 'web',
    formulario: row.formulario ?? undefined,
    estado: (row.estado as WebLeadStatus) || 'nuevo',
    prioridad: (row.prioridad as WebLeadPriority) || 'media',
    etiquetas: row.etiquetas ?? [],
    responsable: row.responsable ?? undefined,
    notasInternas: row.notas_internas ?? undefined,
    actualizado: row.updated_at ?? undefined,
  }
}

export const webLeadsService = {
  /** Lee las solicitudes web activas (no eliminadas) de Supabase. */
  async getWebLeads(): Promise<WebLead[]> {
    const { data, error } = await supabase
      .from('web_leads')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => rowToWebLead(r as WebLeadRow))
  },

  /** Actualiza los campos de gestión (estado/responsable/notas/prioridad/etiquetas). */
  async updateWebLead(payload: {
    id: string
    estado?: WebLeadStatus
    responsable?: string
    notasInternas?: string
    prioridad?: WebLeadPriority
    etiquetas?: string[]
  }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (payload.estado !== undefined) row.estado = payload.estado
    if (payload.responsable !== undefined) row.responsable = payload.responsable
    if (payload.notasInternas !== undefined) row.notas_internas = payload.notasInternas
    if (payload.prioridad !== undefined) row.prioridad = payload.prioridad
    if (payload.etiquetas !== undefined) row.etiquetas = payload.etiquetas
    const { error } = await supabase.from('web_leads').update(row).eq('id', payload.id)
    if (error) throw error
  },

  async deleteWebLead(id: string): Promise<void> {
    const { error } = await supabase.from('web_leads').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async restoreWebLead(id: string): Promise<void> {
    const { error } = await supabase.from('web_leads').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
  },

  /** Borrado físico — sólo permitido (RLS) para admin, y sólo si ya está en papelera. */
  async purgeWebLead(id: string): Promise<void> {
    const { error } = await supabase.from('web_leads').delete().eq('id', id).not('deleted_at', 'is', null)
    if (error) throw error
  },

  /**
   * Convierte una solicitud web en un Lead real (crea `leads` + evento de
   * pipeline + marca la solicitud como cerrada) de forma atómica vía RPC.
   * Ver `convert_web_lead` en 0003_functions.sql.
   */
  async convertWebLead(webLeadId: string): Promise<string> {
    const { data, error } = await supabase.rpc('convert_web_lead', { p_web_lead_id: webLeadId })
    if (error) throw error
    return data as string
  },
}

export default webLeadsService
