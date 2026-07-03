import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Mail, MailOpen, RefreshCw, User, Send, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Textarea, Skeleton, EmptyState, Badge } from '@/components/ui'
import { useInbox, useLeads } from '@/hooks/useData'
import { crmApi } from '@/services/crmApi'
import { cn, fuzzyMatch, initials, stringToColor } from '@/lib/utils'
import type { InboxMessage } from '@/types'

const READ_STORAGE_KEY = 'jd-crm-inbox-read-ids'

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function formatFecha(fecha: string) {
  const d = new Date(fecha.replace(' ', 'T'))
  if (isNaN(d.getTime())) return fecha
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function InboxPage() {
  const { data: emails, isLoading, isError, refetch, isFetching } = useInbox()
  const { leads } = useLeads()
  const [query, setQuery] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds())
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const filtered = useMemo(() => {
    const list = emails ?? []
    return list
      .filter((e) => (onlyUnread ? !readIds.has(e.id) && !e.leido : true))
      .filter((e) =>
        !query ||
        fuzzyMatch(e.asunto, query) ||
        fuzzyMatch(e.deEmail, query) ||
        fuzzyMatch(e.deNombre ?? '', query) ||
        fuzzyMatch(leadById.get(e.idLead ?? '')?.empresa ?? '', query),
      )
  }, [emails, onlyUnread, readIds, query, leadById])

  const selected = filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null

  useEffect(() => {
    if (selected && !readIds.has(selected.id) && !selected.leido) {
      const next = new Set(readIds)
      next.add(selected.id)
      setReadIds(next)
      localStorage.setItem(READ_STORAGE_KEY, JSON.stringify([...next]))
    }
    setReplyOpen(false)
    setReplyText('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const isRead = (e: InboxMessage) => e.leido || readIds.has(e.id)
  const unreadCount = (emails ?? []).filter((e) => !isRead(e)).length

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return
    setSending(true)
    try {
      await crmApi.sendReply({
        to: selected.deEmail,
        subject: selected.asunto || '(sin asunto)',
        body: replyText.trim(),
        leadId: selected.idLead,
      })
      toast.success('Respuesta enviada')
      setReplyOpen(false)
      setReplyText('')
      refetch()
    } catch {
      toast.error('No se pudo enviar la respuesta. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Bandeja"
        subtitle={`Inbox IMAP en vivo${unreadCount ? ` · ${unreadCount} sin leer` : ''}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Actualizar
          </Button>
        }
      />

      {isError ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="No se pudo conectar con n8n"
          description='Verifica que el workflow "CRM API - Leer Inbox" esté activo y vuelve a intentar.'
          action={<Button onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <Skeleton className="h-[520px]" />
          <Skeleton className="h-[520px]" />
        </div>
      ) : !emails?.length ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="Bandeja vacía"
          description="Todavía no llegaron correos nuevos a la cuenta conectada."
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          {/* Lista */}
          <div className="card flex flex-col p-0 lg:h-[calc(100vh-13rem)]">
            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por asunto, remitente o lead..."
                  className="pl-8"
                />
              </div>
              <button
                onClick={() => setOnlyUnread((v) => !v)}
                className={cn(
                  'mt-2 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                  onlyUnread ? 'bg-primary-400 text-white' : 'bg-surface-2 text-muted hover:text-fg',
                )}
              >
                Solo no leídos
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="p-6 text-center text-xs text-muted">Sin resultados.</p>
              ) : (
                filtered.map((e) => {
                  const lead = e.idLead ? leadById.get(e.idLead) : undefined
                  const read = isRead(e)
                  return (
                    <button
                      key={e.id}
                      onClick={() => setSelectedId(e.id)}
                      className={cn(
                        'flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-surface-2',
                        (selected?.id ?? filtered[0]?.id) === e.id && 'bg-surface-2',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn('min-w-0 flex-1 truncate text-sm', !read ? 'font-semibold text-fg' : 'text-muted')} title={e.deNombre || e.deEmail}>
                          {e.deNombre || e.deEmail}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted">{formatFecha(e.fecha)}</span>
                      </div>
                      <span className={cn('truncate text-xs', !read ? 'font-medium text-fg' : 'text-muted')} title={e.asunto || '(sin asunto)'}>
                        {e.asunto || '(sin asunto)'}
                      </span>
                      {lead && (
                        <Badge className="mt-1 w-fit bg-primary-400/10 text-primary-500">{lead.empresa}</Badge>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Detalle */}
          <div className="card flex flex-col p-4 lg:h-[calc(100vh-13rem)]">
            {!selected ? (
              <EmptyState icon={<MailOpen className="h-8 w-8" />} title="Selecciona un correo" />
            ) : (
              <div className="flex h-full flex-col">
                <div className="border-b border-border pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="min-w-0 flex-1 line-clamp-2 text-base font-semibold text-fg" title={selected.asunto || '(sin asunto)'}>{selected.asunto || '(sin asunto)'}</h2>
                    <span className="shrink-0 text-xs text-muted">{formatFecha(selected.fecha)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: stringToColor(selected.deEmail) }}
                    >
                      {initials(selected.deNombre || selected.deEmail)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg" title={selected.deNombre || selected.deEmail}>{selected.deNombre || selected.deEmail}</p>
                      <p className="truncate text-xs text-muted" title={selected.deEmail}>{selected.deEmail}</p>
                    </div>
                    {selected.idLead && leadById.get(selected.idLead) && (
                      <Badge className="ml-auto shrink-0 gap-1 bg-primary-400/10 text-primary-500">
                        <User className="h-3 w-3" /> {leadById.get(selected.idLead)?.empresa}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto py-4">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{selected.cuerpo}</p>
                </div>

                <div className="border-t border-border pt-3">
                  {!replyOpen ? (
                    <Button variant="outline" size="sm" onClick={() => setReplyOpen(true)}>
                      <Send className="h-4 w-4" /> Responder
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <Textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder={`Responder a ${selected.deNombre || selected.deEmail}...`}
                        autoFocus
                        disabled={sending}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={sendReply} disabled={sending || !replyText.trim()}>
                          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          {sending ? 'Enviando…' : 'Enviar'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)} disabled={sending}>
                          Cancelar
                        </Button>
                      </div>
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
