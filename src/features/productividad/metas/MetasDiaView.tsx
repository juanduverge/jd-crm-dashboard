import { useMemo, useState } from 'react'
import { addDays, isToday } from 'date-fns'
import toast from 'react-hot-toast'
import { Check, ChevronLeft, ChevronRight, Circle, ListChecks, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { cn } from '@/lib/utils'
import { useEliminarMeta, useGoals, useRegistrarAvance, useTareas } from '@/hooks/useData'
import { EditarMetaModal } from './EditarMetaModal'
import { NuevaMetaModal } from './NuevaMetaModal'
import {
  filtrarPorPeriodo, fmtDia, fmtNum, iso, progreso, valorProgreso, rangoConsulta, tonoProgreso,
} from '../shared/goalMeta'
import type { Goal } from '@/types'

/**
 * Metas del día: el checklist que se abre a las 8am. Filas compactas con el
 * contador a la vista y +/− a un clic — nada de tarjetas grandes, aquí lo que
 * importa es ver de un vistazo qué toca hoy.
 */
export function MetasDiaView() {
  const [ref, setRef] = useState(() => new Date())
  const [nueva, setNueva] = useState(false)

  const fecha = iso(ref)
  const consulta = rangoConsulta(ref)
  const { data: goals, isLoading, isError } = useGoals(consulta.desde, consulta.hasta)
  const { data: tareas } = useTareas()

  const metas = useMemo(
    () => filtrarPorPeriodo(goals, 'dia', fecha, fecha),
    [goals, fecha],
  )

  const tareasHoy = useMemo(
    () => (tareas ?? []).filter((t) => t.estado !== 'hecha' && t.fechaVencimiento === fecha),
    [tareas, fecha],
  )

  const hechas = metas.filter((g) => progreso(g) >= 100).length

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
        {metas.length > 0 && (
          <span className="text-xs text-muted">{hechas} de {metas.length} completadas</span>
        )}
        <Button className="ml-auto" onClick={() => setNueva(true)}>
          <Plus className="h-4 w-4" /> Meta suelta
        </Button>
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}

      {isError && !isLoading && (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="No se pudieron cargar las metas del día"
          description="Comprueba que la migración 0015 esté aplicada en Supabase."
        />
      )}

      {!isLoading && !isError && metas.length === 0 && (
        <EmptyState
          icon={<ListChecks className="h-8 w-8" />}
          title="Nada programado para este día"
          description="Las metas diarias salen solas de la meta del mes. Si este día no es laborable en tu reparto, no aparece nada."
        />
      )}

      {metas.length > 0 && (
        <div className="card divide-y divide-border overflow-hidden p-0">
          {metas.map((g) => <FilaMetaDia key={g.id} goal={g} />)}
        </div>
      )}

      {tareasHoy.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Tareas con vencimiento hoy
          </p>
          <div className="card divide-y divide-border overflow-hidden p-0">
            {tareasHoy.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <Circle className="h-4 w-4 shrink-0 text-muted" />
                <p className="min-w-0 flex-1 truncate text-sm text-fg" title={t.titulo}>{t.titulo}</p>
                {t.leadNombre && <span className="shrink-0 text-xs text-muted">{t.leadNombre}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <NuevaMetaModal
        open={nueva}
        onClose={() => setNueva(false)}
        mes={ref}
        periodo="dia"
        rango={{ desde: fecha, hasta: fecha }}
      />
    </div>
  )
}

function FilaMetaDia({ goal }: { goal: Goal }) {
  const avance = useRegistrarAvance()
  const eliminar = useEliminarMeta()
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const pct = progreso(goal)
  const valor = valorProgreso(goal)
  const esToggle = goal.tipo === 'toggle'
  const hecho = esToggle ? valor >= 1 : pct >= 100
  // Una meta automática no se toca a mano: la alimentan las acciones del CRM.
  const auto = !!goal.metrica

  const sumar = (delta: number) =>
    avance.mutate({ id: goal.id, delta }, {
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo registrar el avance'),
    })

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {/* En un contador el círculo es un indicador: el progreso se mueve con
          +/−, no marcando la fila. En un toggle sí es el interruptor. */}
      {esToggle ? (
        <button
          onClick={() => sumar(hecho ? -1 : 1)}
          disabled={avance.isPending || auto}
          className="shrink-0"
          title={hecho ? 'Desmarcar' : 'Marcar como hecho'}
        >
          {hecho
            ? <Check className="h-5 w-5 rounded-full bg-green-500 p-0.5 text-white" />
            : <Circle className="h-5 w-5 text-muted hover:text-primary-500" />}
        </button>
      ) : (
        <span className="shrink-0" title={hecho ? 'Objetivo alcanzado' : 'En progreso'}>
          {hecho
            ? <Check className="h-5 w-5 rounded-full bg-green-500 p-0.5 text-white" />
            : <Circle className="h-5 w-5 text-muted" />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', hecho ? 'text-muted line-through' : 'font-medium text-fg')} title={goal.nombre}>
          {goal.nombre}
        </p>
        {!esToggle && (
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-28 overflow-hidden rounded-full bg-surface-2">
              <div className={cn('h-full rounded-full transition-all', tonoProgreso(pct))} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-muted">
              {fmtNum(valor)} / {fmtNum(goal.target)}{goal.unidad ? ` ${goal.unidad}` : ''}
            </span>
          </div>
        )}
      </div>

      {/* Editar / eliminar también aquí: el día es la vista de entrada por
          defecto, y hasta ahora obligaba a subir a semana o mes sólo para
          corregir una errata o quitar una meta suelta. */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={() => setEditando(true)}
          className="btn-ghost h-8 w-8 rounded-lg p-0 text-muted hover:text-fg"
          title="Editar meta"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {/* Sólo las metas SUELTAS se borran desde el día: una meta diaria de
            una cascada es un trozo del reparto mensual, y borrarla aquí
            dejaría el mes descuadrado. Esa se elimina desde su meta madre. */}
        {!goal.parentId && (
          <button
            onClick={() => setBorrando(true)}
            className="btn-ghost h-8 w-8 rounded-lg p-0 text-red-500 hover:bg-red-500/10"
            title="Eliminar meta"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!esToggle && !auto && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => sumar(-1)}
            disabled={avance.isPending || valor <= 0}
            className="btn-ghost h-8 w-8 rounded-lg border border-border p-0 disabled:opacity-40"
            title="Restar 1"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => sumar(1)}
            disabled={avance.isPending}
            className="btn-ghost h-8 w-8 rounded-lg border border-border p-0"
            title="Sumar 1"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <EditarMetaModal goal={goal} open={editando} onClose={() => setEditando(false)} />
      <ConfirmDeleteModal
        open={borrando}
        onClose={() => setBorrando(false)}
        title="Eliminar meta"
        itemLabel={goal.nombre}
        onConfirm={async () => {
          await eliminar.mutateAsync(goal.id)
          toast.success('Meta eliminada')
          setBorrando(false)
        }}
      />
    </div>
  )
}
