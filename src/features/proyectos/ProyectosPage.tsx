import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  DndContext, DragOverlay, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertTriangle, Banknote, Briefcase, CheckCircle2, KanbanSquare, List, PauseCircle, Plus, Search, Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Input, Skeleton } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { HScrollBoard } from '@/features/pipeline/HScrollBoard'
import { useEsMovil } from '@/hooks/useMediaQuery'
import { today } from '@/lib/followUps'
import { cn, formatCurrency } from '@/lib/utils'
import {
  ETAPAS_PROYECTO, ETAPA_PROYECTO_META, TIPO_PROYECTO_LABEL, diasEnEtapa, progresoRecopilacion,
  resumenCobros, situacionEntrega, textoEntrega,
} from '@/lib/proyectos'
import type { EtapaProyecto, Proyecto } from '@/types'
import { useActualizarProyecto, useCrearProyecto, useProyectos } from './useProyectos'

type Filtro = 'todos' | 'curso' | 'pausa' | 'atencion'

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'curso', label: 'En curso' },
  { id: 'pausa', label: 'En pausa' },
  { id: 'atencion', label: 'Necesitan atención' },
]

/** Atrasado en la entrega o con un pago vencido: lo que hay que mirar hoy. */
function necesitaAtencion(p: Proyecto, hoy: string): boolean {
  return situacionEntrega(p, hoy).sit === 'atrasado' || resumenCobros(p, hoy).vencidos > 0
}

/**
 * Suma por moneda. Mezclar dólares y pesos en una sola cifra daría un número
 * que no es ninguna de las dos cosas.
 */
function porMoneda(proyectos: Proyecto[], campo: 'cobrado' | 'pendiente', hoy: string): string {
  const mapa = new Map<string, number>()
  for (const p of proyectos) {
    const v = resumenCobros(p, hoy)[campo]
    if (v > 0) mapa.set(p.moneda, (mapa.get(p.moneda) ?? 0) + v)
  }
  if (!mapa.size) return formatCurrency(0)
  return [...mapa.entries()].map(([m, v]) => formatCurrency(v, m)).join(' · ')
}

