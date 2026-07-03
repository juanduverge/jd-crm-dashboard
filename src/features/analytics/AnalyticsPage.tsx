import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, Legend, PieChart, Pie, Cell,
} from 'recharts'
import { BarChart3, Mail, MessageCircle, Instagram, Linkedin } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle, Skeleton, Badge, EmptyState } from '@/components/ui'
import { KpiCard } from '@/features/dashboard/KpiCard'
import { ConversionFunnel } from '@/components/charts/ConversionFunnel'
import { CHART_SERIES, CHANNEL_COLORS, BrandTooltip, ChartGradients, axisTick, gridProps } from '@/components/charts/chartTheme'
import { useLeads, useMessages, useCampaigns } from '@/hooks/useData'
import { DEFAULT_NICHES } from '@/lib/config'
import { formatCurrency, scoreColor, cn } from '@/lib/utils'
import type { Kpi, Lead, Message } from '@/types'

const NICHE_COLORS = CHART_SERIES
const CHANNEL_ICON: Record<string, typeof Mail> = { email: Mail, whatsapp: MessageCircle, instagram: Instagram, linkedin: Linkedin }

const FUNNEL_STAGES: { key: string; label: string; match: (l: Lead) => boolean; color: string }[] = [
  { key: 's', label: 'Scrapeados', match: () => true, color: '#94a3b8' },
  { key: 'c', label: 'Contactados', match: (l) => l.estado !== 'nuevo', color: '#0082f3' },
  { key: 'r', label: 'Respondieron', match: (l) => ['respondio', 'reunion', 'propuesta', 'negociacion', 'ganado'].includes(l.estado), color: '#6248ff' },
  { key: 'm', label: 'Reunión / Propuesta', match: (l) => ['reunion', 'propuesta', 'negociacion', 'ganado'].includes(l.estado), color: '#f38744' },
  { key: 'w', label: 'Ganado', match: (l) => l.estado === 'ganado', color: '#16a34a' },
]

function buildKpis(leads: Lead[], messages: Message[]): Kpi[] {
  const ganados = leads.filter((l) => l.estado === 'ganado')
  const valorGanado = ganados.reduce((s, l) => s + (l.valorEstimado || 0), 0)
  const enviados = messages.filter((m) => !m.respuestaRecibida).length
  const respuestas = messages.filter((m) => m.respuestaRecibida).length
  const tasaResp = enviados ? (respuestas / (enviados + respuestas)) * 100 : 0
  const ticketProm = ganados.length ? valorGanado / ganados.length : 0

  return [
    { key: 'leads', label: 'Total leads', value: leads.length, format: 'number' },
    { key: 'msgs', label: 'Mensajes enviados', value: enviados, format: 'number' },
    { key: 'resp', label: 'Tasa de respuesta', value: tasaResp, format: 'percent' },
    { key: 'clientes', label: 'Clientes cerrados', value: ganados.length, format: 'number' },
    { key: 'ticket', label: 'Ticket promedio', value: ticketProm, format: 'currency' },
    { key: 'valor', label: 'Valor generado', value: valorGanado, format: 'currency' },
  ]
}

