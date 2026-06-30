import { useMemo } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, PieChart, Pie, Cell, FunnelChart, Funnel, LabelList,
} from 'recharts'
import { Activity, Workflow, AlertTriangle, CheckCircle2, XCircle, Mail, MessageCircle, UserPlus, CalendarCheck, GitBranch } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle, Skeleton, Badge } from '@/components/ui'
import { KpiCard } from './KpiCard'
import { useLeads, useActivity, useWorkflows } from '@/hooks/useData'
import { DEFAULT_NICHES } from '@/lib/config'
import { formatCurrency, cn } from '@/lib/utils'
import type { Kpi, Lead } from '@/types'
import { sheetsService } from '@/services/sheetsService'

const NICHE_COLORS = ['#ff7448', '#6248ff', '#0082f3', '#16a34a', '#f59e0b', '#94a3b8']

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
  const spark = (base: number) => Array.from({ length: 8 }, (_, i) => base * (0.6 + Math.sin(i) * 0.2 + i * 0.05))

  return [
    { key: 'total', label: 'Total leads', value: leads.length, change: 12, spark: spark(leads.length), format: 'number' },
    { key: 'activos', label: 'Leads activos', value: activos, change: 8, spark: spark(activos), format: 'number' },
    { key: 'emails', label: 'Emails enviados (mes)', value: contactados * 2, change: 23, spark: spark(contactados), format: 'number' },
    { key: 'resp', label: 'Tasa de respuesta', value: tasaResp, change: 4, spark: spark(tasaResp), format: 'percent' },
    { key: 'pipeline', label: 'Pipeline activo', value: pipelineUsd, change: 15, spark: spark(pipelineUsd / 1000), format: 'currency' },
    { key: 'cerrados', label: 'Clientes cerrados (mes)', value: ganados, change: ganados ? 50 : 0, spark: spark(ganados || 1), format: 'number' },
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

const activityIcon = {
  email: Mail, whatsapp: MessageCircle, lead: UserPlus,
  workflow: GitBranch, pipeline: GitBranch, meeting: CalendarCheck,
}

export function DashboardPage() {
  const { leads, isLoading } = useLeads()
  const { data: activity } = useActivity()
  const { data: workflows, isError: wfError } = useWorkflows()

  const kpis = useMemo(() => buildKpis(leads), [leads])

  const funnelData = useMemo(
    () => FUNNEL_STAGES.map((s) => ({ name: s.label, value: leads.filter(s.match).length, fill: s.color })),
    [leads],
  )

  const nicheData = useMemo(() => {
    const counts = new Map<string, number>()
    leads.forEach((l) => counts.set(l.nicho || 'otros', (counts.get(l.nicho || 'otros') || 0) + 1))
    return [...counts.entries()].map(([k, v]) => ({
      name: DEFAULT_NICHES.find((n) => n.id === k)?.nombre || k,
      value: v,
    }))
  }, [leads])

  const activityTrend = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      dia: `${i + 1}`,
      enviados: Math.round(8 + Math.sin(i / 3) * 5 + Math.random() * 4),
      respuestas: Math.round(2 + Math.sin(i / 4) * 2 + Math.random() * 2),
      cierres: Math.round(Math.random() * 1.5),
    }))
  }, [])

  const needAttention = useMemo(
    () => leads.filter((l) => !['ganado', 'perdido', 'nuevo'].includes(l.estado)).slice(0, 6),
    [leads],
  )

  return (
    <div>
      <PageHeader
        title="🏠 Resumen"
        subtitle={`JDDeveloper · ${sheetsService.isLive() ? 'datos en vivo' : 'datos de ejemplo'}`}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          : kpis.map((k, i) => <KpiCard key={k.key} kpi={k} index={i} />)}
      </div>

      {/* Sección media */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Embudo de conversión</CardTitle></CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <FunnelChart>
                <Tooltip />
                <Funnel dataKey="value" data={funnelData} isAnimationActive>
                  <LabelList position="right" fill="currentColor" stroke="none" dataKey="name" className="text-xs" />
                  <LabelList position="left" fill="#fff" stroke="none" dataKey="value" />
                </Funnel>
              </FunnelChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader><CardTitle>Leads por nicho</CardTitle></CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={nicheData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={3}>
                  {nicheData.map((_, i) => <Cell key={i} fill={NICHE_COLORS[i % NICHE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Actividad 30 días */}
      <Card className="mt-4">
        <CardHeader><CardTitle>Actividad — últimos 30 días</CardTitle></CardHeader>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activityTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} stroke="rgb(var(--muted))" />
              <YAxis tick={{ fontSize: 11 }} stroke="rgb(var(--muted))" />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="enviados" stroke="#ff7448" strokeWidth={2} dot={false} name="Emails enviados" />
              <Line type="monotone" dataKey="respuestas" stroke="#6248ff" strokeWidth={2} dot={false} name="Respuestas" />
              <Line type="monotone" dataKey="cierres" stroke="#16a34a" strokeWidth={2} dot={false} name="Cierres" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Sección inferior */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Feed actividad */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4" /> Actividad reciente</CardTitle></CardHeader>
          <div className="space-y-3">
            {(activity ?? []).map((e) => {
              const Icon = activityIcon[e.type] ?? Activity
              return (
                <div key={e.id} className="flex gap-3">
                  <div className="mt-0.5 rounded-lg bg-surface-2 p-1.5 text-primary-500"><Icon className="h-3.5 w-3.5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{e.title}</p>
                    {e.detail && <p className="text-xs text-muted">{e.detail}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        {/* Workflows n8n */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-4 w-4" /> Workflows n8n</CardTitle></CardHeader>
          {wfError ? (
            <p className="py-6 text-center text-xs text-muted">
              No se pudo conectar a n8n.<br />Verifica que esté corriendo en localhost:5678.
            </p>
          ) : (
            <div className="space-y-2">
              {(workflows ?? []).slice(0, 6).map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                  <span className="truncate text-sm text-fg">{w.name}</span>
                  <Badge className={cn(w.active ? 'bg-green-100 text-green-600' : 'bg-surface-2 text-muted')}>
                    {w.active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                    {w.active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
              ))}
              {!workflows?.length && <p className="py-6 text-center text-xs text-muted">Sin workflows.</p>}
            </div>
          )}
        </Card>

        {/* Necesitan atención */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Necesitan atención</CardTitle></CardHeader>
          <div className="space-y-2">
            {needAttention.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-fg">{l.empresa}</p>
                  <p className="text-xs text-muted">{l.estado} · {formatCurrency(l.valorEstimado || 0)}</p>
                </div>
              </div>
            ))}
            {!needAttention.length && <p className="py-6 text-center text-xs text-muted">Todo al día 🎉</p>}
          </div>
        </Card>
      </div>
    </div>
  )
}
