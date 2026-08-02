import { format, getMonth, getYear, setMonth, setYear } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarSearch, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { Button, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { iso } from '../shared/goalMeta'

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

const MESES = Array.from({ length: 12 }, (_, i) =>
  format(new Date(2000, i, 1), 'LLLL', { locale: es }))

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
  const anio = getYear(refFecha)
  const anios = Array.from({ length: 11 }, (_, i) => anio - 5 + i)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPaso(-1)}
          className="btn-ghost h-8 w-8 rounded-lg border border-border p-0"
          aria-label="Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => onPaso(1)}
          className="btn-ghost h-8 w-8 rounded-lg border border-border p-0"
          aria-label="Siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <Button size="sm" variant="outline" onClick={onHoy}>Hoy</Button>

      <p className="min-w-0 shrink-0 px-1 text-base font-semibold capitalize text-fg">{titulo}</p>

      {/* Mes y año sueltos: en la vista de año el mes no pinta nada. */}
      {vista !== 'anio' && (
        <Select
          className="h-8 w-auto py-0 text-xs capitalize"
          value={getMonth(refFecha)}
          onChange={(e) => onFecha(setMonth(refFecha, Number(e.target.value)))}
          aria-label="Mes"
        >
          {MESES.map((m, i) => <option key={m} value={i} className="capitalize">{m}</option>)}
        </Select>
      )}

      <Select
        className="h-8 w-auto py-0 text-xs"
        value={anio}
        onChange={(e) => onFecha(setYear(refFecha, Number(e.target.value)))}
        aria-label="Año"
      >
        {anios.map((a) => <option key={a} value={a}>{a}</option>)}
      </Select>

      {/* Buscar una fecha concreta. Un `input[type=date]` en vez de un
          calendario propio: el nativo ya trae teclado, escritura y su propio
          selector, y en móvil es el que el sistema sabe abrir. */}
      <label className="relative inline-flex items-center" title="Ir a una fecha">
        <CalendarSearch className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted" />
        <input
          type="date"
          value={iso(refFecha)}
          onChange={(e) => {
            if (!e.target.value) return
            onFecha(new Date(`${e.target.value}T00:00:00`))
          }}
          className="input h-8 w-[9.5rem] py-0 pl-7 text-xs"
          aria-label="Ir a una fecha"
        />
      </label>

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex rounded-xl border border-border bg-surface p-1">
          {VISTAS.map((v) => (
            <button
              key={v.valor}
              onClick={() => onVista(v.valor)}
              title={`${v.label} (${v.tecla.toUpperCase()})`}
              className={cn(
                'rounded-lg px-3 py-1 text-[13px] font-medium transition-colors',
                v.valor === vista ? 'bg-primary-500 text-white shadow-sm' : 'text-muted hover:text-fg',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={onNuevo}>
          <Plus className="mr-1.5 h-4 w-4" /> Crear
        </Button>
      </div>
    </div>
  )
}
