import { useMemo, useState } from 'react'
import { addDays, isToday } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Check, ChevronLeft, ChevronRight, Circle, Clock, Pencil, Play, Plus, Target, Trash2,
} from 'lucide-react'
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { cn } from '@/lib/utils'
import {
  useActualizarBloque, useCrearBloque, useEliminarBloque, useGoals, useHorarioDia,
  useIniciarTiempo, useToggleBloque,
} from '@/hooks/useData'
import { useAuthStore } from '@/store/authStore'
import { DIAS_SEMANA, filtrarPorPeriodo, fmtDia, fmtNum, iso, isoDow, rangoConsulta } from '../shared/goalMeta'
import type { Goal, HorarioBloque, HorarioBloqueDia } from '@/types'

/**
 * Plantilla de horario diario. Los bloques son fijos y recurrentes (qué días
 * de la semana aplican); la marca de completado es por FECHA.
 *
 * Un bloque puede colgar de una meta mensual: al marcarlo, el CRM resuelve la
 * meta diaria de esa fecha dentro de esa familia y le suma el aporte del
 * bloque. Al desmarcarlo lo resta exactamente. Por eso el enlace se hace con
 * la meta del mes y no con la del día: el bloque es plantilla, la meta diaria
 * cambia cada jornada.
 */
export function HorarioDiarioView() {
  const [ref, setRef] = useState(() => new Date())
  const [editando, setEditando] = useState<HorarioBloque | null>(null)
  const [nuevo, setNuevo] = useState(false)
  const [borrando, setBorrando] = useState<HorarioBloque | null>(null)

  const fecha = iso(ref)
  const dow = isoDow(ref)
  const { data: bloques, isLoading, isError } = useHorarioDia(fecha)
  const consulta = rangoConsulta(ref)
  const { data: goals } = useGoals(consulta.desde, consulta.hasta)
  const eliminar = useEliminarBloque()

  const metasMes = useMemo(
    () => filtrarPorPeriodo(goals, 'mes', consulta.desde, consulta.hasta),
    [goals, consulta.desde, consulta.hasta],
  )
  const metasPorId = useMemo(() => {
    const m = new Map<string, Goal>()
    for (const g of goals ?? []) m.set(g.id, g)
    return m
  }, [goals])

  const delDia = useMemo(
    () => (bloques ?? []).filter((b) => b.activo && b.diasSemana.includes(dow)),
    [bloques, dow],
  )
  const otros = useMemo(
    () => (bloques ?? []).filter((b) => !b.activo || !b.diasSemana.includes(dow)),
    [bloques, dow],
  )

  const hechos = delDia.filter((b) => b.completado).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setRef((d) => addDays(d, -1))} className="btn-ghost h-8 w-8 rounded-lg border border-border p-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setRef((d) => addDays(d, 1))} className="btn-ghost h-8 w-8 rounded-lg border border-border p-0">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-semibold capitalize text-fg">{fmtDia(ref)}</p>
        {isToday(ref)
          ? <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-600 dark:text-primary-300">Hoy</span>
          : <Button size="sm" variant="ghost" onClick={() => setRef(new Date())}>Hoy</Button>}
        {delDia.length > 0 && <span className="text-xs text-muted">{hechos} de {delDia.length} bloques</span>}
        <Button className="ml-auto" onClick={() => setNuevo(true)}>
          <Plus className="h-4 w-4" /> Nuevo bloque
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}

      {isError && !isLoading && (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          title="No se pudo cargar el horario"
          description="Comprueba que la migración 0015 esté aplicada en Supabase."
        />
      )}

      {!isLoading && !isError && delDia.length === 0 && otros.length === 0 && (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          title="Horario vacío"
          description="Crea los bloques de tu día (8:00-8:15 setup, 8:15-10:15 prospección…). Se repiten los días que elijas."
          action={<Button onClick={() => setNuevo(true)}><Plus className="h-4 w-4" /> Nuevo bloque</Button>}
        />
      )}

      {delDia.length > 0 && (
        <div className="card divide-y divide-border overflow-hidden p-0">
          {delDia.map((b) => (
            <FilaBloque
              key={b.id}
              bloque={b}
              fecha={fecha}
              meta={b.goalId ? metasPorId.get(b.goalId) : undefined}
              onEditar={() => setEditando(b)}
              onEliminar={() => setBorrando(b)}
            />
          ))}
        </div>
      )}

      {otros.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Bloques de otros días de la semana
          </p>
          <div className="card divide-y divide-border overflow-hidden p-0">
            {otros.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 opacity-60">
                <span className="w-24 shrink-0 text-xs tabular-nums text-muted">{b.horaInicio}–{b.horaFin}</span>
                <p className="min-w-0 flex-1 truncate text-sm text-fg">{b.titulo}</p>
                <span className="shrink-0 text-[11px] text-muted">
                  {b.activo
                    ? DIAS_SEMANA.filter((d) => b.diasSemana.includes(d.iso)).map((d) => d.corto).join(' ')
                    : 'Desactivado'}
                </span>
                <button onClick={() => setEditando(b)} className="btn-ghost h-7 w-7 shrink-0 p-0 text-muted hover:text-fg">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <BloqueModal
        open={nuevo || !!editando}
        onClose={() => { setNuevo(false); setEditando(null) }}
        bloque={editando}
        metasMes={metasMes}
      />

      <ConfirmDeleteModal
        open={!!borrando}
        onClose={() => setBorrando(null)}
        title="Eliminar bloque"
        itemLabel={borrando?.titulo}
        message="El bloque desaparece del horario. El progreso que ya sumó a tus metas no se toca."
        onConfirm={async () => {
          if (!borrando) return
          await eliminar.mutateAsync(borrando.id)
          toast.success('Bloque eliminado')
          setBorrando(null)
        }}
      />
    </div>
  )
}

