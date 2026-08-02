import { useMemo } from 'react'
import {
  endOfMonth, endOfWeek, format, getYear, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { diasDelRango, iso } from '../shared/goalMeta'
import type { ItemCalendario } from './itemCalendario'

/**
 * La vista de año: doce miniaturas. No cabe el título de nada, así que la
 * densidad se expresa con el color del propio número —cuanto más cargado el
 * día, más fuerte—. Es un mapa de calor del año, que es la única pregunta que
 * un año entero puede contestar de verdad.
 *
 * Pulsar un día salta a su vista diaria; pulsar el nombre del mes, a la mensual.
 */

/** Cuatro tramos y no un degradado continuo: hay que poder distinguirlos. */
function tono(n: number): string {
  if (n === 0) return 'text-fg'
  if (n <= 2) return 'bg-primary-500/15 text-fg'
  if (n <= 5) return 'bg-primary-500/35 text-fg'
  return 'bg-primary-500/60 font-semibold text-white'
}

export function VistaAnio({
  anio, porFecha, onDia, onMes,
}: {
  anio: Date
  porFecha: Map<string, ItemCalendario[]>
  onDia: (fecha: string) => void
  onMes: (fecha: string) => void
}) {
  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(getYear(anio), i, 1)),
    [anio],
  )

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {meses.map((m) => {
        const desde = iso(startOfWeek(startOfMonth(m), { weekStartsOn: 1 }))
        const hasta = iso(endOfWeek(endOfMonth(m), { weekStartsOn: 1 }))
        const dias = diasDelRango(desde, hasta)

        return (
          <div key={+m} className="card p-3">
            <button
              onClick={() => onMes(iso(m))}
              className="mb-2 w-full text-left text-sm font-semibold capitalize text-fg hover:text-primary-500"
            >
              {format(m, 'LLLL', { locale: es })}
            </button>

            <div className="grid grid-cols-7 gap-px text-center">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
                <span key={i} className="text-[9px] uppercase text-muted">{d}</span>
              ))}

              {dias.map((d) => {
                const fecha = iso(d)
                const n = (porFecha.get(fecha) ?? []).length
                const delMes = isSameMonth(d, m)

                return (
                  <button
                    key={fecha}
                    onClick={() => onDia(fecha)}
                    title={n ? `${n} en el calendario` : undefined}
                    className={cn(
                      'flex h-6 items-center justify-center rounded text-[10px] tabular-nums transition hover:ring-1 hover:ring-primary-500',
                      delMes ? tono(n) : 'text-muted/40',
                      isToday(d) && 'ring-1 ring-primary-500',
                    )}
                  >
                    {format(d, 'd')}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
