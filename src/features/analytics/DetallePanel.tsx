import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Calculator, Info, Loader2, Search, X } from 'lucide-react'
import { Input } from '@/components/ui'
import { Drawer, Modal } from '@/components/ui/Modal'
import { STAGE_BY_ID } from '@/lib/pipeline'
import { cn } from '@/lib/utils'
import { analyticsService } from '@/services/analyticsService'
import { useProyectos } from '@/features/proyectos/useProyectos'
import type { Lead } from '@/types'
import { crearIndices, resolver, type Consulta, type Contexto } from './detalle'
import { GLOSARIO, type ClaveGlosario, type Termino } from './glosario'

/**
 * «Abrir un dato»: cualquier cifra de Analíticas envuelta en <Abrible> se
 * puede pulsar y enseña, en un panel lateral, los leads que la forman.
 *
 * El contexto es opcional a propósito: los mismos componentes (PorCanal,
 * Contratos…) se usan en Productividad, donde no hay proveedor. Allí las
 * cifras se pintan igual pero no se abren.
 */

interface Ctx {
  abrir: (q: Consulta) => void
  explicar: (t: ClaveGlosario) => void
}

const DetalleCtx = createContext<Ctx | null>(null)

export function useDetalle() {
  return useContext(DetalleCtx)
}

export function DetalleProvider({ children, leads, desde, hasta, nombreNicho }: {
  children: ReactNode
  leads: Lead[]
  desde: string
  hasta: string
  nombreNicho: (id?: string) => string
}) {
  const [consulta, setConsulta] = useState<Consulta | null>(null)
  const [termino, setTermino] = useState<ClaveGlosario | null>(null)

  // Los datos crudos se piden la primera vez que se abre algo, no al entrar:
  // la página carga igual de rápido que antes.
  const [activo, setActivo] = useState(false)
  const toques = useQuery({ queryKey: ['analytics', 'toques'], queryFn: analyticsService.toques, enabled: activo, staleTime: 60_000 })
  const eventos = useQuery({ queryKey: ['analytics', 'eventos'], queryFn: analyticsService.eventosAvance, enabled: activo, staleTime: 60_000 })
  const proyectos = useProyectos()

  const listo = !!toques.data && !!eventos.data
  const ctx = useMemo<Contexto | null>(() => (listo
    ? { leads, toques: toques.data!, eventos: eventos.data!, proyectos: proyectos.data ?? [], desde, hasta, nombreNicho }
    : null), [listo, leads, toques.data, eventos.data, proyectos.data, desde, hasta, nombreNicho])
  const ix = useMemo(() => (ctx ? crearIndices(ctx) : null), [ctx])
  const detalle = useMemo(() => (consulta && ctx && ix ? resolver(consulta, ctx, ix) : null), [consulta, ctx, ix])

  const api = useMemo<Ctx>(() => ({
    abrir: (q) => { setActivo(true); setConsulta(q) },
    explicar: (t) => setTermino(t),
  }), [])

  const error = toques.isError || eventos.isError

  return (
    <DetalleCtx.Provider value={api}>
      {children}

      <Drawer open={!!consulta} onClose={() => setConsulta(null)} width="max-w-lg">
        {consulta && (
          !detalle ? (
            <div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-muted">
              {error ? 'No se pudieron cargar los datos.' : <><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</>}
            </div>
          ) : (
            <ListaDetalle
              key={JSON.stringify(consulta)}
              titulo={detalle.titulo}
              termino={detalle.termino}
              formula={detalle.formula}
              filas={detalle.filas}
              onClose={() => setConsulta(null)}
              onExplicar={(t) => setTermino(t)}
            />
          )
        )}
      </Drawer>

      <ExplicacionModal termino={termino} onClose={() => setTermino(null)} />
    </DetalleCtx.Provider>
  )
}

