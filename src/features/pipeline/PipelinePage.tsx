import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  pointerWithin, rectIntersection, type CollisionDetection,
  type DragStartEvent, type DragEndEvent,
} from '@dnd-kit/core'
import { LayoutGrid, List, Filter, RefreshCw, X, TrendingUp, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { useEsMovil } from '@/hooks/useMediaQuery'
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
import { TouchFilterBar } from '@/components/TouchFilterBar'
import { PrefFilterBar, pasaPrefs, type PrefKey } from '@/components/PrefFilterBar'
import { pasaFiltroToque } from '@/lib/touches'
import { today } from '@/lib/followUps'
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

  // Un tablero de cinco columnas de 288px en una pantalla de 360 es arrastrar
  // a ciegas: nunca ves dos etapas a la vez y el scroll vertical de cada
  // columna pelea con el horizontal del tablero. En el telefono se entra por
  // la lista; el kanban sigue estando a un toque para quien lo quiera.
  const esMovil = useEsMovil()
  const [view, setView] = useState<'kanban' | 'list'>(
    () => (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'list' : 'kanban'),
  )
  const [showFilters, setShowFilters] = useState(false)
  const [fNicho, setFNicho] = useState('')
  const [fPrioridad, setFPrioridad] = useState('')
  const [fResponsable, setFResponsable] = useState('')
  const [fValorMin, setFValorMin] = useState(0)
  // Filtro de toque/situación: vive fuera del panel plegable porque es la
  // pregunta que más se hace en el tablero ("¿a quién le toca hoy?").
  const [fToque, setFToque] = useState('')
  const [prefs, setPrefs] = useState<PrefKey[]>([])
  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  // El Resumen enlaza aquí con ?lead=<id> desde «Necesitan atención»: llegas
  // con la ficha ya abierta en vez de tener que buscarla en el tablero.
  const [params, setParams] = useSearchParams()
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(() => params.get('lead'))
  const cerrarDrawer = () => {
    setDrawerLeadId(null)
    if (params.get('lead')) {
      params.delete('lead')
      setParams(params, { replace: true })
    }
  }
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

  // Base para los recuentos de la barra de toques: todo lo demás ya aplicado,
  // para que cada píldora enseñe el número real que va a dar al pulsarla.
  const baseFiltrada = useMemo(
    () =>
      activos.filter(
        (l) =>
          (!fNicho || l.nicho === fNicho) &&
          (!fPrioridad || l.prioridad === fPrioridad) &&
          (!fResponsable || l.responsable === fResponsable) &&
          (l.valorEstimado || 0) >= fValorMin &&
          pasaPrefs(l, prefs),
      ),
    [activos, fNicho, fPrioridad, fResponsable, fValorMin, prefs],
  )

  // Conteo de las marcas: sobre el pipeline ya filtrado por lo demás, pero
  // sin aplicar las propias marcas —si no, la que está activa se contaría a
  // sí misma y las otras dos saldrían siempre a cero.
  const baseMarcas = useMemo(
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

  const hoy = today()
  const filtered = useMemo(
    () => baseFiltrada.filter((l) => pasaFiltroToque(l, fToque, hoy)),
    [baseFiltrada, fToque, hoy],
  )

  // Las métricas se calculan sobre `baseFiltrada`, no sobre `filtered`: la
  // píldora de toque es una forma de mirar el pipeline, no de redefinirlo.
  // Antes, pulsar «Touch 2» dejaba el forecast del mes en $0 y parecía que la
  // pantalla se había roto.
  const fc = useMemo(() => forecast(baseFiltrada), [baseFiltrada])
  const totalOpen = useMemo(
    () => baseFiltrada.reduce((s, l) => s + (l.valorEstimado || 0), 0),
    [baseFiltrada],
  )
  // El ganado sale del archivo, no del tablero: ahí ya no hay leads cerrados.
  const ganado = useMemo(
    () => archivados.filter((l) => l.estado === 'ganado').reduce((s, l) => s + (l.valorEstimado || 0), 0),
    [archivados],
  )
  const staleCount = useMemo(() => baseFiltrada.filter(isStale).length, [baseFiltrada])

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
        title="Pipeline"
        subtitle={fToque ? `${filtered.length} de ${baseFiltrada.length} leads` : `${baseFiltrada.length} leads · ${formatCurrency(totalOpen)} en juego`}
        actions={
          <>
            <div className="flex shrink-0 overflow-hidden rounded-xl border border-border">
              <button onClick={() => setView('kanban')} className={cn('flex min-h-[38px] items-center gap-1.5 px-3 text-xs font-medium transition-colors', view === 'kanban' ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}>
                <LayoutGrid className="h-3.5 w-3.5" /> Kanban
              </button>
              <button onClick={() => setView('list')} className={cn('flex min-h-[38px] items-center gap-1.5 px-3 text-xs font-medium transition-colors', view === 'list' ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}>
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
        <MetricCard label="Cerrado ganado" value={formatCurrency(ganado)} accent="text-[rgb(var(--ok))]" />
        <MetricCard
          label="Leads estancados"
          value={`${staleCount}`}
          icon={staleCount ? <AlertTriangle className="h-4 w-4" /> : undefined}
          accent={staleCount ? 'text-[rgb(var(--danger))]' : undefined}
        />
      </div>

      <TouchFilterBar
        leads={baseFiltrada}
        value={fToque}
        onChange={setFToque}
        gruposVisibles={['toque', 'situacion']}
        className="mb-3"
      />

      {/* Marcas personales: se suman a los filtros de arriba, no los sustituyen. */}
      <PrefFilterBar leads={baseMarcas} value={prefs} onChange={setPrefs} className="mb-4" />

      {showFilters && (
        <div className="card mb-4 grid grid-cols-1 gap-3 p-3 sm:flex sm:flex-wrap sm:items-end">
          <label className="t-label text-xs font-medium text-muted">Nicho
            <Select className="mt-1 w-full sm:w-40" value={fNicho} onChange={(e) => setFNicho(e.target.value)}>
              <option value="">Todos</option>
              {nichos.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
            </Select>
          </label>
          <label className="t-label text-xs font-medium text-muted">Prioridad
            <Select className="mt-1 w-full sm:w-32" value={fPrioridad} onChange={(e) => setFPrioridad(e.target.value)}>
              <option value="">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </Select>
          </label>
          <label className="t-label text-xs font-medium text-muted">Vendedor
            <Select className="mt-1 w-full sm:w-36" value={fResponsable} onChange={(e) => setFResponsable(e.target.value)}>
              <option value="">Todos</option>
              {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </label>
          <label className="t-label text-xs font-medium text-muted">Valor mínimo: {formatCurrency(fValorMin)}
            <input type="range" min={0} max={10000} step={500} value={fValorMin} onChange={(e) => setFValorMin(+e.target.value)} className="mt-2 block w-full accent-primary-400 sm:w-44" />
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
        <div className="flex gap-3 overflow-hidden">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-96 w-[85vw] shrink-0 sm:w-72" />)}</div>
      ) : !filtered.length ? (
        // Un filtro sin resultados dejaba columnas vacías y todo a cero, sin
        // una sola palabra que explicara por qué. Ahora lo dice y ofrece la
        // salida en el mismo sitio donde te has quedado atascado.
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="t-card">Ningún lead con este filtro</p>
          <p className="t-hint max-w-sm">
            {fToque
              ? 'El pipeline tiene leads, pero ninguno está en este punto de la secuencia.'
              : 'Ajusta los filtros o añade una oportunidad para empezar.'}
          </p>
          {(fToque || fNicho || fPrioridad || fResponsable || fValorMin > 0 || prefs.length > 0) && (
            <Button variant="outline" size="sm" onClick={() => { setFToque(''); setPrefs([]); clearFilters() }}>
              <X className="h-4 w-4" /> Quitar filtros
            </Button>
          )}
        </div>
      ) : view === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={collisionDetection} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <HScrollBoard className="max-h-[calc(100dvh-15rem)] overflow-y-auto snap-x snap-mandatory sm:snap-none">
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
        <ListView leads={filtered} onOpen={(l) => setDrawerLeadId(l.id)} esMovil={esMovil} />
      )}

      <LeadForm
        open={formStage !== null || editing !== null}
        onClose={() => { setFormStage(null); setEditing(null) }}
        onSubmit={handleSubmit}
        initial={editing ?? (formStage ? ({ estado: formStage } as Lead) : null)}
      />
      <LeadDrawer
        lead={drawerLead}
        onClose={() => cerrarDrawer()}
        onEdit={(l) => { cerrarDrawer(); setEditing(l) }}
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
      <p className="t-eyebrow flex items-center gap-1.5 truncate" title={label}>{icon}{label}</p>
      <p className={cn('t-num mt-1.5 text-lg leading-none sm:text-xl', accent)}>{value}</p>
    </div>
  )
}

function ListView({ leads, onOpen, esMovil }: { leads: Lead[]; onOpen: (l: Lead) => void; esMovil: boolean }) {
  const sorted = [...leads].sort((a, b) => (b.valorEstimado || 0) - (a.valorEstimado || 0))

  // Seis columnas no caben en 360px: la tabla obligaba a arrastrar de lado
  // para leer el valor, que es justo el dato por el que se ordena. En el
  // telefono cada oportunidad pasa a ser una tarjeta pulsable entera.
  if (esMovil) {
    return (
      <div className="space-y-2">
        {sorted.map((l) => {
          const sc = scoreColor(l.score)
          const stale = isStale(l)
          return (
            <button
              key={l.id}
              onClick={() => onOpen(l)}
              className="card w-full p-3 text-left transition-colors active:bg-surface-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="t-card truncate">{l.empresa}</p>
                  {l.ciudad && <p className="mt-0.5 truncate text-xs text-muted">{l.ciudad}</p>}
                </div>
                <span className={cn('shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold', sc.bg, sc.text)}>{l.score}</span>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <Badge><span className="h-2 w-2 rounded-full" style={{ background: STAGE_BY_ID[l.estado]?.color }} /> {STAGE_BY_ID[l.estado]?.label}</Badge>
                <span className="t-num text-sm">{l.valorEstimado ? formatCurrency(l.valorEstimado) : '—'}</span>
                <span className={cn('ml-auto text-xs tabular-nums', stale ? 'font-semibold text-[rgb(var(--danger))]' : 'text-muted')}>
                  {daysInStage(l)}d en etapa
                </span>
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th max-w-[220px]">Empresa</th>
              <th className="th">Etapa</th>
              <th className="th">Score</th>
              <th className="th">Valor</th>
              <th className="th">Prioridad</th>
              <th className="th">Días</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => {
              const sc = scoreColor(l.score)
              const stale = isStale(l)
              return (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                  <td className="td max-w-[220px]">
                    <button onClick={() => onOpen(l)} className="block max-w-full truncate font-medium text-fg hover:text-primary-600" title={l.empresa}>{l.empresa}</button>
                    <p className="truncate text-xs text-muted" title={l.ciudad || undefined}>{l.ciudad}</p>
                  </td>
                  <td className="td">
                    <Badge><span className="h-2 w-2 rounded-full" style={{ background: STAGE_BY_ID[l.estado]?.color }} /> {STAGE_BY_ID[l.estado]?.label}</Badge>
                  </td>
                  <td className="td"><span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', sc.bg, sc.text)}>{l.score}</span></td>
                  <td className="td font-medium">{l.valorEstimado ? formatCurrency(l.valorEstimado) : '—'}</td>
                  <td className="td capitalize text-muted">{l.prioridad || '—'}</td>
                  <td className={cn('td', stale && 'font-semibold text-[rgb(var(--danger))]')}>{daysInStage(l)}d</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