export function AnalyticsPage() {
  const { leads, isLoading: leadsLoading, isError: leadsError } = useLeads()
  const { data: messages, isLoading: msgsLoading } = useMessages()
  const { campaigns } = useCampaigns()

  const msgs = messages ?? []
  const isLoading = leadsLoading || msgsLoading

  const kpis = useMemo(() => buildKpis(leads, msgs), [leads, msgs])

  const funnelData = useMemo(
    () => FUNNEL_STAGES.map((s) => ({ name: s.label, value: leads.filter(s.match).length, fill: s.color })),
    [leads],
  )

  const channelData = useMemo(() => {
    const counts = new Map<string, number>()
    msgs.forEach((m) => counts.set(m.canal, (counts.get(m.canal) || 0) + 1))
    return [...counts.entries()].map(([k, v]) => ({ name: k, value: v, fill: CHANNEL_COLORS[k] || '#94a3b8' }))
  }, [msgs])

  const nicheData = useMemo(() => {
    const counts = new Map<string, number>()
    leads.forEach((l) => counts.set(l.nicho || 'otros', (counts.get(l.nicho || 'otros') || 0) + 1))
    return [...counts.entries()]
      .map(([k, v]) => ({ name: DEFAULT_NICHES.find((n) => n.id === k)?.nombre || k, value: v }))
      .sort((a, b) => b.value - a.value)
  }, [leads])

  const activityTrend = useMemo(() => {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return d.toISOString().slice(0, 10)
    })
    const byDay = new Map(days.map((d) => [d, { dia: d.slice(5), enviados: 0, respuestas: 0 }]))
    for (const m of msgs) {
      const key = (m.fecha || '').slice(0, 10)
      const bucket = byDay.get(key)
      if (!bucket) continue
      if (m.respuestaRecibida) bucket.respuestas += 1
      else bucket.enviados += 1
    }
    return [...byDay.values()]
  }, [msgs])
  const hasTrendData = activityTrend.some((d) => d.enviados > 0 || d.respuestas > 0)

  const topLeads = useMemo(
    () => leads.slice().sort((a, b) => b.score - a.score).slice(0, 10),
    [leads],
  )

  return (
    <div>
      <PageHeader
        title="📊 Analíticas"
        subtitle={`Reportes por campaña, nicho y canal · ${campaigns.length} campañas`}
      />

      {leadsError && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
          No se pudo conectar con n8n para leer los leads. Verifica que el workflow "CRM API - Leer Sheets" esté activo.
        </p>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : kpis.map((k, i) => <KpiCard key={k.key} kpi={k} index={i} />)}
      </div>

      {/* Embudo + canal */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Embudo de conversión</CardTitle></CardHeader>
          {isLoading ? <Skeleton className="h-72" /> : (
            <div className="min-h-[18rem]"><ConversionFunnel data={funnelData} /></div>
          )}
        </Card>

        <Card>
          <CardHeader><CardTitle>Mensajes por canal</CardTitle></CardHeader>
          {isLoading ? <Skeleton className="h-72" /> : !channelData.length ? (
            <p className="py-20 text-center text-xs text-muted">Sin mensajes registrados.</p>
          ) : (
            <div className="relative h-72">
              <div className="pointer-events-none absolute inset-x-0 top-[38%] z-10 -translate-y-1/2 text-center">
                <p className="text-2xl font-bold tabular-nums text-fg">{channelData.reduce((s, d) => s + d.value, 0)}</p>
                <p className="text-[11px] text-muted">mensajes</p>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={channelData} dataKey="value" nameKey="name" innerRadius={54} outerRadius={86} paddingAngle={3} cornerRadius={6} stroke="rgb(var(--surface))" strokeWidth={2} animationDuration={700} animationBegin={100}>
                    {channelData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Pie>
                  <Tooltip content={<BrandTooltip />} cursor={false} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Actividad 30 días */}
      <Card className="mt-4">
        <CardHeader><CardTitle>Actividad — últimos 30 días</CardTitle></CardHeader>
        {!hasTrendData ? (
          <p className="py-10 text-center text-xs text-muted">Sin mensajes registrados en los últimos 30 días.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <ChartGradients />
                <CartesianGrid {...gridProps} vertical={false} />
                <XAxis dataKey="dia" tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                <Tooltip content={<BrandTooltip />} cursor={{ stroke: 'rgb(var(--muted))', strokeDasharray: '3 3' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Area type="monotone" dataKey="enviados" stroke="#ff7448" strokeWidth={2.5} fill="url(#gradCoralArea)" name="Enviados" animationDuration={800} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} />
                <Area type="monotone" dataKey="respuestas" stroke="#6248ff" strokeWidth={2.5} fill="url(#gradVioletArea)" name="Respuestas" animationDuration={800} activeDot={{ r: 4, strokeWidth: 2, stroke: 'rgb(var(--surface))' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* Nicho + Top leads */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle>Leads por nicho</CardTitle></CardHeader>
          {isLoading ? <Skeleton className="h-72" /> : !nicheData.length ? (
            <p className="py-20 text-center text-xs text-muted">Sin leads registrados.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={nicheData} layout="vertical" margin={{ left: 8, right: 8 }} barCategoryGap={6}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} width={90} tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 13)}…` : v)} />
                  <Tooltip content={<BrandTooltip />} cursor={{ fill: 'rgb(var(--muted))', fillOpacity: 0.06 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={700}>
                    {nicheData.map((_, i) => <Cell key={i} fill={NICHE_COLORS[i % NICHE_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Top 10 leads por score</CardTitle></CardHeader>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : !topLeads.length ? (
            <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="Sin leads" description="Todavía no hay leads para rankear." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Empresa</th>
                    <th className="px-2 py-2 text-left font-medium">Nicho</th>
                    <th className="px-2 py-2 text-left font-medium">Canal</th>
                    <th className="px-2 py-2 text-left font-medium">Score</th>
                    <th className="px-2 py-2 text-left font-medium">Estado</th>
                    <th className="px-2 py-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {topLeads.map((l) => {
                    const sc = scoreColor(l.score)
                    const Icon = l.canalPrincipal ? CHANNEL_ICON[l.canalPrincipal] : undefined
                    const niche = DEFAULT_NICHES.find((n) => n.id === l.nicho)
                    return (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="max-w-[180px] truncate px-2 py-2 font-medium text-fg" title={l.empresa}>{l.empresa}</td>
                        <td className="px-2 py-2 text-muted">{niche ? `${niche.emoji} ${niche.nombre}` : l.nicho || '—'}</td>
                        <td className="px-2 py-2 text-muted">
                          {Icon ? <Icon className="h-3.5 w-3.5" /> : '—'}
                        </td>
                        <td className="px-2 py-2">
                          <span className={cn('inline-flex h-6 w-8 items-center justify-center rounded-md text-xs font-bold', sc.bg, sc.text)}>{l.score}</span>
                        </td>
                        <td className="px-2 py-2"><Badge>{l.estado}</Badge></td>
                        <td className="px-2 py-2 text-right font-medium text-fg">{l.valorEstimado ? formatCurrency(l.valorEstimado) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
