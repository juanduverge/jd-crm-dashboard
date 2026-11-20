import type { Evento } from '@/types'
import type { HorarioLaboral } from '@/lib/perfilTrabajo'

/**
 * Huecos libres para una reunión: dentro del horario de trabajo y sin pisar
 * nada del calendario (que ya trae lo de Google sincronizado).
 *
 * Paso de 30 minutos. Los eventos de todo el día no bloquean: suelen ser
 * recordatorios («cumpleaños de…»), no tiempo ocupado.
 */

export interface DiaConHuecos {
  fecha: string          // yyyy-MM-dd
  dia: Date
  horas: string[]        // HH:MM
}

const PASO_MIN = 30
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const isoDow = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay())
const aMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0) }
const aHhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/**
 * `desde` es el primer día que se mira (por defecto hoy) y `dias` cuántos.
 * Así el selector puede pedir cualquier mes, aunque sea dentro de un año.
 */
export function calcularHuecos(eventos: Evento[], horario: HorarioLaboral, dias = 14, ahora = new Date(), desde: Date = ahora): DiaConHuecos[] {
  const ocupados = eventos
    .filter((e) => e.estado !== 'cancelado' && !e.todoElDia)
    .map((e) => [Date.parse(e.inicio), Date.parse(e.fin)] as const)

  const dur = horario.duracionReunion
  const ini = aMin(horario.desde)
  const fin = aMin(horario.hasta)
  // No se ofrece nada que empiece en menos de una hora: no da tiempo a avisar.
  const minimo = ahora.getTime() + 60 * 60_000

  const out: DiaConHuecos[] = []
  for (let i = 0; i < dias; i++) {
    const d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + i)
    if (!horario.dias.includes(isoDow(d))) continue
    const horas: string[] = []
    for (let m = ini; m + dur <= fin; m += PASO_MIN) {
      const a = new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60).getTime()
      const b = a + dur * 60_000
      if (a < minimo) continue
      if (ocupados.some(([x, y]) => a < y && b > x)) continue
      horas.push(aHhmm(m))
    }
    if (horas.length) out.push({ fecha: iso(d), dia: d, horas })
  }
  return out
}
