import { format, parseISO } from 'date-fns'

/**
 * Formatos del registro de tiempo. Dos lecturas distintas y por eso dos
 * funciones: el cronómetro en marcha se lee como un reloj (los segundos
 * corren), y un total del día se lee en palabras (nadie quiere contar
 * dígitos para saber que son dos horas).
 */

/** Reloj del cronómetro: H:MM:SS (o M:SS si no llega a la hora). */
export function fmtReloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const dos = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${dos(m)}:${dos(r)}` : `${m}:${dos(r)}`
}

/** Duración cerrada: "2h 15m", "45m", "30s". */
export function fmtDuracion(seg: number): string {
  const s = Math.max(0, Math.floor(seg))
  if (s < 60) return `${s}s`
  const h = Math.floor(s / 3600)
  const m = Math.round((s % 3600) / 60)
  // Redondear 59m30s hacia arriba daría "1h 60m".
  if (m === 60) return `${h + 1}h`
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** Hora de un timestamp ISO, en local. */
export const fmtHora = (isoTs: string): string => format(parseISO(isoTs), 'HH:mm')

/**
 * Segundos que dura un bloque de horario ("09:00"–"10:30" -> 5400). Un bloque
 * que cruza la medianoche se cuenta hasta el final del día en vez de dar un
 * número negativo: el horario es una plantilla diaria, no un rango real.
 */
export function duracionBloqueSeg(horaInicio: string, horaFin: string): number {
  const min = (hhmm: string): number => {
    const [h, m] = hhmm.split(':')
    return (Number(h) || 0) * 60 + (Number(m) || 0)
  }
  const a = min(horaInicio)
  const b = min(horaFin)
  return Math.max(0, (b > a ? b : 24 * 60) - a) * 60
}

/** Segundos transcurridos desde un timestamp ISO hasta ahora. */
export function segundosDesde(isoTs: string, ahora: number = Date.now()): number {
  return Math.max(0, Math.floor((ahora - parseISO(isoTs).getTime()) / 1000))
}
