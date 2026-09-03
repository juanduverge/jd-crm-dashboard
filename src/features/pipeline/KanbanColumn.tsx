import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { stageTotals } from '@/lib/pipeline'
import { touchColor, touchLabel, TOUCH_MAX } from '@/lib/touches'
import type { Lead, LeadStatus } from '@/types'
import { KanbanCard } from './KanbanCard'

/**
 * Etapas donde un lead puede estar en varios toques distintos. En vez de
 * partir el tablero en cinco columnas gigantes —que obligarían a arrastrar a
 * mano cada vez que se contacta, justo lo contrario de que el toque sea
 * automático—, la columna se subdivide por dentro. La pregunta "¿en qué
 * contacto está?" se responde de un vistazo y el tablero sigue teniendo el
 * mismo número de columnas.
 */
const ETAPAS_CON_TOQUES: LeadStatus[] = ['contactado', 'seguimiento']

/** Agrupa por toque, de menor a mayor, colapsando el 5+ en un solo bloque. */
function porToque(cards: Lead[]): { toque: number; leads: Lead[] }[] {
  const mapa = new Map<number, Lead[]>()
  for (const l of cards) {
    const k = Math.min(l.touchActual, TOUCH_MAX)
    const arr = mapa.get(k)
    if (arr) arr.push(l)
    else mapa.set(k, [l])
  }
  return [...mapa.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([toque, leads]) => ({ toque, leads }))
}

interface Props {
  stage: { id: LeadStatus; label: string; color: string }
  leads: Lead[]
  onOpen: (l: Lead) => void
  onAdd: (stage: LeadStatus) => void
  onDelete?: (l: Lead) => void
  onEdit?: (l: Lead) => void
  /** Abre el composer de correo con ese lead ya cargado. */
  onEmail?: (l: Lead) => void
}

export function KanbanColumn({ stage, leads, onOpen, onAdd, onDelete, onEdit, onEmail }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage: stage.id } })
  const { count, value } = stageTotals(leads, stage.id)
  const cards = leads.filter((l) => l.estado === stage.id)
  const subdividir = ETAPAS_CON_TOQUES.includes(stage.id) && cards.length > 0

  return (
    <div className="flex w-[85vw] max-w-[18rem] shrink-0 snap-start flex-col sm:w-72 sm:snap-align-none">
      <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stage.color }} />
          <span className="min-w-0 truncate text-sm font-semibold text-fg" title={stage.label}>{stage.label}</span>
          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-xs text-muted">{count}</span>
        </div>
        <button
          onClick={() => onAdd(stage.id)}
          className="btn-ghost h-6 w-6 shrink-0 p-0"
          title="Agregar lead a esta etapa"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2 px-1 text-xs font-medium text-muted">{formatCurrency(value)}</p>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 overflow-hidden rounded-xl border-2 border-dashed p-2 transition-all duration-150',
          isOver
            ? 'scale-[1.01] border-primary-400 bg-primary-50/60 shadow-glow dark:bg-primary-400/10'
            : 'border-transparent',
        )}
      >
        {subdividir
          ? porToque(cards).map(({ toque, leads: grupo }) => (
              <div key={toque} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 px-0.5">
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', touchColor(toque))}>
                    {touchLabel(toque)}
                  </span>
                  <span className="text-[10px] text-muted">{grupo.length}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                {grupo.map((l) => (
                  <KanbanCard key={l.id} lead={l} onOpen={onOpen} onDelete={onDelete} onEdit={onEdit} onEmail={onEmail} />
                ))}
              </div>
            ))
          : cards.map((l) => (
              <KanbanCard key={l.id} lead={l} onOpen={onOpen} onDelete={onDelete} onEdit={onEdit} onEmail={onEmail} />
            ))}
        {cards.length === 0 && (
          <p className="py-6 text-center text-xs text-muted/60">Sin leads</p>
        )}
      </div>
    </div>
  )
}
