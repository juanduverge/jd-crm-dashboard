import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  X, Mail, MessageCircle, Phone, Globe, Save, UserPlus, CalendarClock,
  UserCheck, Sparkles, Paperclip, ArrowRightCircle, Tag, Trash2,
} from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Button, Badge } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { cn } from '@/lib/utils'
import { useUpdateWebLead, useConvertWebLead, useCreateTarea, useDeleteWebLead, useEmailAliases } from '@/hooks/useData'
import { crmApi } from '@/services/crmApi'
import type { WebLead } from '@/types'
import { ESTADOS, ESTADO_ORDER, PRIORIDADES, PRIORIDAD_ORDER, initials, colorFromString } from './webLeadMeta'

const TABS = ['Detalles', 'Gestión', 'Actividad'] as const

function fecha(iso?: string) {
  if (!iso) return '—'
  try { return format(new Date(iso), "dd MMM yyyy · HH:mm") } catch { return iso }
}

export function WebLeadDrawer({ lead, onClose }: { lead: WebLead | null; onClose: () => void }) {
  const update = useUpdateWebLead()
  const convert = useConvertWebLead()
  const crearTarea = useCreateTarea()
  const deleteWebLead = useDeleteWebLead()
  const aliases = useEmailAliases()
  const [tab, setTab] = useState<(typeof TABS)[number]>('Detalles')
  const [notas, setNotas] = useState('')
  const [responsable, setResponsable] = useState('')
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [replyFrom, setReplyFrom] = useState<string>(aliases[0].email)
  const [replyBody, setReplyBody] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  useEffect(() => {
    if (lead) {
      setNotas(lead.notasInternas ?? '')
      setResponsable(lead.responsable ?? '')
      setTab('Detalles')
      setComposerOpen(false)
      setReplyBody('')
    }
  }, [lead?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lead) return null

  const patch = (payload: Parameters<typeof update.mutate>[0], okMsg = 'Actualizado') =>
    update.mutate(payload, {
      onSuccess: () => toast.success(okMsg),
      onError: () => toast.error('No se pudo guardar — ¿workflow "CRM API - Web Lead" activo?'),
    })

  const wa = (lead.telefono || '').replace(/\D/g, '')
  const etiquetas = lead.etiquetas
  const yaConvertido = etiquetas.includes('convertido')

  const convertir = () => {
    if (yaConvertido) return
    convert.mutate(lead, {
      onSuccess: () => toast.success('✅ Convertido en Lead — ya está en Leads y Pipeline'),
      onError: () => toast.error('No se pudo convertir. Revisa que "Escribir Sheets" esté activo.'),
    })
  }

  const enviarRespuesta = async () => {
    if (!replyBody.trim()) return
    setSending(true)
    try {
      await crmApi.sendReply({
        to: lead.email,
        subject: lead.asunto || 'Tu consulta en JD Developer',
        body: replyBody.trim(),
        from: replyFrom,
        leadId: lead.id,
      })
      toast.success('Respuesta enviada')
      setComposerOpen(false)
      setReplyBody('')
    } catch {
      toast.error('No se pudo enviar. Revisa que "CRM API - Enviar Respuesta" esté activo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Drawer open={!!lead} onClose={onClose} width="max-w-lg">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface p-5">
        <div className="flex items-start justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: colorFromString(lead.nombre || lead.email) }}>
              {initials(lead.nombre || lead.email)}
            </span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-fg" title={lead.nombre}>{lead.nombre}</h3>
              <p className="truncate text-xs text-muted" title={lead.empresa}>{lead.empresa || 'Sin empresa'}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button onClick={() => setConfirmDeleteOpen(true)} className="btn-ghost text-red-500 hover:bg-red-500/10" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
            <button onClick={onClose} className="btn-ghost"><X className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={ESTADOS[lead.estado].badge}>{ESTADOS[lead.estado].label}</Badge>
          <Badge className={PRIORIDADES[lead.prioridad].badge}>{PRIORIDADES[lead.prioridad].label}</Badge>
          <Badge className="bg-border/50 text-muted">🌐 {lead.fuente}</Badge>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={convertir}
            disabled={yaConvertido || convert.isPending}
            className={cn('btn h-8 px-3 text-xs', yaConvertido ? 'btn-outline text-green-600' : 'btn-primary')}
          >
            {yaConvertido ? <><UserCheck className="h-3.5 w-3.5" /> Convertido</> : <><ArrowRightCircle className="h-3.5 w-3.5" /> {convert.isPending ? 'Convirtiendo…' : 'Convertir en Lead'}</>}
          </button>
          <button
            onClick={() => setComposerOpen((v) => !v)}
            className={cn('btn h-8 px-3 text-xs', composerOpen ? 'btn-primary' : 'btn-outline')}
          >
            <Mail className="h-3.5 w-3.5" /> Responder
          </button>
          {wa && <a className="btn btn-outline h-8 px-3 text-xs" target="_blank" rel="noreferrer" href={`https://wa.me/${wa}`}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>}
        </div>

        {composerOpen && (
          <div className="mt-3 space-y-2 rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-muted">De:</span>
              <select
                value={replyFrom}
                onChange={(e) => setReplyFrom(e.target.value)}
                className="input h-7 flex-1 text-xs"
              >
                {aliases.map((a) => (
                  <option key={a.email} value={a.email}>{a.label} — {a.email}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted">Para: {lead.email} · Asunto: Re: {lead.asunto || 'Tu consulta en JD Developer'}</p>
            <textarea
              rows={5}
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Escribe tu respuesta…"
              className="input w-full text-sm"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setComposerOpen(false)}>Cancelar</Button>
              <Button onClick={enviarRespuesta} disabled={sending || !replyBody.trim()}>
                {sending ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </div>
        )}
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

      <div className="space-y-5 p-5">
        {tab === 'Detalles' && (
          <>
            {lead.asunto && <p className="text-sm font-semibold text-fg">{lead.asunto}</p>}
            <p className="whitespace-pre-wrap rounded-xl bg-surface p-4 text-sm text-fg">{lead.mensaje}</p>

            <Field label="Contacto">
              <div className="space-y-1.5 text-sm">
                <button onClick={() => { setTab('Detalles'); setComposerOpen(true) }} className="flex items-center gap-2 text-left text-fg hover:text-primary-500"><Mail className="h-4 w-4 text-muted" /> {lead.email}</button>
                {lead.telefono && <a href={`tel:${lead.telefono}`} className="flex items-center gap-2 text-fg hover:text-primary-500"><Phone className="h-4 w-4 text-muted" /> {lead.telefono}</a>}
              </div>
            </Field>

            <Field label="Origen">
              <div className="grid gap-1.5 text-xs text-muted">
                <p><span className="font-medium text-fg">Recibido:</span> {fecha(lead.fechaHora)}</p>
                <p><span className="font-medium text-fg">Formulario:</span> {lead.formulario ?? 'contacto'}</p>
                {lead.pagina && <p><span className="font-medium text-fg">Página:</span> {lead.pagina}</p>}
                {lead.url && <p className="min-w-0 truncate" title={lead.url}><span className="font-medium text-fg">URL:</span> {lead.url}</p>}
                {(lead.utmSource || lead.utmCampaign) && <p><span className="font-medium text-fg">UTM:</span> {lead.utmSource}/{lead.utmMedium}/{lead.utmCampaign}</p>}
                {lead.ip && <p><span className="font-medium text-fg">IP:</span> {lead.ip}</p>}
              </div>
            </Field>
          </>
        )}

        {tab === 'Gestión' && (
          <>
            <Field label="Estado">
              <div className="flex flex-wrap gap-1.5">
                {ESTADO_ORDER.map((e) => (
                  <button key={e} onClick={() => patch({ id: lead.id, estado: e }, 'Estado actualizado')}
                    className={cn('rounded-full px-3 py-1 text-xs font-medium transition', lead.estado === e ? ESTADOS[e].badge + ' ring-2 ring-primary-400/40' : 'bg-surface text-muted hover:text-fg')}>
                    {ESTADOS[e].label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Prioridad">
              <div className="flex flex-wrap gap-1.5">
                {PRIORIDAD_ORDER.map((p) => (
                  <button key={p} onClick={() => patch({ id: lead.id, prioridad: p }, 'Prioridad actualizada')}
                    className={cn('flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition', lead.prioridad === p ? PRIORIDADES[p].badge + ' ring-2 ring-primary-400/40' : 'bg-surface text-muted hover:text-fg')}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', PRIORIDADES[p].dot)} />{PRIORIDADES[p].label}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Responsable">
              <div className="flex gap-2">
                <input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre del responsable"
                  className="input h-9 flex-1 text-sm" />
                <Button variant="outline" disabled={update.isPending} onClick={() => patch({ id: lead.id, responsable }, 'Responsable asignado')}>
                  <UserCheck className="h-4 w-4" /> Asignar
                </Button>
              </div>
            </Field>

            <Field label="Etiquetas">
              <div className="flex flex-wrap items-center gap-1.5">
                {etiquetas.map((t) => (
                  <span key={t} className="flex items-center gap-1 rounded-full bg-border/50 px-2 py-0.5 text-xs text-fg">
                    <Tag className="h-3 w-3" />{t}
                    <button onClick={() => patch({ id: lead.id, etiquetas: etiquetas.filter((x) => x !== t) })} className="text-muted hover:text-red-500">×</button>
                  </span>
                ))}
                <input
                  value={nuevaEtiqueta}
                  onChange={(e) => setNuevaEtiqueta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && nuevaEtiqueta.trim()) {
                      patch({ id: lead.id, etiquetas: [...etiquetas, nuevaEtiqueta.trim()] })
                      setNuevaEtiqueta('')
                    }
                  }}
                  placeholder="+ etiqueta"
                  className="input h-7 w-24 text-xs"
                />
              </div>
            </Field>

            <Field label="Notas internas">
              <textarea rows={4} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Notas del equipo…" className="input w-full text-sm" />
              <Button variant="outline" className="mt-2" disabled={update.isPending} onClick={() => patch({ id: lead.id, notas_internas: notas }, 'Notas guardadas')}>
                <Save className="h-4 w-4" /> Guardar notas
              </Button>
            </Field>
          </>
        )}

        {tab === 'Actividad' && (
          <div className="space-y-4">
            <Timeline
              items={[
                { icon: Globe, text: 'Solicitud recibida desde la web', time: fecha(lead.fechaHora), done: true },
                lead.responsable ? { icon: UserCheck, text: `Asignado a ${lead.responsable}`, time: fecha(lead.actualizado), done: true } : null,
                { icon: Mail, text: `Estado actual: ${ESTADOS[lead.estado].label}`, time: fecha(lead.actualizado), done: lead.estado !== 'nuevo' },
              ].filter(Boolean) as { icon: typeof Globe; text: string; time: string; done: boolean }[]}
            />
            {/* Acciones futuras (arquitectura preparada) */}
            <div className="rounded-xl border border-dashed border-border p-4">
              <p className="mb-2 text-xs font-medium text-muted">Próximamente</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const fecha = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10)
                    crearTarea.mutate(
                      { titulo: `Seguir a ${lead.nombre}`, tipo: 'seguimiento', fechaVencimiento: fecha, prioridad: lead.prioridad, notas: lead.asunto || '' },
                      { onSuccess: () => toast.success('📅 Seguimiento creado (en 2 días) — mira Tareas'), onError: () => toast.error('No se pudo crear la tarea') },
                    )
                  }}
                  disabled={crearTarea.isPending}
                  className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2 text-xs font-medium text-primary-600 transition hover:bg-primary-100 dark:bg-primary-400/15 dark:text-primary-300"
                >
                  <CalendarClock className="h-4 w-4" /> Programar seguimiento
                </button>
                <FutureBtn icon={UserPlus} label="Convertir en cliente" />
                <FutureBtn icon={Sparkles} label="Respuesta con IA" />
                <FutureBtn icon={Paperclip} label="Adjuntar archivo" />
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDeleteModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Eliminar solicitud"
        itemLabel={lead.nombre}
        onConfirm={async () => {
          await deleteWebLead.mutateAsync({ id: lead.id })
          toast.success('Solicitud eliminada')
          setConfirmDeleteOpen(false)
          onClose()
        }}
      />
    </Drawer>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      {children}
    </div>
  )
}

function Timeline({ items }: { items: { icon: typeof Globe; text: string; time: string; done: boolean }[] }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((it, i) => (
        <li key={i} className="relative">
          <span className={cn('absolute -left-[27px] grid h-6 w-6 place-items-center rounded-full', it.done ? 'bg-primary-500 text-white' : 'bg-surface text-muted')}>
            <it.icon className="h-3.5 w-3.5" />
          </span>
          <p className="text-sm text-fg">{it.text}</p>
          <p className="text-xs text-muted">{it.time}</p>
        </li>
      ))}
    </ol>
  )
}

function FutureBtn({ icon: Icon, label }: { icon: typeof Globe; label: string }) {
  return (
    <button disabled className="flex cursor-not-allowed items-center gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted opacity-70" title="Disponible en una próxima versión">
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}
