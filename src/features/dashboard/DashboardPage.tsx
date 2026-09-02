import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle, Skeleton } from '@/components/ui'
import { KpiCard } from './KpiCard'
import { ConversionFunnel } from '@/components/charts/ConversionFunnel'
import { CHART_SERIES, BrandTooltip, ChartGradients, axisTick, gridProps } from '@/components/charts/chartTheme'
import { useLeads, useMessages, useNichos } from '@/hooks/useData'

import { formatCurrency, cn } from '@/lib/utils'
import type { Kpi, Lead } from '@/types'
import { crmApi } from '@/services/crmApi'
import { daysInStage, isStale } from '@/lib/pipeline'

const NICHE_COLORS = CHART_SERIES

function buildKpis(leads: Lead[]): Kpi[] {
  const activos = leads.filter((l) => !['ganado', 'perdido'].includes(l.estado)).length
  const ganados = leads.filter((l) => l.estado === 'ganado').length
  const pipelineUsd = leads
    .filter((l) => !['ganado', 'perdido'].includes(l.estado))
    .reduce((s, l) => s + (l.valorEstimado || 0), 0)
  const respondieron = leads.filter((l) =>
    ['respondio', 'reunion', 'propuesta', 'negociacion', 'ganado'].includes(l.estado),
  ).length
  const contactados = leads.filter((l) => l.estado !== 'nuevo').length
  const tasaResp = contactados ? (respondieron / contactados) * 100 : 0

  // Eran seis: «Total leads», «Leads activos» y «Contactados» son tres
  // recuentos de la misma lista, y seis cajas idénticas en fila no dicen cuál
  // mirar primero. Quedan las cuatro que responden a una pregunta distinta
  // cada una: cuánto hay en juego, cuántos vivos, si el contacto funciona y
  // cuántos han cerrado.
  return [
    { key: 'pipeline', label: 'Pipeline activo', value: pipelineUsd, format: 'currency' },
    { key: 'activos', label: 'Leads activos', value: activos, format: 'number' },
    { key: 'resp', label: 'Tasa de respuesta', value: tasaResp, format: 'percent' },
    { key: 'cerrados', label: 'Clientes cerrados', value: ganados, format: 'number' },
  ]
}

const FUNNEL_STAGES: { key: string; label: string; match: (l: Lead) => boolean; color: string }[] = [
  { key: 's', label: 'Scrapeados', match: () => true, color: '#94a3b8' },
  { key: 'c', label: 'Contactados', match: (l) => l.estado !== 'nuevo', color: '#0082f3' },
  { key: 'o', label: 'Abrieron', match: (l) => ['seguimiento', 'respondio', 'reunion', 'propuesta', 'negociacion', 'ganado'].includes(l.estado), color: '#6248ff' },
  { key: 'r', label: 'Respondieron', match: (l) => ['respondio', 'reunion', 'propuesta', 'negociacion', 'ganado'].includes(l.estado), color: '#f38744' },
  { key: 'm', label: 'Reunión', match: (l) => ['reunion', 'propuesta', 'negociacion', 'ganado'].includes(l.estado), color: '#ff7448' },
  { key: 'w', label: 'Cliente', match: (l) => l.estado === 'ganado', color: '#16a34a' },
]

