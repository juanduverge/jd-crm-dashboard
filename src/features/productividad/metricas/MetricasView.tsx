import { useMemo, useState } from 'react'
import { addMonths, format, getISODay, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  AlertTriangle, BarChart3, CalendarCheck, CheckSquare, ChevronLeft, ChevronRight, Clock,
  Target, Timer, Users,
} from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import {
  BrandTooltip, ChartGradients, axisTick, gridProps,
} from '@/components/charts/chartTheme'
import {
  useEntradasDelRango, useGoals, usePlanDelRango, useResumenTiempo, useTareas,
} from '@/hooks/useData'
import {
  desdeIso, diasDelRango, filtrarPorPeriodo, fmtMes, fmtNum, progreso, rangoConsulta,
  rangoMes, tonoProgreso, valorProgreso,
} from '../shared/goalMeta'
import { duracionBloqueSeg, fmtDuracion } from '../tiempo/tiempoMeta'
import { PanelComercial } from './PanelComercial'
import type { Goal } from '@/types'

/**
 * Métricas — el mes visto por detrás: cuántas horas se midieron, en qué días
 * cayeron y qué parte de ellas fue a parar a una meta.
 *
 * Dos fuentes que se cruzan pero no se mezclan:
 *
 * - `v_tiempo_diario` dice dónde se fue el tiempo (sólo tramos cerrados).
 * - `goals` dice qué se consiguió.
 *
 * - `tasks` dice qué se cerró y qué se quedó por el camino.
 *
 * No se suman ni se derivan una de otra a propósito: el tiempo mide, no puntúa
 * (ver la 0016). Que una meta vaya al 100% con pocas horas es información, no
 * un error de cuadre.
 *
 * Lo que no se cumplió sale con el mismo peso que lo que sí: un panel que sólo
 * enseña lo conseguido no sirve para corregir nada.
 */
