import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Banknote, CalendarClock, Check, CheckCircle2, ExternalLink, Loader2, PauseCircle, PlayCircle,
  RotateCcw, Trash2,
} from 'lucide-react'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { today } from '@/lib/followUps'
import { cn, formatCurrency } from '@/lib/utils'
import {
  ETAPAS_PROYECTO, diasEnEtapa, progresoRecopilacion, resumenCobros, textoEntrega,
} from '@/lib/proyectos'
import type { EtapaProyecto, Proyecto } from '@/types'
import { useActualizarProyecto, useEliminarProyecto, useProyecto } from './useProyectos'
import { SeccionAlcance, SeccionCobros, SeccionEnlaces, SeccionNotas, SeccionRecopilacion, SeccionResumen } from './secciones'

const PESTANAS = ['Resumen', 'Alcance', 'Cobros', 'Recopilación', 'Enlaces', 'Notas'] as const
type Pestana = (typeof PESTANAS)[number]

/** Campos que se editan en borrador y se guardan con la barra de abajo. */
type Editable = Omit<Proyecto, 'id' | 'leadId' | 'etapaDesde' | 'creadoEn' | 'actualizadoEn' | 'pagos'>

const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

/**
 * Borrador con fusión campo a campo. Cuando llega una versión nueva del
 * servidor (otro dispositivo, o la fase cambiada desde aquí mismo), solo se
 * actualizan los campos que el usuario NO ha tocado: así refrescar nunca se
 * come lo que está escribiendo.
 */
function useBorrador(servidor: Proyecto | null | undefined) {
  const [borrador, setBorrador] = useState<Proyecto | null>(null)
  const base = useRef<Proyecto | null>(null)

  useEffect(() => {
    if (!servidor) return
    setBorrador((actual) => {
      const anterior = base.current
      base.current = servidor
      if (!actual || !anterior || actual.id !== servidor.id) return servidor
      const fusion = { ...servidor } as Record<string, unknown>
      for (const k of Object.keys(servidor)) {
        const key = k as keyof Proyecto
        if (key !== 'pagos' && !igual(actual[key], anterior[key])) fusion[k] = actual[key]
      }
      return fusion as unknown as Proyecto
    })
  }, [servidor])

  const cambios = useMemo(() => {
    if (!borrador || !servidor) return {}
    const patch: Partial<Editable> = {}
    for (const k of Object.keys(borrador) as (keyof Editable)[]) {
      if (['id', 'leadId', 'etapaDesde', 'creadoEn', 'actualizadoEn', 'pagos'].includes(k)) continue
      if (!igual(borrador[k], servidor[k])) (patch as Record<string, unknown>)[k] = borrador[k]
    }
    return patch
  }, [borrador, servidor])

  const set = <K extends keyof Proyecto>(k: K, v: Proyecto[K]) =>
    setBorrador((b) => (b ? { ...b, [k]: v } : b))

  const descartar = () => servidor && setBorrador(servidor)

  return { borrador, set, cambios, descartar }
}

