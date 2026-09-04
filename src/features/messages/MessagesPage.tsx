import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Search, MessageSquare, Mail, MessageCircle, Instagram, Linkedin, RefreshCw, Send, PenSquare, X, Check, CheckCheck, AlertTriangle, FileEdit } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Skeleton, EmptyState, Badge, Textarea } from '@/components/ui'
import { AttachmentPicker } from '@/components/ui/AttachmentPicker'
import { MaestroDetalle, Avatar } from '@/components/ui/MaestroDetalle'
import { useMessages, useLeads, useEmailAliases } from '@/hooks/useData'
import { useEsMovil } from '@/hooks/useMediaQuery'
import { crmApi } from '@/services/crmApi'
import { cn, fuzzyMatch, fileToBase64, htmlToText, esCorreoPropio } from '@/lib/utils'
import { fechaCorta, soloHora, claveDia, etiquetaDia } from '@/lib/fecha'
import { NewMessageModal } from './NewMessageModal'
import type { Channel, Message } from '@/types'

const channelIcon: Record<Channel, typeof Mail> = {
  email: Mail,
  whatsapp: MessageCircle,
  instagram: Instagram,
  linkedin: Linkedin,
}

/**
 * Estado de envío, como icono.
 *
 * Antes se imprimía «Estado: draft» debajo de cada mensaje, en inglés y en
 * texto corrido. Un estado que se repite en cada burbuja tiene que ocupar lo
 * que ocupa un icono, no una línea.
 */
function EstadoEnvio({ estado, claro }: { estado?: string; claro?: boolean }) {
  if (!estado) return null
  const e = estado.toLowerCase()
  const base = cn('inline-flex items-center gap-1 text-[0.6875rem]', claro ? 'text-white/70' : 'text-muted')

  if (e === 'sent' || e === 'enviado' || e === 'ok')
    return <span className={base}><CheckCheck className="h-3 w-3" /> Enviado</span>
  if (e === 'queued' || e === 'pendiente' || e === 'pending')
    return <span className={base}><Check className="h-3 w-3" /> En cola</span>
  if (e === 'draft' || e === 'borrador')
    return <span className={base}><FileEdit className="h-3 w-3" /> Borrador</span>
  if (e === 'failed' || e === 'error' || e === 'fallido')
    return <span className="inline-flex items-center gap-1 text-[0.6875rem] font-medium" style={{ color: 'rgb(var(--danger))' }}><AlertTriangle className="h-3 w-3" /> No salió</span>
  return <span className={base}>{estado}</span>
}

