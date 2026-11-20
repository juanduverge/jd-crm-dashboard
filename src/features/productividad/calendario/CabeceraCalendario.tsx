import { CalendarSearch, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { iso } from '../shared/goalMeta'
import { BotonSincronizar } from './PanelLateral'

/**
 * La cabecera de navegación. Antes «Agosto 2026» era sólo un rótulo; ahora es
 * el mando: mes, año, ir a hoy, saltar a una fecha concreta y adelante/atrás.
 *
 * El selector de año se genera alrededor del año que se está mirando y no
 * alrededor del actual, para que navegar lejos no deje el desplegable sin la
 * opción a la que acabas de llegar.
 */

export type VistaCalendario = 'dia' | 'semana' | 'mes' | 'anio'

export const VISTAS: { valor: VistaCalendario; label: string; tecla: string }[] = [
  { valor: 'dia', label: 'Día', tecla: 'd' },
  { valor: 'semana', label: 'Semana', tecla: 's' },
  { valor: 'mes', label: 'Mes', tecla: 'm' },
  { valor: 'anio', label: 'Año', tecla: 'a' },
]

export function CabeceraCalendario({
  fecha, vista, titulo, onFecha, onPaso, onVista, onHoy, onNuevo,
}: {
  fecha: Date
  vista: VistaCalendario
  /** Lo que se está mirando, ya formateado por la vista que manda. */
  titulo: string
  onFecha: (d: Date) => void
  /**
   * Adelante/atrás salta lo que dura la vista: un día, una semana, un mes o un
   * año. Por eso el paso lo decide quien conoce la vista, no la cabecera.
   */
  onPaso: (dir: -1 | 1) => void
  onVista: (v: VistaCalendario) => void
  onHoy: () => void
  onNuevo: () => void
}) {
  const refFecha = fecha

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Button size="sm" variant="outline" onClick={onHoy} className="rounded-full px-4">Hoy</Button>
      <div className="flex items-center">
        <button onClick={() => onPaso(-1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Anterior">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => onPaso(1)} className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg" aria-label="Siguiente">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <h2 className="min-w-0 text-lg font-semibold tracking-tight text-fg sm:text-xl">{titulo.charAt(0).toUpperCase() + titulo.slice(1)}</h2>

      {/* En el teléfono no hay mini mes: saltar a una fecha con el selector nativo. */}
      <label className="relative inline-flex items-center lg:hidden" title="Ir a una fecha">
        <CalendarSearch className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted" />
        <input
          type="date"
          value={iso(refFecha)}
          onChange={(e) => { if (e.target.value) onFecha(new Date(`${e.target.value}T00:00:00`)) }}
          className="input h-8 w-[9.5rem] py-0 pl-7 text-xs"
          aria-label="Ir a una fecha"
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        <BotonSincronizar compacto />
        <div className="inline-flex rounded-full border border-border bg-surface p-0.5">
          {VISTAS.map((v) => (
            <button
              key={v.valor}
              onClick={() => onVista(v.valor)}
              title={`${v.label} (${v.tecla.toUpperCase()})`}
              className={cn(
                'rounded-full px-3.5 py-1 text-[13px] font-medium transition-colors',
                v.valor === vista ? 'bg-primary-500 text-white shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={onNuevo} className="rounded-full lg:hidden">
          <Plus className="h-4 w-4" /> Crear
        </Button>
      </div>
    </div>
  )
}
