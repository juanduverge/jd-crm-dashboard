import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import {
  Bot, Power, Play, ExternalLink, X, CheckCircle2, XCircle, Clock,
  RefreshCw, Wifi, WifiOff,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Button, Badge, Skeleton, EmptyState } from '@/components/ui'
import { Drawer } from '@/components/ui/Modal'
import { useWorkflows, useExecutions } from '@/hooks/useData'
import { n8nService } from '@/services/n8nService'
import { config } from '@/lib/config'
import { cn } from '@/lib/utils'
import { executionStats, executionsByDay, STATUS_META, durationLabel, INTEGRATIONS } from '@/lib/automations'
import type { WorkflowInfo } from '@/types'

export function AutomationsPage() {
  const { data: workflows, isLoading, isError, refetch, isFetching } = useWorkflows()
  const [panelWf, setPanelWf] = useState<WorkflowInfo | null>(null)
  const qc = useQueryClient()

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => n8nService.setActive(id, active),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['workflows'] }) },
    onError: () => toast.error('No se pudo cambiar el estado del workflow'),
  })

  const runMutation = useMutation({
    mutationFn: (id: string) => n8nService.run(id),
    onSuccess: () => { toast.success('Workflow ejecutado'); qc.invalidateQueries({ queryKey: ['executions'] }) },
    onError: () => toast.error('No se pudo ejecutar (requiere trigger manual compatible)'),
  })

  return (
    <div>
      <PageHeader
        title="🤖 Automatizaciones"
        subtitle={isError ? 'n8n no responde — revisa que esté corriendo en localhost:5678' : `${workflows?.length ?? 0} workflows`}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Sincronizar
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      ) : isError || !workflows?.length ? (
        <EmptyState
          icon={<Bot className="h-8 w-8" />}
          title={isError ? 'No se pudo conectar a n8n' : 'Sin workflows'}
          description={isError ? 'Verifica VITE_N8N_URL / VITE_N8N_API_KEY y que n8n esté activo.' : 'No hay workflows creados todavía en esta instancia.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onToggle={() => toggleMutation.mutate({ id: wf.id, active: !wf.active })}
              onRun={() => runMutation.mutate(wf.id)}
              onOpenPanel={() => setPanelWf(wf)}
              busy={toggleMutation.isPending || runMutation.isPending}
            />
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-base font-semibold text-fg">Integraciones</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {INTEGRATIONS.map((i) => (
          <IntegrationCard key={i.id} integration={i} />
        ))}
      </div>

      <ExecutionsPanel workflow={panelWf} onClose={() => setPanelWf(null)} />
    </div>
  )
}

function WorkflowCard({
  workflow, onToggle, onRun, onOpenPanel, busy,
}: {
  workflow: WorkflowInfo
  onToggle: () => void
  onRun: () => void
  onOpenPanel: () => void
  busy: boolean
}) {
  const { data: executions } = useExecutions(workflow.id)
  const stats = useMemo(() => executionStats(executions ?? []), [executions])
  const last = executions?.[0]

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpenPanel} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-fg hover:text-primary-600">{workflow.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">ID {workflow.id}</p>
        </button>
        <button
          onClick={onToggle}
          disabled={busy}
          title={workflow.active ? 'Desactivar' : 'Activar'}
          className={cn(
            'flex h-7 w-12 shrink-0 items-center rounded-full px-1 transition-colors',
            workflow.active ? 'justify-end bg-green-500' : 'justify-start bg-surface-2',
          )}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <Badge className={workflow.active ? 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400' : ''}>
          <Power className="h-3 w-3" /> {workflow.active ? 'Activo' : 'Inactivo'}
        </Badge>
        {last && (
          <Badge className={STATUS_META[last.status ?? 'waiting']?.cls}>
            {last.status === 'success' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
            {STATUS_META[last.status ?? 'waiting']?.label}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted">
        <div><span className="font-semibold text-fg">{stats.total}</span> ejecuciones</div>
        <div><span className="font-semibold text-fg">{stats.successRate}%</span> éxito</div>
      </div>
      {last && (
        <p className="flex items-center gap-1 text-xs text-muted">
          <Clock className="h-3 w-3" /> Última: {new Date(last.startedAt).toLocaleString('es')}
        </p>
      )}

      <div className="mt-auto flex gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={onRun} disabled={busy}>
          <Play className="h-3.5 w-3.5" /> Ejecutar
        </Button>
        <a
          className="btn btn-outline h-8 px-3 text-xs"
          href={`${config.n8n.url}/workflow/${workflow.id}`}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir en n8n
        </a>
      </div>
    </Card>
  )
}

function IntegrationCard({ integration }: { integration: (typeof INTEGRATIONS)[number] }) {
  const [testing, setTesting] = useState(false)
  const connected = integration.status === 'connected'

  const test = async () => {
    setTesting(true)
    const ok = await n8nService.ping()
    setTesting(false)
    toast[ok ? 'success' : 'error'](ok ? `${integration.name}: conexión OK (n8n responde)` : 'n8n no responde')
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-fg">{integration.name}</p>
        {connected ? <Wifi className="h-4 w-4 text-green-500" /> : <WifiOff className="h-4 w-4 text-muted" />}
      </div>
      {connected ? (
        <>
          <Badge className="w-fit bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400">Conectado</Badge>
          {integration.credential && <p className="text-xs text-muted">{integration.credential}</p>}
          {integration.detail && <p className="text-xs text-muted">{integration.detail}</p>}
          <Button size="sm" variant="outline" className="mt-1" onClick={test} disabled={testing}>
            {testing ? 'Probando…' : 'Probar conexión'}
          </Button>
        </>
      ) : (
        <>
          <Badge>🔜 Próximamente</Badge>
          <p className="text-xs text-muted">{integration.detail}</p>
          <Button size="sm" variant="outline" className="mt-1" disabled>Configurar</Button>
        </>
      )}
    </Card>
  )
}

function ExecutionsPanel({ workflow, onClose }: { workflow: WorkflowInfo | null; onClose: () => void }) {
  const { data: executions, isLoading } = useExecutions(workflow?.id)
  const chartData = useMemo(() => executionsByDay(executions ?? [], 14), [executions])

  return (
    <Drawer open={!!workflow} onClose={onClose} width="max-w-lg">
      {workflow && (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface p-5">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-fg">{workflow.name}</h3>
              <p className="text-xs text-muted">Últimas ejecuciones</p>
            </div>
            <button onClick={onClose} className="btn-ghost shrink-0"><X className="h-4 w-4" /></button>
          </div>

          <div className="p-5">
            <p className="mb-2 text-xs font-medium text-muted">Ejecuciones por día (14 días)</p>
            <div className="card mb-5 h-40 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ff7448" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {isLoading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : !executions?.length ? (
              <p className="text-sm text-muted">Sin ejecuciones registradas.</p>
            ) : (
              <div className="space-y-2">
                {executions.slice(0, 20).map((e) => {
                  const meta = STATUS_META[e.status ?? 'waiting']
                  return (
                    <div key={e.id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs">
                      <div>
                        <p className="font-medium text-fg">{new Date(e.startedAt).toLocaleString('es')}</p>
                        <p className="text-muted">Duración: {durationLabel(e.startedAt, e.stoppedAt)} · {e.mode}</p>
                      </div>
                      <Badge className={meta?.cls}>{meta?.label}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  )
}
