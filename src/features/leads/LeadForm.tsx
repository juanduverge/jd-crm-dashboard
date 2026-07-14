import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadSchema, type LeadFormValues } from './leadSchema'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { DEFAULT_NICHES, PIPELINE_STAGES } from '@/lib/config'
import type { Lead } from '@/types'

/** Valores del form a partir del lead (o vacíos en modo crear). */
function buildDefaults(initial?: Lead | null): LeadFormValues {
  return {
    empresa: initial?.empresa ?? '',
    nicho: initial?.nicho ?? 'real-estate',
    web: initial?.web ?? '',
    direccion: initial?.direccion ?? '',
    ciudad: initial?.ciudad ?? '',
    pais: initial?.pais ?? '',
    cargo: initial?.cargo ?? '',
    email: initial?.email ?? '',
    telefono: initial?.telefono ?? '',
    whatsapp: initial?.whatsapp ?? '',
    instagram: initial?.instagram ?? '',
    facebook: initial?.facebook ?? '',
    linkedin: initial?.linkedin ?? '',
    fuente: initial?.fuente ?? '',
    responsable: initial?.responsable ?? '',
    etiquetas: (initial?.etiquetas ?? []).join(', '),
    score: initial?.score ?? 50,
    valorEstimado: initial?.valorEstimado ?? 0,
    estado: initial?.estado ?? 'nuevo',
    prioridad: initial?.prioridad ?? 'media',
    notas: initial?.notas ?? '',
  }
}

function Field({ label, error, children, className }: { label: string; error?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-500">{error}</span>}
    </label>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="col-span-full mt-2 border-b border-border pb-1 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{children}</h4>
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
    defaultValues: buildDefaults(initial),
  })

  // Re-poblar el form cada vez que se abre o cambia el lead seleccionado.
  useEffect(() => {
    if (open) reset(buildDefaults(initial))
  }, [open, initial, reset])

  const submit = handleSubmit((values) => {
    onSubmit(values)
    reset(buildDefaults(null))
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
        <SectionTitle>Empresa</SectionTitle>
        <Field label="Empresa *" error={errors.empresa?.message}>
          <Input {...register('empresa')} placeholder="Sunset Realty Miami" />
        </Field>
        <Field label="Nicho / categoría *" error={errors.nicho?.message}>
          <Select {...register('nicho')}>
            {DEFAULT_NICHES.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
          </Select>
        </Field>
        <Field label="Sitio web" error={errors.web?.message}><Input {...register('web')} placeholder="https://…" /></Field>
        <Field label="Dirección"><Input {...register('direccion')} placeholder="Calle 123…" /></Field>
        <Field label="Ciudad"><Input {...register('ciudad')} placeholder="Miami" /></Field>
        <Field label="País"><Input {...register('pais')} placeholder="Estados Unidos" /></Field>

        <SectionTitle>Contacto principal</SectionTitle>
        <Field label="Cargo"><Input {...register('cargo')} placeholder="Gerente, Dueño…" /></Field>
        <Field label="Email" error={errors.email?.message}><Input {...register('email')} placeholder="contacto@empresa.com" /></Field>
        <Field label="Teléfono"><Input {...register('telefono')} placeholder="+1 305…" /></Field>
        <Field label="WhatsApp"><Input {...register('whatsapp')} placeholder="+1305…" /></Field>
        <Field label="Instagram"><Input {...register('instagram')} placeholder="@empresa" /></Field>
        <Field label="Facebook"><Input {...register('facebook')} placeholder="facebook.com/…" /></Field>
        <Field label="LinkedIn" className="sm:col-span-2"><Input {...register('linkedin')} placeholder="linkedin.com/company/…" /></Field>

        <SectionTitle>Comercial y gestión</SectionTitle>
        <Field label="Estado / etapa">
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
        <Field label="Fuente"><Input {...register('fuente')} placeholder="Google Maps, Referido…" /></Field>
        <Field label="Responsable"><Input {...register('responsable')} placeholder="JD" /></Field>
        <Field label="Score (0-100)" error={errors.score?.message}><Input type="number" {...register('score')} /></Field>
        <Field label="Valor estimado (USD)"><Input type="number" {...register('valorEstimado')} /></Field>
        <Field label="Etiquetas (separadas por coma)" className="sm:col-span-2">
          <Input {...register('etiquetas')} placeholder="vip, e-commerce, urgente" />
        </Field>

        <SectionTitle>Notas</SectionTitle>
        <div className="sm:col-span-2">
          <Field label="Notas"><Textarea {...register('notas')} placeholder="Detalles, contexto…" /></Field>
        </div>
      </form>
    </Modal>
  )
}
