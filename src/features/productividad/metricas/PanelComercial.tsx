import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, AlertTriangle, CalendarClock, Flame, MessageSquare, Search, Target, TrendingUp,
} from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { useMetricasCrm } from '@/hooks/useData'
import { fmtMetrica } from '@/lib/metricas'
import { touchColor } from '@/lib/touches'
import { cn } from '@/lib/utils'
import { iso, rangoMes, rangoSemana } from '../shared/goalMeta'
import type { MetricasCrm } from '@/types'

/**
 * Panel comercial — el "qué hice / qué estoy haciendo / qué me falta" del mes.
 *
 * Todos los números salen de un único RPC (`metricas_crm`, migración 0028) que
 * los deriva de las acciones reales: dar de alta un lead, completar un toque,
 * mover una etapa. Aquí no se cuenta nada a mano ni se recalcula en el
 * navegador; si un número no cuadra, el sitio donde mirar es `metrica_valor()`.
 *
 * El orden de la pantalla es el orden de las preguntas que se hacen de verdad:
 * primero cómo va el embudo, luego el ritmo de contacto, y al final —lo único
 * accionable hoy mismo— lo que está esperando.
 */
export function PanelComercial({ mes, esActual }: { mes: Date; esActual: boolean }) {
  // Sólo se ofrecen día y semana en el mes en curso: "hoy" dentro de un mes
  // pasado no significa nada y sólo daría ceros confusos.
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('mes')
  const efectivo = esActual ? periodo : 'mes'

  const rango = useMemo(() => {
    if (efectivo === 'mes') return rangoMes(mes)
    if (efectivo === 'semana') return rangoSemana(new Date())
    const hoy = iso(new Date())
    return { desde: hoy, hasta: hoy }
  }, [efectivo, mes])

  const { data, isLoading, isError } = useMetricasCrm(rango.desde, rango.hasta)

  if (isError) {
    return (
      <div className="card flex items-center gap-2 text-sm text-muted">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        No se pudieron cargar las métricas comerciales. Comprueba que la migración 0028 esté aplicada.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {esActual && (
        <div className="flex w-fit overflow-hidden rounded-lg border border-border text-xs">
          {([['dia', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriodo(k)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                periodo === k ? 'bg-primary-400 text-white' : 'hover:bg-surface-2',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          <Kpis m={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Embudo m={data} />
            <Toques m={data} />
          </div>
          <QueMeFalta m={data} />
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- KPIs */

function Kpis({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        icon={<Search className="h-4 w-4" />}
        label="Leads encontrados"
        valor={String(p.leads_encontrados)}
        pie={`${p.leads_contactados} recibieron su primer contacto`}
      />
      <Kpi
        icon={<Activity className="h-4 w-4" />}
        label="Contactos realizados"
        valor={String(p.contactos_realizados)}
        pie={
          m.ratios.toques_por_lead > 0
            ? `${fmtMetrica(undefined, m.ratios.toques_por_lead)} toques por lead`
            : 'Todavía sin toques en el periodo'
        }
      />
      <Kpi
        icon={<MessageSquare className="h-4 w-4" />}
        label="Tasa de respuesta"
        valor={`${Math.round(m.ratios.tasa_respuesta)}%`}
        pie={`${p.respuestas_recibidas} respuestas sobre los toques dados`}
        acento={m.ratios.tasa_respuesta >= 15 ? 'text-emerald-500' : undefined}
      />
      <Kpi
        icon={<TrendingUp className="h-4 w-4" />}
        label="Tasa de conversión"
        valor={`${Math.round(m.ratios.tasa_conversion)}%`}
        pie={`${p.leads_ganados} ganados · ${p.leads_perdidos} perdidos`}
        acento={p.leads_ganados > 0 ? 'text-emerald-500' : undefined}
      />
    </div>
  )
}

function Kpi({
  icon, label, valor, pie, acento,
}: { icon: ReactNode; label: string; valor: string; pie: string; acento?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </div>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums text-fg', acento)}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-muted">{pie}</p>
    </div>
  )
}

/* -------------------------------------------------------------- Embudo */

/**
 * El embudo con barras proporcionales al escalón más ancho, y la conversión
 * respecto al escalón ANTERIOR, no respecto al total: lo que se quiere ver es
 * dónde se rompe la cadena, y un porcentaje sobre el total esconde el salto
 * concreto que está fallando.
 */
function Embudo({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  const pasos = [
    { label: 'Encontrados', valor: p.leads_encontrados },
    { label: 'Contactados', valor: p.leads_contactados },
    { label: 'Respondieron', valor: p.leads_respondieron },
    { label: 'Reuniones', valor: p.reuniones_agendadas },
    { label: 'Propuestas', valor: p.propuestas_enviadas },
    { label: 'Ganados', valor: p.leads_ganados },
  ]
  const max = Math.max(...pasos.map((s) => s.valor), 1)

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Embudo del periodo</h3>
      </div>
      <div className="space-y-2">
        {pasos.map((s, i) => {
          const prev = i > 0 ? pasos[i - 1].valor : 0
          const conv = i > 0 && prev > 0 ? Math.round((s.valor / prev) * 100) : null
          return (
            <div key={s.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">{s.label}</span>
                <span className="font-semibold tabular-nums text-fg">
                  {s.valor}
                  {conv !== null && (
                    <span className={cn('ml-2 font-normal', conv < 20 ? 'text-amber-500' : 'text-muted')}>
                      {conv}%
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary-400"
                  style={{ width: `${Math.max((s.valor / max) * 100, s.valor > 0 ? 3 : 0)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        El porcentaje es la conversión respecto al escalón anterior: señala dónde
        se rompe la cadena, no cuánto queda del total.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------- Toques */

function Toques({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  const barras = [
    { toque: 1, n: p.touch_1 }, { toque: 2, n: p.touch_2 }, { toque: 3, n: p.touch_3 },
    { toque: 4, n: p.touch_4 }, { toque: 5, n: p.touch_5 },
  ]
  const max = Math.max(...barras.map((b) => b.n), 1)

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Insistencia por toque</h3>
      </div>
      <div className="space-y-2">
        {barras.map((b) => (
          <div key={b.toque} className="flex items-center gap-2">
            <span className={cn('w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold', touchColor(b.toque))}>
              {b.toque === 5 ? 'Touch 5+' : `Touch ${b.toque}`}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary-400/80"
                style={{ width: `${Math.max((b.n / max) * 100, b.n > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-muted">{b.n}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <div>
          <span className="block text-muted">Días entre contactos</span>
          <span className="font-semibold text-fg">
            {p.dias_entre_contactos > 0 ? `${fmtMetrica(undefined, p.dias_entre_contactos)} días` : '—'}
          </span>
        </div>
        <div>
          <span className="block text-muted">Tiempo dedicado</span>
          <span className="font-semibold text-fg">
            {fmtMetrica('tiempo_prospeccion_min', p.tiempo_prospeccion_min)}
          </span>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- Qué me falta */

/**
 * Lo único de este panel que no mira al pasado. `situacion` es la foto de HOY
 * de toda la cartera, no del periodo elegido: un seguimiento atrasado lo está
 * ahora mismo, se mire el mes que se mire.
 */
function QueMeFalta({ m }: { m: MetricasCrm }) {
  const s = m.situacion
  const items = [
    { label: 'Seguimientos atrasados', n: s.seg_atrasados, tono: 'text-red-500' },
    { label: 'Para hoy', n: s.seg_hoy, tono: 'text-primary-500' },
    { label: 'Sin contactar', n: s.sin_contactar, tono: 'text-slate-500' },
    { label: 'Contactados sin próximo toque', n: s.sin_proximo, tono: 'text-amber-500' },
    { label: 'En negociación', n: s.negociacion, tono: 'text-emerald-500' },
  ]
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Qué me falta ahora mismo</h3>
        <span className="ml-auto text-[11px] text-muted">{s.total_activos} leads activos</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-border p-3">
            <p className={cn('text-xl font-bold tabular-nums', i.n > 0 ? i.tono : 'text-muted')}>{i.n}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{i.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PanelComercial