function FilaBloque({
  bloque, fecha, meta, onEditar, onEliminar,
}: {
  bloque: HorarioBloqueDia
  fecha: string
  meta?: Goal
  onEditar: () => void
  onEliminar: () => void
}) {
  const toggle = useToggleBloque()
  const iniciarTiempo = useIniciarTiempo()
  const responsable = useAuthStore((s) => s.user?.name)

  /**
   * Cronometrar el bloque es otra cosa que marcarlo: esto mide el rato que le
   * dedicas, marcarlo es lo que suma a la meta. Se guarda el enlace al bloque
   * y a su meta para que las Métricas puedan cruzar plan contra realidad.
   */
  const cronometrar = () =>
    iniciarTiempo.mutate(
      { descripcion: bloque.titulo, fecha, bloqueId: bloque.id, goalId: bloque.goalId, responsable },
      {
        onSuccess: () => toast.success(`Cronómetro en marcha: ${bloque.titulo}`),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo arrancar el cronómetro'),
      },
    )

  const marcar = () =>
    toggle.mutate(
      { id: bloque.id, fecha, completado: bloque.completado },
      {
        onSuccess: () => {
          if (!bloque.completado && meta) {
            toast.success(`+${fmtNum(bloque.aporte)} a "${meta.nombre}"`)
          }
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo actualizar el bloque'),
      },
    )

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button onClick={marcar} disabled={toggle.isPending} className="shrink-0" title={bloque.completado ? 'Desmarcar' : 'Completar'}>
        {bloque.completado
          ? <Check className="h-5 w-5 rounded-full bg-green-500 p-0.5 text-white" />
          : <Circle className="h-5 w-5 text-muted hover:text-primary-500" />}
      </button>

      <span className="w-24 shrink-0 text-xs tabular-nums text-muted">{bloque.horaInicio}–{bloque.horaFin}</span>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', bloque.completado ? 'text-muted line-through' : 'font-medium text-fg')}>
          {bloque.titulo}
        </p>
        {bloque.descripcion && (
          <p
            className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-muted"
            title={bloque.descripcion}
          >
            {bloque.descripcion}
          </p>
        )}
        {meta && (
          <p className="flex items-center gap-1 truncate text-xs text-muted">
            <Target className="h-3 w-3 shrink-0" />
            +{fmtNum(bloque.aporte)} a {meta.nombre}
          </p>
        )}
      </div>

      <button
        onClick={cronometrar}
        disabled={iniciarTiempo.isPending}
        className="btn-ghost h-7 w-7 shrink-0 p-0 text-muted hover:text-primary-500"
        title="Cronometrar este bloque"
      >
        <Play className="h-3.5 w-3.5" />
      </button>
      <button onClick={onEditar} className="btn-ghost h-7 w-7 shrink-0 p-0 text-muted hover:text-fg" title="Editar">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={onEliminar} className="btn-ghost h-7 w-7 shrink-0 p-0 text-red-500 hover:bg-red-500/10" title="Eliminar">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function BloqueModal({
  open, onClose, bloque, metasMes,
}: {
  open: boolean
  onClose: () => void
  bloque: HorarioBloque | null
  metasMes: Goal[]
}) {
  const crear = useCrearBloque()
  const actualizar = useActualizarBloque()

  const [titulo, setTitulo] = useState(bloque?.titulo ?? '')
  const [descripcion, setDescripcion] = useState(bloque?.descripcion ?? '')
  const [inicio, setInicio] = useState(bloque?.horaInicio ?? '08:00')
  const [fin, setFin] = useState(bloque?.horaFin ?? '09:00')
  const [dias, setDias] = useState<number[]>(bloque?.diasSemana ?? [1, 2, 3, 4, 5])
  const [goalId, setGoalId] = useState(bloque?.goalId ?? '')
  const [aporte, setAporte] = useState(String(bloque?.aporte ?? 1))
  const [activo, setActivo] = useState(bloque?.activo ?? true)
  const [clave, setClave] = useState('')

  // El modal se reutiliza para crear y editar; al cambiar de bloque hay que
  // resembrar los campos (sin useEffect: comparando la clave del render).
  const claveActual = bloque?.id ?? 'nuevo'
  if (open && clave !== claveActual) {
    setClave(claveActual)
    setTitulo(bloque?.titulo ?? '')
    setDescripcion(bloque?.descripcion ?? '')
    setInicio(bloque?.horaInicio ?? '08:00')
    setFin(bloque?.horaFin ?? '09:00')
    setDias(bloque?.diasSemana ?? [1, 2, 3, 4, 5])
    setGoalId(bloque?.goalId ?? '')
    setAporte(String(bloque?.aporte ?? 1))
    setActivo(bloque?.activo ?? true)
  }

  const pendiente = crear.isPending || actualizar.isPending

  const guardar = () => {
    if (!titulo.trim()) { toast.error('Escribe un nombre para el bloque'); return }
    if (fin <= inicio) { toast.error('La hora de fin debe ser posterior a la de inicio'); return }
    if (dias.length === 0) { toast.error('Elige al menos un día'); return }

    const ok = () => { toast.success(bloque ? 'Bloque actualizado' : 'Bloque creado'); setClave(''); onClose() }
    const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar el bloque')
    const aporteNum = Number(aporte) || 0

    if (bloque) {
      actualizar.mutate(
        {
          id: bloque.id,
          titulo: titulo.trim(),
          descripcion,
          horaInicio: inicio,
          horaFin: fin,
          diasSemana: dias,
          goalId: goalId || null,
          aporte: aporteNum,
          activo,
        },
        { onSuccess: ok, onError: fail },
      )
    } else {
      crear.mutate(
        {
          titulo: titulo.trim(),
          descripcion: descripcion.trim() || undefined,
          horaInicio: inicio,
          horaFin: fin,
          diasSemana: dias,
          goalId: goalId || undefined,
          aporte: aporteNum,
        },
        { onSuccess: ok, onError: fail },
      )
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={bloque ? 'Editar bloque' : 'Nuevo bloque de horario'}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Nombre del bloque</label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Prospección" autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Descripción (opcional)</label>
          <AutoTextarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué se hace exactamente en este rato: listas, guion, herramienta…"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Desde</label>
            <Input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Hasta</label>
            <Input type="time" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs text-muted">Días en que se repite</p>
          <div className="flex gap-1">
            {DIAS_SEMANA.map((d) => {
              const on = dias.includes(d.iso)
              return (
                <button
                  key={d.iso}
                  type="button"
                  title={d.label}
                  onClick={() => setDias((prev) => on ? prev.filter((x) => x !== d.iso) : [...prev, d.iso].sort())}
                  className={cn(
                    'h-8 w-8 rounded-lg border text-xs font-medium transition',
                    on ? 'border-primary-500 bg-primary-500 text-white' : 'border-border text-muted hover:text-fg',
                  )}
                >
                  {d.corto}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-border p-3">
          <label className="block text-xs text-muted">Meta que alimenta (opcional)</label>
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Ninguna — el bloque sólo se marca</option>
            {metasMes.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nombre}{g.unidad ? ` (${g.unidad})` : ''}
              </option>
            ))}
          </Select>
          {goalId && (
            <div>
              <label className="mb-1 block text-xs text-muted">Cuánto suma al completarlo</label>
              <Input value={aporte} onChange={(e) => setAporte(e.target.value)} inputMode="decimal" className="w-28" />
              <p className="mt-1 text-[11px] text-muted">
                Se suma a la meta diaria de esa fecha. Al desmarcar el bloque se resta igual.
              </p>
            </div>
          )}
        </div>

        {bloque && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-primary-500" />
            Bloque activo
          </label>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar'}</Button>
        </div>
      </div>
    </Modal>
  )
}
