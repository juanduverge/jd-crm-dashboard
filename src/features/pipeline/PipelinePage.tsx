import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, rectIntersection, type CollisionDetection,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { LayoutGrid, List, Filter, RefreshCw, X, TrendingUp, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Select, Badge, Skeleton } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { useLeads, useDeleteLead, useNichos } from '@/hooks/useData'
import { useLeadsStore } from '@/store/leadsStore'
import { OPEN_STAGES, STAGE_BY_ID, forecast, isStale, daysInStage } from '@/lib/pipeline'
import { formatCurrency, cn, scoreColor } from '@/lib/utils'
import { LeadForm } from '../leads/LeadForm'
import { LeadDrawer } from '../leads/LeadDrawer'
import { KanbanCard } from './KanbanCard'
import { KanbanColumn } from './KanbanColumn'
import { OpportunityForm } from './OpportunityForm'
import { HScrollBoard } from './HScrollBoard'
import { CerrarDropZone, CERRAR_DROP_ID } from './CerrarDropZone'
import { CerrarLeadModal } from './CerrarLeadModal'
import type { Lead, LeadStatus } from '@/types'
import { formToLeadPatch, type LeadFormValues } from '../leads/leadSchema'

// Columnas del tablero: solo las 7 etapas abiertas. Los leads ganados/perdidos
// ya NO se listan aquí (antes había una columna combinada que se llenaba sin
// límite y saturaba la vista): viven en /archivo, y se cierran arrastrando a
// la zona de cierre, que pide ganado/perdido + motivo.

