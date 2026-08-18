import { useMemo, useState } from 'react'
import { addMonths, addWeeks, isSameMonth, isSameWeek } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Target } from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useGoals } from '@/hooks/useData'
import { GoalCard } from './GoalCard'
import { NuevaMetaModal } from './NuevaMetaModal'
import {
  filtrarPorPeriodo, fmtMes, fmtNum, fmtRangoSemana, rangoConsulta, rangoMes, rangoSemana,
  valorProgreso,
} from '../shared/goalMeta'
import type { Goal } from '@/types'

/**
 * Vista de metas de un periodo (mes o semana). Es la misma pantalla: cambian
 * el paso del navegador de fechas y el nivel de la cascada que se muestra.
 *
 * Las metas semanales no se crean aquí en el flujo normal — se generan al
 * crear la mensual. El botón de alta crea una meta SUELTA, para lo puntual
 * que no cuelga de un objetivo del mes.
 */
export function MetasPeriodoView({ periodo }: { periodo: 'mes' | 'semana' }) {
  const [ref, setRef] = useState(() => new Date())
  const [nueva, setNueva] = useState(false)

  const rango = periodo === 'mes' ? rangoMes(ref) : rangoSemana(ref)
  const consulta = rangoConsulta(ref)
  const { data: goals, isLoading, isError } = useGoals(consulta.desde, consulta.hasta)

  const metas = useMemo(
    () => filtrarPorPeriodo(goals, periodo, rango.desde, rango.hasta),
    [goals, periodo, rango.desde, rango.hasta],
  )

  const padres = useMemo(() => {
    const map = new Map<string, Goal>()
    for (const g of goals ?? []) map.set(g.id, g)
    return map
  }, [goals])

  const mover = (dir: -1 | 1) =>
    setRef((d) => (periodo === 'mes' ? addMonths(d, dir) : addWeeks(d, dir)))

  const esActual = periodo === 'mes'
    ? isSameMonth(ref, new Date())
    : isSameWeek(ref, new Date(), { weekStartsOn: 1 })

  const etiqueta = periodo === 'mes' ? fmtMes(ref) : fmtRangoSemana(rango.desde, rango.hasta)

  const totales = metas.reduce(
    (acc, g) => {
      const v = valorProgreso(g)
      if (g.tipo === 'contador') { acc.target += g.target; acc.valor += v }
      else { acc.toggles += 1; acc.togglesHechos += v >= 1 ? 1 : 0 }
      return acc
    },
    { target: 0, valor: 0, toggles: 0, togglesHechos: 0 },
  )
  const pctGlobal = totales.target > 0 ? Math.min(100, Math.round((totales.valor / totales.target) * 100)) : 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => mover(-1)} className="btn-ghost h-8 w-8 rounded-lg border border-border p-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => mover(1)} className="btn-ghost h-8 w-8 rounded-lg border border-border p-0">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-semibold capitalize text-fg">{etiqueta}</p>
        {esActual && (
          <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-600 dark:text-primary-300">
            {periodo === 'mes' ? 'Mes actual' : 'Semana actual'}
          </span>
        )}
        {!esActual && (
          <Button size="sm" variant="ghost" onClick={() => setRef(new Date())}>Hoy</Button>
        )}
        <Button className="ml-auto" onClick={() => setNueva(true)}>
          <Plus className="h-4 w-4" /> {periodo === 'mes' ? 'Nueva meta' : 'Meta suelta'}
        </Button>
      </div>

      {metas.length > 0 && (
        <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
          <div>
            <p className="text-2xl font-bold text-fg">{pctGlobal}%</p>
            <p className="text-xs text-muted">Progreso global del {periodo}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-fg">
              {fmtNum(totales.valor)} <span className="text-muted">/ {fmtNum(totales.target)}</span>
            </p>
            <p className="text-xs text-muted">Suma de las metas con contador</p>
          </div>
          {totales.toggles > 0 && (
            <div>
              <p className="text-sm font-semibold text-fg">{totales.togglesHechos} / {totales.toggles}</p>
              <p className="text-xs text-muted">Metas sí/no completadas</p>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      )}

      {isError && !isLoading && (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title="No se pudieron cargar las metas"
          description="Comprueba que la migración 0015 esté aplicada en Supabase y que la tabla goals tenga permisos."
        />
      )}

      {!isLoading && !isError && metas.length === 0 && (
        <EmptyState
          icon={<Target className="h-8 w-8" />}
          title={periodo === 'mes' ? 'Sin metas este mes' : 'Sin metas esta semana'}
          description={
            periodo === 'mes'
              ? 'Crea una meta mensual con su objetivo y el CRM reparte solo las metas semanales y diarias.'
              : 'Las metas semanales se generan al crear la meta del mes. También puedes añadir una suelta.'
          }
          action={<Button onClick={() => setNueva(true)}><Plus className="h-4 w-4" /> Nueva meta</Button>}
        />
      )}

      {metas.length > 0 && (
        <div className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
          {metas.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              eliminable={periodo === 'mes' || !g.parentId}
              subtitulo={
                periodo === 'semana'
                  ? g.parentId
                    ? `De la meta mensual · ${padres.get(g.parentId)?.nombre ?? ''}`
                    : 'Meta suelta de la semana'
                  : g.tieneHijas ? 'Repartida en semanas y días' : 'Sin cascada'
              }
            />
          ))}
        </div>
      )}

      <NuevaMetaModal
        open={nueva}
        onClose={() => setNueva(false)}
        mes={ref}
        periodo={periodo}
        rango={rango}
      />
    </div>
  )
}
