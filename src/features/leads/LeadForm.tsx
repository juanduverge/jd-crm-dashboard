import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadSchema, type LeadFormValues } from './leadSchema'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { DEFAULT_NICHES, PIPELINE_STAGES } from '@/lib/config'
import type { Lead } from '@/types'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  )
}

export function LeadForm({
  open, onClose, onSubmit, initial,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (values: LeadFormValues) => void
  initial?: Lead | null
}) {
  const {
    register, handleSubmit, reset, formState: { errors },
  } = useForm<LeadFormValues>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      empresa: initial?.empresa ?? '',
      nicho: initial?.nicho ?? 'real-estate',
      ciudad: initial?.ciudad ?? '',
      email: initial?.email ?? '',
      telefono: initial?.telefono ?? '',
      web: initial?.web ?? '',
      whatsapp: initial?.whatsapp ?? '',
      score: initial?.score ?? 50,
      valorEstimado: initial?.valorEstimado ?? 0,
      estado: initial?.estado ?? 'nuevo',
      prioridad: initial?.prioridad ?? 'media',
      notas: initial?.notas ?? '',
    },
  })

  const submit = handleSubmit((values) => {
    onSubmit(values)
    reset()
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Editar lead' : 'Agregar lead'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit}>{initial ? 'Guardar cambios' : 'Crear lead'}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Empresa *" error={errors.empresa?.message}>
          <Input {...register('empresa')} placeholder="Sunset Realty Miami" />
        </Field>
        <Field label="Nicho *" error={errors.nicho?.message}>
          <Select {...register('nicho')}>
            {DEFAULT_NICHES.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Ciudad"><Input {...register('ciudad')} placeholder="Miami" /></Field>
        <Field label="Web" error={errors.web?.message}><Input {...register('web')} placeholder="https://…" /></Field>
        <Field label="Email" error={errors.email?.message}><Input {...register('email')} placeholder="contacto@empresa.com" /></Field>
        <Field label="Teléfono"><Input {...register('telefono')} placeholder="+1 305…" /></Field>
        <Field label="WhatsApp"><Input {...register('whatsapp')} placeholder="+1305…" /></Field>
        <Field label="Score (0-100)" error={errors.score?.message}><Input type="number" {...register('score')} /></Field>
        <Field label="Valor estimado (USD)"><Input type="number" {...register('valorEstimado')} /></Field>
        <Field label="Estado">
          <Select {...register('estado')}>
            {PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Prioridad">
          <Select {...register('prioridad')}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notas"><Textarea {...register('notas')} placeholder="Detalles, contexto…" /></Field>
        </div>
      </form>
    </Modal>
  )
}
