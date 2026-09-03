import type React from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { Mail, MessageCircle, Phone, Clock, AlertTriangle, ArrowRight, History, Trash2, Pencil } from 'lucide-react'
import { initials, stringToColor, formatCurrency, scoreColor, cn } from '@/lib/utils'
import { daysInStage, isStale, PRIORITY_META } from '@/lib/pipeline'
import { SITUACION_META, situacionLead, textoProximo, textoUltimoContacto, touchColor, touchLabel } from '@/lib/touches'
import { today } from '@/lib/followUps'
import type { Lead } from '@/types'

export function KanbanCard({ lead, onOpen, onDelete, onEdit, onEmail }: { lead: Lead; onOpen: (l: Lead) => void; onDelete?: (l: Lead) => void; onEdit?: (l: Lead) => void; onEmail?: (l: Lead) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  })
  const stale = isStale(lead)
  const days = daysInStage(lead)
  const sc = scoreColor(lead.score)
  const prio = lead.prioridad ? PRIORITY_META[lead.prioridad] : null
  // El toque y la situación se derivan del lead que ya está en memoria: la
  // tarjeta responde "¿en qué contacto va?" y "¿qué toca ahora?" sin abrirla.
  const hoy = today()
  const sit = situacionLead(lead, hoy)
  const proximo = textoProximo(lead, hoy)
  const ultimo = textoUltimoContacto(lead)

  // Canales que el lead TIENE, no el que le toca por defecto. Antes el pie
  // pintaba siempre un sobre salvo que el canal principal fuera WhatsApp, asi
  // que una tarjeta con sobre podia no tener email y una con WhatsApp
  // confirmado no lo ensenaba. Ahora cada icono significa "esto existe y se
  // puede usar ahora mismo", y el del canal principal va resaltado.
  const emails = (lead.emails?.length ? lead.emails : [lead.email]).filter(Boolean) as string[]
  const canales = [
    lead.whatsapp && {
      key: 'whatsapp',
      icon: MessageCircle,
      href: `https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`,
      externo: true,
      title: `WhatsApp: ${lead.whatsapp}`,
      color: 'text-green-500',
    },
    lead.telefono && {
      key: 'telefono',
      icon: Phone,
      href: `tel:${lead.telefono.replace(/[^\d+]/g, '')}`,
      externo: false,
      title: `Llamar: ${lead.telefono}`,
      color: 'text-sky-500',
    },
    lead.email && {
      key: 'email',
      icon: Mail,
      // Con composer, el sobre escribe dentro del CRM (y deja registrado el
      // envio); sin el, al menos abre el cliente de correo del sistema.
      href: onEmail ? undefined : `mailto:${lead.email}`,
      externo: false,
      title: emails.length > 1 ? `Escribir (${emails.length} correos)` : `Escribir a ${lead.email}`,
      color: 'text-primary-500',
      onClick: onEmail ? () => onEmail(lead) : undefined,
    },
  ].filter(Boolean) as { key: string; icon: typeof Mail; href?: string; externo: boolean; title: string; color: string; onClick?: () => void }[]

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

      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', touchColor(lead.touchActual))}>
          {touchLabel(lead.touchActual)}
        </span>
        {(sit === 'atrasado' || sit === 'hoy' || sit === 'sin_proximo') && (
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', SITUACION_META[sit].cls)}>
            {SITUACION_META[sit].corto}
          </span>
        )}
      </div>

      {ultimo && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
          <History className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Último: {ultimo}</span>
        </div>
      )}

      {proximo && (
        <div className={cn('mt-1 flex items-center gap-1 text-[11px]', proximo.cls)}>
          <ArrowRight className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Próximo: {proximo.texto}</span>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[11px] text-muted">
        <span className={cn('flex items-center gap-1', stale && 'font-semibold text-red-500')}>
          {stale ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          {days}d
        </span>
        <span className="flex items-center gap-0.5">
          {canales.length === 0 ? (
            <span className="text-[10px] italic text-muted/70">Sin contacto</span>
          ) : canales.map((c) => {
            const Icon = c.icon
            const clase = cn(
              'flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-surface-2',
              c.color,
              lead.canalPrincipal !== c.key && 'opacity-60 hover:opacity-100',
            )
            // La tarjeta entera arrastra y abre la ficha: sin frenar el evento
            // aqui, tocar el icono te abriria el drawer en vez de escribir, o
            // empezaria un drag a media pulsacion.
            const frenar = {
              onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
            }
            return c.onClick ? (
              <button
                key={c.key}
                type="button"
                title={c.title}
                onClick={(e) => { e.stopPropagation(); c.onClick!() }}
                {...frenar}
                className={clase}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ) : (
              <a
                key={c.key}
                href={c.href}
                target={c.externo ? '_blank' : undefined}
                rel={c.externo ? 'noreferrer' : undefined}
                title={c.title}
                onClick={(e) => e.stopPropagation()}
                {...frenar}
                className={clase}
              >
                <Icon className="h-3.5 w-3.5" />
              </a>
            )
          })}
        </span>
      </div>
    </div>
  )
}
