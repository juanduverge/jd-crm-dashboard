import type { N8nExecution } from '@/services/n8nService'

/** Estadísticas agregadas de un set de ejecuciones (total, tasa de éxito). */
export function executionStats(executions: N8nExecution[]) {
  const total = executions.length
  const success = executions.filter((e) => e.status === 'success').length
  const successRate = total ? Math.round((success / total) * 100) : 0
  return { total, success, successRate }
}

/** Conteo de ejecuciones por día para los últimos N días (para el gráfico). */
export function executionsByDay(executions: N8nExecution[], days = 14) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets: { date: string; label: string; count: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const date = d.toISOString().slice(0, 10)
    buckets.push({ date, label: d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' }), count: 0 })
  }
  const byDate = new Map(buckets.map((b) => [b.date, b]))
  for (const e of executions) {
    const date = (e.startedAt || '').slice(0, 10)
    const bucket = byDate.get(date)
    if (bucket) bucket.count++
  }
  return buckets
}

export const STATUS_META: Record<string, { label: string; cls: string }> = {
  success: { label: 'Éxito', cls: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400' },
  error: { label: 'Fallo', cls: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' },
  running: { label: 'Ejecutando', cls: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  waiting: { label: 'Esperando', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' },
}

export function durationLabel(startedAt: string, stoppedAt?: string): string {
  if (!stoppedAt) return '—'
  const ms = Date.parse(stoppedAt) - Date.parse(startedAt)
  if (isNaN(ms) || ms < 0) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export interface IntegrationStatus {
  id: string
  name: string
  status: 'connected' | 'soon'
  credential?: string
  detail?: string
}

/** Integraciones conocidas del pipeline de outreach (estado estático informativo). */
export const INTEGRATIONS: IntegrationStatus[] = [
  { id: 'sheets', name: 'Google Sheets', status: 'connected', credential: 'Google Sheets account' },
  { id: 'gmail', name: 'Gmail / SMTP', status: 'connected', credential: 'SMTP account' },
  { id: 'imap', name: 'IMAP', status: 'connected', credential: 'IMAP account' },
  { id: 'whatsapp', name: 'WhatsApp Business', status: 'connected', credential: 'WhatsApp Business API', detail: 'Templates aprobadas' },
  { id: 'claude', name: 'Claude API', status: 'connected', credential: 'Anthropic API' },
  { id: 'apify', name: 'Apify', status: 'connected', credential: 'Apify token' },
  { id: 'calendar', name: 'Google Calendar', status: 'connected', credential: 'Google Calendar account' },
  { id: 'instagram', name: 'Instagram DM', status: 'soon', detail: 'Próximamente' },
  { id: 'linkedin', name: 'LinkedIn', status: 'soon', detail: 'Próximamente' },
  { id: 'stripe', name: 'Stripe', status: 'soon', detail: 'Próximamente' },
]
