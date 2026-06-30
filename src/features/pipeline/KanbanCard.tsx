import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Mail, MessageCircle, Clock, AlertTriangle, ArrowRight } from 'lucide-react'
import { initials, stringToColor, formatCurrency, scoreColor, cn } from '@/lib/utils'
import { daysInStage, isStale, PRIORITY_META } from '@/lib/pipeline'
import type { Lead } from '@/types'

export function KanbanCard({ lead, onOpen }: { lead: Lead; onOpen: (l: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  })
  const stale = isStale(lead)
  const days = daysInStage(lead)
  const sc = scoreColor(lead.score)
  const prio = lead.prioridad ? PRIORITY_META[lead.prioridad] : null

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        'group card cursor-grab touch-none p-3 active:cursor-grabbing',
        isDragging && 'opacity-50',
        stale && 'animate-pulse ring-2 ring-red-400/70',
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start gap-2.5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white"
          style={{ background: stringToColor(lead.empresa) }}
        >
          {initials(lead.empresa)}
        </div>
        <div className="min-w-0 flex-1">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(lead) }}
            onPointerDown={(e) => e.stopPropagation()}
            className="block truncate text-left text-sm font-semibold text-fg hover:text-primary-600"
          >
            {lead.empresa}
          </button>
          <p className="truncate text-xs text-muted">{lead.ciudad || '—'}</p>
        </div>
        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', sc.bg, sc.text)}>
          {lead.score}
        </span>
      </div>

      <div className="mt-2.5 flex items-center justify-between">
        <span className="text-sm font-bold text-fg">
          {lead.valorEstimado ? formatCurrency(lead.valorEstimado) : '—'}
        </span>
        {prio && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', prio.cls)}>
            {prio.label}
          </span>
        )}
      </div>

      {lead.proximoSeguimiento && (
        <div className="mt-2 flex items-center gap-1 truncate text-[11px] text-muted">
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="truncate">{lead.proximoSeguimiento}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted">
        <span className={cn('flex items-center gap-1', stale && 'font-semibold text-red-500')}>
          {stale ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {days}d
        </span>
        <span className="flex items-center gap-1">
          {lead.canalPrincipal === 'whatsapp' ? (
            <MessageCircle className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Mail className="h-3.5 w-3.5 text-primary-500" />
          )}
        </span>
      </div>
    </div>
  )
}