export function ProyectoPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: servidor, isLoading } = useProyecto(id)
  const actualizar = useActualizarProyecto()
  const eliminar = useEliminarProyecto()
  const { borrador, set, cambios, descartar } = useBorrador(servidor)
  const [pestana, setPestana] = useState<Pestana>('Resumen')
  const [borrando, setBorrando] = useState(false)

  const hayCambios = Object.keys(cambios).length > 0
  const hoy = today()

  // Salir con cambios sin guardar avisa, igual que cualquier editor.
  useEffect(() => {
    if (!hayCambios) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [hayCambios])

  if (isLoading || (servidor && !borrador)) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  if (!servidor || !borrador) {
    return (
      <EmptyState
        title="Este proyecto no existe o se eliminó"
        action={<Button size="sm" variant="outline" onClick={() => navigate('/proyectos')}>Volver a proyectos</Button>}
      />
    )
  }

  const p = borrador
  const cobros = resumenCobros({ precio: p.precio, pagos: servidor.pagos }, hoy)
  const entrega = textoEntrega(p, hoy)
  const rec = progresoRecopilacion(p)

  const guardar = async () => {
    try {
      await actualizar.mutateAsync({ id: p.id, patch: cambios })
      toast.success('Proyecto guardado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  // La fase y la pausa se guardan al momento: son un clic, no un formulario.
  const guardarYa = async (patch: Partial<Proyecto>, ok: string) => {
    try {
      await actualizar.mutateAsync({ id: p.id, patch })
      toast.success(ok)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const moverA = (etapa: EtapaProyecto) => {
    if (etapa === servidor.etapa) return
    const meta = ETAPAS_PROYECTO.find((e) => e.id === etapa)!
    guardarYa({ etapa }, `Fase: ${meta.label}`)
  }

  return (
    <div className={cn('mx-auto max-w-5xl', hayCambios && 'pb-20')}>
      {/* Cabecera */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link to="/proyectos" className="flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> Proyectos
        </Link>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => guardarYa({ enPausa: !servidor.enPausa }, servidor.enPausa ? 'Proyecto reanudado' : 'Proyecto en pausa')}
          >
            {servidor.enPausa
              ? <><PlayCircle className="h-4 w-4" /> Reanudar</>
              : <><PauseCircle className="h-4 w-4" /> Pausar</>}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setBorrando(true)} title="Eliminar proyecto" className="text-red-500">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mb-5">
        <input
          value={p.nombre}
          onChange={(e) => set('nombre', e.target.value)}
          className="t-page w-full rounded-lg bg-transparent px-1 -mx-1 outline-none transition hover:bg-surface-2/60 focus:bg-surface-2"
          aria-label="Nombre del proyecto"
        />
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {servidor.enPausa && <span className="badge-warn"><PauseCircle className="h-3 w-3" /> En pausa</span>}
          <span>{diasEnEtapa(servidor)} días en esta fase</span>
          {servidor.leadId && (
            <Link to={`/leads?lead=${servidor.leadId}`} className="flex items-center gap-1 hover:text-primary-600">
              Ver ficha del cliente <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Fases */}
      <div className="card mb-4 p-2">
        <div className="flex gap-1 overflow-x-auto sin-barra scroll-aislado">
          {ETAPAS_PROYECTO.map((e, i) => {
            const idx = ETAPAS_PROYECTO.findIndex((x) => x.id === servidor.etapa)
            const hecha = i < idx
            const actual = i === idx
            return (
              <button
                key={e.id}
                onClick={() => moverA(e.id)}
                title={e.hint}
                className={cn(
                  'flex min-w-[8.5rem] flex-1 shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition',
                  actual ? 'bg-surface-2 ring-1 ring-border' : 'hover:bg-surface-2/60',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                    hecha ? 'text-white' : actual ? 'text-white' : 'bg-surface-2 text-muted',
                  )}
                  style={hecha || actual ? { background: e.color } : undefined}
                >
                  {hecha ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn('min-w-0 truncate text-xs', actual ? 'font-semibold text-fg' : hecha ? 'text-fg' : 'text-muted')}>
                  {e.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Lo esencial de un vistazo */}
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <Dato
          icon={<Banknote className="h-3.5 w-3.5" />}
          label="Cobrado"
          value={`${cobros.porcentaje}%`}
          sub={cobros.total > 0 ? `${formatCurrency(cobros.cobrado, p.moneda)} de ${formatCurrency(cobros.total, p.moneda)}` : 'Sin precio'}
          barra={cobros.porcentaje}
          onClick={() => setPestana('Cobros')}
        />
        <Dato
          icon={<CalendarClock className="h-3.5 w-3.5" />}
          label="Entrega"
          value={p.fechaEntregaPrevista ? new Date(`${p.fechaEntregaPrevista}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : '—'}
          sub={entrega?.texto}
          subCls={entrega?.cls}
          onClick={() => setPestana('Resumen')}
        />
        <Dato
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Recopilado"
          value={`${rec.hechos}/${rec.total}`}
          sub={rec.total && rec.hechos === rec.total ? 'Todo recibido' : 'Material y accesos'}
          barra={rec.total ? Math.round((rec.hechos / rec.total) * 100) : 0}
          onClick={() => setPestana('Recopilación')}
        />
        <Dato
          icon={<RotateCcw className="h-3.5 w-3.5" />}
          label="Revisiones"
          value={`${p.rondasUsadas}/${p.rondasIncluidas}`}
          sub={p.rondasUsadas > p.rondasIncluidas ? 'Pasado: se cobra aparte' : 'Rondas usadas'}
          subCls={p.rondasUsadas > p.rondasIncluidas ? 'text-red-600 dark:text-red-400 font-medium' : undefined}
          onClick={() => setPestana('Alcance')}
        />
      </div>

      {/* Pestañas */}
      <div className="card overflow-hidden p-0">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-3 sin-barra scroll-aislado sm:px-4">
          {PESTANAS.map((t) => (
            <button
              key={t}
              onClick={() => setPestana(t)}
              className={cn(
                'shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-sm transition',
                pestana === t ? 'border-primary-400 font-medium text-fg' : 'border-transparent text-muted hover:text-fg',
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-4 sm:p-5">
          {pestana === 'Resumen' && <SeccionResumen p={p} set={set} />}
          {pestana === 'Alcance' && <SeccionAlcance p={p} set={set} />}
          {pestana === 'Cobros' && <SeccionCobros proyecto={servidor} precio={p.precio} moneda={p.moneda} set={set} />}
          {pestana === 'Recopilación' && <SeccionRecopilacion p={p} set={set} />}
          {pestana === 'Enlaces' && <SeccionEnlaces p={p} set={set} />}
          {pestana === 'Notas' && <SeccionNotas p={p} set={set} />}
        </div>
      </div>

      {/* Barra de guardar: solo aparece cuando hay algo que guardar */}
      {hayCambios && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-3 py-3 pb-[calc(0.75rem+var(--safe-bottom))] backdrop-blur sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <p className="text-sm text-muted">
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-500" />
              Cambios sin guardar
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={descartar} disabled={actualizar.isPending}>Descartar</Button>
              <Button size="sm" onClick={guardar} disabled={actualizar.isPending}>
                {actualizar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        open={borrando}
        onClose={() => setBorrando(false)}
        title="Eliminar proyecto"
        itemLabel={p.nombre}
        message="El proyecto deja de verse en el tablero. El lead ganado no se toca."
        onConfirm={async () => {
          await eliminar.mutateAsync(p.id)
          toast.success('Proyecto eliminado')
          navigate('/proyectos')
        }}
      />
    </div>
  )
}

function Dato({ icon, label, value, sub, subCls, barra, onClick }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; subCls?: string; barra?: number; onClick?: () => void
}) {
  return (
    <button onClick={onClick} className="card card-hover p-3 text-left">
      <p className="t-eyebrow flex items-center gap-1.5 truncate">{icon}{label}</p>
      <p className="t-num mt-1.5 text-xl leading-none">{value}</p>
      {sub && <p className={cn('mt-1 truncate text-[11px]', subCls ?? 'text-muted')} title={sub}>{sub}</p>}
      {barra !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
          <div className={cn('h-full rounded-full', barra === 100 ? 'bg-emerald-500' : 'bg-primary-400')} style={{ width: `${barra}%` }} />
        </div>
      )}
    </button>
  )
}
