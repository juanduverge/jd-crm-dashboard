import { useEffect, useMemo, useState } from 'react'
import { addDays, isToday } from 'date-fns'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Pencil, Play, Plus, Square, Target, Timer, Trash2,
} from 'lucide-react'
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import {
  useCreateTarea, useEliminarEntradaTiempo, useEntradaAbierta, useEntradasDelDia, useGoals,
  useIniciarTiempo, usePararTiempo, useRegistrarTiempoManual, useTareas,
} from '@/hooks/useData'
import { filtrarPorPeriodo, fmtDia, iso, rangoConsulta } from '../shared/goalMeta'
import { fmtDuracion, fmtHora, fmtReloj, segundosDesde } from './tiempoMeta'
import type { Goal, TimeEntry } from '@/types'

/**
 * Registro de tiempo: en qué se va el día.
 *
 * Mide, no puntúa. Parar el cronómetro no suma a ninguna meta — el avance
 * entra por los +/− de la meta diaria y por los bloques del horario. Si el
 * tiempo fuese una tercera puerta, la misma media hora contaría dos veces.
 *
 * Sólo hay un cronómetro a la vez (lo garantiza la BD, no esta pantalla):
 * arrancar uno nuevo cierra el anterior.
 *
 * El cronómetro NO necesita una tarea: basta con escribir en qué estás. La
 * tarea, la meta y la categoría son tres enganches opcionales e independientes
 * —qué cosa concreta, para qué objetivo y de qué tipo de trabajo— y se pueden
 * usar los tres, uno o ninguno.
 */

/**
 * Categorías sugeridas. Van en el cliente y no en un enum de la BD (ver la
 * migración 0019): la columna es texto libre, así que añadir una aquí no
 * necesita migración y el histórico no se invalida si mañana se quita.
 */
const CATEGORIAS: { valor: string; label: string }[] = [
  { valor: 'desarrollo', label: 'Desarrollo' },
  { valor: 'ventas', label: 'Ventas' },
  { valor: 'marketing', label: 'Marketing' },
  { valor: 'reuniones', label: 'Reuniones' },
  { valor: 'investigacion', label: 'Investigación' },
  { valor: 'aprendizaje', label: 'Aprendizaje' },
  { valor: 'libre', label: 'Tiempo libre' },
]

const etiquetaCategoria = (v?: string): string | undefined =>
  v ? (CATEGORIAS.find((c) => c.valor === v)?.label ?? v) : undefined

