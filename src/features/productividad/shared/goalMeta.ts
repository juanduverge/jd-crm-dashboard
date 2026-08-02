import {
  addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import type { Goal } from '@/types'

/** Lunes = 1 ... domingo = 7, igual que el `isodow` de Postgres. */
export const DIAS_SEMANA: { iso: number; corto: string; label: string }[] = [
  { iso: 1, corto: 'L', label: 'Lunes' },
  { iso: 2, corto: 'M', label: 'Martes' },
  { iso: 3, corto: 'X', label: 'Miércoles' },
  { iso: 4, corto: 'J', label: 'Jueves' },
  { iso: 5, corto: 'V', label: 'Viernes' },
  { iso: 6, corto: 'S', label: 'Sábado' },
  { iso: 7, corto: 'D', label: 'Domingo' },
]

export const iso = (d: Date): string => format(d, 'yyyy-MM-dd')
export const desdeIso = (s: string): Date => parseISO(s)

/** ISO dow (1..7) de una fecha; `getDay()` devuelve 0 para domingo. */
export const isoDow = (d: Date): number => d.getDay() === 0 ? 7 : d.getDay()

export function rangoMes(d: Date): { desde: string; hasta: string } {
  return { desde: iso(startOfMonth(d)), hasta: iso(endOfMonth(d)) }
}

export function rangoSemana(d: Date): { desde: string; hasta: string } {
  return {
    desde: iso(startOfWeek(d, { weekStartsOn: 1 })),
    hasta: iso(endOfWeek(d, { weekStartsOn: 1 })),
  }
}

/**
 * Rango que hay que pedir al servidor para pintar el mes: se extiende a las
 * semanas ISO completas de los bordes, porque la primera y la última semana
 * del mes se solapan con el mes vecino y sus metas semanales cuentan.
 */
export function rangoConsulta(d: Date): { desde: string; hasta: string } {
  return {
    desde: iso(startOfWeek(startOfMonth(d), { weekStartsOn: 1 })),
    hasta: iso(endOfWeek(endOfMonth(d), { weekStartsOn: 1 })),
  }
}

export const fmtMes = (d: Date): string => format(d, "LLLL 'de' yyyy", { locale: es })
export const fmtDia = (d: Date): string => format(d, "EEEE d 'de' LLLL", { locale: es })

export function fmtRangoSemana(desde: string, hasta: string): string {
  const a = desdeIso(desde)
  const b = desdeIso(hasta)
  return `${format(a, 'd LLL', { locale: es })} – ${format(b, 'd LLL', { locale: es })}`
}

/** Números "bonitos": sin decimales si no hacen falta. */
export function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')
}

export function progreso(g: Goal): number {
  if (g.target <= 0) return 0
  return Math.min(100, Math.round((g.valorActual / g.target) * 100))
}

export function tonoProgreso(pct: number): string {
  if (pct >= 100) return 'bg-green-500'
  if (pct >= 60) return 'bg-primary-400'
  if (pct >= 30) return 'bg-amber-500'
  return 'bg-slate-400'
}

/** Días de un rango (inclusive), para pintar semanas y calendarios. */
export function diasDelRango(desde: string, hasta: string): Date[] {
  const out: Date[] = []
  let cur = desdeIso(desde)
  const fin = desdeIso(hasta)
  while (cur <= fin) {
    out.push(cur)
    cur = addDays(cur, 1)
  }
  return out
}

/** Metas de un periodo que se solapan con el rango dado. */
export function filtrarPorPeriodo(
  goals: Goal[] | undefined,
  periodo: Goal['periodo'],
  desde: string,
  hasta: string,
): Goal[] {
  return (goals ?? []).filter(
    (g) => g.periodo === periodo && g.fechaInicio <= hasta && g.fechaFin >= desde,
  )
}