export function DashboardPage() {
  const { leads, isLoading, isError: leadsError } = useLeads()
  const { data: messages } = useMessages()
  const nichos = useNichos()

  const kpis = useMemo(() => buildKpis(leads), [leads])

  const funnelData = useMemo(
    () => FUNNEL_STAGES.map((s) => ({ name: s.label, value: leads.filter(s.match).length, fill: s.color })),
    [leads],
  )

  const nicheData = useMemo(() => {
    const counts = new Map<string, number>()
    leads.forEach((l) => counts.set(l.nicho || 'otros', (counts.get(l.nicho || 'otros') || 0) + 1))
    return [...counts.entries()]
      .map(([k, v]) => ({ name: nichos.find((n) => n.id === k)?.nombre || k, value: v }))
      .sort((a, b) => b.value - a.value)
  }, [leads, nichos])

  const activityTrend = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return d.toISOString().slice(0, 10)
    })
    const byDay = new Map(days.map((d) => [d, { dia: d.slice(5), enviados: 0, respuestas: 0 }]))
    for (const m of messages ?? []) {
      const key = (m.fecha || '').slice(0, 10)
      const bucket = byDay.get(key)
      if (!bucket) continue
      if (m.respuestaRecibida) bucket.respuestas += 1
      else bucket.enviados += 1
    }
    return [...byDay.values()]
  }, [messages])
  const hasTrendData = activityTrend.some((d) => d.enviados > 0 || d.respuestas > 0)
  const totalEnviados = activityTrend.reduce((s, d) => s + d.enviados, 0)
  const totalRespuestas = activityTrend.reduce((s, d) => s + d.respuestas, 0)

  // Se llamaba «Necesitan atención» y era, literalmente, los seis primeros
  // leads abiertos en el orden en que llegaban del servidor. Ahora manda el
  // dato que justifica el título: los días parados en la misma etapa.
  const needAttention = useMemo(
    () =>
      leads
        .filter((l) => !['ganado', 'perdido', 'nuevo'].includes(l.estado))
        .sort((a, b) => daysInStage(b) - daysInStage(a))
        .slice(0, 6),
    [leads],
  )

  return (
    <div>
      <PageHeader
        title="Resumen"
        subtitle={`JD Developer · ${crmApi.enabled() ? 'datos en vivo' : 'sin conexión a n8n'}`}
      />

      {leadsError && (
        <p className="aviso-error mb-4">
          No se pudo conectar con n8n para leer los leads. Verifica que el workflow "CRM API - Leer Sheets" esté activo.
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : kpis.map((k, i) => <KpiCard key={k.key} kpi={k} index={i} />)}
      </div>

      {/* Sección media */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Embudo de conversión</CardTitle></CardHeader>
          <div className="min-h-[18rem]"><ConversionFunnel data={funnelData} /></div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Leads por nicho</CardTitle></CardHeader>
          {/* Era un donut con leyenda. Con ocho nichos la leyenda se parte en
              tres líneas y hay que emparejar color con texto para leer un
              simple ranking. Una barra por nicho, ordenadas, se lee de un
              vistazo y no miente sobre el orden. */}
          <NichoRanking data={nicheData} />
        </Card>
      </div>

      {/* Actividad 30 días */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Actividad — últimos 30 días</CardTitle>
          {/* La leyenda de recharts era una fila de texto de 11px flotando
              bajo el gráfico, sin cifras. Aquí sube a la cabecera y trae el
              total de cada serie: se lee el resultado antes que la forma. */}
          <div className="flex shrink-0 items-center gap-4">
            <LeyendaSerie color="#ff7448" label="Enviados" value={totalEnviados} />
            <LeyendaSerie color="#6248ff" label="Respuestas" value={totalRespuestas} />
          </div>
        </CardHeader>
        {!hasTrendData ? (
          <p className="t-hint py-10 text-center text-xs">Sin mensajes registrados en los últimos 30 días.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTrend} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="dia" tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} allowDecimals={false} width={34} />
                <Tooltip content={<BrandTooltip />} cursor={{ stroke: 'rgb(var(--muted))', strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="enviados" stroke="#ff7448" strokeWidth={2.5} fill="url(#gradCoralArea)" name="Enviados" animationDuration={800} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} />
                <Area type="monotone" dataKey="respuestas" stroke="#6248ff" strokeWidth={2.5} fill="url(#gradVioletArea)" name="Respuestas" animationDuration={800} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Necesitan atención</CardTitle>
          <Link to="/pipeline" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
            Ver pipeline <ArrowRight className="h-3 w-3" />
          </Link>
        </CardHeader>
        {!needAttention.length ? (
          <p className="t-hint py-6 text-center">Todo al día.</p>
        ) : (
          <div className="-mx-1.5 grid gap-0.5 sm:grid-cols-2">
            {needAttention.map((l) => (
              // Antes eran filas muertas: te decían qué mirar y no había forma
              // de llegar hasta ello.
              <Link
                key={l.id}
                to={`/pipeline?lead=${l.id}`}
                className="flex items-center gap-3 rounded-lg px-1.5 py-2 row-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg" title={l.empresa}>{l.empresa}</p>
                  <p className="truncate text-xs capitalize text-muted">{l.estado} · {formatCurrency(l.valorEstimado || 0)}</p>
                </div>
                <span className={cn('shrink-0 text-xs tabular-nums', isStale(l) ? 'font-semibold text-[rgb(var(--danger))]' : 'text-muted')}>
                  {daysInStage(l)}d
                </span>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function LeyendaSerie({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: color }} />
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-fg">{value}</span>
    </span>
  )
}

function NichoRanking({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  if (!total) return <p className="t-hint py-10 text-center">Todavía no hay leads clasificados por nicho.</p>
  const max = data[0]?.value || 1
  return (
    <div>
      <p className="t-num text-2xl leading-none">{total}</p>
      <p className="t-eyebrow mt-1">leads en total</p>
      <div className="mt-4 space-y-2.5">
        {data.slice(0, 7).map((d, i) => (
          <div key={d.name}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.8125rem] text-fg" title={d.name}>{d.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {d.value} · {Math.round((d.value / total) * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{ width: `${(d.value / max) * 100}%`, background: NICHE_COLORS[i % NICHE_COLORS.length] }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