export function MetricasView() {
  const [ref, setRef] = useState(() => new Date())

  const rango = rangoMes(ref)
  const consulta = rangoConsulta(ref)

  const tiempo = useResumenTiempo(rango.desde, rango.hasta)
  const tramos = useEntradasDelRango(rango.desde, rango.hasta)
  const { data: goals, isLoading: cargandoMetas } = useGoals(consulta.desde, consulta.hasta)
  const { data: tareas } = useTareas()
  const planRango = usePlanDelRango(rango.desde, rango.hasta)

  const filas = tiempo.data ?? []

  /** Totales del mes y horas por día, en una sola pasada. */
  const resumen = useMemo(() => {
    const porDia = new Map<string, number>()
    const porMeta = new Map<string, { nombre: string; segundos: number }>()
    let segundos = 0
    let segundosConMeta = 0
    let entradas = 0

    for (const f of filas) {
      segundos += f.segundos
      entradas += f.entradas
      porDia.set(f.fecha, (porDia.get(f.fecha) ?? 0) + f.segundos)

      if (f.goalId) {
        segundosConMeta += f.segundos
        const prev = porMeta.get(f.goalId)
        porMeta.set(f.goalId, {
          nombre: prev?.nombre ?? f.goalNombre ?? 'Meta',
          segundos: (prev?.segundos ?? 0) + f.segundos,
        })
      }
    }

    // Jornadas: días con tiempo medido, no días del mes. La media por jornada
    // sólo tiene sentido sobre los días que se trabajaron.
    const jornadas = [...porDia.values()].filter((s) => s > 0).length

    return {
      segundos,
      segundosConMeta,
      entradas,
      jornadas,
      media: jornadas > 0 ? Math.round(segundos / jornadas) : 0,
      pctConMeta: segundos > 0 ? Math.round((segundosConMeta / segundos) * 100) : 0,
      porDia,
      porMeta,
    }
  }, [filas])

  /**
   * El PLAN: lo que el horario dice que debería pasar cada día del mes.
   *
   * La plantilla de `horario_bloques` no guarda fechas, sino días de la semana,
   * así que el plan de un mes concreto hay que proyectarlo: por cada día del
   * rango se suman los bloques activos cuyo `diasSemana` incluye ese ISO dow.
   *
   * El cumplimiento sólo se mide hasta HOY. Contar como incumplidos los bloques
   * de días que aún no han llegado convertiría el día 1 de cada mes en un 3%.
   */
  const plan = useMemo(() => {
    const bloques = (planRango.data?.bloques ?? []).filter((b) => b.activo)
    const hechos = new Set(
      (planRango.data?.completados ?? []).map((c) => `${c.fecha}|${c.bloqueId}`),
    )
    const hoy = format(new Date(), 'yyyy-MM-dd')

    const porDia = new Map<string, number>()
    let previstos = 0
    let cumplidos = 0
    let segundosPrevistos = 0

    for (const d of diasDelRango(rango.desde, rango.hasta)) {
      const clave = format(d, 'yyyy-MM-dd')
      const dow = getISODay(d)
      let seg = 0
      for (const b of bloques) {
        if (!b.diasSemana.includes(dow)) continue
        seg += duracionBloqueSeg(b.horaInicio, b.horaFin)
        if (clave <= hoy) {
          previstos += 1
          if (hechos.has(`${clave}|${b.id}`)) cumplidos += 1
        }
      }
      porDia.set(clave, seg)
      if (clave <= hoy) segundosPrevistos += seg
    }

    return {
      porDia,
      previstos,
      cumplidos,
      segundosPrevistos,
      pctBloques: previstos > 0 ? Math.round((cumplidos / previstos) * 100) : 0,
      // Horas reales sobre horas planificadas. Puede pasar del 100%: se trabajó
      // más de lo previsto, que también es una desviación del plan.
      pctHoras: segundosPrevistos > 0
        ? Math.round((resumen.segundos / segundosPrevistos) * 100)
        : 0,
    }
  }, [planRango.data, rango.desde, rango.hasta, resumen.segundos])

  /** Serie del gráfico: todos los días del mes, también los de cero. */
  const serie = useMemo(
    () =>
      diasDelRango(rango.desde, rango.hasta).map((d) => {
        const clave = format(d, 'yyyy-MM-dd')
        return {
          dia: format(d, 'd'),
          fecha: clave,
          horas: Math.round(((resumen.porDia.get(clave) ?? 0) / 3600) * 100) / 100,
          plan: Math.round(((plan.porDia.get(clave) ?? 0) / 3600) * 100) / 100,
        }
      }),
    [rango.desde, rango.hasta, resumen.porDia, plan.porDia],
  )

  /**
   * Desglose por responsable. `responsable` es texto libre en este módulo, así
   * que se normaliza para agrupar; sin él, todo cae en «Sin asignar», que es
   * información y no un error: dice cuánto del mes no tiene dueño.
   */
  const porResponsable = useMemo(() => {
    const SIN = 'Sin asignar'
    const m = new Map<
      string,
      { etiqueta: string; segundos: number; dias: Set<string>; metas: number; cumplidas: number }
    >()
    const dame = (bruto?: string) => {
      const etiqueta = bruto?.trim() || SIN
      const clave = etiqueta.toLowerCase()
      let v = m.get(clave)
      if (!v) {
        v = { etiqueta, segundos: 0, dias: new Set(), metas: 0, cumplidas: 0 }
        m.set(clave, v)
      }
      return v
    }

    for (const f of filas) {
      const v = dame(f.responsable)
      v.segundos += f.segundos
      if (f.segundos > 0) v.dias.add(f.fecha)
    }
    // Las metas del mes se cuentan aparte del tiempo: alguien puede cumplir sus
    // metas sin haber cronometrado un solo minuto (ver la 0016).
    for (const g of filtrarPorPeriodo(goals, 'mes', rango.desde, rango.hasta)) {
      const v = dame(g.responsable)
      v.metas += 1
      if (valorProgreso(g) >= g.target) v.cumplidas += 1
    }

    return [...m.values()]
      .map((v) => ({ ...v, jornadas: v.dias.size }))
      .sort((a, b) => b.segundos - a.segundos || b.metas - a.metas)
  }, [filas, goals, rango.desde, rango.hasta])

  /** Metas del mes cruzadas con las horas que se les dedicaron. */
  const metasDelMes = useMemo(() => {
    const metas = filtrarPorPeriodo(goals, 'mes', rango.desde, rango.hasta)
    return metas
      .map((g) => ({ goal: g, segundos: resumen.porMeta.get(g.id)?.segundos ?? 0 }))
      .sort((a, b) => b.segundos - a.segundos)
  }, [goals, rango.desde, rango.hasta, resumen.porMeta])

  /**
   * Horas que fueron a metas que NO son del mes visible (semanales sueltas,
   * metas de otro mes). Se muestran aparte para que el desglose cuadre con el
   * total sin fingir que pertenecen al mes.
   */
  const otrasMetas = useMemo(() => {
    const delMes = new Set(metasDelMes.map((m) => m.goal.id))
    return [...resumen.porMeta.entries()]
      .filter(([id]) => !delMes.has(id))
      .reduce((acc, [, v]) => acc + v.segundos, 0)
  }, [metasDelMes, resumen.porMeta])

  /**
   * Lo que más tiempo se llevó, agrupado por descripción (normalizada a
   * minúsculas: "Prospección" y "prospección" son lo mismo, y quien lo escribe
   * no está pensando en mayúsculas). Se guarda la primera forma escrita para
   * enseñarla tal cual.
   */
  const topActividades = useMemo(() => {
    const m = new Map<string, { etiqueta: string; segundos: number; tramos: number }>()
    for (const t of tramos.data ?? []) {
      const clave = t.descripcion.trim().toLowerCase()
      if (!clave) continue
      const prev = m.get(clave)
      m.set(clave, {
        etiqueta: prev?.etiqueta ?? t.descripcion.trim(),
        segundos: (prev?.segundos ?? 0) + (t.duracionSeg ?? 0),
        tramos: (prev?.tramos ?? 0) + 1,
      })
    }
    return [...m.values()].sort((a, b) => b.segundos - a.segundos).slice(0, 8)
  }, [tramos.data])

  /** Tareas cerradas dentro del mes, según el sello `completada_en` (0017). */
  const tareasCumplidas = useMemo(
    () => (tareas ?? []).filter(
      (t) => t.completadaEn && t.completadaEn.slice(0, 10) >= rango.desde
        && t.completadaEn.slice(0, 10) <= rango.hasta,
    ),
    [tareas, rango.desde, rango.hasta],
  )

  /**
   * Lo que no salió. Dos cosas distintas que se leen juntas:
   *
   * - Metas diarias del mes ya vencidas que no llegaron a su objetivo.
   * - Tareas vencidas dentro del mes que siguen sin cerrarse.
   *
   * Sólo se miran días ya pasados: una meta de mañana no está fallada, está
   * pendiente, y mezclarlas convertiría el panel en una alarma permanente.
   */
  const fallado = useMemo(() => {
    const hoy = format(new Date(), 'yyyy-MM-dd')
    const limite = rango.hasta < hoy ? rango.hasta : hoy

    const metas = filtrarPorPeriodo(goals, 'dia', rango.desde, rango.hasta)
      .filter((g: Goal) => g.fechaFin < limite && valorProgreso(g) < g.target)
      .sort((a, b) => (a.fechaFin < b.fechaFin ? 1 : -1))

    const pendientes = (tareas ?? []).filter(
      (t) => t.estado !== 'hecha' && t.fechaVencimiento
        && t.fechaVencimiento >= rango.desde && t.fechaVencimiento < limite,
    )

    // Cuánto se dejó de hacer, no cuántas metas fallaron: 20 llamadas de 100
    // y 99 de 100 no son el mismo problema.
    const deficit = metas.reduce((acc, g) => acc + Math.max(0, g.target - valorProgreso(g)), 0)

    return { metas, pendientes, deficit }
  }, [goals, tareas, rango.desde, rango.hasta])

  const esActual = isSameMonth(ref, new Date())
  const sinDatos = !tiempo.isLoading && filas.length === 0

  return (
    <div className="space-y-4">
      {/* Navegador de mes */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setRef((d) => addMonths(d, -1))}
            className="btn-ghost h-8 w-8 rounded-lg border border-border p-0"
            aria-label="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setRef((d) => addMonths(d, 1))}
            className="btn-ghost h-8 w-8 rounded-lg border border-border p-0"
            aria-label="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-semibold capitalize text-fg">{fmtMes(ref)}</p>
        {esActual ? (
          <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[10px] font-medium text-primary-600 dark:text-primary-300">
            Mes actual
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setRef(new Date())}>
            Este mes
          </Button>
        )}
      </div>

      {/* Actividad comercial — se pinta ANTES del tiempo porque es la pregunta
          principal del CRM: qué se hizo con los leads. El análisis de tiempo
          contra el horario sigue debajo, intacto. */}
      <PanelComercial mes={ref} esActual={esActual} />

      <div className="flex items-center gap-2 pt-2">
        <Clock className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Tiempo y cumplimiento del horario</h3>
      </div>

      {/* KPIs */}
      {tiempo.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Tiempo medido"
            valor={fmtDuracion(resumen.segundos)}
            pie={`${resumen.entradas} ${resumen.entradas === 1 ? 'tramo' : 'tramos'} en el mes`}
          />
          <Kpi
            label="Jornadas con registro"
            valor={String(resumen.jornadas)}
            pie={`de ${serie.length} días del mes`}
          />
          <Kpi
            label="Media por jornada"
            valor={resumen.jornadas ? fmtDuracion(resumen.media) : '—'}
            pie="Sólo cuenta los días trabajados"
          />
          <Kpi
            label="Tiempo con meta"
            valor={`${resumen.pctConMeta}%`}
            pie={`${fmtDuracion(resumen.segundosConMeta)} ligados a un objetivo`}
          />
          <Kpi
            label="Tareas cumplidas"
            valor={String(tareasCumplidas.length)}
            pie={
              fallado.pendientes.length
                ? `${fallado.pendientes.length} vencidas sin cerrar`
                : 'Ninguna vencida sin cerrar'
            }
          />
        </div>
      )}

      {sinDatos && (
        <EmptyState
          icon={<Clock className="h-8 w-8" />}
          title="Sin tiempo registrado este mes"
          description="Arranca el cronómetro en Tiempo (o desde un bloque del horario) y este panel se llena solo. Sólo cuentan los tramos cerrados."
        />
      )}

      {!sinDatos && (
        <>
          {/* Horas por día */}
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted" />
              <h3 className="text-sm font-semibold text-fg">Horas por día</h3>
              <span className="ml-auto flex items-center gap-3 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-sm bg-primary-400" /> Real
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3 rounded-full bg-muted" /> Plan
                </span>
                <span>Total {fmtDuracion(resumen.segundos)}</span>
              </span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={serie} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <ChartGradients />
                  <CartesianGrid vertical={false} {...gridProps} />
                  <XAxis dataKey="dia" tick={axisTick} tickLine={false} axisLine={false} interval={1} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} unit="h" />
                  <Tooltip
                    cursor={{ fill: 'rgb(var(--muted) / 0.08)' }}
                    content={
                      <BrandTooltip
                        labelFormatter={(l) => {
                          const f = serie.find((s) => s.dia === String(l))
                          return f
                            ? format(desdeIso(f.fecha), "EEEE d 'de' LLLL", { locale: es })
                            : String(l)
                        }}
                        valueFormatter={(v) => `${fmtNum(Number(v))} h`}
                      />
                    }
                  />
                  <Bar dataKey="horas" name="Horas" fill="url(#gradCoral)" radius={[6, 6, 0, 0]} maxBarSize={26} />
                  {/* El plan va detrás como línea: es la referencia, no el dato. */}
                  <Line
                    type="stepAfter"
                    dataKey="plan"
                    name="Plan"
                    stroke="rgb(var(--muted))"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    activeDot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Metas del mes vs horas dedicadas */}
          <div className="card">
            <div className="mb-4 flex items-center gap-2">
              <Target className="h-4 w-4 text-muted" />
              <h3 className="text-sm font-semibold text-fg">Metas del mes y horas dedicadas</h3>
            </div>

            {cargandoMetas && <Skeleton className="h-24 w-full" />}

            {!cargandoMetas && metasDelMes.length === 0 && (
              <p className="py-6 text-center text-sm text-muted">
                No hay metas mensuales en {fmtMes(ref)}.
              </p>
            )}

            {!cargandoMetas && metasDelMes.length > 0 && (
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted">
                      <th className="px-4 pb-2 font-medium">Meta</th>
                      <th className="px-4 pb-2 text-right font-medium">Progreso</th>
                      <th className="px-4 pb-2 text-right font-medium">Tiempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metasDelMes.map(({ goal, segundos }) => {
                      const pct = progreso(goal)
                      return (
                        <tr key={goal.id} className="row-hover border-b border-border/60 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium text-fg">{goal.nombre}</p>
                            <p className="text-xs text-muted">
                              {fmtNum(valorProgreso(goal))} / {fmtNum(goal.target)}
                              {goal.unidad ? ` ${goal.unidad}` : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="ml-auto flex w-32 items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className={`h-full rounded-full ${tonoProgreso(pct)}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-9 text-right text-xs tabular-nums text-muted">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-fg">
                            {segundos > 0 ? fmtDuracion(segundos) : <span className="text-muted">—</span>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {otrasMetas > 0 && (
              <p className="pt-3 text-xs text-muted">
                Otras {fmtDuracion(otrasMetas)} fueron a metas que no son mensuales de este mes
                (semanales sueltas o de otro periodo).
              </p>
            )}
          </div>

          {/* En qué se fue el mes, actividad por actividad */}
          {topActividades.length > 0 && (
            <div className="card">
              <div className="mb-4 flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted" />
                <h3 className="text-sm font-semibold text-fg">Lo que más tiempo se llevó</h3>
                <span className="ml-auto text-xs text-muted">Top {topActividades.length}</span>
              </div>
              <ul className="space-y-2.5">
                {topActividades.map((a) => {
                  const pct = resumen.segundos > 0
                    ? Math.round((a.segundos / resumen.segundos) * 100)
                    : 0
                  return (
                    <li key={a.etiqueta}>
                      <div className="flex items-baseline gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg" title={a.etiqueta}>
                          {a.etiqueta}
                        </span>
                        <span className="shrink-0 tabular-nums text-fg">{fmtDuracion(a.segundos)}</span>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full rounded-full bg-primary-400" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {a.tramos} {a.tramos === 1 ? 'tramo' : 'tramos'}
                      </p>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </>
      )}

      {/* Plan contra realidad — no depende del tiempo medido, sólo del horario */}
      {plan.previstos > 0 && (
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-muted" />
            <h3 className="text-sm font-semibold text-fg">Plan contra realidad</h3>
            <span className="ml-auto text-xs text-muted">Hasta hoy</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted">Bloques del horario cumplidos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {plan.pctBloques}%
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary-400"
                  style={{ width: `${Math.min(100, plan.pctBloques)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {plan.cumplidos} de {plan.previstos} bloques previstos
              </p>
            </div>

            <div>
              <p className="text-xs text-muted">Horas medidas sobre las planificadas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {plan.segundosPrevistos > 0 ? `${plan.pctHoras}%` : '—'}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary-400"
                  style={{ width: `${Math.min(100, plan.pctHoras)}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted">
                {fmtDuracion(resumen.segundos)} de {fmtDuracion(plan.segundosPrevistos)} previstas
              </p>
            </div>
          </div>

          <p className="pt-3 text-xs text-muted">
            El horario es una plantilla semanal, así que el plan del mes se proyecta día a
            día. Pasar del 100% no es un error: significa que se trabajó más de lo previsto.
          </p>
        </div>
      )}

      {/* Por responsable */}
      {porResponsable.length > 1 && (
        <div className="card">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-muted" />
            <h3 className="text-sm font-semibold text-fg">Por responsable</h3>
          </div>

          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 pb-2 font-medium">Responsable</th>
                  <th className="px-4 pb-2 text-right font-medium">Tiempo</th>
                  <th className="px-4 pb-2 text-right font-medium">Jornadas</th>
                  <th className="px-4 pb-2 text-right font-medium">Metas del mes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porResponsable.map((r) => (
                  <tr key={r.etiqueta}>
                    <td className="px-4 py-2.5">
                      <span className="text-fg">{r.etiqueta}</span>
                      {resumen.segundos > 0 && r.segundos > 0 && (
                        <span className="ml-2 text-xs text-muted">
                          {Math.round((r.segundos / resumen.segundos) * 100)}% del tiempo
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-fg">
                      {r.segundos > 0 ? fmtDuracion(r.segundos) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {r.jornadas || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted">
                      {r.metas ? `${r.cumplidas}/${r.metas}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="pt-3 text-xs text-muted">
            Tiempo y metas se cuentan por separado: se pueden cumplir las metas sin
            cronometrar nada, y al revés.
          </p>
        </div>
      )}

      {/* Lo que no salió — se enseña aunque no haya tiempo registrado */}
      <div className="card">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-muted" />
          <h3 className="text-sm font-semibold text-fg">Lo que no salió</h3>
          {fallado.deficit > 0 && (
            <span className="ml-auto text-xs text-muted">
              {fmtNum(fallado.deficit)} sin hacer en total
            </span>
          )}
        </div>

        {fallado.metas.length === 0 && fallado.pendientes.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nada vencido sin cerrar en {fmtMes(ref)}. Los días que aún no han llegado no
            cuentan como fallados.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Target className="h-3.5 w-3.5" /> Metas diarias no alcanzadas
              </p>
              {fallado.metas.length === 0 ? (
                <p className="text-sm text-muted">Ninguna.</p>
              ) : (
                <ul className="space-y-1.5">
                  {fallado.metas.slice(0, 8).map((g) => (
                    <li key={g.id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
                        {format(desdeIso(g.fechaFin), 'd LLL', { locale: es })}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg" title={g.nombre}>
                        {g.nombre}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-red-600 dark:text-red-400">
                        {fmtNum(g.valorActual)}/{fmtNum(g.target)}
                      </span>
                    </li>
                  ))}
                  {fallado.metas.length > 8 && (
                    <li className="text-xs text-muted">y {fallado.metas.length - 8} más</li>
                  )}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <CheckSquare className="h-3.5 w-3.5" /> Tareas vencidas sin cerrar
              </p>
              {fallado.pendientes.length === 0 ? (
                <p className="text-sm text-muted">Ninguna.</p>
              ) : (
                <ul className="space-y-1.5">
                  {fallado.pendientes.slice(0, 8).map((t) => (
                    <li key={t.id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-14 shrink-0 text-xs tabular-nums text-muted">
                        {t.fechaVencimiento
                          ? format(desdeIso(t.fechaVencimiento), 'd LLL', { locale: es })
                          : '—'}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-fg" title={t.titulo}>
                        {t.titulo}
                      </span>
                    </li>
                  ))}
                  {fallado.pendientes.length > 8 && (
                    <li className="text-xs text-muted">y {fallado.pendientes.length - 8} más</li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Tarjeta de KPI: un número grande y su contexto, sin adornos. */
function Kpi({ label, valor, pie }: { label: string; valor: string; pie: string }) {
  return (
    <div className="card">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold text-fg">{valor}</p>
      <p className="mt-1 text-xs text-muted">{pie}</p>
    </div>
  )
}