export function PipelinePage() {
  const { isLoading, isError, refetch, isFetching } = useLeads()
  const leads = useLeadsStore((s) => s.leads)
  const { addLead, updateLead, moveStage, removeLeads } = useLeadsStore()
  const deleteLead = useDeleteLead()
  const nichos = useNichos()

  const [view, setView] = useState<'kanban' | 'list'>('kanban')
  const [showFilters, setShowFilters] = useState(false)
  const [fNicho, setFNicho] = useState('')
  const [fPrioridad, setFPrioridad] = useState('')
  const [fResponsable, setFResponsable] = useState('')
  const [fValorMin, setFValorMin] = useState(0)
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null)
  const drawerLead = drawerLeadId ? (leads.find((l) => l.id === drawerLeadId) ?? null) : null
  const [formStage, setFormStage] = useState<LeadStatus | null>(null)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lead | null>(null)
  const [editOpp, setEditOpp] = useState<Lead | null>(null)
  const [cerrando, setCerrando] = useState<Lead | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Colisión: prioriza el puntero dentro de una columna (funciona en cualquier
  // dirección, incluso hacia columnas vacías/cortas); si el puntero cae en un
  // hueco, usa intersección de rectángulos como respaldo.
  const collisionDetection: CollisionDetection = (args) => {
    const pointer = pointerWithin(args)
    return pointer.length > 0 ? pointer : rectIntersection(args)
  }

  const responsables = useMemo(
    () => [...new Set(leads.map((l) => l.responsable).filter(Boolean))] as string[],
    [leads],
  )

  // Solo leads ACTIVOS: los cerrados (ganado/perdido) se consultan en /archivo.
  const activos = useMemo(
    () => leads.filter((l) => l.estado !== 'ganado' && l.estado !== 'perdido'),
    [leads],
  )
  const archivados = useMemo(
    () => leads.filter((l) => l.estado === 'ganado' || l.estado === 'perdido'),
    [leads],
  )

  const filtered = useMemo(
    () =>
      activos.filter(
        (l) =>
          (!fNicho || l.nicho === fNicho) &&
          (!fPrioridad || l.prioridad === fPrioridad) &&
          (!fResponsable || l.responsable === fResponsable) &&
          (l.valorEstimado || 0) >= fValorMin,
      ),
    [activos, fNicho, fPrioridad, fResponsable, fValorMin],
  )

  const fc = useMemo(() => forecast(filtered), [filtered])
  // `filtered` ya solo contiene abiertos, así que el total es directo.
  const totalOpen = useMemo(
    () => filtered.reduce((s, l) => s + (l.valorEstimado || 0), 0),
    [filtered],
  )
  // El ganado sale del archivo, no del tablero: ahí ya no hay leads cerrados.
  const ganado = useMemo(
    () => archivados.filter((l) => l.estado === 'ganado').reduce((s, l) => s + (l.valorEstimado || 0), 0),
    [archivados],
  )
  const staleCount = useMemo(() => filtered.filter(isStale).length, [filtered])

  const onDragStart = (e: DragStartEvent) => setActiveLead((e.active.data.current?.lead as Lead) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setActiveLead(null)
    const overId = e.over?.id as string | undefined
    const lead = e.active.data.current?.lead as Lead | undefined
    if (!overId || !lead) return
    // Soltar en la zona de cierre no mueve de etapa: abre el diálogo que pide
    // ganado/perdido + motivo, y de ahí el lead se va al archivo.
    if (overId === CERRAR_DROP_ID) {
      setCerrando(lead)
      return
    }
    const destino = overId as LeadStatus
    if (lead.estado === destino) return
    moveStage(lead.id, destino)
    toast.success(`${lead.empresa} → ${STAGE_BY_ID[destino].label}`)
  }

  const handleSubmit = (values: LeadFormValues) => {
    const patch = formToLeadPatch(values)
    if (editing) {
      updateLead(editing.id, patch)
      toast.success('Lead actualizado')
    } else {
      addLead({
        ...patch,
        id: `L-${Date.now()}`,
        fechaCaptura: new Date().toISOString().slice(0, 10),
        fechaUltimoMovimiento: new Date().toISOString(),
      } as Lead)
      toast.success('Lead agregado')
    }
    setFormStage(null)
    setEditing(null)
  }

  const clearFilters = () => { setFNicho(''); setFPrioridad(''); setFResponsable(''); setFValorMin(0) }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    try {
      await deleteLead.mutateAsync({ leadId: id })
      removeLeads([id])
      toast.success(`${deleteTarget.empresa} eliminado`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar el lead')
    }
    setDeleteTarget(null)
  }

  return (
    <div>
      <PageHeader
        title="💰 Pipeline"
        subtitle={`${filtered.length} leads · ${formatCurrency(totalOpen)} en juego`}
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-border">
              <button onClick={() => setView('kanban')} className={cn('flex items-center gap-1 px-3 py-1.5 text-xs', view === 'kanban' ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}>
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
              <button onClick={() => setView('list')} className={cn('flex items-center gap-1 px-3 py-1.5 text-xs', view === 'list' ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}>
                <List className="h-3.5 w-3.5" /> Lista
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-4 w-4" /> Filtros
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Sincronizar
            </Button>
          </>
        }
      />

      {/* Métricas de forecast */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Forecast del mes" value={formatCurrency(fc)} icon={<TrendingUp className="h-4 w-4" />} accent="text-primary-500" />
        <MetricCard label="Pipeline abierto" value={formatCurrency(totalOpen)} />
        <MetricCard label="Cerrado ganado" value={formatCurrency(ganado)} accent="text-green-500" />
        <MetricCard
          label="Leads estancados"
          value={`${staleCount}`}
          icon={staleCount ? <AlertTriangle className="h-4 w-4" /> : undefined}
          accent={staleCount ? 'text-red-500' : undefined}
        />
      </div>

      {showFilters && (
        <div className="card mb-4 flex flex-wrap items-end gap-3 p-3">
          <label className="text-xs text-muted">Nicho
            <Select className="mt-1 w-40" value={fNicho} onChange={(e) => setFNicho(e.target.value)}>
              <option value="">Todos</option>
              {nichos.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted">Prioridad
            <Select className="mt-1 w-32" value={fPrioridad} onChange={(e) => setFPrioridad(e.target.value)}>
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </Select>
          </label>
          <label className="text-xs text-muted">Vendedor
            <Select className="mt-1 w-36" value={fResponsable} onChange={(e) => setFResponsable(e.target.value)}>
              <option value="">Todos</option>
              {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </label>
          <label className="text-xs text-muted">Valor mínimo: {formatCurrency(fValorMin)}
            <input type="range" min={0} max={10000} step={500} value={fValorMin} onChange={(e) => setFValorMin(+e.target.value)} className="mt-2 block w-44 accent-primary-400" />
          </label>
          <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4" /> Limpiar</Button>
        </div>
      )}

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted">No se pudo conectar con n8n para leer el pipeline.</p>
          <Button size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /> Reintentar</Button>
        </div>
      ) : isLoading ? (
        <div className="flex gap-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-96 w-72" />)}</div>
      ) : view === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <HScrollBoard className="max-h-[calc(100vh-15rem)] overflow-y-auto">
            <div className="flex gap-3 pb-3">
              {OPEN_STAGES.map((stage) => (
                <KanbanColumn key={stage.id} stage={stage} leads={filtered} onOpen={(l) => setDrawerLeadId(l.id)} onAdd={setFormStage} onDelete={setDeleteTarget} onEdit={setEditOpp} />
              ))}
              {/* Zona de cierre: reemplaza a la antigua columna Ganado/Perdido */}
              <CerrarDropZone archivados={archivados.length} />
            </div>
          </HScrollBoard>
          <DragOverlay>{activeLead ? <div className="w-64"><KanbanCard lead={activeLead} onOpen={() => {}} /></div> : null}</DragOverlay>
        </DndContext>
      ) : (
        <ListView leads={filtered} onOpen={(l) => setDrawerLeadId(l.id)} />
      )}

      <LeadForm
        open={formStage !== null || editing !== null}
        onClose={() => { setFormStage(null); setEditing(null) }}
        onSubmit={handleSubmit}
        initial={editing ?? (formStage ? ({ estado: formStage } as Lead) : null)}
      />
      <LeadDrawer
        lead={drawerLead}
        onClose={() => setDrawerLeadId(null)}
        onEdit={(l) => { setDrawerLeadId(null); setEditing(l) }}
        onMoveStage={(id, estado) => { moveStage(id, estado); toast.success('Etapa actualizada') }}
      />
      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Eliminar lead"
        itemLabel={deleteTarget?.empresa}
        warning="También se eliminará su registro en Pipeline. Sus notas y tareas asociadas permanecerán, pero quedarán sin lead visible mientras esté en la Papelera."
      />
      <OpportunityForm
        lead={editOpp}
        open={!!editOpp}
        onClose={() => setEditOpp(null)}
        onSave={(id, patch) => { updateLead(id, patch); toast.success('Oportunidad actualizada') }}
      />
      <CerrarLeadModal lead={cerrando} onClose={() => setCerrando(null)} />
    </div>
  )
}

