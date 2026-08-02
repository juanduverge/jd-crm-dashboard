import { format, isSameMonth, isToday } from 'date-fns'
import { cn } from '@/lib/utils'
import { DIAS_SEMANA, iso } from '../shared/goalMeta'
import { clasesPunto, type ItemCalendario } from './itemCalendario'

/**
 * La vista de mes: la panorámica. No intenta enseñar horas —para eso están
 * semana y día—, sino responder "¿qué días están cargados?".
 *
 * Cada celda muestra hasta cuatro items y un "+N más" que abre ese día en la
 * vista diaria. Cortar la lista es deliberado: una celda que crece rompe la
 * cuadrícula y con ella la única cosa que la vista de mes hace bien, que es
 * dejar comparar días de un vistazo.
 */

const MAX_POR_DIA = 4

export function VistaMes({
  mes, dias, porFecha, onDia, onHueco, onItem,
}: {
  mes: Date
  dias: Date[]
  porFecha: Map<string, ItemCalendario[]>
  /** Abrir ese día en la vista diaria. */
  onDia: (fecha: string) => void
  onHueco: (fecha: string) => void
  onItem: (item: ItemCalendario) => void
}) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-border">
        {DIAS_SEMANA.map((d) => (
          <div key={d.iso} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {d.label.slice(0, 3)}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {dias.map((d) => {
          const fecha = iso(d)
          const items = porFecha.get(fecha) ?? []
          const delMes = isSameMonth(d, mes)

          return (
            <div
              key={fecha}
              className={cn(
                'group relative min-h-[104px] border-b border-r border-border p-1.5',
                !delMes && 'bg-surface-2/30',
              )}
            >
              {/* El fondo de la celda es el que crea; los items van encima. */}
              <button
                type="button"
                aria-label={`Crear el ${fecha}`}
                className="absolute inset-0"
                onClick={() => onHueco(fecha)}
              />

              <button
                type="button"
                onClick={() => onDia(fecha)}
                className={cn(
                  'relative inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs transition',
                  isToday(d) ? 'bg-primary-500 font-semibold text-white' : 'text-fg hover:bg-surface-2',
                  !delMes && 'text-muted',
                )}
              >
                {format(d, 'd')}
              </button>

              <div className="relative mt-1 space-y-0.5">
                {items.slice(0, MAX_POR_DIA).map((i) => (
                  <button
                    key={i.clave}
                    onClick={() => onItem(i)}
                    title={`${i.titulo}${i.subtitulo ? ` · ${i.subtitulo}` : ''}`}
                    className="flex w-full items-center gap-1 rounded px-1 py-px text-left text-[11px] text-fg transition hover:bg-surface-2"
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', clasesPunto(i.color))} />
                    {i.inicio && (
                      <span className="shrink-0 tabular-nums text-[10px] text-muted">
                        {format(i.inicio, 'H:mm')}
                      </span>
                    )}
                    <span className="truncate">{i.titulo}</span>
                  </button>
                ))}

                {items.length > MAX_POR_DIA && (
                  <button
                    onClick={() => onDia(fecha)}
                    className="px-1 text-[10px] font-medium text-muted hover:text-fg"
                  >
                    +{items.length - MAX_POR_DIA} más
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
