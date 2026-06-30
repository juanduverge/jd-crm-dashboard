import { create } from 'zustand'
import type { Lead } from '@/types'

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
  addLead: (lead) => set({ leads: [lead, ...get().leads] }),
  updateLead: (id, patch) =>
    set({ leads: get().leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) }),
  removeLeads: (ids) => {
    const set2 = new Set(ids)
    set({ leads: get().leads.filter((l) => !set2.has(l.id)), selectedIds: new Set() })
  },
  moveStage: (id, estado) =>
    set({ leads: get().leads.map((l) => (l.id === id ? { ...l, estado } : l)) }),
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
