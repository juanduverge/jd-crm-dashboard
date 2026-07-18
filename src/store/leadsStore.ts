import { create } from 'zustand'
import type { Lead } from '@/types'
import { leadsService } from '@/services/leadsService'
import { pipelineService } from '@/services/pipelineService'

/**
 * Persistencia best-effort; nunca bloquea la UI optimista.
 * Los campos "propios" del lead y los de Pipeline (estado/valor/prioridad/
 * canal/responsable/próximo seguimiento/probabilidad/fecha cierre/score
 * manual) viven en la misma fila de Supabase (`leads`, ver migración 0008):
 * un lead y su oportunidad de pipeline son la misma entidad.
 */
const persist = {
  move(lead: Lead) {
    pipelineService.updatePipeline(lead.id, {
      estado: lead.estado, valorEstimado: lead.valorEstimado,
      prioridad: lead.prioridad, canalPrincipal: lead.canalPrincipal, responsable: lead.responsable,
      proximoSeguimiento: lead.proximoSeguimiento,
    }).catch(() => {})
  },
  create(_lead: Lead) {
    // El lead (incluidos sus campos de pipeline) ya se creó en Supabase
    // vía leadsService.createLead antes de llegar aquí; nada más que hacer.
  },
  favorito(lead: Lead) {
    leadsService.toggleFavorito(lead.id, !!lead.favorito).catch(() => {})
  },
  update(lead: Lead, prevEstado?: Lead['estado']) {
    // Campos propios del lead -> Supabase.
    leadsService.updateLead(lead.id, {
      empresa: lead.empresa, cargo: lead.cargo, nicho: lead.nicho,
      ciudad: lead.ciudad, pais: lead.pais, direccion: lead.direccion,
      telefono: lead.telefono, email: lead.email, web: lead.web,
      whatsapp: lead.whatsapp, instagram: lead.instagram,
      facebook: lead.facebook, linkedin: lead.linkedin,
      fuente: lead.fuente, notas: lead.notas,
      etiquetas: lead.etiquetas ?? [],
    }).catch(() => {})
    // Campos de pipeline -> Supabase (misma fila `leads`). Solo se envía `estado`
    // (y por lo tanto se inserta un evento en pipeline_events) si de verdad cambió;
    // así una edición normal del lead no genera ruido en el historial de etapas.
    pipelineService.updatePipeline(lead.id, {
      ...(prevEstado !== undefined && lead.estado !== prevEstado ? { estado: lead.estado } : {}),
      valorEstimado: lead.valorEstimado, prioridad: lead.prioridad,
      canalPrincipal: lead.canalPrincipal, responsable: lead.responsable,
      proximoSeguimiento: lead.proximoSeguimiento, probabilidad: lead.probabilidad,
      fechaCierreEstimada: lead.fechaCierreEstimada, scoreManual: lead.scoreManual ?? 0,
    }).catch(() => {})
  },
}

/**
 * Store local de leads. Se hidrata desde React Query (sheetsService) y mantiene
 * las mutaciones optimistas de v1 (agregar/editar/mover de etapa/eliminar).
 * En iteraciones siguientes estas mutaciones se sincronizan a Sheets vía n8n.
 */
/** Ventana durante la cual un lead recién editado localmente no se pisa con datos remotos (evita que un refetch en curso revierta un cambio que aún no propagó en Sheets). */
const DIRTY_WINDOW_MS = 15_000

interface LeadsState {
  leads: Lead[]
  selectedIds: Set<string>
  hydrated: boolean
  dirty: Record<string, number>
  setLeads: (leads: Lead[]) => void
  addLead: (patch: Partial<Lead>) => Promise<Lead>
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
  dirty: {},
  setLeads: (leads) => {
    // No pisar mutaciones locales si ya estaba hidratado y la fuente es la misma.
    if (!get().hydrated) set({ leads, hydrated: true })
    else set({ leads: mergeKeepLocal(get().leads, leads, get().dirty) })
  },
  addLead: async (patch) => {
    // Crea el lead en Supabase primero (necesitamos el id real generado por la BD).
    const created = await leadsService.createLead(patch)
    const withScore: Lead = {
      ...created,
      estado: patch.estado ?? created.estado,
      prioridad: patch.prioridad ?? created.prioridad,
      canalPrincipal: patch.canalPrincipal ?? created.canalPrincipal,
      valorEstimado: patch.valorEstimado ?? created.valorEstimado,
      responsable: patch.responsable ?? created.responsable,
      score: Math.min(100, (created.scoreIA ?? 0) + (patch.scoreManual ?? created.scoreManual ?? 0)),
    }
    set({ leads: [withScore, ...get().leads] })
    persist.create(withScore)
    return withScore
  },
  updateLead: (id, patch) => {
    const prevEstado = get().leads.find((l) => l.id === id)?.estado
    const leads = get().leads.map((l) => {
      if (l.id !== id) return l
      const merged = { ...l, ...patch }
      // Total = IA + Manual (capado a 100); derivado, se recalcula al vuelo.
      merged.score = Math.min(100, (merged.scoreIA ?? 0) + (merged.scoreManual ?? 0))
      return merged
    })
    set({ leads, dirty: { ...get().dirty, [id]: Date.now() } })
    const updated = leads.find((l) => l.id === id)
    if (updated) persist.update(updated, prevEstado)
  },

  /** Actualiza el estado local sin volver a persistir (usado tras acciones que ya escriben en Sheets, como el análisis IA). */
  patchLocal: (id, patch) => {
    set({ leads: get().leads.map((l) => {
      if (l.id !== id) return l
      const merged = { ...l, ...patch }
      if ('scoreIA' in patch || 'scoreManual' in patch) {
        merged.score = Math.min(100, (merged.scoreIA ?? 0) + (merged.scoreManual ?? 0))
      }
      return merged
    }) })
  },
  toggleFavorito: (id) => {
    const leads = get().leads.map((l) => (l.id === id ? { ...l, favorito: !l.favorito } : l))
    set({ leads, dirty: { ...get().dirty, [id]: Date.now() } })
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

/**
 * Conserva leads locales que no existan aún en remoto y refresca el resto.
 * Los leads con una edición local reciente (favorito, score manual, etc.) se
 * mantienen tal cual durante DIRTY_WINDOW_MS: un refetch en curso puede traer
 * datos de Sheets que todavía no reflejan la escritura que acabamos de hacer,
 * y sin esto ese refetch revertía visualmente el cambio (ver: favoritos que
 * "se borran" al abrir el detalle del lead justo después de marcarlos).
 */
function mergeKeepLocal(local: Lead[], remote: Lead[], dirty: Record<string, number>): Lead[] {
  const localById = new Map(local.map((l) => [l.id, l]))
  const remoteIds = new Set(remote.map((l) => l.id))
  const localOnly = local.filter((l) => !remoteIds.has(l.id))
  const now = Date.now()
  const merged = remote.map((l) => {
    const touchedAt = dirty[l.id]
    if (touchedAt && now - touchedAt < DIRTY_WINDOW_MS) {
      return localById.get(l.id) ?? l
    }
    return l
  })
  return [...localOnly, ...merged]
}
