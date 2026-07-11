import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Globe, Search, RefreshCw, Inbox as InboxIcon, Flame, Clock, CheckCircle2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Input, Skeleton } from '@/components/ui'
import { useWebLeads } from '@/hooks/useData'
import type { WebLead, WebLeadStatus } from '@/types'
import { WebLeadDrawer } from './WebLeadDrawer'
import { ESTADOS, PRIORIDADES, initials, colorFromString } from './webLeadMeta'

function timeAgo(iso?: string) {
  if (!iso) return ''
  try { return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es }) } catch { return '' }
}

export function WebLeadsPage() {
  const { data: leads, isLoading, isError, refetch, isFetching } = useWebLeads()
  const [openId, setOpenId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | WebLeadStatus>('todos')
  const [q, setQ] = useState('')

  const all = leads ?? []
  const stats = useMemo(() => ({
    total: all.length,
    nuevos: all.filter((l) => l.estado === 'nuevo').length,
    proceso: all.filter((l) => l.estado === 'en_proceso').length,
    urgentes: all.filter((l) => l.prioridad === 'urgente' || l.prioridad === 'alta').length,
    cerrados: all.filter((l) => l.estado === 'cerrado').length,
  }), [all])

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return all
      .filter((l) => filtro === 'todos' || l.estado === filtro)
      .filter((l) => !term || [l.nombre, l.email, l.empresa, l.asunto, l.mensaje].some((v) => (v || '').toLowerCase().includes(term)))
  }, [all, filtro, q])

  const open = all.find((l) => l.id === openId) ?? null

  const tabs: { id: 'todos' | WebLeadStatus; label: string; count: number }[] = [
    { id: 'todos', label: 'Todas', count: all.length },
    { id: 'nuevo', label: 'Nuevas', count: stats.nuevos },
    { id: 'en_proceso', label: 'En proceso', count: stats.proceso },
    { id: 'respondido', label: 'Respondidas', count: all.filter((l) => l.estado === 'respondido').length },
    { id: 'cerrado', label: 'Cerradas', count: stats.cerrados },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox de Leads"
        subtitle="Solicitudes recibidas desde el formulario de jddeveloper.com"
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        }
      />

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={InboxIcon} label="Total" value={stats.total} tone="neutral" />
        <StatTile icon={Globe} label="Nuevas" value={stats.nuevos} tone="primary" />
        <StatTile icon={Flame} label="Prioritarias" value={stats.urgentes} tone="danger" />
        <StatTile icon={CheckCircle2} label="Cerradas" value={stats.cerrados} tone="success" />
      </div>

      {/* Toolbar: tabs + search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setFiltro(t.id)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filtro === t.id ? 'bg-primary-500 text-white shadow-sm' : 'bg-surface text-muted hover:text-fg'
              }`}
            >
              {t.label}
              <span className={`rounded-full px-1.5 text-[10px] ${filtro === t.id ? 'bg-white/25' : 'bg-border/60'}`}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input placeholder="Buscar por nombre, email, mensaje…" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {isError && !isLoading && (
        <EmptyState
          icon={<Globe className="h-8 w-8" />}
          title="No se pudieron cargar las solicitudes"
          description='Verifica que el workflow "CRM API - Leer Sheets" incluya la hoja web_leads y esté activo.'
          action={<Button onClick={() => refetch()}>Reintentar</Button>}
        />
      )}

      {!isLoading && !isError && list.length === 0 && (
        <EmptyState
          icon={<InboxIcon className="h-8 w-8" />}
          title={q || filtro !== 'todos' ? 'Sin resultados' : 'Bandeja vacía'}
          description={q || filtro !== 'todos' ? 'Prueba con otro filtro o búsqueda.' : 'Cuando alguien complete el formulario de la web, aparecerá aquí automáticamente.'}
        />
      )}

      {!isLoading && !isError && list.length > 0 && (
        <div className="card divide-y divide-border overflow-hidden p-0">
          {list.map((l) => <LeadRow key={l.id} lead={l} onClick={() => setOpenId(l.id)} />)}
        </div>
      )}

      <WebLeadDrawer lead={open} onClose={() => setOpenId(null)} />
    </div>
  )
}

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof Globe; label: string; value: number; tone: 'neutral' | 'primary' | 'danger' | 'success' }) {
  const tones: Record<string, string> = {
    neutral: 'text-fg bg-surface',
    primary: 'text-primary-600 bg-primary-50 dark:text-primary-300 dark:bg-primary-400/15',
    danger: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/15',
    success: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-500/15',
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}><Icon className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none text-fg">{value}</p>
        <p className="mt-1 truncate text-xs text-muted">{label}</p>
      </div>
    </div>
  )
}

function LeadRow({ lead, onClick }: { lead: WebLead; onClick: () => void }) {
  const est = ESTADOS[lead.estado]
  const pri = PRIORIDADES[lead.prioridad]
  const nuevo = lead.estado === 'nuevo'
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-surface">
      {/* Avatar */}
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
        style={{ background: colorFromString(lead.nombre || lead.email) }}
      >
        {initials(lead.nombre || lead.email)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {nuevo && <span className="h-2 w-2 shrink-0 rounded-full bg-primary-500" title="Sin abrir" />}
          <p className={`min-w-0 flex-1 truncate text-sm ${nuevo ? 'font-bold text-fg' : 'font-medium text-fg'}`} title={lead.nombre}>
            {lead.nombre}
          </p>
          {lead.empresa && <span className="hidden shrink-0 text-xs text-muted sm:inline">· {lead.empresa}</span>}
          <span className="ml-auto shrink-0 text-[11px] text-muted">{timeAgo(lead.fechaHora)}</span>
        </div>
        <p className="mt-0.5 min-w-0 truncate text-xs text-muted" title={lead.asunto || lead.mensaje}>
          {lead.asunto ? <span className="font-medium text-fg/80">{lead.asunto} — </span> : null}{lead.mensaje}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${est.badge}`}>{est.label}</span>
          <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${pri.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${pri.dot}`} />{pri.label}
          </span>
          {lead.etiquetas.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-border/50 px-2 py-0.5 text-[10px] text-muted">{t}</span>
          ))}
          {lead.responsable && <span className="ml-auto text-[10px] text-muted">👤 {lead.responsable}</span>}
        </div>
      </div>
    </button>
  )
}
