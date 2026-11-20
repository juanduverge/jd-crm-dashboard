import type { Goal, MetricasPeriodo } from '@/types'
import { valorProgreso } from './goalMeta'

/**
 * Cuánto te toca hoy de una meta mensual.
 *
 * La idea es la de siempre al repartir trabajo: lo que falta entre los días
 * laborables que quedan, contando hoy. Se recalcula cada día, así que un mal
 * lunes sube un poco el objetivo del martes en vez de arrastrarse hasta el 30.
 *
 * «Lo que falta» se mide como estaba al EMPEZAR el día (avance total menos lo
 * hecho hoy). Si no, cada contacto de hoy bajaría el objetivo de hoy y nunca
 * se llegaría a cumplirlo.
 */

/** Lunes a viernes (ISO dow 1..5), como la cascada por defecto de Metas. */
const LABORABLES = [1, 2, 3, 4, 5]

const isoDow = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay())

export function esLaborable(d: Date): boolean {
  return LABORABLES.includes(isoDow(d))
}

/** Días laborables desde `hoy` (incluido) hasta `finIso` (incluido). */
export function laborablesRestantes(hoy: Date, finIso: string): number {
  const fin = new Date(`${finIso}T12:00:00`)
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12)
  let n = 0
  while (d <= fin) {
    if (esLaborable(d)) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

export interface RitmoHoy {
  /** Avance de la meta en todo su periodo. */
  hecho: number
  /** Lo conseguido hoy (solo metas automáticas; las manuales no lo saben). */
  hechoHoy?: number
  /** Objetivo de hoy. 0 si hoy no es laborable o la meta ya está cumplida. */
  tocaHoy: number
  falta: number
  diasRestantes: number
  laborableHoy: boolean
}

export function ritmoHoy(g: Goal, hoyMetricas?: MetricasPeriodo, hoy = new Date()): RitmoHoy {
  const hecho = valorProgreso(g)
  const hechoHoy = g.metrica && hoyMetricas ? Number(hoyMetricas[g.metrica] ?? 0) : undefined
  const falta = Math.max(0, g.target - hecho)
  const diasRestantes = laborablesRestantes(hoy, g.fechaFin)
  const laborableHoy = esLaborable(hoy)
  const faltabaAlEmpezar = Math.max(0, g.target - (hecho - (hechoHoy ?? 0)))
  const tocaHoy = laborableHoy && diasRestantes > 0 && faltabaAlEmpezar > 0
    ? Math.ceil(faltabaAlEmpezar / diasRestantes)
    : 0
  return { hecho, hechoHoy, tocaHoy, falta, diasRestantes, laborableHoy }
}

/**
 * Metas vivas que tocan un rango: de primer nivel (las hijas de la cascada
 * antigua no se enseñan sueltas) y no canceladas, duren lo que duren.
 */
export function metasVivas(goals: Goal[] | undefined, desde: string, hasta: string): Goal[] {
  return (goals ?? [])
    .filter((g) => !g.parentId && g.estado !== 'cancelada' && g.fechaInicio <= hasta && g.fechaFin >= desde)
    .sort((a, b) => a.orden - b.orden || a.fechaFin.localeCompare(b.fechaFin))
}

/** Metas de número en curso hoy (las que tienen «hoy te tocan»). */
export function metasDelMes(goals: Goal[] | undefined, hoy: string): Goal[] {
  return metasVivas(goals, hoy, hoy).filter((g) => g.tipo !== 'toggle')
}

/** Metas libres pendientes para hoy o ya atrasadas. */
export function libresParaHoy(goals: Goal[] | undefined, hoy: string): Goal[] {
  return (goals ?? [])
    .filter((g) => !g.parentId && g.tipo === 'toggle' && g.estado !== 'cancelada' && g.valorActual < 1 && g.fechaFin <= hoy)
    .sort((a, b) => a.fechaFin.localeCompare(b.fechaFin))
}
