import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Send, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Textarea } from '@/components/ui'
import { AttachmentPicker } from '@/components/ui/AttachmentPicker'
import { useLeads, useEmailAliases } from '@/hooks/useData'
import { crmApi } from '@/services/crmApi'
import { messagesService } from '@/services/messagesService'
import { fileToBase64 } from '@/lib/utils'

/** Composer libre: escribe a cualquier email, exista o no como lead en el CRM. */
export function NewMessageModal({
  open, onClose, onSent, initialTo, toOptions, leadId, lockTo,
}: {
  open: boolean
  onClose: () => void
  onSent?: () => void
  /** Prellena el destinatario (ej. al abrir desde el perfil de un lead). */
  initialTo?: string
  /**
   * Emails conocidos de ese lead. Muchos leads del scraping traen varios
   * (info@, ventas@, el del duenyo) y hasta ahora se enviaba siempre al
   * primero sin poder cambiarlo: tocaba salir a Gmail para escribir al
   * bueno. Con dos o mas, el campo "Para" pasa a ser un desplegable.
   */
  toOptions?: string[]
  /** Asocia el envío a un lead ya conocido, sin depender del auto-match por email. */
  leadId?: string
  /** Si true, el campo "Para" no se puede editar (viene de un contexto ya definido). */
  lockTo?: boolean
}) {
  const { leads } = useLeads()
  const aliases = useEmailAliases()
  const [to, setTo] = useState(initialTo ?? '')
  const [from, setFrom] = useState<string>(aliases[0].email)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) { setTo(initialTo ?? ''); setFrom(aliases[0].email) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTo])

  // Sin duplicados y sin vacios, con el prellenado siempre dentro: si el
  // destinatario actual no estuviera en la lista, el select lo cambiaria solo
  // y acabarias escribiendo a otro sin enterarte.
  const opcionesTo = useMemo(() => {
    const vistos = new Set<string>()
    return [initialTo, ...(toOptions ?? [])]
      .map((e) => e?.trim())
      .filter((e): e is string => !!e)
      .filter((e) => {
        const k = e.toLowerCase()
        if (vistos.has(k)) return false
        vistos.add(k)
        return true
      })
  }, [initialTo, toOptions])

  const matchedLead = useMemo(() => {
    const target = to.trim().toLowerCase()
    return leads.find((l) => (l.emails?.length ? l.emails : [l.email]).some((e) => e?.trim().toLowerCase() === target))
  }, [leads, to])

  const allEmails = useMemo(
    () => leads.flatMap((l) => (l.emails?.length ? l.emails : [l.email]).filter((e): e is string => !!e).map((e) => ({ email: e, empresa: l.empresa }))),
    [leads],
  )

  const reset = () => { setTo(''); setSubject(''); setBody(''); setAttachment(null) }

  const submit = async () => {
    const email = to.trim()
    if (!email || !/\S+@\S+\.\S+/.test(email)) { toast.error('Ingresa un email válido'); return }
    if (!body.trim()) { toast.error('Escribe un mensaje'); return }
    setSending(true)
    try {
      const att = attachment ? await fileToBase64(attachment) : null
      await crmApi.sendReply({
        to: email,
        from,
        subject: subject.trim() || 'Mensaje de JD Developer',
        body: body.trim(),
        leadId: leadId ?? matchedLead?.id,
        ...(att ? { attachmentName: attachment!.name, attachmentBase64: att, attachmentMimeType: attachment!.type } : {}),
      })
      // El correo ya salio por SMTP. El registro en Supabase va aparte: si
      // comparte el try, un fallo de RLS acaba diciendo "no se pudo enviar"
      // sobre un correo entregado, y el reenvio duplica al destinatario.
      const effectiveLeadId = leadId ?? matchedLead?.id
      const effectiveSubject = subject.trim() || 'Mensaje de JD Developer'
      try {
        await messagesService.logSentMessage({
          leadId: effectiveLeadId,
          destinatario: email,
          asunto: effectiveSubject,
          cuerpo: body.trim(),
        })
        toast.success('Mensaje enviado')
      } catch (e) {
        toast.success('Mensaje enviado (no se pudo guardar en el historial)')
        console.error('logSentMessage fallo tras un envio correcto:', e)
      }
      reset()
      onSent?.()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? `No se pudo enviar el mensaje: ${e.message}` : 'No se pudo enviar el mensaje. Intenta de nuevo.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo mensaje"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={submit} disabled={sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Enviando…' : 'Enviar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Enviar desde</label>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>
            {/* El guion solo si hay etiqueta: los alias configurados a mano
                suelen venir sin `label`, y salia un "— correo@..." suelto. */}
            {aliases.map((a) => (
              <option key={a.email} value={a.email}>{a.label?.trim() ? `${a.label} — ${a.email}` : a.email}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Para</label>
          {opcionesTo.length > 1 ? (
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {opcionesTo.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          ) : (
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="destinatario@ejemplo.com"
              list="leads-emails"
              disabled={lockTo}
            />
          )}
          {opcionesTo.length > 1 && (
            <p className="mt-1 text-[11px] text-muted">Este lead tiene {opcionesTo.length} correos: elige a cual escribir.</p>
          )}
          <datalist id="leads-emails">
            {allEmails.map(({ email, empresa }) => <option key={email} value={email}>{empresa}</option>)}
          </datalist>
          {matchedLead && (
            <p className="mt-1 text-[11px] text-primary-600 dark:text-primary-400">Coincide con el lead: {matchedLead.empresa}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Asunto</label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asunto del mensaje" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Mensaje</label>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escribe tu mensaje..." disabled={sending} />
        </div>
        <AttachmentPicker file={attachment} onChange={setAttachment} />
        <p className="text-[11px] text-muted">Se agrega automáticamente el pie legal (dirección).</p>
      </div>
    </Modal>
  )
}
