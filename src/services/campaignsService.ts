import { supabase } from '@/lib/supabaseClient'
import type { Campaign, CampaignStatus } from '@/types'

/**
 * campaignsService — CRUD del módulo Campañas contra Supabase
 * (tablas `campaigns` + `campaign_leads`, ver 0001_schema.sql).
 *
 * El envío real (email/whatsapp) sigue siendo responsabilidad de los
 * workflows de n8n (fuera de alcance) — este servicio sólo gestiona los
 * metadatos de la campaña y su asociación con leads (`campaign_leads`).
 */

interface CampaignRow {
  id: string
  nombre: string
  nicho: string | null
  idioma: string | null
  estado: string | null
  tipo_mensaje: string | null
  template: string | null
  total_leads: number | null
  enviados: number | null
  respondidos: number | null
  fecha_inicio: string | null
  fecha_fin: string | null
  notas: string | null
  created_at: string
  deleted_at: string | null
}

/** Convierte una fila `campaigns` + sus leadIds asociados en un Campaign completo. */
function rowToCampaign(row: CampaignRow, leadIds: string[]): Campaign {
  const enviados = row.enviados ?? 0
  const respondidos = row.respondidos ?? 0
  return {
    id: row.id,
    nombre: row.nombre || '(sin nombre)',
    nicho: row.nicho || 'otros',
    idioma: (row.idioma as Campaign['idioma']) || 'es',
    estado: (row.estado as CampaignStatus) || 'borrador',
    totalLeads: row.total_leads ?? leadIds.length,
    enviados,
    respondieron: respondidos,
    conversion: enviados ? Math.round((respondidos / enviados) * 1000) / 10 : 0,
    valorGenerado: 0,
    templateId: row.template ?? undefined,
    createdAt: row.created_at,
    leadIds,
    events: [],
  }
}

export interface CampaignCreateInput {
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

export interface CampaignUpdateInput {
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

/** Reemplaza por completo las filas `campaign_leads` de una campaña. */
async function setCampaignLeads(campaignId: string, leadIds: string[]): Promise<void> {
  const { error: delError } = await supabase.from('campaign_leads').delete().eq('campaign_id', campaignId)
  if (delError) throw delError
  if (!leadIds.length) return
  const rows = leadIds.map((leadId) => ({ campaign_id: campaignId, lead_id: leadId }))
  const { error } = await supabase.from('campaign_leads').insert(rows)
  if (error) throw error
}

export const campaignsService = {
  /** Lee las campañas activas (no eliminadas) con sus leadIds asociados. */
  async getCampaigns(): Promise<Campaign[]> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    const rows = (data ?? []) as CampaignRow[]
    if (!rows.length) return []

    const { data: links, error: linksError } = await supabase
      .from('campaign_leads')
      .select('campaign_id, lead_id')
      .in('campaign_id', rows.map((r) => r.id))
    if (linksError) throw linksError

    const leadsByCampaign = new Map<string, string[]>()
    for (const l of links ?? []) {
      const arr = leadsByCampaign.get(l.campaign_id) ?? []
      arr.push(l.lead_id)
      leadsByCampaign.set(l.campaign_id, arr)
    }

    return rows.map((r) => rowToCampaign(r, leadsByCampaign.get(r.id) ?? []))
  },

  /** Campañas en papelera (soft-deleted), para el módulo de papelera. */
  async getTrashCampaigns(): Promise<{ id: string; nombre: string; deletedAt: string | null }[]> {
    const { data, error } = await supabase
      .from('campaigns')
      .select('id, nombre, deleted_at')
      .not('deleted_at', 'is', null)
    if (error) throw error
    return (data ?? []).map((r) => ({ id: r.id, nombre: r.nombre || '(sin nombre)', deletedAt: r.deleted_at }))
  },

  /** Crea una campaña nueva y, si trae leadIds, crea las filas de asociación. */
  async createCampaign(payload: CampaignCreateInput): Promise<string> {
    const row: Record<string, unknown> = {
      nombre: payload.nombre,
      nicho: payload.nicho,
      idioma: payload.idioma ?? 'es',
      estado: payload.estado ?? 'borrador',
      tipo_mensaje: payload.tipoMensaje,
      template: payload.template,
      total_leads: payload.totalLeads ?? payload.leadIds?.length ?? 0,
      notas: payload.notas,
    }
    const { data, error } = await supabase.from('campaigns').insert(row).select('id').single()
    if (error) throw error
    const id = data.id as string
    if (payload.leadIds?.length) await setCampaignLeads(id, payload.leadIds)
    return id
  },

  /** Edita campos de una campaña existente; si trae leadIds, reemplaza la asociación completa. */
  async updateCampaign(payload: CampaignUpdateInput): Promise<void> {
    const row: Record<string, unknown> = {}
    if (payload.nombre !== undefined) row.nombre = payload.nombre
    if (payload.nicho !== undefined) row.nicho = payload.nicho
    if (payload.idioma !== undefined) row.idioma = payload.idioma
    if (payload.estado !== undefined) row.estado = payload.estado
    if (payload.tipoMensaje !== undefined) row.tipo_mensaje = payload.tipoMensaje
    if (payload.template !== undefined) row.template = payload.template
    if (payload.fechaInicio !== undefined) row.fecha_inicio = payload.fechaInicio
    if (payload.fechaFin !== undefined) row.fecha_fin = payload.fechaFin
    if (payload.enviados !== undefined) row.enviados = payload.enviados
    if (payload.respondidos !== undefined) row.respondidos = payload.respondidos
    if (payload.notas !== undefined) row.notas = payload.notas
    if (payload.totalLeads !== undefined) row.total_leads = payload.totalLeads
    else if (payload.leadIds !== undefined) row.total_leads = payload.leadIds.length

    if (Object.keys(row).length) {
      const { error } = await supabase.from('campaigns').update(row).eq('id', payload.id)
      if (error) throw error
    }
    if (payload.leadIds !== undefined) await setCampaignLeads(payload.id, payload.leadIds)
  },

  /** Elimina (soft-delete) una campaña. */
  async deleteCampaign(id: string): Promise<void> {
    const { error } = await supabase.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  /** Restaura una campaña eliminada. */
  async restoreCampaign(id: string): Promise<void> {
    const { error } = await supabase.from('campaigns').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
  },

  /** Borrado físico — sólo permitido (RLS) para admin, y sólo si ya está en papelera. */
  async purgeCampaign(id: string): Promise<void> {
    const { error } = await supabase.from('campaigns').delete().eq('id', id).not('deleted_at', 'is', null)
    if (error) throw error
  },
}

export default campaignsService
