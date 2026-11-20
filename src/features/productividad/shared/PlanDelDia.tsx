import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { subDays } from 'date-fns'
import toast from 'react-hot-toast'
import { CheckCircle2, Circle, Copy, Plus, Sunrise, Sun, Moon, Target, X, Zap } from 'lucide-react'
import { Button, Input, Select, Skeleton } from '@/components/ui'
import { useCrearMeta, useEliminarMeta, useGoals, useMetricasCrm, useRegistrarAvance } from '@/hooks/useData'
import { METRICA_BY_CLAVE, METRICAS, fmtMetrica } from '@/lib/metricas'
import { cn } from '@/lib/utils'
import type { Goal, MetricaClave, MomentoDia } from '@/types'
import { iso, valorProgreso } from './goalMeta'
import { metasDelMes, ritmoHoy } from './ritmoMeta'

/**
 * El plan de hoy — lo que Juan se propone cada mañana.
 *
 * No es un número fijo: son metas de UN día (goals con periodo 'dia', 0075)
 * que escribe él: «20 llamadas», «5 leads», «terminar la web de X». Si lleva
 * un número y una palabra que el CRM sabe medir («llamadas», «mensajes»,
 * «reuniones»…), se cuenta sola con lo que registra; si no, es una casilla.
 * Cada cosa puede ir a la mañana, la tarde o la noche.
 *
 * Debajo, lo que toca hoy de las metas del mes (el reparto de siempre), para
 * que el plan del día y las metas no vayan cada uno por su lado.
 *
 * Lo usan el Resumen (compacto) y «Mi día» (completo).
 */

const MOMENTOS: { v: MomentoDia; l: string; icon: typeof Sun }[] = [
  { v: 'manana', l: 'Mañana', icon: Sunrise },
  { v: 'tarde', l: 'Tarde', icon: Sun },
  { v: 'noche', l: 'Noche', icon: Moon },
]

/**
 * Palabra → métrica. El orden importa: «llamadas contestadas» tiene que caer
 * en contestadas antes que en llamadas, y «leads nuevos» antes que «leads».
 */
const PALABRAS: [RegExp, MetricaClave][] = [
  [/contestad/i, 'llamadas_contestadas'],
  [/minuto/i, 'minutos_llamada'],
  [/llamad/i, 'llamadas_realizadas'],
  [/whats|wasap|\bwa\b/i, 'contactos_whatsapp'],
  [/correo|e-?mail|mail/i, 'contactos_email'],
  [/mensaje/i, 'mensajes_enviados'],
  [/respuest|respond/i, 'respuestas_recibidas'],
  [/reuni/i, 'reuniones_agendadas'],
  [/propuest|cotizaci/i, 'propuestas_enviadas'],
  [/venta|cerrar|cliente.* nuevo/i, 'leads_ganados'],
  [/(buscar|encontrar|captar|nuevos?).*lead|lead.*(nuevo|buscar|encontr)/i, 'leads_encontrados'],
  [/lead/i, 'leads_contactados'],
  [/contacto|toque|seguimiento/i, 'contactos_realizados'],
  [/tarea/i, 'tareas_completadas'],
]

/** «20 llamadas» → { número: 20, métrica: llamadas_realizadas }. */
export function interpretar(texto: string): { target?: number; metrica?: MetricaClave } {
  const m = texto.trim().match(/^(\d+)\s+(.+)$/)
  if (!m) return {}
  const target = Number(m[1])
  const metrica = PALABRAS.find(([re]) => re.test(m[2]))?.[1]
  return { target: target > 0 ? target : undefined, metrica }
}

const esDelDia = (g: Goal, dia: string) =>
  !g.parentId && g.periodo === 'dia' && g.fechaInicio === dia && g.fechaFin === dia && g.estado !== 'cancelada'

