import { format, isSameMonth, isToday, isWeekend } from 'date-fns'
import { cn } from '@/lib/utils'
import { DIAS_SEMANA, iso } from '../shared/goalMeta'
import { clasesBloque, type ItemCalendario } from './itemCalendario'

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
    <div className="card overflow-hidden rounded-2xl p-0">
      <div className="grid grid-cols-7 border-b border-border bg-surface">
        {DIAS_SEMANA.map((d) => (
          <div key={d.iso} className={cn('px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider', d.iso >= 6 ? 'text-muted/60' : 'text-muted')}>
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
                'group relative min-h-[118px] border-b border-r border-border/70 p-1.5 transition-colors hover:bg-surface-2/40',
                !delMes ? 'bg-surface-2/40' : isToday(d) ? 'bg-primary-500/[0.05]' : isWeekend(d) && 'bg-surface-2/20',
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
                  'relative inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums transition',
                  isToday(d) ? 'bg-primary-500 text-white shadow-sm' : 'text-fg hover:bg-surface-2',
                  !delMes && 'font-normal text-muted/60',
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
                    className={cn(
                      'flex w-full items-center gap-1 rounded-md border-l-2 px-1.5 py-0.5 text-left text-[11px] font-medium transition hover:shadow-sm',
                      clasesBloque(i.color),
                      i.evento?.estado === 'hecho' && 'line-through opacity-60',
                    )}
                  >
                    {i.inicio && (
                      <span className="shrink-0 tabular-nums text-[10px] opacity-75">
                        {format(i.inicio, 'H:mm')}
                      </span>
                    )}
                    <span className="truncate">{i.titulo}</span>
                  </button>
                ))}

                {items.length > MAX_POR_DIA && (
                  <button
                    onClick={() => onDia(fecha)}
                    className="rounded px-1.5 text-[10px] font-semibold text-muted hover:bg-surface-2 hover:text-fg"
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
