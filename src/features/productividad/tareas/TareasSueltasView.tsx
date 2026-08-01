import { useMemo, useState } from 'react'
import { format, isPast, isToday } from 'date-fns'
import toast from 'react-hot-toast'
import {
  CheckSquare, Plus, RefreshCw, Phone, Mail, Users, MessageCircle, CalendarClock, Check, Circle,
  Target, Trash2,
} from 'lucide-react'
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { cn } from '@/lib/utils'
import { useCreateTarea, useDeleteTarea, useGoals, useTareas, useUpdateTarea } from '@/hooks/useData'
import { PRIORIDADES, PRIORIDAD_ORDER } from '@/features/webleads/webLeadMeta'
import { filtrarPorPeriodo, rangoConsulta } from '../shared/goalMeta'
import type { Goal, Tarea, TareaSeccion, TareaTipo } from '@/types'

/**
 * Tareas sueltas: el to-do que no es numérico y por tanto no es una Meta.
 * Se agrupa en prioritaria / secundaria / idea, y opcionalmente se cuelga de
 * una meta mensual para saber a qué objetivo alimenta.
 */

const TIPOS: Record<TareaTipo, { label: string; icon: typeof Phone }> = {
  seguimiento: { label: 'Seguimiento', icon: CalendarClock },
  llamada: { label: 'Llamada', icon: Phone },
  email: { label: 'Email', icon: Mail },
  reunion: { label: 'Reunión', icon: Users },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle },
  otro: { label: 'Otro', icon: CheckSquare },
}

const SECCIONES: { id: TareaSeccion; label: string; hint: string }[] = [
  { id: 'prioritaria', label: 'Prioritarias', hint: 'Lo que mueve la aguja hoy' },
  { id: 'secundaria', label: 'Secundarias', hint: 'Importante, pero puede esperar' },
  { id: 'idea', label: 'Ideas', hint: 'Aparcadas, sin compromiso de fecha' },
]

function venc(iso?: string): { txt: string; tone: string } {
  if (!iso) return { txt: 'Sin fecha', tone: 'text-muted' }
  try {
    const d = new Date(iso + 'T00:00:00')
    const txt = format(d, 'dd MMM')
    if (isToday(d)) return { txt: 'Hoy', tone: 'text-orange-600 dark:text-orange-400 font-semibold' }
    if (isPast(d)) return { txt: `Vencida · ${txt}`, tone: 'text-red-600 dark:text-red-400 font-semibold' }
    return { txt, tone: 'text-muted' }
  } catch { return { txt: iso, tone: 'text-muted' } }
}