function MetricCard({ label, value, icon, accent }: { label: string; value: string; icon?: React.ReactNode; accent?: string }) {
  return (
    <div className="card p-3">
      <p className="flex items-center gap-1 text-xs text-muted">{icon}{label}</p>
      <p className={cn('mt-1 text-xl font-bold text-fg', accent)}>{value}</p>
    </div>
  )
}

function ListView({ leads, onOpen }: { leads: Lead[]; onOpen: (l: Lead) => void }) {
  const sorted = [...leads].sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0))
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface-2 text-xs text-muted">
            <tr>
              <th className="max-w-[220px] px-3 py-3 text-left font-medium">Empresa</th>
              <th className="px-3 py-3 text-left font-medium">Etapa</th>
              <th className="px-3 py-3 text-left font-medium">Score</th>
              <th className="px-3 py-3 text-left font-medium">Valor</th>
              <th className="px-3 py-3 text-left font-medium">Prioridad</th>
              <th className="px-3 py-3 text-left font-medium">Días</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => {
              const sc = scoreColor(l.score)
              const stale = isStale(l)
              return (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                  <td className="max-w-[220px] px-3 py-2.5">
                    <button onClick={() => onOpen(l)} className="block max-w-full truncate font-medium text-fg hover:text-primary-600" title={l.empresa}>{l.empresa}</button>
                    <p className="truncate text-xs text-muted" title={l.ciudad || undefined}>{l.ciudad}</p>
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge><span className="h-2 w-2 rounded-full" style={{ background: STAGE_BY_ID[l.estado]?.color }} /> {STAGE_BY_ID[l.estado]?.label}</Badge>
                  </td>
                  <td className="px-3 py-2.5"><span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', sc.bg, sc.text)}>{l.score}</span></td>
                  <td className="px-3 py-2.5 font-medium text-fg">{l.valorEstimado ? formatCurrency(l.valorEstimado) : '—'}</td>
                  <td className="px-3 py-2.5 capitalize text-muted">{l.prioridad || '—'}</td>
                  <td className={cn('px-3 py-2.5', stale && 'font-semibold text-red-500')}>{daysInStage(l)}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
