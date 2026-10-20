import { useId, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Badge, Button, EmptyState, Input, Select, Skeleton, Textarea } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import type { CmsField, CmsItem, CmsValue } from '@/types/cms'
import { STATUSES } from './model'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return <label className="cms-field flex min-w-0 flex-col gap-1.5 text-sm"><span className="font-medium">{label}</span>{children}{hint && <span className="text-xs text-muted">{hint}</span>}</label>
}
export function StatusBadge({ item }: { item?: CmsItem }) {
  return <Badge className={item?.status === 'publicado' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : ''}>{item ? STATUSES[item.status] : 'Falta'}</Badge>
}
export function BackToContent() { return <Link className="mb-4 inline-flex items-center gap-2 text-sm text-muted hover:text-fg" to="/contenido"><ArrowLeft size={16} />Contenido</Link> }
export function LoadingContent() { return <div className="space-y-3" aria-label="Cargando contenido"><Skeleton className="h-12" /><Skeleton className="h-64" /></div> }
export function ContentError({ retry }: { retry: () => void }) { return <EmptyState title="No se pudo cargar el contenido" description="Revisa tu conexión y los permisos de tu sesión." action={<Button onClick={retry}>Reintentar</Button>} /> }

export function UnsavedChangesDialog({ navigation }: { navigation: { open: boolean; cancel: () => void; proceed: () => void } }) {
  return <Modal open={navigation.open} title="Cambios sin guardar" onClose={navigation.cancel} footer={<><Button type="button" variant="outline" onClick={navigation.cancel}>Seguir editando</Button><Button type="button" onClick={navigation.proceed}>Salir sin guardar</Button></>}><p className="text-sm">Tienes cambios sin guardar. Si sales, se perderán.</p></Modal>
}

export function TypeFields({ fields, values, onChange, disabled, allowIncomplete }: { fields: CmsField[]; values: Record<string, CmsValue>; onChange: (values: Record<string, CmsValue>) => void; disabled?: boolean; allowIncomplete?: boolean }) {
  const prefix = useId()
  return <div className="grid min-w-0 gap-4 sm:grid-cols-2">{fields.map(field => {
    const value = values[field.clave]
    const set = (next: CmsValue) => onChange({ ...values, [field.clave]: next })
    const common = { id: `${prefix}-${field.clave}`, disabled, required: !!field.obligatorio && !allowIncomplete }
    const text = typeof value === 'string' || typeof value === 'number' ? String(value) : ''
    let input: ReactNode
    switch (field.tipo) {
      case 'opcion': input = <Select {...common} value={text} onChange={e => set(e.target.value)}><option value="">Seleccionar…</option>{field.opciones?.map(option => <option key={option} value={option}>{option}</option>)}</Select>; break
      case 'texto_largo': input = <Textarea {...common} value={text} onChange={e => set(e.target.value)} />; break
      case 'lista': input = <Textarea {...common} value={Array.isArray(value) ? value.join('\n') : ''} placeholder="Un elemento por línea" onChange={e => set(e.target.value.split('\n'))} />; break
      case 'numero': input = <Input {...common} type="number" step="any" value={text} onChange={e => set(e.target.value === '' ? null : Number(e.target.value))} />; break
      case 'fecha': input = <Input {...common} type="date" value={text} onChange={e => set(e.target.value)} />; break
      case 'url': input = <Input {...common} type="url" pattern="https?://.+" value={text} onChange={e => set(e.target.value)} />; break
      case 'texto': input = <Input {...common} value={text} onChange={e => set(e.target.value)} />; break
      default: input = <p className="text-sm text-amber-700">Este campo todavía no admite edición. Su valor se conservará.</p>
    }
    return <Field key={field.clave} label={`${field.etiqueta}${field.obligatorio ? ' *' : ''}`}>{input}</Field>
  })}</div>
}
