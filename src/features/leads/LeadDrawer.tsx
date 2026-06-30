import { useState } from 'react'
import { X, Mail, MessageCircle, Globe, MapPin, Phone, Edit3, GitBranch } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Button, Badge } from '@/components/ui'
import { scoreColor, formatCurrency, initials, stringToColor, cn } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/lib/config'
import type { Lead } from '@/types'

const TABS = ['Detalles', 'Actividad', 'Mensajes', 'Notas'] as const

export function LeadDrawer({
  lead, onClose, onEdit, onMoveStage,
}: {
  lead: Lead | null
  onClose: () => void
  onEdit: (l: Lead) => void
  onMoveStage: (id: string, estado: Lead['estado']) => void
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Detalles')
  if (!lead) return null
  const sc = scoreColor(lead.score)

  return (
    <Drawer open={!!lead} onClose={onClose}>
      <div className="sticky top-0 z-10 border-b border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ background: stringToColor(lead.empresa) }}>
              {initials(lead.empresa)}
            </div>
            <div>
              <h3 className="font-semibold text-fg">{lead.empresa}</h3>
              <p className="text-xs text-muted">{lead.ciudad} · {lead.nicho}</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge className={cn(sc.bg, sc.text)}>Score {lead.score}</Badge>
          <Badge>{PIPELINE_STAGES.find((s) => s.id === lead.estado)?.label}</Badge>
          {lead.valorEstimado ? <Badge className="bg-primary-50 text-primary-600">{formatCurrency(lead.valorEstimado)}</Badge> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => onEdit(lead)}><Edit3 className="h-3.5 w-3.5" /> Editar</Button>
          {lead.email && <a className="btn btn-outline h-8 px-3 text-xs" href={`mailto:${lead.email}`}><Mail className="h-3.5 w-3.5" /> Email</a>}
          {lead.whatsapp && <a className="btn btn-outline h-8 px-3 text-xs" target="_blank" href={`https://wa.me/${lead.whatsapp.replace(/\D/g, '')}`}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-5">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('border-b-2 px-3 py-2 text-sm', tab === t ? 'border-primary-400 text-fg' : 'border-transparent text-muted hover:text-fg')}>
            {t}
          </button>
        ))}
      </div>

      <div className="p-5">
        {tab === 'Detalles' && (
          <div className="space-y-3 text-sm">
            <Row icon={Globe} label="Web" value={lead.web} link={lead.web} />
            <Row icon={Mail} label="Email" value={lead.email} link={lead.email ? `mailto:${lead.email}` : undefined} />
            <Row icon={Phone} label="Teléfono" value={lead.telefono} />
            <Row icon={MapPin} label="Ciudad" value={lead.ciudad} />
            {lead.diagnosticoIA && (
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="mb-1 text-xs font-medium text-muted">Diagnóstico IA</p>
                <p className="text-sm text-fg">{lead.diagnosticoIA}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Stat label="PageSpeed móvil" value={lead.pageSpeedMovil} />
              <Stat label="PageSpeed desktop" value={lead.pageSpeedDesktop} />
            </div>
            <div>
              <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted"><GitBranch className="h-3.5 w-3.5" /> Mover a etapa</p>
              <div className="flex flex-wrap gap-1.5">
                {PIPELINE_STAGES.filter((s) => s.id !== lead.estado).map((s) => (
                  <button key={s.id} onClick={() => onMoveStage(lead.id, s.id)}
                    className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface-2">
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {tab === 'Actividad' && <Timeline lead={lead} />}
        {tab === 'Mensajes' && <p className="text-sm text-muted">Historial de mensajes disponible en el tab Mensajes (Fase 3).</p>}
        {tab === 'Notas' && <p className="whitespace-pre-wrap text-sm text-fg">{lead.notas || 'Sin notas.'}</p>}
      </div>
    </Drawer>
  )
}

function Row({ icon: Icon, label, value, link }: { icon: any; label: string; value?: string; link?: string }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted" />
      <span className="w-20 text-xs text-muted">{label}</span>
      {link ? <a href={link} target="_blank" className="truncate text-primary-600 hover:underline">{value}</a>
            : <span className="truncate text-fg">{value}</span>}
    </div>
  )
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-xl border border-border p-2 text-center">
      <p className="text-lg font-bold text-fg">{value ?? '—'}</p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  )
}

function Timeline({ lead }: { lead: Lead }) {
  const events = [
    { t: lead.fechaCaptura, label: 'Lead capturado', detail: lead.fuente },
    { t: lead.ultimaAccion, label: 'Última acción' },
    { t: lead.proximoSeguimiento, label: 'Próximo seguimiento' },
  ].filter((e) => e.t)
  return (
    <div className="space-y-3">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3">
          <div className="mt-1 h-2 w-2 rounded-full bg-primary-400" />
          <div>
            <p className="text-sm text-fg">{e.label}</p>
            <p className="text-xs text-muted">{e.t}{e.detail ? ` · ${e.detail}` : ''}</p>
          </div>
        </div>
      ))}
      {!events.length && <p className="text-sm text-muted">Sin actividad registrada.</p>}
    </div>
  )
}