export function TareasSueltasView() {
  const { data: tareas, isLoading, isError, refetch, isFetching } = useTareas()
  const update = useUpdateTarea()
  const deleteTarea = useDeleteTarea()
  const [filtro, setFiltro] = useState<'pendientes' | 'todas' | 'hechas'>('pendientes')
  const [nueva, setNueva] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tarea | null>(null)

  const consulta = rangoConsulta(new Date())
  const { data: goals } = useGoals(consulta.desde, consulta.hasta)
  const metasPorId = useMemo(() => {
    const m = new Map<string, Goal>()
    for (const g of goals ?? []) m.set(g.id, g)
    return m
  }, [goals])

  const all = tareas ?? []
  const list = useMemo(() => all.filter((t) =>
    filtro === 'todas' ? true : filtro === 'hechas' ? t.estado === 'hecha' : t.estado !== 'hecha',
  ), [all, filtro])

  const pendientes = all.filter((t) => t.estado !== 'hecha')
  const vencidas = pendientes.filter((t) =>
    t.fechaVencimiento
    && isPast(new Date(t.fechaVencimiento + 'T00:00:00'))
    && !isToday(new Date(t.fechaVencimiento + 'T00:00:00')))

  const toggle = (t: Tarea) => {
    const nuevo = t.estado === 'hecha' ? 'pendiente' : 'hecha'
    update.mutate({ id: t.id, estado: nuevo }, {
      onSuccess: () => toast.success(nuevo === 'hecha' ? '✅ Tarea completada' : 'Reabierta'),
      onError: () => toast.error('No se pudo actualizar'),
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Tile label="Pendientes" value={pendientes.length} tone="primary" />
        <Tile label="Vencidas" value={vencidas.length} tone="danger" />
        <Tile label="Completadas" value={all.filter((t) => t.estado === 'hecha').length} tone="success" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {(['pendientes', 'todas', 'hechas'] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={cn('rounded-full px-3 py-1.5 text-xs font-medium capitalize transition',
              filtro === f ? 'bg-primary-500 text-white' : 'bg-surface text-muted hover:text-fg')}>
            {f}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
          <Button onClick={() => setNueva(true)}><Plus className="h-4 w-4" /> Nueva tarea</Button>
        </div>
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}

      {isError && !isLoading && (
        <EmptyState icon={<CheckSquare className="h-8 w-8" />} title="No se pudieron cargar las tareas"
          description="Verifica la conexión con Supabase y los permisos de la tabla tasks."
          action={<Button onClick={() => refetch()}>Reintentar</Button>} />
      )}

      {!isLoading && !isError && list.length === 0 && (
        <EmptyState icon={<CheckSquare className="h-8 w-8" />} title="Sin tareas"
          description="Crea un seguimiento manual o prográmalo desde una solicitud del Inbox de Leads." />
      )}

      {!isLoading && !isError && list.length > 0 && SECCIONES.map((s) => {
        const items = list.filter((t) => t.seccion === s.id)
        if (!items.length) return null
        return (
          <div key={s.id}>
            <div className="mb-2 flex items-baseline gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{s.label}</p>
              <span className="text-[11px] text-muted">{s.hint}</span>
              <span className="ml-auto text-[11px] text-muted">{items.length}</span>
            </div>
            <div className="card divide-y divide-border overflow-hidden p-0">
              {items.map((t) => {
                const Tipo = TIPOS[t.tipo] ?? TIPOS.otro
                const v = venc(t.fechaVencimiento)
                const done = t.estado === 'hecha'
                const pri = PRIORIDADES[t.prioridad]
                const meta = t.goalId ? metasPorId.get(t.goalId) : undefined
                return (
                  <div key={t.id} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
                    <button onClick={() => toggle(t)} className="shrink-0" title={done ? 'Reabrir' : 'Completar'}>
                      {done
                        ? <Check className="h-5 w-5 rounded-full bg-green-500 p-0.5 text-white" />
                        : <Circle className="h-5 w-5 text-muted hover:text-primary-500" />}
                    </button>
                    <Tipo.icon className="h-4 w-4 shrink-0 text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate text-sm', done ? 'text-muted line-through' : 'font-medium text-fg')} title={t.titulo}>
                        {t.titulo}
                      </p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted">
                        {meta && <Target className="h-3 w-3 shrink-0" />}
                        {meta ? `${meta.nombre} · ` : ''}
                        {t.leadNombre ? `${t.leadNombre} · ` : ''}{Tipo.label}{t.notas ? ` · ${t.notas}` : ''}
                      </p>
                    </div>
                    <span className={cn('shrink-0 text-xs', v.tone)}>{v.txt}</span>
                    <span className={cn('hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium sm:inline', pri.badge)}>
                      {pri.label}
                    </span>
                    <button
                      onClick={() => setDeleteTarget(t)}
                      className="btn-ghost h-7 w-7 shrink-0 p-0 text-red-500 hover:bg-red-500/10"
                      title="Eliminar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <NuevaTareaModal open={nueva} onClose={() => setNueva(false)} />
      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar tarea"
        itemLabel={deleteTarget?.titulo}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteTarea.mutateAsync({ id: deleteTarget.id })
          toast.success('Tarea eliminada')
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: number; tone: 'primary' | 'danger' | 'success' }) {
  const tones = {
    primary: 'text-primary-600 dark:text-primary-300',
    danger: 'text-red-600 dark:text-red-400',
    success: 'text-green-600 dark:text-green-400',
  }
  return (
    <div className="card p-4">
      <p className={cn('text-2xl font-bold', tones[tone])}>{value}</p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  )
}

function NuevaTareaModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateTarea()
  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TareaTipo>('seguimiento')
  const [fecha, setFecha] = useState('')
  const [prioridad, setPrioridad] = useState('media')
  const [seccion, setSeccion] = useState<TareaSeccion>('prioritaria')
  const [goalId, setGoalId] = useState('')
  const [notas, setNotas] = useState('')

  const consulta = rangoConsulta(new Date())
  const { data: goals } = useGoals(consulta.desde, consulta.hasta)
  const metasMes = useMemo(
    () => filtrarPorPeriodo(goals, 'mes', consulta.desde, consulta.hasta),
    [goals, consulta.desde, consulta.hasta],
  )

  const guardar = () => {
    if (!titulo.trim()) { toast.error('Escribe un título'); return }
    create.mutate(
      { titulo, tipo, fechaVencimiento: fecha, prioridad, seccion, goalId: goalId || undefined, notas },
      {
        onSuccess: () => {
          toast.success('Tarea creada')
          onClose()
          setTitulo(''); setFecha(''); setNotas(''); setTipo('seguimiento')
          setPrioridad('media'); setSeccion('prioritaria'); setGoalId('')
        },
        onError: () => toast.error('No se pudo crear la tarea'),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva tarea">
      <div className="space-y-3">
        <Input placeholder="¿Qué hay que hacer?" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Select value={tipo} onChange={(e) => setTipo(e.target.value as TareaTipo)}>
            {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
            {PRIORIDAD_ORDER.map((p) => <option key={p} value={p}>{PRIORIDADES[p].label}</option>)}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Bloque</label>
            <Select value={seccion} onChange={(e) => setSeccion(e.target.value as TareaSeccion)}>
              {SECCIONES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Fecha de vencimiento</label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted">Meta a la que alimenta (opcional)</label>
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Ninguna</option>
            {metasMes.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </Select>
        </div>
        <Input placeholder="Notas (opcional)" value={notas} onChange={(e) => setNotas(e.target.value)} />
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={create.isPending}>
            {create.isPending ? 'Creando…' : 'Crear tarea'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