function ListaDetalle({ titulo, termino, formula, filas, onClose, onExplicar }: {
  titulo: string
  termino?: ClaveGlosario
  formula?: string
  filas: ReturnType<typeof resolver>['filas']
  onClose: () => void
  onExplicar: (t: ClaveGlosario) => void
}) {
  const [q, setQ] = useState('')
  const visibles = q.trim()
    ? filas.filter((f) => `${f.empresa} ${f.sub ?? ''} ${f.dato ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    : filas

  return (
    <>
      <div className="sticky top-0 z-10 border-b border-border bg-surface px-4 py-3 sm:px-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="t-eyebrow">Qué hay detrás</p>
            <h2 className="t-card mt-0.5">{titulo}</h2>
            <p className="t-hint">{filas.length} {filas.length === 1 ? 'registro' : 'registros'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="btn-ghost h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9">
            <X className="h-5 w-5 sm:h-4 sm:w-4" />
          </button>
        </div>

        {(formula || termino) && (
          <div className="mt-3 rounded-xl bg-surface-2/70 px-3 py-2.5">
            {formula && (
              <p className="flex items-start gap-2 text-sm text-fg">
                <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                <span className="tabular-nums">{formula}</span>
              </p>
            )}
            {termino && (
              <button onClick={() => onExplicar(termino)} className={cn('flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400', formula && 'mt-1.5')}>
                <Info className="h-3.5 w-3.5" /> ¿Qué significa «{GLOSARIO[termino].titulo}»?
              </button>
            )}
          </div>
        )}

        {filas.length > 8 && (
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la lista…" className="pl-9" />
          </div>
        )}
      </div>

      {visibles.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted">{filas.length ? 'Nada coincide con la búsqueda.' : 'No hay registros para este dato en el periodo.'}</p>
      ) : (
        <ul className="divide-y divide-border">
          {visibles.map((f) => {
            const etapa = f.estado ? STAGE_BY_ID[f.estado] : undefined
            return (
              <li key={f.key}>
                <Link to={`/leads?lead=${f.leadId}`} className="group flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/60 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg group-hover:text-primary-600">{f.empresa}</p>
                    {f.sub && <p className="truncate text-xs text-muted">{f.sub}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                      {etapa && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-muted">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: etapa.color }} /> {etapa.label}
                        </span>
                      )}
                      {f.fecha && (
                        <span className="text-muted">
                          {new Date(f.fecha.length === 10 ? `${f.fecha}T12:00:00` : f.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                  {f.dato && <span className="max-w-[45%] shrink-0 truncate text-right text-xs font-medium tabular-nums text-fg" title={f.dato}>{f.dato}</span>}
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

function ExplicacionModal({ termino, onClose }: { termino: ClaveGlosario | null; onClose: () => void }) {
  const t: Termino | null = termino ? GLOSARIO[termino] : null
  return (
    <Modal open={!!t} onClose={onClose} title={t?.titulo}>
      {t && (
        <div className="space-y-4">
          <div>
            <p className="t-eyebrow mb-1">Qué es</p>
            <p className="text-sm leading-relaxed text-fg">{t.que}</p>
          </div>
          <div>
            <p className="t-eyebrow mb-1">Cómo se calcula</p>
            <p className="text-sm leading-relaxed text-fg">{t.calculo}</p>
          </div>
          {t.lectura && (
            <div className="rounded-xl bg-primary-50/70 px-3 py-2.5 dark:bg-primary-400/10">
              <p className="t-eyebrow mb-1 text-primary-700 dark:text-primary-300">Cómo leerlo</p>
              <p className="text-sm leading-relaxed text-fg">{t.lectura}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------
// Piezas para usar en las tarjetas
// ---------------------------------------------------------------

/**
 * Hace pulsable cualquier dato. Sin proveedor (Productividad) o sin `q`,
 * pinta el contenido tal cual.
 */
export function Abrible({ q, children, className, title }: { q?: Consulta; children: ReactNode; className?: string; title?: string }) {
  const d = useDetalle()
  if (!d || !q) return <span className={className}>{children}</span>
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); d.abrir(q) }}
      title={title ?? 'Ver qué hay detrás'}
      className={cn(
        'rounded-md text-left underline decoration-dotted decoration-muted/50 underline-offset-4 transition',
        'hover:bg-primary-50 hover:text-primary-700 hover:decoration-primary-400 dark:hover:bg-primary-400/10 dark:hover:text-primary-300',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** ⓘ junto a un término: abre su explicación. */
export function Explica({ t, className }: { t: ClaveGlosario; className?: string }) {
  const d = useDetalle()
  if (!d) return null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); d.explicar(t) }}
      aria-label={`Qué significa ${GLOSARIO[t].titulo}`}
      title={`¿Qué es «${GLOSARIO[t].titulo}»?`}
      className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-primary-600', className)}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
  )
}
