import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Search, MessageSquare, Mail, MessageCircle, Instagram, Linkedin, RefreshCw, Send, PenSquare } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Skeleton, EmptyState, Badge, Textarea } from '@/components/ui'
import { AttachmentPicker } from '@/components/ui/AttachmentPicker'
import { useMessages, useLeads } from '@/hooks/useData'
import { crmApi } from '@/services/crmApi'
import { cn, fuzzyMatch, initials, stringToColor, fileToBase64 } from '@/lib/utils'
import { NewMessageModal } from './NewMessageModal'
import type { Channel, Message } from '@/types'

const channelIcon: Record<Channel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  instagram: Instagram,
  linkedin: Linkedin,
}

function formatFecha(fecha: string) {
  const d = new Date(fecha.replace(' ', 'T'))
  if (isNaN(d.getTime())) return fecha
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function MessagesPage() {
  const { data: messages, isLoading, isError, refetch, isFetching } = useMessages()
  const { leads } = useLeads()
  const [query, setQuery] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const threads = useMemo(() => {
    const byLead = new Map<string, Message[]>()
    for (const m of messages ?? []) {
      if (!m.idLead) continue
      if (!byLead.has(m.idLead)) byLead.set(m.idLead, [])
      byLead.get(m.idLead)!.push(m)
    }
    return [...byLead.entries()]
      .map(([idLead, msgs]) => ({
        idLead,
        lead: leadById.get(idLead),
        msgs: msgs.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
        last: msgs.reduce((a, b) => (a.fecha > b.fecha ? a : b)),
      }))
      .sort((a, b) => (a.last.fecha < b.last.fecha ? 1 : -1))
  }, [messages, leadById])

  const filteredThreads = useMemo(
    () =>
      threads.filter(
        (t) =>
          !query ||
          fuzzyMatch(t.lead?.empresa ?? t.idLead, query) ||
          fuzzyMatch(t.last.contenido, query),
      ),
    [threads, query],
  )

  const selected = filteredThreads.find((t) => t.idLead === selectedLeadId) ?? filteredThreads[0] ?? null

  // Composer
  const [compose, setCompose] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [newMessageOpen, setNewMessageOpen] = useState(false)
  // El hilo puede no tener lead asociado (mensaje libre) — en ese caso el
  // idLead del hilo ES el email destino (así lo registra el workflow de envío).
  const leadEmail = selected?.lead?.email?.trim() || (selected && /\S+@\S+\.\S+/.test(selected.idLead) ? selected.idLead : '')
  const leadWhatsapp = (selected?.lead?.whatsapp || '').replace(/[^\d]/g, '')

  const sendMessage = async () => {
    if (!selected || !compose.trim() || !leadEmail) return
    setSending(true)
    try {
      const att = attachment ? await fileToBase64(attachment) : null
      await crmApi.sendReply({
        to: leadEmail,
        subject: `Mensaje de JD Developer${selected.lead?.empresa ? ` · ${selected.lead.empresa}` : ''}`,
        body: compose.trim(),
        leadId: selected.idLead,
        ...(att ? { attachmentName: attachment!.name, attachmentBase64: att, attachmentMimeType: attachment!.type } : {}),
      })
      toast.success('Mensaje enviado')
      setCompose('')
      setAttachment(null)
      refetch()
    } catch {
      toast.error('No se pudo enviar el mensaje. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Mensajes"
        subtitle="Historial unificado multi-canal por lead"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setNewMessageOpen(true)}>
              <PenSquare className="h-4 w-4" /> Nuevo mensaje
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Actualizar
            </Button>
          </>
        }
      />
      <NewMessageModal open={newMessageOpen} onClose={() => setNewMessageOpen(false)} onSent={() => refetch()} />

      {isError ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="No se pudo conectar con n8n"
          description='Verifica que el workflow "CRM API - Leer Sheets" esté activo y vuelve a intentar.'
          action={<Button onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      ) : !threads.length ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="Sin mensajes"
          description="Todavía no hay outreach ni respuestas registradas para ningún lead."
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Lista de conversaciones */}
          <div className="card flex flex-col p-0 lg:h-[calc(100vh-13rem)]">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por lead o contenido..."
                  className="pl-8"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredThreads.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted">Sin resultados.</p>
              ) : (
                filteredThreads.map((t) => {
                  const Icon = channelIcon[t.last.canal] ?? MessageSquare
                  const nombre = t.lead?.empresa ?? t.idLead
                  return (
                    <button
                      key={t.idLead}
                      onClick={() => setSelectedLeadId(t.idLead)}
                      className={cn(
                        'flex w-full items-center gap-2.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                        (selected?.idLead ?? filteredThreads[0]?.idLead) === t.idLead && 'bg-surface-2',
                      )}
                    >
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: stringToColor(nombre) }}
                      >
                        {initials(nombre)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={nombre}>{nombre}</span>
                          <span className="shrink-0 text-[10px] text-muted">{formatFecha(t.last.fecha)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted">
                          <Icon className="h-3 w-3 shrink-0" />
                          <span className="min-w-0 flex-1 truncate" title={t.last.contenido}>{t.last.contenido}</span>
                        </div>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Hilo de conversación */}
          <div className="card flex flex-col p-4 lg:h-[calc(100vh-13rem)]">
            {!selected ? (
              <EmptyState icon={<MessageSquare className="h-8 w-8" />} title="Selecciona una conversación" />
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold text-fg" title={selected.lead?.empresa ?? selected.idLead}>
                      {selected.lead?.empresa ?? selected.idLead}
                    </h2>
                    {selected.lead && <p className="truncate text-xs text-muted">{selected.lead.email}</p>}
                  </div>
                  {selected.lead && <Badge className="shrink-0">{selected.lead.estado}</Badge>}
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4">
                  {selected.msgs.map((m, i) => {
                    const Icon = channelIcon[m.canal] ?? MessageSquare
                    const recibido = m.direccion === 'recibido'
                    return (
                      <div
                        key={i}
                        className={cn('flex flex-col gap-1 rounded-xl border border-border p-3', recibido ? 'bg-surface-2' : 'bg-surface')}
                      >
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Icon className="h-3.5 w-3.5" />
                          <span className="font-medium text-fg">{recibido ? 'Recibido' : m.tipo || 'Enviado'}</span>
                          <span className="ml-auto">{formatFecha(m.fecha)}</span>
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-fg">{m.contenido}</p>
                        {m.estadoEnvio && <span className="text-[11px] text-muted">Estado: {m.estadoEnvio}</span>}
                      </div>
                    )
                  })}
                </div>

                {/* Composer — enviar un mensaje nuevo en el hilo */}
                <div className="mt-3 border-t border-border pt-3">
                  {leadEmail ? (
                    <div className="flex flex-col gap-2">
                      <Textarea
                        value={compose}
                        onChange={(e) => setCompose(e.target.value)}
                        placeholder={`Escribe un mensaje para ${selected.lead?.empresa ?? 'este lead'}…`}
                        rows={3}
                        onKeyDown={(e) => {
                          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendMessage()
                        }}
                      />
                      <AttachmentPicker file={attachment} onChange={setAttachment} />
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[11px] text-muted">Para: {leadEmail} · ⌘/Ctrl+Enter para enviar</span>
                        <div className="flex items-center gap-2">
                          {leadWhatsapp && (
                            <a
                              href={`https://wa.me/${leadWhatsapp}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn-outline h-9 px-3 text-xs"
                            >
                              <MessageCircle className="h-4 w-4 text-green-500" /> WhatsApp
                            </a>
                          )}
                          <Button size="sm" onClick={sendMessage} disabled={sending || !compose.trim()}>
                            <Send className={cn('h-4 w-4', sending && 'animate-pulse')} /> {sending ? 'Enviando…' : 'Enviar'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-start gap-2 text-xs text-muted">
                      <span>Este lead no tiene email registrado.</span>
                      {leadWhatsapp && (
                        <a
                          href={`https://wa.me/${leadWhatsapp}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-outline h-9 px-3 text-xs"
                        >
                          <MessageCircle className="h-4 w-4 text-green-500" /> Abrir WhatsApp
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
