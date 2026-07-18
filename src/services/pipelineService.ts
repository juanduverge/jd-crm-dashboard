import { supabase } from '@/lib/supabaseClient'
import type { Lead } from '@/types'

/**
 * pipelineService — Mutaciones del módulo Pipeline contra Supabase.
 *
 * Diseño: un lead y su "oportunidad" de pipeline son la misma fila en la
 * tabla `leads` (columnas estado/prioridad/canal_principal/valor_estimado/
 * responsable/proximo_seguimiento/probabilidad/fecha_cierre_estimada/
 * score_manual — ver migración 0008). `pipeline_events` sigue siendo un
 * historial append-only: cada vez que cambia `estado` se inserta una fila
 * ahí, para trazabilidad (tiempo en cada etapa, forecast histórico), pero
 * ya NO es la fuente del estado "actual" (eso vive en `leads`).
 *
 * Papelera: como pipeline y lead son la misma fila, soft-delete/restore/purge
 * del pipeline son los mismos RPCs que ya usa leadsService (soft_delete_lead,
 * restore_lead, purge_lead) — no hace falta duplicarlos aquí.
 */

/** Traduce los campos de pipeline de un Lead a columnas de la tabla `leads`. */
function pipelinePatchToRow(patch: Partial<Lead>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.estado !== undefined) row.estado = patch.estado
  if (patch.prioridad !== undefined) row.prioridad = patch.prioridad
  if (patch.canalPrincipal !== undefined) row.canal_principal = patch.canalPrincipal
  if (patch.valorEstimado !== undefined) row.valor_estimado = patch.valorEstimado
  if (patch.responsable !== undefined) row.responsable = patch.responsable
  if (patch.proximoSeguimiento !== undefined) row.proximo_seguimiento = patch.proximoSeguimiento || null
  if (patch.probabilidad !== undefined) row.probabilidad = patch.probabilidad
  if (patch.fechaCierreEstimada !== undefined) row.fecha_cierre_estimada = patch.fechaCierreEstimada || null
  if (patch.scoreManual !== undefined) row.score_manual = patch.scoreManual
  return row
}

async function currentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id
}

/** Inserta una fila de historial en pipeline_events (solo cuando cambia la etapa). */
async function logStageChange(leadId: string, patch: Partial<Lead>) {
  if (patch.estado === undefined) return
  const changedBy = await currentUserId()
  const { error } = await supabase.from('pipeline_events').insert({
    lead_id: leadId,
    etapa: patch.estado,
    probabilidad: patch.probabilidad ?? null,
    valor_estimado: patch.valorEstimado ?? null,
    fecha_cierre_estimada: patch.fechaCierreEstimada || null,
    notas: patch.notas ?? null,
    changed_by: changedBy ?? null,
  })
  if (error) throw error
}

export const pipelineService = {
  /**
   * Actualiza los campos de pipeline de un lead. Si `estado` cambia,
   * inserta además un evento de historial en `pipeline_events`.
   */
  async updatePipeline(leadId: string, patch: Partial<Lead>): Promise<void> {
    const row = pipelinePatchToRow(patch)
    if (Object.keys(row).length > 0) {
      const { error } = await supabase.from('leads').update(row).eq('id', leadId)
      if (error) throw error
    }
    await logStageChange(leadId, patch)
  },

  /** Historial de etapas de un lead (más reciente primero). */
  async getStageHistory(leadId: string) {
    const { data, error } = await supabase
      .from('pipeline_events')
      .select('*')
      .eq('lead_id', leadId)
      .order('changed_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },
}

export default pipelineService