export function RegistroTiempoView() {
  const [ref, setRef] = useState(() => new Date())
  const [borrando, setBorrando] = useState<TimeEntry | null>(null)
  const [manual, setManual] = useState(false)

  const responsable = useAuthStore((s) => s.user?.name)
  const fecha = iso(ref)

  const { data: entradas, isLoading, isError } = useEntradasDelDia(fecha)
  const { data: abierta } = useEntradaAbierta(responsable)
  const consulta = rangoConsulta(ref)
  const { data: goals } = useGoals(consulta.desde, consulta.hasta)
  const eliminar = useEliminarEntradaTiempo()

  const metasMes = useMemo(
    () => filtrarPorPeriodo(goals, 'mes', consulta.desde, consulta.hasta),
    [goals, consulta.desde, consulta.hasta],
  )
  const metasPorId = useMemo(() => {
    const m = new Map<string, Goal>()
    for (const g of goals ?? []) m.set(g.id, g)
    return m
  }, [goals])

  // Sólo las cerradas suman: la abierta se cuenta aparte, en vivo.
  const cerradas = useMemo(() => (entradas ?? []).filter((e) => e.fin), [entradas])
  const totalSeg = useMemo(
    () => cerradas.reduce((acc, e) => acc + (e.duracionSeg ?? 0), 0),
    [cerradas],
  )

  return (
    <div className="space-y-4">
      <Cronometro fecha={fecha} abierta={abierta ?? null} metasMes={metasMes} responsable={responsable} />

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
        {totalSeg > 0 && (
          <span className="text-xs text-muted">
            {fmtDuracion(totalSeg)} registrados en {cerradas.length} {cerradas.length === 1 ? 'tramo' : 'tramos'}
          </span>
        )}
        <Button className="ml-auto" variant="outline" onClick={() => setManual(true)}>
          <Plus className="h-4 w-4" /> Añadir a mano
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}

      {isError && !isLoading && (
        <EmptyState
          icon={<Timer className="h-8 w-8" />}
          title="No se pudo cargar el registro de tiempo"
          description="Comprueba que la migración 0016 esté aplicada en Supabase."
        />
      )}

      {!isLoading && !isError && (entradas ?? []).length === 0 && (
        <EmptyState
          icon={<Timer className="h-8 w-8" />}
          title="Nada registrado este día"
          description="Arranca el cronómetro al empezar algo, o añade el tramo a mano si se te olvidó."
        />
      )}

      {(entradas ?? []).length > 0 && (
        <div className="card divide-y divide-border overflow-hidden p-0">
          {(entradas ?? []).map((e) => (
            <FilaEntrada
              key={e.id}
              entrada={e}
              meta={e.goalId ? metasPorId.get(e.goalId) : undefined}
              onEliminar={() => setBorrando(e)}
            />
          ))}
        </div>
      )}

      <EntradaManualModal
        open={manual}
        onClose={() => setManual(false)}
        fecha={fecha}
        metasMes={metasMes}
        responsable={responsable}
      />

      <ConfirmDeleteModal
        open={!!borrando}
        onClose={() => setBorrando(null)}
        title="Eliminar tramo"
        itemLabel={borrando?.descripcion}
        message="Desaparece del registro del día. No toca ninguna meta: el tiempo sólo mide."
        onConfirm={async () => {
          if (!borrando) return
          await eliminar.mutateAsync(borrando.id)
          toast.success('Tramo eliminado')
          setBorrando(null)
        }}
      />
    </div>
  )
}

/**
 * El cronómetro. Mientras corre, el reloj se pinta desde `inicio` y no desde
 * un contador local: así sobrevive a un refresco de la página y no se
 * desincroniza si la pestaña queda en segundo plano.
 */
