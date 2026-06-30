import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { formatCurrency, cn } from '@/lib/utils'
import { stageTotals } from '@/lib/pipeline'
import type { Lead, LeadStatus } from '@/types'
import { KanbanCard } from './KanbanCard'

interface Props {
  stage: { id: LeadStatus; label: string; color: string }
  leads: Lead[]
  onOpen: (l: Lead) => void
  onAdd: (stage: LeadStatus) => void
}

export function KanbanColumn({ stage, leads, onOpen, onAdd }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id, data: { stage: stage.id } })
  const { count, value } = stageTotals(leads, stage.id)
  const cards = leads.filter((l) => l.estado === stage.id)

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
          <span className="text-sm font-semibold text-fg">{stage.label}</span>
          <span className="rounded-full bg-surface-2 px-1.5 text-xs text-muted">{count}</span>
        </div>
        <button
          onClick={() => onAdd(stage.id)}
          className="btn-ghost h-6 w-6 p-0"
          title="Agregar lead a esta etapa"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2 px-1 text-xs font-medium text-muted">{formatCurrency(value)}</p>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[120px] flex-1 flex-col gap-2 rounded-xl border border-dashed p-2 transition-colors',
          isOver ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-400/10' : 'border-transparent',
        )}
      >
        {cards.map((l) => (
          <KanbanCard key={l.id} lead={l} onOpen={onOpen} />
        ))}
        {cards.length === 0 && (
          <p className="py-6 text-center text-xs text-muted/60">Sin leads</p>
        )}
      </div>
    </div>
  )
}
