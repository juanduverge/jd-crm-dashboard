import { useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import { Button, EmptyState, Input, Select, Skeleton, Textarea } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import type { CmsField, CmsItem, CmsLang, CmsStatus, CmsValue } from '@/types/cms'
import { OPTION_LABELS, SERVICES, servicePath, STATUSES } from './model'

export function Field({ label, children, hint, className }: { label: ReactNode; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={cn('flex min-w-0 flex-col gap-1.5', className)}>
    <span className="t-label">{label}</span>
    {children}
    {hint && <span className="t-hint">{hint}</span>}
  </label>
}

/** Color de cada estado: verde lo que está en la web, ámbar lo que espera a alguien. */
const STATUS_TONE: Record<CmsStatus, string> = {
  idea: 'bg-muted/40', borrador: 'bg-sky-500', revision: 'bg-amber-500',
  programado: 'bg-violet-500', publicado: 'bg-green-600', archivado: 'bg-muted/40',
}
const STATUS_BADGE: Record<CmsStatus, string> = {
  idea: 'badge-neutral', borrador: 'badge-neutral', revision: 'badge-warn',
  programado: 'badge-neutral', publicado: 'badge-ok', archivado: 'badge-neutral',
}

export function StatusBadge({ status }: { status: CmsStatus }) {
  return <span className={STATUS_BADGE[status]}>
    <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE[status])} />{STATUSES[status]}
  </span>
}

/**
 * Píldora de idioma: «EN ●» con el color de su estado, o «ES +» punteada cuando
 * la pieza es de los dos idiomas y esa versión todavía no existe.
 */
export function LangChip({ lang, item, missing, active, onClick }: {
  lang: CmsLang; item?: CmsItem; missing?: boolean; active?: boolean; onClick?: () => void
}) {
  const label = item ? `${lang.toUpperCase()} · ${STATUSES[item.status]}` : `Falta la versión ${lang.toUpperCase()}`
  const content = <>
    {lang.toUpperCase()}
    {item ? <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_TONE[item.status])} /> : <span aria-hidden>+</span>}
  </>
  const cls = cn(
    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold transition-colors',
    item ? 'border border-border bg-surface' : 'border border-dashed border-border text-muted',
    missing && 'hover:border-primary-300 hover:text-fg',
    active && 'border-fg bg-fg text-bg',
  )
  if (!onClick) return <span className={cls} title={label}>{content}</span>
  return <button type="button" className={cls} title={label} aria-label={label} aria-pressed={active} onClick={onClick}>{content}</button>
}

export function BackToContent() {
  return <Link className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-fg" to="/contenido">
    <ArrowLeft size={16} />Blog CMS
  </Link>
}
export function LoadingContent() {
  return <div className="space-y-3" aria-label="Cargando contenido"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>
}
export function ContentError({ retry }: { retry: () => void }) {
  return <EmptyState title="No se pudo cargar el contenido" description="Revisa tu conexión y los permisos de tu sesión."
    action={<Button onClick={retry}>Reintentar</Button>} />
}

/** Bloque plegable del panel de ajustes del editor. */
export function PanelSection({ title, summary, children, defaultOpen = false }: {
  title: string; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return <section className="border-b border-border last:border-b-0">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
      className="flex w-full items-center gap-2 px-4 py-3.5 text-left">
      <span className="t-card flex-1">{title}</span>
      {!open && summary && <span className="min-w-0 truncate text-xs text-muted">{summary}</span>}
      <ChevronDown size={16} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
    </button>
    {open && <div id={id} className="space-y-4 px-4 pb-5">{children}</div>}
  </section>
}

export function UnsavedChangesDialog({ navigation }: { navigation: { open: boolean; cancel: () => void; proceed: () => void } }) {
  return <Modal open={navigation.open} title="Cambios sin guardar" onClose={navigation.cancel}
    footer={<><Button type="button" variant="outline" onClick={navigation.cancel}>Seguir editando</Button>
      <Button type="button" onClick={navigation.proceed}>Salir sin guardar</Button></>}>
    <p className="text-sm">Tienes cambios sin guardar. Si sales, se perderán.</p>
  </Modal>
}

/**
 * Campos propios del tipo, dibujados desde cms_types.campos. `related_service`
 * es un caso especial: se elige de la lista de servicios del idioma, para que
 * la ruta guardada siempre exista.
 */
export function TypeFields({ fields, values, lang, onChange, disabled, allowIncomplete }: {
  fields: CmsField[]; values: Record<string, CmsValue>; lang: CmsLang
  onChange: (values: Record<string, CmsValue>) => void; disabled?: boolean; allowIncomplete?: boolean
}) {
  const prefix = useId()
  return <div className="space-y-4">{fields.map(field => {
    const value = values[field.clave]
    const set = (next: CmsValue) => onChange({ ...values, [field.clave]: next })
    const common = { id: `${prefix}-${field.clave}`, disabled, required: !!field.obligatorio && !allowIncomplete }
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
    let input: ReactNode
    if (field.clave === 'related_service') {
      const known = SERVICES.some(s => servicePath(lang, s) === text)
      input = <Select {...common} value={text} onChange={e => set(e.target.value)}>
        <option value="">Elegir servicio…</option>
        {SERVICES.map(s => <option key={s.en} value={servicePath(lang, s)}>{s.nombre[lang]}</option>)}
        {text && !known && <option value={text}>{text} (ruta antigua)</option>}
      </Select>
    } else switch (field.tipo) {
      case 'opcion': input = <Select {...common} value={text} onChange={e => set(e.target.value)}>
        <option value="">Elegir…</option>
        {field.opciones?.map(option => <option key={option} value={option}>{OPTION_LABELS[field.clave]?.[option] ?? option}</option>)}
      </Select>; break
      case 'texto_largo': input = <Textarea {...common} value={text} onChange={e => set(e.target.value)} />; break
      case 'lista': input = <Textarea {...common} value={Array.isArray(value) ? value.join('\n') : ''} placeholder="Uno por línea" onChange={e => set(e.target.value.split('\n'))} />; break
      case 'numero': input = <Input {...common} type="number" step="any" value={text} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} />; break
      case 'fecha': input = <Input {...common} type="date" value={text} onChange={e => set(e.target.value)} />; break
      case 'url': input = <Input {...common} type="url" pattern="https?://.+" value={text} onChange={e => set(e.target.value)} />; break
      case 'texto': input = <Input {...common} value={text} onChange={e => set(e.target.value)} />; break
      default: input = <p className="text-sm text-amber-700">Este campo todavía no se puede editar aquí. Su valor se conserva.</p>
    }
    return <Field key={field.clave} label={`${field.etiqueta}${field.obligatorio ? ' *' : ''}`}>{input}</Field>
  })}</div>
}