export function PlanDelDia({ hoy, compacto = false }: { hoy: string; compacto?: boolean }) {
  const ayer = iso(subDays(new Date(`${hoy}T12:00:00`), 1))
  const goals = useGoals(ayer, hoy)
  const metricasHoy = useMetricasCrm(hoy, hoy)
  const crear = useCrearMeta()

  const deHoy = useMemo(() => (goals.data ?? []).filter((g) => esDelDia(g, hoy)).sort((a, b) => a.orden - b.orden || (a.creado ?? '').localeCompare(b.creado ?? '')), [goals.data, hoy])
  const deAyer = useMemo(() => (goals.data ?? []).filter((g) => esDelDia(g, ayer)), [goals.data, ayer])
  // Metas de semana o mes con número: lo que toca hoy de cada una.
  const delMes = useMemo(() => metasDelMes(goals.data, hoy).filter((g) => g.periodo !== 'dia'), [goals.data, hoy])

  const hechos = deHoy.filter((g) => valorProgreso(g) >= g.target).length

  const repetirAyer = async () => {
    try {
      for (const g of deAyer) {
        await crear.mutateAsync({
          nombre: g.nombre, tipo: g.tipo, target: g.target, unidad: g.unidad, metrica: g.metrica,
          fechaInicio: hoy, fechaFin: hoy, momento: g.momento,
        })
      }
      toast.success('Plan de ayer copiado a hoy')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo copiar el plan')
    }
  }

  if (goals.isLoading) return <Skeleton className="h-28" />

  const grupos = [
    ...MOMENTOS.map((m) => ({ ...m, items: deHoy.filter((g) => g.momento === m.v) })),
    { v: undefined, l: 'Cuando pueda', icon: Target, items: deHoy.filter((g) => !g.momento) },
  ].filter((x) => x.items.length)

  return (
    <div>
      {deHoy.length > 0 && (
        <p className="mb-2 text-xs text-muted">
          <b className={cn('tabular-nums', hechos === deHoy.length ? 'text-[rgb(var(--ok))]' : 'text-fg')}>{hechos} de {deHoy.length}</b> hechos
          {hechos === deHoy.length && ' · ¡plan cumplido! 🎉'}
        </p>
      )}

      {!deHoy.length && (
        <div className="mb-3 rounded-xl border border-dashed border-border p-3 text-center text-sm text-muted">
          <p>Aún no tienes plan para hoy. Escribe qué quieres conseguir, por ejemplo <b className="text-fg">«20 llamadas»</b> o <b className="text-fg">«terminar la web de Utah»</b>.</p>
          {deAyer.length > 0 && (
            <Button size="sm" variant="outline" className="mt-2" onClick={repetirAyer} disabled={crear.isPending}>
              <Copy className="h-3.5 w-3.5" />Repetir el plan de ayer ({deAyer.length})
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {grupos.map((gr) => (
          <div key={gr.l}>
            {(grupos.length > 1 || gr.v) && (
              <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted"><gr.icon className="h-3 w-3" />{gr.l}</p>
            )}
            <ul className="space-y-1">
              {gr.items.map((g) => <ItemPlan key={g.id} g={g} />)}
            </ul>
          </div>
        ))}
      </div>

      <AnadirAlPlan hoy={hoy} />

      {delMes.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
            De tus metas del mes
            <Link to="/productividad/metas" className="font-medium normal-case tracking-normal text-primary-600 hover:underline">Metas</Link>
          </p>
          <ul className="space-y-2.5">
            {delMes.slice(0, compacto ? 3 : undefined).map((g) => {
              const r = ritmoHoy(g, metricasHoy.data?.periodo)
              const fmt = (v: number) => fmtMetrica(g.metrica, v)
              const pct = r.tocaHoy > 0 && r.hechoHoy != null ? Math.min(100, Math.round((r.hechoHoy / r.tocaHoy) * 100)) : r.falta === 0 ? 100 : 0
              return (
                <li key={g.id}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate text-fg" title={g.nombre}>{g.metrica && <Zap className="mr-1 inline h-3 w-3 text-amber-500" />}{g.nombre}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">
                      {r.falta === 0 ? <span className="font-semibold text-[rgb(var(--ok))]">mes cumplido</span>
                        : !r.laborableHoy ? 'hoy libre'
                          : r.hechoHoy != null ? <><b className="text-fg">{fmt(r.hechoHoy)}</b> / {fmt(r.tocaHoy)} hoy</>
                            : <>toca {fmt(r.tocaHoy)} hoy</>}
                    </span>
                  </div>
                  <Barra pct={pct} />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
      <div className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-[rgb(var(--ok))]' : 'bg-primary-500')} style={{ width: `${pct}%` }} />
    </div>
  )
}

function ItemPlan({ g }: { g: Goal }) {
  const avance = useRegistrarAvance()
  const eliminar = useEliminarMeta()
  const valor = valorProgreso(g)
  const hecho = valor >= g.target
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar')

  const quitar = () => eliminar.mutate(g.id, { onSuccess: () => toast.success('Quitado del plan'), onError: err })
  const botonQuitar = (
    <button type="button" onClick={quitar} aria-label={`Quitar «${g.nombre}» del plan`}
      className="shrink-0 rounded p-1 text-muted/60 hover:bg-surface-2 hover:text-fg">
      <X className="h-3.5 w-3.5" />
    </button>
  )

  if (g.tipo === 'toggle') {
    return (
      <li className="flex items-center gap-2.5 rounded-lg px-1 py-1 row-hover">
        <button type="button" aria-label={hecho ? 'Marcar como pendiente' : 'Marcar como hecho'}
          onClick={() => avance.mutate({ id: g.id, delta: hecho ? -1 : 1 }, { onSuccess: () => { if (!hecho) toast.success('¡Hecho!') }, onError: err })}
          className="shrink-0 text-muted hover:text-[rgb(var(--ok))]">
          {hecho ? <CheckCircle2 className="h-5 w-5 text-[rgb(var(--ok))]" /> : <Circle className="h-5 w-5" />}
        </button>
        <span className={cn('min-w-0 flex-1 text-sm', hecho ? 'text-muted line-through' : 'text-fg')}>{g.nombre}</span>
        {botonQuitar}
      </li>
    )
  }

  const pct = Math.min(100, Math.round((valor / g.target) * 100))
  const fmt = (v: number) => fmtMetrica(g.metrica, v)
  return (
    <li className="rounded-lg px-1 py-1 row-hover">
      <div className="flex items-center gap-2">
        <span className={cn('min-w-0 flex-1 truncate text-sm', hecho ? 'text-[rgb(var(--ok))]' : 'text-fg')} title={g.metrica ? `Se cuenta solo: ${METRICA_BY_CLAVE[g.metrica]?.label}` : undefined}>
          {g.metrica && <Zap className="mr-1 inline h-3 w-3 text-amber-500" />}{g.nombre}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted"><b className="text-fg">{fmt(valor)}</b> / {fmt(g.target)}{hecho ? ' ✓' : ''}</span>
        {!g.metrica && (
          <button type="button" onClick={() => avance.mutate({ id: g.id, delta: 1 }, { onError: err })}
            className="shrink-0 rounded-md border border-border px-1.5 text-xs font-semibold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10" aria-label="Sumar uno">+1</button>
        )}
        {botonQuitar}
      </div>
      <Barra pct={pct} />
    </li>
  )
}

function AnadirAlPlan({ hoy }: { hoy: string }) {
  const crear = useCrearMeta()
  const [texto, setTexto] = useState('')
  const [momento, setMomento] = useState<MomentoDia | undefined>(() => {
    const h = new Date().getHours()
    return h < 12 ? 'manana' : h < 19 ? 'tarde' : 'noche'
  })
  // `undefined` = lo que adivine el texto; 'mano' = forzar a mano.
  const [forzar, setForzar] = useState<MetricaClave | 'mano' | undefined>(undefined)
  const leido = interpretar(texto)
  const metrica = forzar === 'mano' ? undefined : forzar ?? leido.metrica

  const anadir = async () => {
    const t = texto.trim()
    if (!t) return
    try {
      await crear.mutateAsync(leido.target
        ? { nombre: t, tipo: 'contador', target: leido.target, unidad: metrica ? METRICA_BY_CLAVE[metrica]?.unidad : undefined, metrica, fechaInicio: hoy, fechaFin: hoy, momento }
        : { nombre: t, tipo: 'toggle', target: 1, fechaInicio: hoy, fechaFin: hoy, momento })
      setTexto('')
      setForzar(undefined)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo añadir')
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); anadir() }} className="mt-3">
      <div className="flex gap-2">
        <Input value={texto} onChange={(e) => { setTexto(e.target.value); setForzar(undefined) }} placeholder="Añadir al plan: «20 llamadas», «revisar propuesta de Utah»…" />
        <Button type="submit" size="icon" disabled={!texto.trim() || crear.isPending} aria-label="Añadir al plan"><Plus className="h-4 w-4" /></Button>
      </div>
      {texto.trim() && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {MOMENTOS.map((m) => (
            <button key={m.v} type="button" onClick={() => setMomento(momento === m.v ? undefined : m.v)}
              className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-1', momento === m.v ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200' : 'border-border text-muted hover:text-fg')}>
              <m.icon className="h-3 w-3" />{m.l}
            </button>
          ))}
          <span className="mx-1 text-muted">·</span>
          {leido.target ? (
            <label className="inline-flex items-center gap-1 text-muted">
              Se cuenta:
              <Select value={metrica ?? 'mano'} onChange={(e) => setForzar(e.target.value as MetricaClave | 'mano')} className="h-7 w-auto py-0 text-xs">
                <option value="mano">a mano (+1)</option>
                {METRICAS.filter((m) => m.formato !== 'moneda').map((m) => <option key={m.clave} value={m.clave}>solo: {m.label}</option>)}
              </Select>
            </label>
          ) : (
            <span className="text-muted">Casilla para marcar. Empieza con un número («20 llamadas») para que se cuente.</span>
          )}
        </div>
      )}
    </form>
  )
}
