import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import toast from 'react-hot-toast'
import { Search, Mail, MailOpen, RefreshCw, Send, Loader2, X } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Textarea, Skeleton, EmptyState, Badge } from '@/components/ui'
import { AttachmentPicker } from '@/components/ui/AttachmentPicker'
import { CuerpoCorreo } from '@/components/ui/CuerpoCorreo'
import { MaestroDetalle, Avatar } from '@/components/ui/MaestroDetalle'
import { useInbox, useLeads, useEmailAliases, useMarkInboxRead } from '@/hooks/useData'
import { useEsMovil } from '@/hooks/useMediaQuery'
import { crmApi } from '@/services/crmApi'
import { cn, fuzzyMatch, fileToBase64, htmlToText } from '@/lib/utils'
import { fechaCorta, fechaLarga, claveDia, etiquetaDia } from '@/lib/fecha'

/** Primera línea del correo, para la lista. */
function resumen(cuerpo: string) {
  return htmlToText(cuerpo || '').replace(/\s+/g, ' ').slice(0, 140)
}

export function InboxPage() {
  const { data: emails, isLoading, isError, refetch, isFetching } = useInbox()
  const { leads } = useLeads()
  const aliases = useEmailAliases()
  const markInboxRead = useMarkInboxRead()
  const esMovil = useEsMovil()

  const [query, setQuery] = useState('')
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyFrom, setReplyFrom] = useState<string>(aliases[0].email)
  const [replyText, setReplyText] = useState('')
  const [replyAttachment, setReplyAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const filtered = useMemo(() => {
    const list = emails ?? []
    return list
      .filter((e) => (onlyUnread ? !e.leido : true))
      .filter((e) =>
        !query ||
        fuzzyMatch(e.asunto, query) ||
        fuzzyMatch(e.deEmail, query) ||
        fuzzyMatch(e.deNombre ?? '', query) ||
        fuzzyMatch(leadById.get(e.idLead ?? '')?.empresa ?? '', query),
      )
  }, [emails, onlyUnread, query, leadById])

  // En escritorio siempre hay un correo a la vista. En el teléfono no se abre
  // ninguno hasta que se toca, o la lista no se vería nunca.
  const selected = esMovil
    ? filtered.find((e) => e.id === selectedId) ?? null
    : filtered.find((e) => e.id === selectedId) ?? filtered[0] ?? null

  useEffect(() => {
    if (selected && !selected.leido) {
      markInboxRead.mutate(selected.id)
    }
    setReplyOpen(false)
    setReplyText('')
    setReplyAttachment(null)
    setReplyFrom(aliases[0].email)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id])

  const unreadCount = (emails ?? []).filter((e) => !e.leido).length

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return
    setSending(true)
    try {
      const att = replyAttachment ? await fileToBase64(replyAttachment) : null
      await crmApi.sendReply({
        to: selected.deEmail,
        from: replyFrom,
        subject: selected.asunto || '(sin asunto)',
        body: replyText.trim(),
        leadId: selected.idLead,
        ...(att ? { attachmentName: replyAttachment!.name, attachmentBase64: att, attachmentMimeType: replyAttachment!.type } : {}),
      })
      // El registro en `outreach_messages` lo hace n8n (nodo "Registrar Envio"),
      // con la credencial de servicio. Ver NewMessageModal para el porque.
      toast.success('Respuesta enviada')
      setReplyOpen(false)
      setReplyText('')
      setReplyAttachment(null)
      refetch()
    } catch (e) {
      toast.error(e instanceof Error ? `No se pudo enviar la respuesta: ${e.message}` : 'No se pudo enviar la respuesta. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  /* ---------------------------- Lista ---------------------------- */

  const lista = (
    <>
      <div className="shrink-0 border-b border-border px-3 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por asunto, remitente o lead…"
            className="pl-9"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="tap absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted transition-colors hover:text-fg"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Dos pestañas en vez de un interruptor suelto: se ve de un vistazo en
            cuál de las dos vistas estás y cuántos quedan sin leer. */}
        <div className="mt-2.5 flex items-center gap-1">
          <Pestana activa={!onlyUnread} onClick={() => setOnlyUnread(false)}>
            Todos
          </Pestana>
          <Pestana activa={onlyUnread} onClick={() => setOnlyUnread(true)}>
            Sin leer
            {unreadCount > 0 && (
              <span
                className={cn(
                  'ml-1.5 rounded-full px-1.5 text-[0.6875rem] font-semibold tabular-nums',
                  onlyUnread ? 'bg-white/25 text-white' : 'bg-primary-400/15 text-primary-600 dark:text-primary-300',
                )}
              >
                {unreadCount}
              </span>
            )}
          </Pestana>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-6 py-10 text-center text-[0.8125rem] text-muted">
            {onlyUnread ? 'No queda nada sin leer.' : 'Ningún correo coincide con la búsqueda.'}
          </p>
        ) : (
          filtered.map((e, i) => {
            const lead = e.idLead ? leadById.get(e.idLead) : undefined
            const nombre = e.deNombre || e.deEmail
            const activo = selected?.id === e.id
            const nuevoDia = i === 0 || claveDia(e.fecha) !== claveDia(filtered[i - 1].fecha)
            return (
              <div key={e.id}>
                {/* Separador de día pegajoso: al bajar por la lista siempre se
                    sabe de cuándo es lo que se está mirando. */}
                {nuevoDia && (
                  <div className="sticky top-0 z-[5] bg-surface-2/95 px-3 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted backdrop-blur">
                    {etiquetaDia(e.fecha)}
                  </div>
                )}
                <button
                  onClick={() => setSelectedId(e.id)}
                  className={cn(
                    'relative flex w-full items-start gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors',
                    activo ? 'bg-primary-400/[0.07]' : 'hover:bg-surface-2',
                  )}
                >
                  {/* Seleccionado se marca con una barra, no con un bloque de
                      color: el correo sin leer ya usa el coral y dos cosas
                      naranjas a la vez no distinguen ninguna. */}
                  {activo && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary-400" />}
                  <Avatar
                    nombre={nombre}
                    semilla={e.deEmail}
                    className={cn(!e.leido && 'ring-2 ring-primary-400/40')}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn('min-w-0 flex-1 truncate text-sm', e.leido ? 'text-fg/80' : 'font-semibold text-fg')}
                        title={nombre}
                      >
                        {nombre}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-[0.6875rem] tabular-nums',
                          e.leido ? 'text-muted' : 'font-medium text-primary-600 dark:text-primary-300',
                        )}
                      >
                        {fechaCorta(e.fecha)}
                      </span>
                    </div>
                    <p
                      className={cn('mt-0.5 truncate text-[0.8125rem]', e.leido ? 'text-muted' : 'font-medium text-fg')}
                      title={e.asunto || '(sin asunto)'}
                    >
                      {e.asunto || '(sin asunto)'}
                    </p>
                    {/* El adelanto del cuerpo es lo que evita abrir cinco
                        correos para encontrar uno. No estaba. */}
                    <p className="mt-0.5 truncate text-xs text-muted/80">{resumen(e.cuerpo) || 'Sin contenido'}</p>
                    {lead && (
                      <Badge className="mt-1.5 bg-primary-400/10 text-primary-600 dark:text-primary-300">{lead.empresa}</Badge>
                    )}
                  </div>
                  {!e.leido && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-400" aria-label="Sin leer" />}
                </button>
              </div>
            )
          })
        )}
      </div>
    </>
  )

  /* --------------------------- Detalle --------------------------- */

  const lead = selected?.idLead ? leadById.get(selected.idLead) : undefined

  const detalle = !selected ? (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={<MailOpen className="h-8 w-8" />}
        title="Selecciona un correo"
        description="Elige un mensaje de la lista para leerlo aquí."
      />
    </div>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
        <h2 className="text-base font-semibold leading-snug text-fg sm:text-lg" title={selected.asunto || '(sin asunto)'}>
          {selected.asunto || '(sin asunto)'}
        </h2>
        <div className="mt-3 flex items-center gap-3">
          <Avatar nombre={selected.deNombre || selected.deEmail} semilla={selected.deEmail} className="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-fg">{selected.deNombre || selected.deEmail}</p>
            <p className="truncate text-xs text-muted" title={selected.deEmail}>
              {selected.deEmail}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="hidden text-xs text-muted sm:block">{fechaLarga(selected.fecha)}</span>
            <span className="text-xs text-muted sm:hidden">{fechaCorta(selected.fecha)}</span>
            {lead && <Badge className="bg-primary-400/10 text-primary-600 dark:text-primary-300">{lead.empresa}</Badge>}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5">
        <CuerpoCorreo html={selected.cuerpo} />
      </div>

      {/* Responder ya no es un botón que abre un hueco a mitad de pantalla: la
          caja vive anclada abajo y crece al escribir. */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3 pb-safe sm:px-5">
        {!replyOpen ? (
          <button
            onClick={() => setReplyOpen(true)}
            className="flex w-full items-center gap-2 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5 text-left text-sm text-muted transition-colors hover:border-primary-300 hover:text-fg"
          >
            <Send className="h-4 w-4 shrink-0" />
            <span className="truncate">Responder a {selected.deNombre || selected.deEmail}…</span>
          </button>
        ) : (
          <div className="space-y-2">
            <select
              className="input h-9 text-[0.8125rem]"
              value={replyFrom}
              onChange={(e) => setReplyFrom(e.target.value)}
              disabled={sending}
            >
              {aliases.map((a) => (
                <option key={a.email} value={a.email}>
                  Desde: {a.label} — {a.email}
                </option>
              ))}
            </select>
            <Textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={`Responder a ${selected.deNombre || selected.deEmail}…`}
              rows={3}
              autoFocus
              disabled={sending}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendReply()
              }}
            />
            <AttachmentPicker file={replyAttachment} onChange={setReplyAttachment} />
            <div className="flex items-center justify-between gap-2">
              <span className="hidden truncate text-[0.6875rem] text-muted sm:inline">⌘/Ctrl+Enter para enviar</span>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)} disabled={sending}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={sendReply} disabled={sending || !replyText.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {sending ? 'Enviando…' : 'Enviar'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
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
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <Skeleton className="h-[520px] rounded-2xl" />
          <Skeleton className="hidden h-[520px] rounded-2xl lg:block" />
        </div>
      ) : !emails?.length ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="Bandeja vacía"
          description="Todavía no llegaron correos nuevos a la cuenta conectada."
        />
      ) : (
        <MaestroDetalle
          lista={lista}
          detalle={detalle}
          abierto={!!selected}
          onVolver={() => setSelectedId(null)}
          tituloVuelta="Bandeja"
        />
      )}
    </div>
  )
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'tap inline-flex items-center rounded-full px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
        activa ? 'bg-primary-400 text-white' : 'text-muted hover:bg-surface-2 hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}
