import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Send, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Textarea } from '@/components/ui'
import { AttachmentPicker } from '@/components/ui/AttachmentPicker'
import { useLeads } from '@/hooks/useData'
import { crmApi, REPLY_ALIASES } from '@/services/crmApi'
import { fileToBase64 } from '@/lib/utils'

/** Composer libre: escribe a cualquier email, exista o no como lead en el CRM. */
export function NewMessageModal({
  open, onClose, onSent, initialTo, leadId, lockTo,
}: {
  open: boolean
  onClose: () => void
  onSent?: () => void
  /** Prellena el destinatario (ej. al abrir desde el perfil de un lead). */
  initialTo?: string
  /** Asocia el envío a un lead ya conocido, sin depender del auto-match por email. */
  leadId?: string
  /** Si true, el campo "Para" no se puede editar (viene de un contexto ya definido). */
  lockTo?: boolean
}) {
  const { leads } = useLeads()
  const [to, setTo] = useState(initialTo ?? '')
  const [from, setFrom] = useState<string>(REPLY_ALIASES[0].email)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (open) { setTo(initialTo ?? ''); setFrom(REPLY_ALIASES[0].email) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTo])

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
      toast.success('Mensaje enviado')
      reset()
      onSent?.()
      onClose()
    } catch {
      toast.error('No se pudo enviar el mensaje. Intenta de nuevo.')
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
            {REPLY_ALIASES.map((a) => <option key={a.email} value={a.email}>{a.label} — {a.email}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Para</label>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="destinatario@ejemplo.com"
            list="leads-emails"
            disabled={lockTo}
          />
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
