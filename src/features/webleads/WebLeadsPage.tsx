import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Globe, Mail, RefreshCw, Save } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, EmptyState, Select, Skeleton, Textarea } from '@/components/ui'
import { useUpdateWebLead, useWebLeads } from '@/hooks/useData'
import type { WebLead, WebLeadStatus } from '@/types'

const ESTADOS: { id: WebLeadStatus; label: string; badge: string }[] = [
  { id: 'nuevo', label: 'Nuevo', badge: 'bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300' },
  { id: 'en_proceso', label: 'En proceso', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  { id: 'respondido', label: 'Respondido', badge: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400' },
  { id: 'cerrado', label: 'Cerrado', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400' },
]

function estadoDe(l: WebLead) {
  return ESTADOS.find((e) => e.id === l.estado) ?? ESTADOS[0]
}

function fecha(iso?: string) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'dd MMM yyyy HH:mm') } catch { return iso }
}

export function WebLeadsPage() {
  const { data: leads, isLoading, isError, refetch } = useWebLeads()
  const update = useUpdateWebLead()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todos' | WebLeadStatus>('todos')
  const [notas, setNotas] = useState('')

  const list = useMemo(
    () => (leads ?? []).filter((l) => filtro === 'todos' || l.estado === filtro),
    [leads, filtro],
  )
  const selected = list.find((l) => l.id === selectedId) ?? list[0] ?? null

  const cambiarEstado = (l: WebLead, estado: WebLeadStatus) => {
    update.mutate(
      { id: l.id, estado },
      {
        onSuccess: () => toast.success('Estado actualizado'),
        onError: () => toast.error('No se pudo actualizar — ¿workflow "CRM API - Web Lead" activo?'),
      },
    )
  }

  const guardarNotas = (l: WebLead) => {
    update.mutate(
      { id: l.id, notas_internas: notas },
      {
        onSuccess: () => toast.success('Notas guardadas'),
        onError: () => toast.error('No se pudieron guardar las notas'),
      },
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Solicitudes Web"
        subtitle="Mensajes recibidos desde el formulario de contacto de jddeveloper.com"
        actions={
          <Button variant="outline" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Button>
        }
      />

      {/* Filtro por estado */}
      <div className="flex flex-wrap items-center gap-2">
        {(['todos', ...ESTADOS.map((e) => e.id)] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filtro === f
                ? 'bg-primary-500 text-white'
                : 'bg-surface text-muted hover:text-fg'
            }`}
          >
            {f === 'todos' ? 'Todos' : ESTADOS.find((e) => e.id === f)?.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
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
          icon={<Globe className="h-8 w-8" />}
          title="Sin solicitudes todavía"
          description="Cuando alguien complete el formulario de contacto de la web, aparecerá aquí automáticamente."
        />
      )}

      {!isLoading && !isError && list.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,380px)_1fr]">
          {/* Lista */}
          <div className="card divide-y divide-border overflow-hidden p-0">
            {list.map((l) => {
              const est = estadoDe(l)
              const active = selected?.id === l.id
              return (
                <button
                  key={l.id}
                  onClick={() => { setSelectedId(l.id); setNotas(l.notasInternas ?? '') }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface ${active ? 'bg-surface' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold text-fg" title={l.nombre}>{l.nombre}</p>
                      <Badge className={`shrink-0 ${est.badge}`}>{est.label}</Badge>
                    </div>
                    <p className="min-w-0 truncate text-xs text-muted" title={l.asunto || l.mensaje}>
                      {l.asunto || l.mensaje}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted">{fecha(l.fechaHora)}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Detalle */}
          {selected && (
            <div className="card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-bold text-fg" title={selected.nombre}>{selected.nombre}</h2>
                  <p className="truncate text-sm text-muted" title={selected.email}>
                    {selected.email}{selected.empresa ? ` · ${selected.empresa}` : ''}{selected.telefono ? ` · ${selected.telefono}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select
                    value={selected.estado}
                    onChange={(e) => cambiarEstado(selected, e.target.value as WebLeadStatus)}
                  >
                    {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </Select>
                  <a href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.asunto ?? 'Tu consulta en JD Developer')}`}>
                    <Button><Mail className="h-4 w-4" /> Responder</Button>
                  </a>
                </div>
              </div>

              {selected.asunto && (
                <p className="text-sm font-semibold text-fg">{selected.asunto}</p>
              )}
              <p className="whitespace-pre-wrap rounded-xl bg-surface p-4 text-sm text-fg">{selected.mensaje}</p>

              <div className="grid gap-2 text-xs text-muted sm:grid-cols-2">
                <p><span className="font-medium text-fg">Recibido:</span> {fecha(selected.fechaHora)}</p>
                <p><span className="font-medium text-fg">Fuente:</span> {selected.fuente} · {selected.formulario ?? 'contacto'}</p>
                {selected.url && <p className="min-w-0 truncate sm:col-span-2" title={selected.url}><span className="font-medium text-fg">URL:</span> {selected.url}</p>}
                {selected.referrer && <p className="min-w-0 truncate sm:col-span-2" title={selected.referrer}><span className="font-medium text-fg">Referrer:</span> {selected.referrer}</p>}
                {selected.utmSource && <p><span className="font-medium text-fg">UTM:</span> {selected.utmSource}/{selected.utmMedium}/{selected.utmCampaign}</p>}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-fg">Notas internas</p>
                <Textarea
                  rows={3}
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                  placeholder="Notas del equipo sobre esta solicitud…"
                />
                <Button variant="outline" disabled={update.isPending} onClick={() => guardarNotas(selected)}>
                  <Save className="h-4 w-4" /> Guardar notas
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