export function MessagesPage() {
  const { data: messages, isLoading, isError, refetch, isFetching } = useMessages()
  const { leads } = useLeads()
  const aliases = useEmailAliases()
  const esMovil = useEsMovil()
  const [query, setQuery] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  const leadById = useMemo(() => new Map(leads.map((l) => [l.id, l])), [leads])

  const threads = useMemo(() => {
    const propias = aliases.map((a) => a.email)
    const byLead = new Map<string, Message[]>()
    for (const bruto of messages ?? []) {
      // Una copia de nuestro propio envío que volvió por IMAP se marcaba como
      // «recibido» y en el hilo salía del lado del lead, como si nos lo
      // hubieran escrito ellos. Sigue en el hilo, pero del lado que le toca.
      const m: Message =
        bruto.direccion === 'recibido' && esCorreoPropio(bruto.remitente ?? '', propias)
          ? { ...bruto, direccion: 'enviado' }
          : bruto
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
  }, [messages, leadById, aliases])

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

  // En el teléfono la conversación se abre al tocarla; en escritorio siempre
  // hay una a la vista para no dejar media pantalla vacía.
  const selected = esMovil
    ? filteredThreads.find((t) => t.idLead === selectedLeadId) ?? null
    : filteredThreads.find((t) => t.idLead === selectedLeadId) ?? filteredThreads[0] ?? null

  // Composer
  const [compose, setCompose] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [newMessageOpen, setNewMessageOpen] = useState(false)

  // Una conversación se abre por el final, como cualquier chat. Antes empezaba
  // arriba del todo y había que bajar a mano hasta lo último que se dijo.
  const finHilo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    finHilo.current?.scrollIntoView({ block: 'end' })
  }, [selected?.idLead, selected?.msgs.length])

  // El hilo puede no tener lead asociado (mensaje libre) — en ese caso el
  // idLead del hilo ES el email destino (así lo registra el workflow de envío).
  const leadEmail = selected?.lead?.email?.trim() || (selected && /\S+@\S+\.\S+/.test(selected.idLead) ? selected.idLead : '')
  const leadWhatsapp = (selected?.lead?.whatsapp || '').replace(/[^\d]/g, '')

  const sendMessage = async () => {
    if (!selected || !compose.trim() || !leadEmail) return
    setSending(true)
    // El id del hilo NO siempre es un lead: en un hilo suelto es la dirección
    // de correo. Mandarlo como `leadId` metía un email en una columna uuid,
    // el insert reventaba y el catch se lo comía: el mensaje salía por SMTP
    // pero nunca quedaba registrado. Aquí se separan las dos cosas.
    const leadId = selected.lead?.id
    const asunto = `Mensaje de JD Developer${selected.lead?.empresa ? ` · ${selected.lead.empresa}` : ''}`
    try {
      const att = attachment ? await fileToBase64(attachment) : null
      await crmApi.sendReply({
        to: leadEmail,
        subject: asunto,
        body: compose.trim(),
        leadId,
        ...(att ? { attachmentName: attachment!.name, attachmentBase64: att, attachmentMimeType: attachment!.type } : {}),
      })
      // El registro en `outreach_messages` lo hace n8n (nodo "Registrar Envio"),
      // con la credencial de servicio. Ver NewMessageModal para el porque.
      toast.success('Mensaje enviado')
      setCompose('')
      setAttachment(null)
      refetch()
    } catch (e) {
      // Aqui ya solo puede haber fallado el envio en si: el registro tiene su
      // propio catch mas arriba y nunca llega hasta este.
      toast.error(e instanceof Error ? `No se pudo enviar el mensaje: ${e.message}` : 'No se pudo enviar el mensaje. Intenta de nuevo.')
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
            placeholder="Buscar por lead o contenido…"
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
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {filteredThreads.length === 0 ? (
          <p className="px-6 py-10 text-center text-[0.8125rem] text-muted">Ninguna conversación coincide con la búsqueda.</p>
        ) : (
          filteredThreads.map((t) => {
            const Icon = channelIcon[t.last.canal] ?? MessageSquare
            const nombre = t.lead?.empresa ?? t.idLead
            const activo = selected?.idLead === t.idLead
            const mio = t.last.direccion !== 'recibido'
            return (
              <button
                key={t.idLead}
                onClick={() => setSelectedLeadId(t.idLead)}
                className={cn(
                  'relative flex w-full items-center gap-3 border-b border-border/50 px-3 py-3 text-left transition-colors',
                  activo ? 'bg-primary-400/[0.07]' : 'hover:bg-surface-2',
                )}
              >
                {activo && <span className="absolute inset-y-0 left-0 w-[3px] rounded-r-full bg-primary-400" />}
                <Avatar nombre={nombre} className="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={nombre}>
                      {nombre}
                    </span>
                    <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted">{fechaCorta(t.last.fecha)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[0.8125rem] text-muted">
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {/* Saber si lo último lo dijiste tú o te lo dijeron es la
                        mitad de la información de una lista de chats. */}
                    {mio && <span className="shrink-0 text-muted/70">Tú:</span>}
                    <span className="min-w-0 flex-1 truncate">{htmlToText(t.last.contenido) || '—'}</span>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>
    </>
  )

  /* --------------------------- Detalle --------------------------- */

  const nombreHilo = selected?.lead?.empresa ?? selected?.idLead ?? ''

  const detalle = !selected ? (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={<MessageSquare className="h-8 w-8" />}
        title="Selecciona una conversación"
        description="Elige un lead de la lista para ver todo lo que os habéis dicho."
      />
    </div>
  ) : (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <Avatar nombre={nombreHilo} className="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[0.9375rem] font-semibold text-fg" title={nombreHilo}>
            {nombreHilo}
          </h2>
          <p className="truncate text-xs text-muted">{leadEmail || 'Sin email registrado'}</p>
        </div>
        {leadWhatsapp && (
          <a
            href={`https://wa.me/${leadWhatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-surface-2"
            title="Abrir WhatsApp"
          >
            <MessageCircle className="h-4 w-4 text-green-500" />
          </a>
        )}
        {selected.lead && <Badge className="hidden shrink-0 sm:inline-flex">{selected.lead.estado}</Badge>}
      </div>

      {/* El hilo, como un chat: lo tuyo a la derecha, lo suyo a la izquierda.
          Antes eran cajas idénticas apiladas y no se distinguía quién hablaba
          sin leer la etiqueta pequeña de arriba. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
          {selected.msgs.map((m, i) => {
            const Icon = channelIcon[m.canal] ?? MessageSquare
            const recibido = m.direccion === 'recibido'
            const nuevoDia = i === 0 || claveDia(m.fecha) !== claveDia(selected.msgs[i - 1].fecha)
            // Mensajes seguidos del mismo lado se agrupan: menos aire muerto y
            // se lee como una conversación, no como un listado.
            const encadena =
              !nuevoDia && i > 0 && (selected.msgs[i - 1].direccion === 'recibido') === recibido

            return (
              <div key={i}>
                {nuevoDia && (
                  <div className="my-3 flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted">
                      {etiquetaDia(m.fecha)}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                )}
                <div className={cn('flex', recibido ? 'justify-start' : 'justify-end', encadena ? 'mt-0.5' : 'mt-2')}>
                  <div
                    className={cn(
                      'max-w-[88%] px-3.5 py-2.5 sm:max-w-[75%]',
                      recibido
                        ? 'rounded-2xl rounded-bl-md bg-surface-2 text-fg'
                        : 'rounded-2xl rounded-br-md bg-primary-400 text-white',
                    )}
                  >
                    {/* El asunto solo encabeza el primer mensaje de la tanda:
                        repetirlo en cada burbuja era ruido. */}
                    {m.asunto && !encadena && (
                      <p className={cn('mb-1 text-[0.8125rem] font-semibold', recibido ? 'text-fg' : 'text-white')}>
                        {m.asunto}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {htmlToText(m.contenido) || '—'}
                    </p>
                    {m.remitente && recibido && (
                      <p className="mt-1 truncate text-[0.6875rem] text-muted">{m.remitente}</p>
                    )}
                    <div className={cn('mt-1.5 flex items-center justify-end gap-2', recibido ? 'text-muted' : 'text-white/70')}>
                      <Icon className="h-3 w-3 shrink-0 opacity-70" />
                      <span className="text-[0.6875rem] tabular-nums">{soloHora(m.fecha)}</span>
                      <EstadoEnvio estado={m.estadoEnvio} claro={!recibido} />
                    </div>
                    {/* Un envío fallido tiene que decir por qué; el motivo
                        estaba en `outreach_messages.error` y no se leía. */}
                    {m.error && (
                      <p
                        className={cn(
                          'mt-1.5 rounded-lg px-2 py-1 text-[0.6875rem]',
                          recibido ? 'aviso-error' : 'bg-white/15 text-white',
                        )}
                      >
                        {m.error}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={finHilo} />
        </div>
      </div>

      {/* Composer — enviar un mensaje nuevo en el hilo */}
      <div className="shrink-0 border-t border-border bg-surface px-4 py-3 pb-safe sm:px-5">
        {leadEmail ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-2">
            <Textarea
              value={compose}
              onChange={(e) => setCompose(e.target.value)}
              placeholder={`Escribe un mensaje para ${selected.lead?.empresa ?? 'este lead'}…`}
              rows={2}
              className="min-h-[52px]"
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendMessage()
              }}
            />
            <AttachmentPicker file={attachment} onChange={setAttachment} />
            <div className="flex items-center justify-between gap-2">
              <span className="hidden min-w-0 truncate text-[0.6875rem] text-muted sm:block">
                Para: {leadEmail} · ⌘/Ctrl+Enter para enviar
              </span>
              <Button size="sm" className="ml-auto" onClick={sendMessage} disabled={sending || !compose.trim()}>
                <Send className={cn('h-4 w-4', sending && 'animate-pulse')} /> {sending ? 'Enviando…' : 'Enviar'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col items-start gap-2 text-[0.8125rem] text-muted">
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
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
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
          // Este módulo lee de Supabase (`outreach_messages` + `inbox_messages`),
          // no de n8n ni de Sheets. El mensaje anterior mandaba a revisar un
          // workflow que no interviene: media hora perdida cada vez que fallaba.
          title="No se pudieron cargar los mensajes"
          description="La consulta a Supabase falló. Revisa la conexión y que las migraciones 0012 y 0024 estén aplicadas."
          action={<Button onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <Skeleton className="h-[520px] rounded-2xl" />
          <Skeleton className="hidden h-[520px] rounded-2xl lg:block" />
        </div>
      ) : !threads.length ? (
        <EmptyState
          icon={<MessageSquare className="h-8 w-8" />}
          title="Sin mensajes"
          description="Todavía no hay outreach ni respuestas registradas para ningún lead."
        />
      ) : (
        <MaestroDetalle
          lista={lista}
          detalle={detalle}
          abierto={!!selected}
          onVolver={() => setSelectedLeadId(null)}
          tituloVuelta="Mensajes"
        />
      )}
    </div>
  )
}