function Cronometro({
  fecha, abierta, metasMes, responsable,
}: {
  fecha: string
  abierta: TimeEntry | null
  metasMes: Goal[]
  responsable?: string
}) {
  const [descripcion, setDescripcion] = useState('')
  const [goalId, setGoalId] = useState('')
  const [categoria, setCategoria] = useState('')
  const [taskId, setTaskId] = useState('')
  const [nuevaTarea, setNuevaTarea] = useState(false)
  const [ahora, setAhora] = useState(() => Date.now())

  const iniciar = useIniciarTiempo()
  const parar = usePararTiempo()
  const crearTarea = useCreateTarea()
  const { data: tareas } = useTareas()

  /** Sólo las que siguen vivas: arrancar el reloj sobre algo ya hecho no tiene sentido. */
  const pendientes = useMemo(
    () => (tareas ?? []).filter((t) => t.estado !== 'hecha'),
    [tareas],
  )

  useEffect(() => {
    if (!abierta) return
    const t = setInterval(() => setAhora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [abierta])

  const limpiar = () => {
    setDescripcion(''); setGoalId(''); setCategoria(''); setTaskId('')
  }

  /**
   * Pulsar una categoría también rellena la descripción si está vacía: el caso
   * frecuente es "voy a estar en reuniones" y no debería costar dos gestos.
   * Si ya has escrito algo, no se toca lo que escribiste.
   */
  const elegirCategoria = (c: { valor: string; label: string }) => {
    const quitando = categoria === c.valor
    setCategoria(quitando ? '' : c.valor)
    if (!quitando && !descripcion.trim()) setDescripcion(c.label)
  }

  const elegirTarea = (id: string) => {
    setTaskId(id)
    const t = pendientes.find((x) => x.id === id)
    if (!t) return
    // La tarea manda sobre el texto: si estás midiendo una tarea concreta, el
    // registro debe llamarse como ella para que luego cuadren las métricas.
    setDescripcion(t.titulo)
    if (t.goalId) setGoalId(t.goalId)
  }

  const arrancar = (extra?: { descripcion?: string; taskId?: string }) => {
    const texto = (extra?.descripcion ?? descripcion).trim()
    if (!texto) { toast.error('¿En qué vas a trabajar?'); return }
    iniciar.mutate(
      {
        descripcion: texto,
        fecha,
        goalId: goalId || undefined,
        taskId: extra?.taskId ?? (taskId || undefined),
        categoria: categoria || undefined,
        responsable,
      },
      {
        onSuccess: limpiar,
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo arrancar el cronómetro'),
      },
    )
  }

  const detener = () => {
    parar.mutate(
      { id: abierta?.id, responsable },
      {
        onSuccess: (seg) => toast.success(`${fmtDuracion(seg)} registrados`),
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo parar el cronómetro'),
      },
    )
  }

  if (abierta) {
    const seg = segundosDesde(abierta.inicio, ahora)
    return (
      <div className="card flex flex-wrap items-center gap-4 border-primary-500/40 bg-primary-500/5">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-500 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-primary-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-fg">{abierta.descripcion}</p>
          <p className="text-xs text-muted">Desde las {fmtHora(abierta.inicio)}</p>
        </div>
        <p className="shrink-0 text-2xl font-semibold tabular-nums text-fg">{fmtReloj(seg)}</p>
        <Button onClick={detener} disabled={parar.isPending}>
          <Square className="h-4 w-4" /> {parar.isPending ? 'Parando…' : 'Parar'}
        </Button>
      </div>
    )
  }

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs text-muted">¿En qué vas a trabajar?</label>
          <Input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') arrancar() }}
            placeholder="Prospección de leads"
          />
        </div>
        <div className="w-52">
          <label className="mb-1 block text-xs text-muted">Tarea (opcional)</label>
          <Select
            value={taskId}
            onChange={(e) => {
              if (e.target.value === '__nueva') { setNuevaTarea(true); return }
              elegirTarea(e.target.value)
            }}
          >
            <option value="">Sin tarea</option>
            {pendientes.map((t) => <option key={t.id} value={t.id}>{t.titulo}</option>)}
            <option value="__nueva">+ Crear tarea nueva…</option>
          </Select>
        </div>
        <div className="w-52">
          <label className="mb-1 block text-xs text-muted">Meta (opcional)</label>
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Sin meta</option>
            {metasMes.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </Select>
        </div>
        <Button onClick={() => arrancar()} disabled={iniciar.isPending}>
          <Play className="h-4 w-4" /> {iniciar.isPending ? 'Arrancando…' : 'Empezar'}
        </Button>
      </div>

      {/* Las categorías son atajos, no un campo obligatorio: el cronómetro
          arranca igual sin tocar ninguna. Sirven para que luego Métricas pueda
          decir "el 40% del mes se fue en reuniones", cosa que con la
          descripción libre nunca se podría agrupar. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] text-muted">Categoría:</span>
        {CATEGORIAS.map((c) => (
          <button
            key={c.valor}
            type="button"
            onClick={() => elegirCategoria(c)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
              categoria === c.valor
                ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300'
                : 'border-border text-muted hover:text-fg',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <NuevaTareaRapidaModal
        open={nuevaTarea}
        onClose={() => { setNuevaTarea(false); setTaskId('') }}
        pendiente={crearTarea.isPending || iniciar.isPending}
        onCrear={async (titulo) => {
          const t = await crearTarea.mutateAsync({
            titulo,
            fechaVencimiento: fecha,
            responsable,
          })
          setNuevaTarea(false)
          setTaskId(t.id)
          setDescripcion(titulo)
          // Se arranca en el mismo gesto: quien crea una tarea desde el
          // cronómetro es porque va a empezarla ahora mismo.
          arrancar({ descripcion: titulo, taskId: t.id })
        }}
      />
    </div>
  )
}

/** Crear una tarea sin salir del cronómetro: sólo el título, el resto luego. */
function NuevaTareaRapidaModal({
  open, onClose, onCrear, pendiente,
}: {
  open: boolean
  onClose: () => void
  onCrear: (titulo: string) => Promise<void>
  pendiente: boolean
}) {
  const [titulo, setTitulo] = useState('')

  useEffect(() => { if (open) setTitulo('') }, [open])

  const crear = async () => {
    if (!titulo.trim()) { toast.error('Ponle un título a la tarea'); return }
    try {
      await onCrear(titulo.trim())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la tarea')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva tarea">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">¿Qué vas a hacer?</label>
          <Input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') crear() }}
            placeholder="Preparar la propuesta de Acme"
            autoFocus
          />
          <p className="mt-1 text-[11px] text-muted">
            Se crea en Tareas con vencimiento hoy y el cronómetro arranca sobre ella.
            Prioridad, sección y lead se ajustan luego desde el tablero.
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={pendiente}>Cancelar</Button>
          <Button onClick={crear} disabled={pendiente}>
            {pendiente ? 'Creando…' : 'Crear y empezar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function FilaEntrada({
  entrada, meta, onEliminar,
}: {
  entrada: TimeEntry
  meta?: Goal
  onEliminar: () => void
}) {
  const corriendo = !entrada.fin

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="w-24 shrink-0 text-xs tabular-nums text-muted">
        {fmtHora(entrada.inicio)}{entrada.fin ? `–${fmtHora(entrada.fin)}` : '–…'}
      </span>

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', corriendo ? 'font-medium text-primary-600 dark:text-primary-300' : 'text-fg')}>
          {entrada.descripcion}
        </p>
        {(meta || entrada.categoria) && (
          <p className="flex items-center gap-2 truncate text-xs text-muted">
            {meta && (
              <span className="inline-flex items-center gap-1 truncate">
                <Target className="h-3 w-3 shrink-0" /> {meta.nombre}
              </span>
            )}
            {entrada.categoria && (
              <span className="shrink-0 rounded-full bg-surface-2 px-1.5 py-px text-[10px]">
                {etiquetaCategoria(entrada.categoria)}
              </span>
            )}
          </p>
        )}
      </div>

      {entrada.fuente === 'manual' && (
        <span className="shrink-0 rounded-full bg-muted/10 px-2 py-0.5 text-[10px] text-muted" title="Escrito a mano, no medido">
          <Pencil className="mr-1 inline h-2.5 w-2.5" />a mano
        </span>
      )}

      <span className="w-16 shrink-0 text-right text-sm tabular-nums text-fg">
        {corriendo ? '—' : fmtDuracion(entrada.duracionSeg ?? 0)}
      </span>

      <button onClick={onEliminar} className="btn-ghost h-7 w-7 shrink-0 p-0 text-red-500 hover:bg-red-500/10" title="Eliminar">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Tramo escrito a mano. Las horas se escriben en local (HH:MM del día que se
 * está viendo) y se mandan como instantes completos: la BD guarda
 * timestamptz, y "de 9 a 10" sin día no significa nada.
 */
function EntradaManualModal({
  open, onClose, fecha, metasMes, responsable,
}: {
  open: boolean
  onClose: () => void
  fecha: string
  metasMes: Goal[]
  responsable?: string
}) {
  const registrar = useRegistrarTiempoManual()
  const [descripcion, setDescripcion] = useState('')
  const [desde, setDesde] = useState('09:00')
  const [hasta, setHasta] = useState('10:00')
  const [goalId, setGoalId] = useState('')

  const guardar = () => {
    if (!descripcion.trim()) { toast.error('Escribe qué hiciste'); return }
    if (hasta <= desde) { toast.error('La hora de fin debe ser posterior a la de inicio'); return }

    registrar.mutate(
      {
        descripcion: descripcion.trim(),
        fecha,
        inicio: new Date(`${fecha}T${desde}`).toISOString(),
        fin: new Date(`${fecha}T${hasta}`).toISOString(),
        goalId: goalId || undefined,
        responsable,
      },
      {
        onSuccess: () => {
          toast.success('Tramo añadido')
          setDescripcion('')
          setGoalId('')
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar el tramo'),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Añadir tramo a mano">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">¿Qué hiciste?</label>
          <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Llamadas de seguimiento" autoFocus />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Desde</label>
            <Input type="time" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Hasta</label>
            <Input type="time" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Meta (opcional)</label>
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Sin meta</option>
            {metasMes.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </Select>
          <p className="mt-1 text-[11px] text-muted">
            Enlazar con una meta no le suma progreso: sirve para saber cuánto tiempo le dedicas.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={registrar.isPending}>
            {registrar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
