import { useState, useEffect } from 'react'
import { X, Mail, MessageCircle, Globe, MapPin, Phone, Edit3, GitBranch, Briefcase, User, Flag, Instagram, Facebook, Linkedin, Tag, Sparkles, Loader2, Plus, Trash2, Pencil, Users, MessageSquare, Star, Calendar, Clock } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Button, Badge, Skeleton } from '@/components/ui'
import { scoreColor, formatCurrency, initials, stringToColor, cn, htmlToText } from '@/lib/utils'
import { PIPELINE_STAGES } from '@/lib/config'
import { crmApi } from '@/services/crmApi'
import { useLeadsStore } from '@/store/leadsStore'
import { useContacts, useCreateContact, useUpdateContact, useDeleteContact, useNotes, useCreateNote, useUpdateNote, useDeleteNote, useMessages } from '@/hooks/useData'
import { NewMessageModal } from '@/features/messages/NewMessageModal'
import toast from 'react-hot-toast'
import type { Lead, Contact, ContactType, Note, Channel } from '@/types'

const TABS = ['Detalles', 'Contactos', 'Actividad', 'Mensajes', 'Notas'] as const

/** Formatea una fecha ISO o 'YYYY-MM-DD' de forma legible; devuelve el original si no parsea. */
function fmtFecha(v?: string): string {
  if (!v) return ''
  const d = new Date(v.length <= 10 ? v + 'T00:00:00' : v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const channelIcon: Record<Channel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  instagram: Instagram,
  linkedin: Linkedin,
}

const TIPO_LABELS: Record<ContactType, string> = {
  principal: 'Principal', ventas: 'Ventas', soporte: 'Soporte',
  facturacion: 'Facturación', personal: 'Personal', otro: 'Otro',
}

export function LeadDrawer({
  lead, onClose, onEdit, onMoveStage,
}: {
  lead: Lead | null
  onClose: () => void
  onEdit: (l: Lead) => void
  onMoveStage: (id: string, estado: Lead['estado']) => void
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Detalles')
  const [selectedEmail, setSelectedEmail] = useState<string | undefined>(undefined)
  const [analizando, setAnalizando] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const patchLocal = useLeadsStore((s) => s.patchLocal)
  const toggleFavorito = useLeadsStore((s) => s.toggleFavorito)
  useEffect(() => { setSelectedEmail(undefined) }, [lead?.id])
  if (!lead) return null
  const sc = scoreColor(lead.score)
  const emailOptions = lead.emails && lead.emails.length > 1 ? lead.emails : undefined
  const activeEmail = selectedEmail && emailOptions?.includes(selectedEmail) ? selectedEmail : (emailOptions?.[0] ?? lead.email)

  const analizarConIA = async () => {
    setAnalizando(true)
    try {
      const r = await crmApi.analizarLead({
        leadId: lead.id, empresa: lead.empresa, nicho: lead.nicho, web: lead.web, score: lead.score,
        pageSpeedMovil: lead.pageSpeedMovil, pageSpeedDesktop: lead.pageSpeedDesktop, tieneSSL: lead.tieneSSL,
        ratingGoogle: lead.ratingGoogle, numResenas: lead.numResenas, diagnosticoIA: lead.diagnosticoIA, notas: lead.notas,
      })
      patchLocal(lead.id, {
        scoreIA: r.scoreIA, observacionesIA: r.observaciones, recomendacionesIA: r.recomendaciones,
        oportunidadesIA: r.oportunidades, erroresIA: r.errores,
      })
      toast.success('Análisis IA completado')
    } catch {
      toast.error('No se pudo analizar el lead')
    } finally {
      setAnalizando(false)
    }
  }

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
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleFavorito(lead.id)}
              className={cn('btn-ghost', lead.favorito ? 'text-amber-400' : 'text-muted/50')}
              title={lead.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
            >
              <Star className={cn('h-4 w-4', lead.favorito && 'fill-amber-400')} />
            </button>
            <button onClick={onClose} className="btn-ghost"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge className={cn(sc.bg, sc.text)}>Score {lead.score}</Badge>
          <Badge>{PIPELINE_STAGES.find((s) => s.id === lead.estado)?.label}</Badge>
          {lead.valorEstimado ? <Badge className="bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300">{formatCurrency(lead.valorEstimado)}</Badge> : null}
        </div>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => onEdit(lead)}><Edit3 className="h-3.5 w-3.5" /> Editar</Button>
          <Button size="sm" variant="outline" onClick={analizarConIA} disabled={analizando}>
            {analizando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {analizando ? 'Analizando…' : lead.scoreIA !== undefined ? 'Reanalizar con IA' : 'Analizar con IA'}
          </Button>
          {activeEmail && <Button size="sm" variant="outline" onClick={() => setComposeOpen(true)}><Mail className="h-3.5 w-3.5" /> Email</Button>}
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
            <Row icon={Briefcase} label="Cargo" value={lead.cargo} />
            <Row icon={Globe} label="Web" value={lead.web} link={lead.web} />
            {emailOptions ? (
              <div className="flex items-start gap-3 py-2 text-sm">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <span className="mb-1 block text-xs font-medium text-muted">
                    Email <span className="text-muted/70">· {emailOptions.length} encontrados en el registro</span>
                  </span>
                  <select
                    className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
                    value={activeEmail}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                  >
                    {emailOptions.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              </div>
            ) : (
              <Row icon={Mail} label="Email" value={lead.email} onClick={lead.email ? () => setComposeOpen(true) : undefined} />
            )}
            <Row icon={Phone} label="Teléfono" value={lead.telefono} />
            <Row icon={MessageCircle} label="WhatsApp" value={lead.whatsapp} />
            <Row icon={Instagram} label="Instagram" value={lead.instagram} />
            <Row icon={Facebook} label="Facebook" value={lead.facebook} />
            <Row icon={Linkedin} label="LinkedIn" value={lead.linkedin} />
            <Row icon={MapPin} label="Dirección" value={lead.direccion} />
            <Row icon={MapPin} label="Ciudad" value={lead.ciudad} />
            <Row icon={MapPin} label="País" value={lead.pais} />
            <Row icon={Flag} label="Fuente" value={lead.fuente} />
            <Row icon={User} label="Responsable" value={lead.responsable} />
            {lead.etiquetas && lead.etiquetas.length > 0 && (
              <div className="flex items-start gap-2">
                <Tag className="mt-0.5 h-4 w-4 text-muted" />
                <span className="w-20 text-xs text-muted">Etiquetas</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {lead.etiquetas.map((t) => <Badge key={t}>{t}</Badge>)}
                </div>
              </div>
            )}
            {lead.diagnosticoIA && (
              <div className="rounded-xl bg-surface-2 p-3">
                <p className="mb-1 text-xs font-medium text-muted">Diagnóstico IA</p>
                <p className="text-sm text-fg">{lead.diagnosticoIA}</p>
              </div>
            )}
            {lead.scoreIA !== undefined && (
              <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-1 text-xs font-medium text-primary-600"><Sparkles className="h-3.5 w-3.5" /> Análisis IA</p>
                  <Badge className={cn(scoreColor(lead.scoreIA).bg, scoreColor(lead.scoreIA).text)}>{lead.scoreIA}/100</Badge>
                </div>
                {lead.observacionesIA && <p className="text-sm text-fg"><b className="text-muted">Observaciones: </b>{lead.observacionesIA}</p>}
                {lead.recomendacionesIA && <p className="text-sm text-fg"><b className="text-muted">Recomendaciones: </b>{lead.recomendacionesIA}</p>}
                {lead.oportunidadesIA && <p className="text-sm text-fg"><b className="text-muted">Oportunidades: </b>{lead.oportunidadesIA}</p>}
                {lead.erroresIA && <p className="text-sm text-fg"><b className="text-muted">Errores: </b>{lead.erroresIA}</p>}
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
            {(lead.fechaCaptura || lead.fechaUltimoMovimiento || lead.ultimaAccion) && (
              <div className="flex flex-col gap-1 border-t border-border pt-3 text-[11px] text-muted">
                {lead.fechaCaptura && (
                  <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Creado el {fmtFecha(lead.fechaCaptura)}</span>
                )}
                {(lead.fechaUltimoMovimiento || lead.ultimaAccion) && (
                  <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Última actualización: {fmtFecha(lead.fechaUltimoMovimiento || lead.ultimaAccion)}</span>
                )}
              </div>
            )}
          </div>
        )}
        {tab === 'Contactos' && <ContactsTab leadId={lead.id} />}
        {tab === 'Actividad' && <Timeline lead={lead} />}
        {tab === 'Mensajes' && <MessagesTab leadId={lead.id} />}
        {tab === 'Notas' && <NotesTab leadId={lead.id} />}
      </div>
      <NewMessageModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        initialTo={activeEmail}
        leadId={lead.id}
        lockTo
      />
    </Drawer>
  )
}

function Row({ icon: Icon, label, value, link, onClick }: { icon: any; label: string; value?: string; link?: string; onClick?: () => void }) {
  if (!value) return null
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted" />
      <span className="w-20 text-xs text-muted">{label}</span>
      {onClick ? <button onClick={onClick} className="min-w-0 flex-1 truncate text-left text-primary-600 hover:underline" title={value}>{value}</button>
      : link ? <a href={link} target="_blank" className="min-w-0 flex-1 truncate text-primary-600 hover:underline" title={value}>{value}</a>
            : <span className="min-w-0 flex-1 truncate text-fg" title={value}>{value}</span>}
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

const emptyForm = { nombre: '', cargo: '', email: '', telefono: '', tipo: 'otro' as ContactType, notas: '' }

function ContactsTab({ leadId }: { leadId: string }) {
  const { data: contacts, isLoading } = useContacts(leadId)
  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const deleteContact = useDeleteContact()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const startEdit = (c: Contact) => {
    setEditingId(c.id)
    setShowNew(false)
    setForm({ nombre: c.nombre, cargo: c.cargo || '', email: c.email || '', telefono: c.telefono || '', tipo: c.tipo, notas: c.notas || '' })
  }

  const startNew = () => {
    setShowNew(true)
    setEditingId(null)
    setForm(emptyForm)
  }

  const cancel = () => {
    setShowNew(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const save = async () => {
    if (!form.nombre.trim()) return toast.error('El nombre es obligatorio')
    try {
      if (editingId) {
        await updateContact.mutateAsync({ leadId, id: editingId, ...form })
        toast.success('Contacto actualizado')
      } else {
        await createContact.mutateAsync({ leadId, ...form })
        toast.success('Contacto agregado')
      }
      cancel()
    } catch {
      toast.error('No se pudo guardar el contacto')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteContact.mutateAsync({ leadId, id })
      toast.success('Contacto eliminado')
    } catch {
      toast.error('No se pudo eliminar el contacto')
    }
  }

  const saving = createContact.isPending || updateContact.isPending

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-medium text-muted"><Users className="h-3.5 w-3.5" /> Contactos del lead</p>
        {!showNew && !editingId && (
          <Button size="sm" variant="outline" onClick={startNew}><Plus className="h-3.5 w-3.5" /> Agregar</Button>
        )}
      </div>

      {isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
      {!isLoading && contacts?.length === 0 && !showNew && <p className="text-sm text-muted">Sin contactos registrados.</p>}

      {contacts?.map((c) => (
        editingId === c.id ? (
          <ContactForm key={c.id} form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} />
        ) : (
          <div key={c.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium text-fg">
                  {c.nombre}
                  <Badge>{TIPO_LABELS[c.tipo]}</Badge>
                </p>
                {c.cargo && <p className="text-xs text-muted">{c.cargo}</p>}
                {c.email && <p className="truncate text-xs text-muted">{c.email}</p>}
                {c.telefono && <p className="text-xs text-muted">{c.telefono}</p>}
                {c.notas && <p className="mt-1 text-xs text-muted">{c.notas}</p>}
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => startEdit(c)} className="btn-ghost h-7 w-7"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => remove(c.id)} className="btn-ghost h-7 w-7 text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        )
      ))}

      {showNew && <ContactForm form={form} setForm={setForm} onSave={save} onCancel={cancel} saving={saving} />}
    </div>
  )
}

function ContactForm({
  form, setForm, onSave, onCancel, saving,
}: {
  form: typeof emptyForm
  setForm: (f: typeof emptyForm) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  return (
    <div className="space-y-2 rounded-xl border border-primary-500/30 bg-primary-500/5 p-3">
      <input className="input" placeholder="Nombre *" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
        <select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ContactType })}>
          {Object.entries(TIPO_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="input" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="input" placeholder="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
      </div>
      <textarea className="input" placeholder="Notas" rows={2} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Guardar</Button>
      </div>
    </div>
  )
}

function MessagesTab({ leadId }: { leadId: string }) {
  const { data: allMessages, isLoading } = useMessages()
  const messages = (allMessages ?? [])
    .filter((m) => m.idLead === leadId)
    .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))

  if (isLoading) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
  if (!messages.length) return <p className="text-sm text-muted">Sin mensajes registrados para este lead.</p>

  return (
    <div className="space-y-2">
      {messages.map((m, i) => {
        const Icon = channelIcon[m.canal] ?? MessageSquare
        const recibido = m.direccion === 'recibido'
        return (
          <div key={`${leadId}-${i}`} className={cn('rounded-xl border border-border p-3 text-sm', recibido && 'bg-primary-500/5')}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-fg">
                <Icon className="h-3.5 w-3.5" /> {m.tipo || (recibido ? 'Respuesta recibida' : 'Mensaje enviado')}
              </div>
              <span className="text-[11px] text-muted">{new Date(m.fecha).toLocaleString('es')}</span>
            </div>
            {m.contenido && <p className="mt-1.5 whitespace-pre-wrap text-fg">{htmlToText(m.contenido)}</p>}
            {m.estadoEnvio && <p className="mt-1 text-[11px] text-muted">Estado: {m.estadoEnvio}</p>}
          </div>
        )
      })}
    </div>
  )
}

function NotesTab({ leadId }: { leadId: string }) {
  const { data: notes, isLoading } = useNotes(leadId)
  const createNote = useCreateNote()
  const updateNote = useUpdateNote()
  const deleteNote = useDeleteNote()
  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const add = async () => {
    if (!text.trim()) return
    try {
      await createNote.mutateAsync({ leadId, texto: text.trim() })
      setText('')
    } catch {
      toast.error('No se pudo agregar la nota')
    }
  }

  const startEdit = (n: Note) => {
    setEditingId(n.id)
    setEditText(n.texto)
  }

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return
    try {
      await updateNote.mutateAsync({ leadId, id: editingId, texto: editText.trim() })
      setEditingId(null)
    } catch {
      toast.error('No se pudo editar la nota')
    }
  }

  const remove = async (id: string) => {
    try {
      await deleteNote.mutateAsync({ leadId, id })
      toast.success('Nota eliminada')
    } catch {
      toast.error('No se pudo eliminar la nota')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          className="input flex-1"
          rows={2}
          placeholder="Escribe una nota…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button size="sm" onClick={add} disabled={createNote.isPending || !text.trim()}>
          {createNote.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}
      {!isLoading && notes?.length === 0 && <p className="text-sm text-muted">Sin notas registradas.</p>}

      <div className="space-y-2">
        {notes?.map((n) => (
          <div key={n.id} className="rounded-xl border border-border p-3">
            {editingId === n.id ? (
              <div className="space-y-2">
                <textarea className="input" rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button>
                  <Button size="sm" onClick={saveEdit} disabled={updateNote.isPending}>Guardar</Button>
                </div>
              </div>
            ) : (
              <>
                <p className="whitespace-pre-wrap text-sm text-fg">{n.texto}</p>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-xs text-muted">
                    {n.autor} · {new Date(n.creado).toLocaleString('es')}
                    {n.fueEditado && n.editado && <span> · editado {new Date(n.editado).toLocaleString('es')}</span>}
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => startEdit(n)} className="btn-ghost h-6 w-6"><Pencil className="h-3 w-3" /></button>
                    <button onClick={() => remove(n.id)} className="btn-ghost h-6 w-6 text-red-500"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
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
