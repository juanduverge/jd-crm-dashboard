import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Mail, MessageCircle, Clock, AlertTriangle, ArrowRight, Trash2, Pencil } from 'lucide-react'
import { initials, stringToColor, formatCurrency, scoreColor, cn } from '@/lib/utils'
import { daysInStage, isStale, PRIORITY_META } from '@/lib/pipeline'
import type { Lead } from '@/types'

export function KanbanCard({ lead, onOpen, onDelete, onEdit }: { lead: Lead; onOpen: (l: Lead) => void; onDelete?: (l: Lead) => void; onEdit?: (l: Lead) => void }) {
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
        'group card w-full cursor-grab touch-none overflow-hidden p-3 transition-all duration-150 active:cursor-grabbing',
        'hover:-translate-y-0.5 hover:border-primary-300/60 hover:shadow-card-hover',
        isDragging && 'z-50 rotate-[1.5deg] scale-[1.03] opacity-90 shadow-[0_16px_40px_rgba(16,16,16,0.25)] ring-2 ring-primary-400',
        stale && !isDragging && 'animate-pulse ring-2 ring-red-400/70',
      )}
      onClick={() => onOpen(lead)}
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
            className="block w-full max-w-full truncate text-left text-sm font-semibold text-fg hover:text-primary-600"
            title={lead.empresa}
          >
            {lead.empresa}
          </button>
          <p className="truncate text-xs text-muted" title={lead.ciudad || undefined}>{lead.ciudad || '—'}</p>
        </div>
        <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold', sc.bg, sc.text)}>
          {lead.score}
        </span>
        {onEdit && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(lead) }}
            onPointerDown={(e) => e.stopPropagation()}
            className="btn-ghost h-6 w-6 shrink-0 p-0 text-muted opacity-0 transition-opacity hover:bg-surface-2 hover:text-primary-600 group-hover:opacity-100 focus-visible:opacity-100"
            title="Editar oportunidad"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(lead) }}
            onPointerDown={(e) => e.stopPropagation()}
            className="btn-ghost h-6 w-6 shrink-0 p-0 text-red-500 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100 focus-visible:opacity-100"
            title="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-bold text-fg">
          {lead.valorEstimado ? formatCurrency(lead.valorEstimado) : '—'}
        </span>
        {prio && (
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', prio.cls)}>
            {prio.label}
          </span>
        )}
      </div>

      {lead.proximoSeguimiento && (
        <div className="mt-2 flex items-center gap-1 text-[11px] text-muted">
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={lead.proximoSeguimiento}>{lead.proximoSeguimiento}</span>
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