export function ProyectosPage() {
  const navigate = useNavigate()
  const esMovil = useEsMovil()
  const { data: proyectos, isLoading, isError, refetch } = useProyectos()
  const actualizar = useActualizarProyecto()
  const crear = useCrearProyecto()

  const [vista, setVista] = useState<'tablero' | 'lista'>(() => (esMovil ? 'lista' : 'tablero'))
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busqueda, setBusqueda] = useState('')
  const [arrastrando, setArrastrando] = useState<Proyecto | null>(null)
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')

  const hoy = today()

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (proyectos ?? []).filter((p) => {
      if (q && !`${p.nombre} ${p.tipo ?? ''} ${p.plataforma ?? ''}`.toLowerCase().includes(q)) return false
      if (filtro === 'curso') return !p.enPausa && !['entregado', 'mantenimiento'].includes(p.etapa)
      if (filtro === 'pausa') return p.enPausa
      if (filtro === 'atencion') return necesitaAtencion(p, hoy)
      return true
    })
  }, [proyectos, busqueda, filtro, hoy])

  const kpis = useMemo(() => {
    const todos = proyectos ?? []
    const enCurso = todos.filter((p) => !['entregado', 'mantenimiento'].includes(p.etapa))
    return {
      enCurso: enCurso.length,
      porCobrar: porMoneda(todos, 'pendiente', hoy),
      cobrado: porMoneda(todos, 'cobrado', hoy),
      atencion: todos.filter((p) => necesitaAtencion(p, hoy)).length,
    }
  }, [proyectos, hoy])

  // En el teléfono el arrastre arranca con una pulsación larga: con el
  // sensor de puntero de siempre, intentar hacer scroll movía la tarjeta.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  )

  const onDragStart = (e: DragStartEvent) => setArrastrando((e.active.data.current?.proyecto as Proyecto) ?? null)
  const onDragEnd = (e: DragEndEvent) => {
    setArrastrando(null)
    const p = e.active.data.current?.proyecto as Proyecto | undefined
    const destino = e.over?.id as EtapaProyecto | undefined
    if (!p || !destino || destino === p.etapa) return
    actualizar.mutate(
      { id: p.id, patch: { etapa: destino } },
      {
        onSuccess: () => toast.success(`${p.nombre} → ${ETAPA_PROYECTO_META[destino].label}`),
        onError: () => toast.error('No se pudo mover el proyecto'),
      },
    )
  }

  const onCrear = async () => {
    if (!nuevoNombre.trim()) return
    try {
      const id = await crear.mutateAsync(nuevoNombre)
      setNuevoAbierto(false)
      setNuevoNombre('')
      navigate(`/proyectos/${id}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear el proyecto')
    }
  }

  const abrir = (p: Proyecto) => navigate(`/proyectos/${p.id}`)

  return (
    <div>
      <PageHeader
        title="Proyectos"
        subtitle="Lo que pasa después de ganar: fase, alcance, cobros y entregas"
        actions={
          <>
            <div className="flex rounded-xl border border-border p-0.5">
              {([['tablero', KanbanSquare, 'Tablero'], ['lista', List, 'Lista']] as const).map(([id, Icon, label]) => (
                <button
                  key={id}
                  onClick={() => setVista(id)}
                  className={cn(
                    'flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition sm:h-8',
                    vista === id ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={() => setNuevoAbierto(true)}>
              <Plus className="h-4 w-4" /> Nuevo proyecto
            </Button>
          </>
        }
      />

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:mb-5 sm:grid-cols-4 sm:gap-3">
        <Kpi icon={<Briefcase className="h-3.5 w-3.5" />} label="En curso" value={String(kpis.enCurso)} />
        <Kpi icon={<Wallet className="h-3.5 w-3.5" />} label="Por cobrar" value={kpis.porCobrar} />
        <Kpi icon={<Banknote className="h-3.5 w-3.5" />} label="Cobrado" value={kpis.cobrado} accent="text-emerald-600 dark:text-emerald-400" />
        <Kpi
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
          label="Necesitan atención"
          value={String(kpis.atencion)}
          accent={kpis.atencion ? 'text-red-600 dark:text-red-400' : undefined}
          onClick={kpis.atencion ? () => setFiltro('atencion') : undefined}
        />
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar proyecto…" className="pl-9" />
        </div>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sin-barra sm:mx-0 sm:px-0">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltro(f.id)}
              className={cn(
                'h-9 shrink-0 rounded-full px-3 text-xs font-medium transition sm:h-8',
                filtro === f.id ? 'bg-fg text-bg' : 'bg-surface-2 text-muted hover:text-fg',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <EmptyState
          title="No se pudieron cargar los proyectos"
          description="Revisa la conexión e inténtalo otra vez."
          action={<Button size="sm" variant="outline" onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80 w-[85vw] shrink-0 sm:w-72" />)}
        </div>
      ) : !proyectos?.length ? (
        <EmptyState
          icon={<Briefcase className="h-10 w-10" />}
          title="Aún no hay proyectos"
          description="Cada lead que pasa a «Cerrado ganado» crea su proyecto solo. También puedes crear uno a mano."
          action={<Button size="sm" onClick={() => setNuevoAbierto(true)}><Plus className="h-4 w-4" /> Nuevo proyecto</Button>}
        />
      ) : !filtrados.length ? (
        <EmptyState
          title="Ningún proyecto con este filtro"
          action={<Button size="sm" variant="outline" onClick={() => { setFiltro('todos'); setBusqueda('') }}>Quitar filtros</Button>}
        />
      ) : vista === 'tablero' ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setArrastrando(null)}>
          <HScrollBoard className="snap-x snap-mandatory sm:snap-none">
            <div className="flex gap-3 pb-2">
              {ETAPAS_PROYECTO.map((etapa) => (
                <Columna key={etapa.id} etapa={etapa} proyectos={filtrados.filter((p) => p.etapa === etapa.id)} hoy={hoy} onOpen={abrir} />
              ))}
            </div>
          </HScrollBoard>
          <DragOverlay>
            {arrastrando && <TarjetaContenido p={arrastrando} hoy={hoy} className="rotate-[1.5deg] shadow-xl ring-2 ring-primary-400" />}
          </DragOverlay>
        </DndContext>
      ) : (
        <ListaPorEtapa proyectos={filtrados} hoy={hoy} onOpen={abrir} />
      )}

      <Modal
        open={nuevoAbierto}
        onClose={() => setNuevoAbierto(false)}
        title="Nuevo proyecto"
        footer={
          <>
            <Button variant="outline" onClick={() => setNuevoAbierto(false)}>Cancelar</Button>
            <Button onClick={onCrear} disabled={!nuevoNombre.trim() || crear.isPending}>
              {crear.isPending ? 'Creando…' : 'Crear y abrir'}
            </Button>
          </>
        }
      >
        <label className="t-label mb-1.5" htmlFor="nuevo-proyecto">Nombre del proyecto o cliente</label>
        <Input
          id="nuevo-proyecto"
          autoFocus
          value={nuevoNombre}
          onChange={(e) => setNuevoNombre(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onCrear()}
          placeholder="Ej. Web de Clínica Dental Sonrisa"
        />
        <p className="t-hint mt-2">
          Los leads que pasan a «Cerrado ganado» ya crean su proyecto solos. Usa esto para clientes que llegaron por otro lado.
        </p>
      </Modal>
    </div>
  )
}

function Kpi({ icon, label, value, accent, onClick }: {
  icon: React.ReactNode; label: string; value: string; accent?: string; onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={cn('card p-3 text-left', onClick && 'card-hover cursor-pointer')}>
      <p className="t-eyebrow flex items-center gap-1.5 truncate">{icon}{label}</p>
      <p className={cn('t-num mt-1.5 truncate text-lg leading-none sm:text-xl', accent)} title={value}>{value}</p>
    </Comp>
  )
}

function Columna({ etapa, proyectos, hoy, onOpen }: {
  etapa: (typeof ETAPAS_PROYECTO)[number]; proyectos: Proyecto[]; hoy: string; onOpen: (p: Proyecto) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id })
  return (
    <div className="flex w-[85vw] max-w-[18rem] shrink-0 snap-start flex-col sm:w-72">
      <div className="mb-2 rounded-xl border border-border bg-surface px-3 py-2" title={etapa.hint}>
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: etapa.color }} />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{etapa.label}</span>
          <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-xs text-muted">{proyectos.length}</span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted">{etapa.hint}</p>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-[140px] flex-1 flex-col gap-2 rounded-xl border-2 border-dashed p-1.5 transition',
          isOver ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-400/10' : 'border-transparent',
        )}
      >
        {proyectos.map((p) => <TarjetaArrastrable key={p.id} p={p} hoy={hoy} onOpen={onOpen} />)}
        {!proyectos.length && <p className="py-6 text-center text-xs text-muted/60">Sin proyectos</p>}
      </div>
    </div>
  )
}

function TarjetaArrastrable({ p, hoy, onOpen }: { p: Proyecto; hoy: string; onOpen: (p: Proyecto) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: p.id, data: { proyecto: p } })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      onClick={() => onOpen(p)}
      {...listeners}
      {...attributes}
      className={cn('cursor-pointer', isDragging && 'opacity-30')}
    >
      <TarjetaContenido p={p} hoy={hoy} />
    </div>
  )
}

/** La tarjeta responde de un vistazo: qué es, cuánto se ha cobrado y cuándo se entrega. */
function TarjetaContenido({ p, hoy, className }: { p: Proyecto; hoy: string; className?: string }) {
  const cobros = resumenCobros(p, hoy)
  const entrega = textoEntrega(p, hoy)
  const rec = progresoRecopilacion(p)
  const dias = diasEnEtapa(p)
  const detalle = [
    p.tipo ? TIPO_PROYECTO_LABEL[p.tipo] ?? p.tipo : null,
    p.numPaginas ? `${p.numPaginas} pág.` : p.paginas.length ? `${p.paginas.length} pág.` : null,
    p.plataforma,
  ].filter(Boolean).join(' · ')

  return (
    <div className={cn(
      'card group p-3 transition hover:-translate-y-0.5 hover:border-primary-300/60 hover:shadow-card-hover',
      p.enPausa && 'opacity-70',
      className,
    )}>
      <div className="flex items-start gap-2">
        <p className="t-card min-w-0 flex-1 truncate" title={p.nombre}>{p.nombre}</p>
        {p.enPausa && <span className="badge-warn shrink-0"><PauseCircle className="h-3 w-3" /> Pausa</span>}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{detalle || 'Alcance sin definir'}</p>

      {/* Cobros */}
      <div className="mt-3">
        <div className="mb-1 flex items-baseline justify-between gap-2 text-[11px]">
          <span className="text-muted">
            {cobros.total > 0
              ? <><span className="t-num text-xs">{formatCurrency(cobros.cobrado, p.moneda)}</span> de {formatCurrency(cobros.total, p.moneda)}</>
              : 'Sin precio'}
          </span>
          <span className={cn('t-num text-xs', cobros.porcentaje === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
            {cobros.porcentaje}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-all', cobros.porcentaje === 100 ? 'bg-emerald-500' : 'bg-primary-400')}
            style={{ width: `${cobros.porcentaje}%` }}
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {entrega && <span className={entrega.cls}>{entrega.texto}</span>}
        {rec.total > 0 && (
          <span className={cn('flex items-center gap-1', rec.hechos === rec.total ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted')}>
            <CheckCircle2 className="h-3 w-3" /> {rec.hechos}/{rec.total}
          </span>
        )}
        {cobros.vencidos > 0 && <span className="badge-danger">Pago vencido</span>}
        {dias >= 14 && !['entregado', 'mantenimiento'].includes(p.etapa) && (
          <span className="text-amber-600 dark:text-amber-400" title="Días en esta fase">{dias} d en fase</span>
        )}
      </div>
    </div>
  )
}

/** En el teléfono el tablero obliga a deslizar columna a columna; la lista se lee de arriba abajo. */
function ListaPorEtapa({ proyectos, hoy, onOpen }: { proyectos: Proyecto[]; hoy: string; onOpen: (p: Proyecto) => void }) {
  return (
    <div className="space-y-5">
      {ETAPAS_PROYECTO.map((etapa) => {
        const grupo = proyectos.filter((p) => p.etapa === etapa.id)
        if (!grupo.length) return null
        return (
          <section key={etapa.id}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: etapa.color }} />
              <h2 className="t-eyebrow">{etapa.label}</h2>
              <span className="text-xs text-muted">{grupo.length}</span>
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {grupo.map((p) => (
                <button key={p.id} onClick={() => onOpen(p)} className="text-left">
                  <TarjetaContenido p={p} hoy={hoy} />
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
