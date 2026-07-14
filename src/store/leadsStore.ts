import { create } from 'zustand'
import type { Lead } from '@/types'
import { crmApi } from '@/services/crmApi'

/** Persistencia best-effort a Sheets vía n8n; nunca bloquea la UI optimista. */
const persist = {
  move(lead: Lead) {
    crmApi.updatePipeline({
      leadId: lead.id, empresa: lead.empresa, estado: lead.estado, valorEstimado: lead.valorEstimado,
      prioridad: lead.prioridad, canalPrincipal: lead.canalPrincipal, responsable: lead.responsable,
      proximoSeguimiento: lead.proximoSeguimiento,
    }).catch(() => {})
  },
  create(lead: Lead) {
    crmApi.createLead({
      leadId: lead.id, empresa: lead.empresa, email: lead.email, telefono: lead.telefono,
      ciudad: lead.ciudad, nicho: lead.nicho, web: lead.web, score: lead.score,
    }).catch(() => {})
    crmApi.updatePipeline({
      leadId: lead.id, empresa: lead.empresa, estado: lead.estado, valorEstimado: lead.valorEstimado,
      prioridad: lead.prioridad, canalPrincipal: lead.canalPrincipal, responsable: lead.responsable,
    }).catch(() => {})
  },
  favorito(lead: Lead) {
    crmApi.updatePipelineExtra({ leadId: lead.id, favorito: !!lead.favorito }).catch(() => {})
  },
  update(lead: Lead) {
    // Campos que viven en la hoja prospects.
    crmApi.updateLead({
      leadId: lead.id,
      empresa: lead.empresa, cargo: lead.cargo, nicho: lead.nicho,
      ciudad: lead.ciudad, pais: lead.pais, direccion: lead.direccion,
      telefono: lead.telefono, email: lead.email, web: lead.web,
      whatsapp: lead.whatsapp, instagram: lead.instagram,
      facebook: lead.facebook, linkedin: lead.linkedin,
      score: lead.score, fuente: lead.fuente, notas: lead.notas,
      etiquetas: (lead.etiquetas ?? []).join(', '),
    }).catch(() => {})
    // Campos que viven en la hoja pipeline.
    crmApi.updatePipeline({
      leadId: lead.id, empresa: lead.empresa, estado: lead.estado,
      valorEstimado: lead.valorEstimado, prioridad: lead.prioridad,
      canalPrincipal: lead.canalPrincipal, responsable: lead.responsable,
      proximoSeguimiento: lead.proximoSeguimiento,
    }).catch(() => {})
  },
}

/**
 * Store local de leads. Se hidrata desde React Query (sheetsService) y mantiene
 * las mutaciones optimistas de v1 (agregar/editar/mover de etapa/eliminar).
 * En iteraciones siguientes estas mutaciones se sincronizan a Sheets vía n8n.
 */
interface LeadsState {
  leads: Lead[]
  selectedIds: Set<string>
  hydrated: boolean
  setLeads: (leads: Lead[]) => void
  addLead: (lead: Lead) => void
  updateLead: (id: string, patch: Partial<Lead>) => void
  patchLocal: (id: string, patch: Partial<Lead>) => void
  toggleFavorito: (id: string) => void
  removeLeads: (ids: string[]) => void
  moveStage: (id: string, estado: Lead['estado']) => void
  toggleSelect: (id: string) => void
  clearSelection: () => void
  selectAll: (ids: string[]) => void
}

export const useLeadsStore = create<LeadsState>((set, get) => ({
  leads: [],
  selectedIds: new Set(),
  hydrated: false,
  setLeads: (leads) => {
    // No pisar mutaciones locales si ya estaba hidratado y la fuente es la misma.
    if (!get().hydrated) set({ leads, hydrated: true })
    else set({ leads: mergeKeepLocal(get().leads, leads) })
  },
  addLead: (lead) => {
    set({ leads: [lead, ...get().leads] })
    persist.create(lead)
  },
  updateLead: (id, patch) => {
    const leads = get().leads.map((l) => (l.id === id ? { ...l, ...patch } : l))
    set({ leads })
    const updated = leads.find((l) => l.id === id)
    if (updated) persist.update(updated)
  },

  /** Actualiza el estado local sin volver a persistir (usado tras acciones que ya escriben en Sheets, como el análisis IA). */
  patchLocal: (id, patch) => {
    set({ leads: get().leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) })
  },
  toggleFavorito: (id) => {
    const leads = get().leads.map((l) => (l.id === id ? { ...l, favorito: !l.favorito } : l))
    set({ leads })
    const updated = leads.find((l) => l.id === id)
    if (updated) persist.favorito(updated)
  },
  removeLeads: (ids) => {
    const set2 = new Set(ids)
    set({ leads: get().leads.filter((l) => !set2.has(l.id)), selectedIds: new Set() })
  },
  moveStage: (id, estado) => {
    const now = new Date().toISOString()
    const leads = get().leads.map((l) =>
      l.id === id ? { ...l, estado, fechaUltimoMovimiento: now } : l,
    )
    set({ leads })
    const moved = leads.find((l) => l.id === id)
    if (moved) persist.move(moved)
  },
  toggleSelect: (id) => {
    const s = new Set(get().selectedIds)
    s.has(id) ? s.delete(id) : s.add(id)
    set({ selectedIds: s })
  },
  clearSelection: () => set({ selectedIds: new Set() }),
  selectAll: (ids) => set({ selectedIds: new Set(ids) }),
}))

/** Conserva leads locales que no existan aún en remoto y refresca el resto. */
function mergeKeepLocal(local: Lead[], remote: Lead[]): Lead[] {
  const remoteIds = new Set(remote.map((l) => l.id))
  const localOnly = local.filter((l) => !remoteIds.has(l.id))
  return [...localOnly, ...remote]
}
