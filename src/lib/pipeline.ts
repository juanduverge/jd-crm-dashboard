import { PIPELINE_STAGES } from './config'
import type { Lead, LeadStatus } from '@/types'

/** Etapas "abiertas" del kanban en orden (excluye ganado/perdido para el flujo principal). */
export const OPEN_STAGES = PIPELINE_STAGES.filter(
  (s) => s.id !== 'ganado' && s.id !== 'perdido',
)

export const STAGE_BY_ID = Object.fromEntries(
  PIPELINE_STAGES.map((s) => [s.id, s]),
) as Record<LeadStatus, (typeof PIPELINE_STAGES)[number]>

const DAY = 1000 * 60 * 60 * 24

/** Días que el lead lleva en su etapa actual (usa último movimiento o fecha de captura). */
export function daysInStage(lead: Lead): number {
  const ref = lead.fechaUltimoMovimiento || lead.ultimaAccion || lead.fechaCaptura
  const t = ref ? Date.parse(ref) : NaN
  if (isNaN(t)) return 0
  return Math.max(0, Math.floor((Date.now() - t) / DAY))
}

/** Un lead está estancado si lleva 7+ días sin moverse y no está cerrado. */
export function isStale(lead: Lead): boolean {
  if (lead.estado === 'ganado' || lead.estado === 'perdido') return false
  return daysInStage(lead) >= 7
}

/** Valor ponderado por probabilidad de la etapa (para forecast). */
export function weightedValue(lead: Lead): number {
  const stage = STAGE_BY_ID[lead.estado]
  const prob = stage?.probability ?? 0
  return (lead.valorEstimado || 0) * prob
}

/** Forecast del pipeline: suma de valor × probabilidad de todos los leads abiertos. */
export function forecast(leads: Lead[]): number {
  return leads
    .filter((l) => l.estado !== 'perdido')
    .reduce((sum, l) => sum + weightedValue(l), 0)
}

/** Total $ y conteo por etapa. */
export function stageTotals(leads: Lead[], stage: LeadStatus) {
  const inStage = leads.filter((l) => l.estado === stage)
  return {
    count: inStage.length,
    value: inStage.reduce((s, l) => s + (l.valorEstimado || 0), 0),
  }
}

export const PRIORITY_META: Record<NonNullable<Lead['prioridad']>, { label: string; cls: string }> = {
  alta: { label: 'Alta', cls: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' },
  media: { label: 'Media', cls: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  baja: { label: 'Baja', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' },
}
