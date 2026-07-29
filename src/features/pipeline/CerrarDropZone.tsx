import { useDroppable } from '@dnd-kit/core'
import { Archive, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Id del droppable de cierre. No es una etapa: se maneja aparte en onDragEnd. */
export const CERRAR_DROP_ID = '__cerrar__'

/**
 * Sustituye a la antigua columna combinada Ganado/Perdido del kanban.
 *
 * Antes, los leads cerrados se quedaban ahí acumulándose y saturando el
 * tablero. Ahora arrastrar aquí abre el diálogo de cierre (ganado/perdido +
 * motivo) y el lead se va al Archivo — el gesto que ya conocías, pero el
 * tablero queda solo con lo que sigue vivo.
 */
export function CerrarDropZone({ archivados }: { archivados: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: CERRAR_DROP_ID })

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <Archive className="h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 truncate text-sm font-semibold text-fg">Cerrar trato</span>
        <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-xs text-muted">{archivados}</span>
      </div>
      <p className="mb-2 px-1 text-xs text-muted">en el archivo</p>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 text-center transition-all duration-150',
          isOver
            ? 'scale-[1.02] border-primary-400 bg-primary-50/60 shadow-glow dark:bg-primary-400/10'
            : 'border-border/70',
        )}
      >
        <ArrowRight className={cn('h-5 w-5 transition', isOver ? 'text-primary-400' : 'text-muted/50')} />
        <p className="text-xs text-muted">
          {isOver ? 'Suelta para cerrar el trato' : 'Arrastra aquí para marcar ganado o perdido'}
        </p>
      </div>
    </div>
  )
}
