import type { FollowUpAgendaItem, FollowUpResultado, FollowUpTipo } from '@/types'

/**
 * Metadatos y helpers del módulo Seguimientos.
 * Sigue el patrón de `lib/pipeline.ts` (PRIORITY_META, STAGE_BY_ID...):
 * los datos de presentación viven aquí, no repartidos por los componentes.
 */

/**
 * Medios de contacto, en el orden en que se usan de verdad: los tres canales
 * del día a día primero, las reuniones después, las redes al final.
 * Los valores son los del enum `follow_up_tipo` (0013 + 0020).
 */
export const FOLLOW_UP_TIPOS: { id: FollowUpTipo; label: string; emoji: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { id: 'email', label: 'Correo electrónico', emoji: '✉️' },
  { id: 'llamada', label: 'Llamada', emoji: '📞' },
  { id: 'reunion', label: 'Reunión presencial', emoji: '🤝' },
  { id: 'videollamada', label: 'Videollamada', emoji: '📹' },
  { id: 'linkedin', label: 'LinkedIn', emoji: '💼' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'sms', label: 'SMS', emoji: '📱' },
  { id: 'otro', label: 'Otro', emoji: '•' },
]

export const TIPO_META = Object.fromEntries(
  FOLLOW_UP_TIPOS.map((t) => [t.id, t]),
) as Record<FollowUpTipo, (typeof FOLLOW_UP_TIPOS)[number]>

export const RESULTADO_META: Record<FollowUpResultado, { label: string; cls: string }> = {
  positivo: { label: 'Positivo', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  negativo: { label: 'Negativo', cls: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' },
  sin_respuesta: { label: 'Sin respuesta', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' },
}

/** Fecha de hoy en formato YYYY-MM-DD, en hora local (no UTC). */
export function today(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** YYYY-MM-DD a N días de hoy. Usa mediodía local para no cruzar husos por error. */
export function addDays(days: number, from: string = today()): string {
  const d = new Date(`${from}T12:00:00`)
  d.setDate(d.getDate() + days)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/**
 * Atajos de reprogramación. Se cuentan siempre desde HOY, no desde la fecha
 * actual del seguimiento: "en 1 semana" dicho sobre un toque vencido hace un
 * mes significa dentro de siete días, no hace tres semanas.
 *
 * `meses` en vez de `dias: 30` para que "en 1 mes" caiga en el mismo día del
 * mes siguiente, que es lo que la gente entiende por un mes.
 */
export const ATAJOS_REPROGRAMAR: { label: string; dias?: number; meses?: number }[] = [
  { label: 'Mañana', dias: 1 },
  { label: 'En 3 días', dias: 3 },
  { label: 'En 1 semana', dias: 7 },
  { label: 'En 2 semanas', dias: 14 },
  { label: 'En 1 mes', meses: 1 },
]

/** YYYY-MM-DD a N meses de hoy, recortando al último día si el mes es corto. */
export function addMonths(months: number, from: string = today()): string {
  const d = new Date(`${from}T12:00:00`)
  const dia = d.getDate()
  d.setMonth(d.getMonth() + months)
  // El 31 de enero + 1 mes daría 3 de marzo; se recorta al 28/29 de febrero.
  if (d.getDate() !== dia) d.setDate(0)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
}

/** Resuelve un atajo a su fecha YYYY-MM-DD. */
export function fechaDeAtajo(a: (typeof ATAJOS_REPROGRAMAR)[number]): string {
  return a.meses ? addMonths(a.meses) : addDays(a.dias ?? 0)
}

/**
 * Días sugeridos para el siguiente toque según cómo fue el anterior.
 * Un "positivo" quiere continuidad; un "sin respuesta" da margen; un
 * "negativo" espera bastante más antes de volver a insistir.
 */
export const SIGUIENTE_TOQUE_DIAS: Record<FollowUpResultado, number> = {
  positivo: 3,
  sin_respuesta: 7,
  negativo: 21,
}

export interface AgendaGrupos {
  vencidos: FollowUpAgendaItem[]
  hoy: FollowUpAgendaItem[]
  proximos: FollowUpAgendaItem[]   // dentro de los próximos 7 días
  masAdelante: FollowUpAgendaItem[]
}

/**
 * Reparte la agenda en los cubos de la vista. La urgencia vencido/hoy/próximo
 * la calcula la BD (vista `follow_ups_agenda`), así que no depende del reloj
 * del navegador; aquí solo se corta "próximos" a 7 días.
 */
export function agruparAgenda(items: FollowUpAgendaItem[]): AgendaGrupos {
  const limite = addDays(7)
  const g: AgendaGrupos = { vencidos: [], hoy: [], proximos: [], masAdelante: [] }
  for (const it of items) {
    if (it.urgencia === 'vencido') g.vencidos.push(it)
    else if (it.urgencia === 'hoy') g.hoy.push(it)
    else if (it.fechaProgramada <= limite) g.proximos.push(it)
    else g.masAdelante.push(it)
  }
  // Los más vencidos primero: son los que más urge rescatar.
  g.vencidos.sort((a, b) => b.diasVencido - a.diasVencido)
  return g
}

/** "hace 3 días" / "hoy" / "en 5 días" a partir de `dias_vencido` de la vista. */
export function textoVencimiento(diasVencido: number): string {
  if (diasVencido > 0) return diasVencido === 1 ? 'venció ayer' : `venció hace ${diasVencido} días`
  if (diasVencido === 0) return 'hoy'
  const faltan = -diasVencido
  return faltan === 1 ? 'mañana' : `en ${faltan} días`
}
