import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  ArrowRight, CalendarDays, CalendarPlus, Check, CheckCircle2, Circle, ExternalLink, Plus, Target, Video, Zap,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, CardHeader, CardTitle, Input, Skeleton } from '@/components/ui'
import {
  useActualizarEvento, useCreateTarea, useEntradaAbierta, useEventos, useFollowUpsAgenda, useGoals,
  useGoogleCalendarEstado, useMetricasCrm, useRegistrarAvance, useResumenTiempo, useSincronizarGoogle, useTareas, useUpdateTarea,
} from '@/hooks/useData'
import { useAuthStore } from '@/store/authStore'
import { CompletarFollowUpModal } from '@/features/followups/CompletarFollowUpModal'
import { TIPO_META } from '@/lib/followUps'
import { fmtMetrica } from '@/lib/metricas'
import { cn } from '@/lib/utils'
import type { Evento, FollowUpAgendaItem, Goal, Tarea } from '@/types'
import { ItemModal } from '../calendario/ItemModal'
import { Cronometro } from '../tiempo/RegistroTiempoView'
import { fmtDuracion, segundosDesde } from '../tiempo/tiempoMeta'
import { iso, rangoMes } from '../shared/goalMeta'
import { libresParaHoy, metasDelMes, ritmoHoy } from '../shared/ritmoMeta'

/**
 * Mi día — todo lo de hoy en una pantalla, para ir tachándolo.
 *
 * Sustituye a tres pantallas que había que cruzar a mano (Horario del día,
 * Tareas, Registro de tiempo). Aquí está la agenda (con Google Calendar si
 * está conectado), los contactos que tocan, las tareas, lo que te toca de
 * cada meta y el cronómetro. Cada cosa se cierra desde aquí mismo.
 */
export default function MiDiaPage() {
  const ahora = new Date()
  const hoy = iso(ahora)
  const desdeIso = new Date(`${hoy}T00:00:00`).toISOString()
  const hastaIso = new Date(`${hoy}T23:59:59`).toISOString()
  const responsable = useAuthStore((s) => s.user?.name)
  const mes = rangoMes(ahora)

  const eventos = useEventos(desdeIso, hastaIso)
  useSincronizarGoogle(desdeIso, hastaIso)
  const agenda = useFollowUpsAgenda()
  const tareas = useTareas()
  const goals = useGoals(mes.desde, mes.hasta)
  const metricasHoy = useMetricasCrm(hoy, hoy)
  const tiempo = useResumenTiempo(hoy, hoy)
  const { data: abierta } = useEntradaAbierta(responsable)

  const [agendando, setAgendando] = useState(false)
  const [abrirEvento, setAbrirEvento] = useState<Evento | null>(null)

  const metas = useMemo(() => metasDelMes(goals.data, hoy), [goals.data, hoy])
  const libres = useMemo(() => libresParaHoy(goals.data, hoy), [goals.data, hoy])
  const segHoy = (tiempo.data ?? []).reduce((s, t) => s + t.segundos, 0) + (abierta && !abierta.fin ? segundosDesde(abierta.inicio) : 0)
  const p = metricasHoy.data?.periodo

  return (
    <div>
      <PageHeader
        title="Mi día"
        subtitle={capitalizar(format(ahora, "EEEE d 'de' LLLL", { locale: es }))}
        actions={<Button size="sm" onClick={() => setAgendando(true)}><CalendarPlus className="h-4 w-4" />Agendar reunión</Button>}
      />

      {/* Lo hecho hoy, en una línea: motiva más que lo pendiente. */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Hecho label="contactos hechos" valor={p ? String(p.contactos_realizados) : '…'} />
        <Hecho label="respuestas" valor={p ? String(p.respuestas_recibidas) : '…'} />
        <Hecho label="tareas terminadas" valor={p ? String(p.tareas_completadas) : '…'} />
        <Hecho label="trabajado" valor={fmtDuracion(segHoy)} />
      </div>

      <Cronometro fecha={hoy} abierta={abierta ?? null} metasMes={metas} responsable={responsable} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Agenda eventos={eventos.data ?? []} cargando={eventos.isLoading} onAbrir={setAbrirEvento} onAgendar={() => setAgendando(true)} />
          <Contactos items={agenda.data ?? []} cargando={agenda.isLoading} />
        </div>
        <div className="space-y-4">
          <MetasHoy metas={metas} libres={libres} hoy={hoy} cargando={goals.isLoading} hoyPeriodo={p} />
          <TareasHoy tareas={tareas.data ?? []} cargando={tareas.isLoading} hoy={hoy} />
        </div>
      </div>

      {agendando && (
        <ItemModal open onClose={() => setAgendando(false)} fecha={hoy} hora={format(new Date(Date.now() + 3_600_000), 'HH:00')} prefill={{ tipo: 'reunion' }} />
      )}
      {abrirEvento && (
        <ItemModal open onClose={() => setAbrirEvento(null)} fecha={hoy} evento={abrirEvento} />
      )}
    </div>
  )
}

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Hecho({ label, valor }: { label: string; valor: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted">
      <span className="text-sm font-semibold tabular-nums text-fg">{valor}</span>{label}
    </span>
  )
}

function Enlace({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
      {children} <ArrowRight className="h-3 w-3" />
    </Link>
  )
}

// ---------------------------------------------------------------
// Agenda: los eventos de hoy, con la casilla de «hecho»
// ---------------------------------------------------------------

function Agenda({ eventos, cargando, onAbrir, onAgendar }: {
  eventos: Evento[]; cargando: boolean; onAbrir: (e: Evento) => void; onAgendar: () => void
}) {
  const actualizar = useActualizarEvento()
  const google = useGoogleCalendarEstado()
  const lista = eventos.filter((e) => e.estado !== 'cancelado')
  const ahora = Date.now()
  const hora = (v: string) => format(new Date(v), 'HH:mm')

  const marcar = (e: Evento) => {
    const nuevo = e.estado === 'hecho' ? 'confirmado' : 'hecho'
    actualizar.mutate({ id: e.id, estado: nuevo }, {
      onSuccess: () => { if (nuevo === 'hecho') toast.success('Hecho') },
      onError: (err) => toast.error(err instanceof Error ? err.message : 'No se pudo guardar'),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agenda{lista.length ? <span className="ml-1.5 font-normal text-muted">· {lista.length}</span> : null}</CardTitle>
        <Enlace to="/productividad/calendario">Calendario</Enlace>
      </CardHeader>
      <p className="-mt-2 mb-3 flex items-center gap-1.5 text-[0.6875rem] text-muted">
        <span className={cn('h-1.5 w-1.5 rounded-full', google.data?.conectado ? 'bg-green-500' : 'bg-slate-400')} />
        {google.data?.conectado ? 'Incluye tu Google Calendar' : 'Google Calendar sin conectar: solo eventos del CRM'}
      </p>
      {cargando ? <Lista /> : !lista.length ? (
        <button type="button" onClick={onAgendar} className="flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed border-border py-8 text-sm text-muted hover:text-fg">
          <CalendarDays className="h-5 w-5" />Nada agendado hoy. Pulsa para agendar una reunión.
        </button>
      ) : (
        <ul className="space-y-1">
          {lista.map((e) => {
            const hecho = e.estado === 'hecho'
            const pasado = Date.parse(e.fin) < ahora
            const enCurso = !hecho && !pasado && Date.parse(e.inicio) <= ahora
            return (
              <li key={e.id} className={cn('flex items-center gap-3 rounded-xl px-2 py-2.5', enCurso ? 'bg-primary-50 dark:bg-primary-500/10' : 'row-hover')}>
                <Casilla hecho={hecho} onClick={() => marcar(e)} />
                <button type="button" onClick={() => onAbrir(e)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <span className="w-[4.75rem] shrink-0 text-xs tabular-nums text-muted">{e.todoElDia ? 'Todo el día' : `${hora(e.inicio)}–${hora(e.fin)}`}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn('block truncate text-sm font-medium', hecho ? 'text-muted line-through' : 'text-fg')}>{e.titulo}</span>
                    {e.ubicacion && <span className="block truncate text-xs text-muted">{e.ubicacion}</span>}
                  </span>
                </button>
                {enCurso && <span className="shrink-0 rounded-full bg-[rgb(var(--ok))]/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-[rgb(var(--ok))]">ahora</span>}
                {e.enlace && !hecho && (
                  <a href={e.enlace} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-primary-600">
                    {e.enlace.includes('meet.google') ? <Video className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}Entrar
                  </a>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Casilla({ hecho, onClick, label = 'Marcar como hecho' }: { hecho: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="shrink-0 text-muted hover:text-[rgb(var(--ok))]">
      {hecho ? <CheckCircle2 className="h-5 w-5 text-[rgb(var(--ok))]" /> : <Circle className="h-5 w-5" />}
    </button>
  )
}

// ---------------------------------------------------------------
// Contactos que tocan hoy (seguimientos)
// ---------------------------------------------------------------

function Contactos({ items, cargando }: { items: FollowUpAgendaItem[]; cargando: boolean }) {
  const [completando, setCompletando] = useState<FollowUpAgendaItem | null>(null)
  const deHoy = items.filter((f) => f.diasVencido === 0)
  const vencidos = items.filter((f) => f.diasVencido > 0)
  // Primero lo de hoy (es lo que se puede cumplir); de lo vencido, lo más reciente:
  // lo que lleva 80 días esperando ya no es urgente, es otra conversación.
  const lista = [...deHoy.sort((a, b) => (a.hora ?? '99').localeCompare(b.hora ?? '99')), ...vencidos.sort((a, b) => a.diasVencido - b.diasVencido)].slice(0, 8)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Contactos por hacer
          <span className="ml-1.5 font-normal text-muted">· {deHoy.length} de hoy{vencidos.length ? `, ${vencidos.length} atrasados` : ''}</span>
        </CardTitle>
        <Enlace to="/seguimientos">Seguimientos</Enlace>
      </CardHeader>
      {cargando ? <Lista /> : !lista.length ? (
        <Vacio texto="Ningún contacto pendiente." />
      ) : (
        <ul className="space-y-1">
          {lista.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl px-2 py-2 row-hover">
              <Casilla hecho={false} onClick={() => setCompletando(f)} label="Registrar contacto" />
              <Link to={`/pipeline?lead=${f.leadId}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{f.leadEmpresa}</p>
                <p className="truncate text-xs text-muted">Toque {f.orden} · {TIPO_META[f.tipo]?.label ?? f.tipo}{f.nota ? ` · ${f.nota}` : ''}</p>
              </Link>
              <span className={cn('shrink-0 text-xs tabular-nums', f.diasVencido > 0 ? 'font-semibold text-[rgb(var(--danger))]' : 'text-muted')}>
                {f.diasVencido > 0 ? `hace ${f.diasVencido} d` : f.hora ? f.hora.slice(0, 5) : 'hoy'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {completando && (
        <CompletarFollowUpModal followUp={completando} leadEmpresa={completando.leadEmpresa} onClose={() => setCompletando(null)} />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------
// Metas: lo que toca hoy de cada meta del mes
// ---------------------------------------------------------------

function MetasHoy({ metas, libres, hoy, cargando, hoyPeriodo }: {
  metas: Goal[]; libres: Goal[]; hoy: string; cargando: boolean; hoyPeriodo?: Parameters<typeof ritmoHoy>[1]
}) {
  const avance = useRegistrarAvance()
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas de hoy</CardTitle>
        <Enlace to="/productividad/metas">Metas</Enlace>
      </CardHeader>
      {!cargando && libres.length > 0 && (
        <ul className="mb-4 space-y-1">
          {libres.map((g) => (
            <li key={g.id} className="flex items-start gap-2.5 rounded-xl px-1 py-1.5 row-hover">
              <Casilla hecho={false} label="Marcar meta como hecha" onClick={() => avance.mutate({ id: g.id, delta: 1 }, { onSuccess: () => toast.success('¡Meta cumplida!') })} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-fg">{g.nombre}</span>
                <span className="block text-xs text-muted">
                  {g.fechaFin < hoy ? <span className="font-semibold text-[rgb(var(--danger))]">atrasada</span> : 'para hoy'}
                  {g.horasEstimadas ? ` · ${g.horasEstimadas} h` : ''}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {cargando ? <Lista n={3} /> : !metas.length && !libres.length ? (
        <Link to="/productividad/metas" className="flex flex-col items-center gap-1.5 py-6 text-center text-sm text-muted hover:text-fg">
          <Target className="h-5 w-5" />Sin metas para hoy. Pon una y aquí verás lo que te toca.
        </Link>
      ) : !metas.length ? null : (
        <div className="space-y-3.5">
          {metas.map((g) => {
            const r = ritmoHoy(g, hoyPeriodo)
            const fmt = (v: number) => fmtMetrica(g.metrica, v)
            const cumplidaMes = r.falta === 0
            const hechoHoy = r.hechoHoy
            const pctHoy = r.tocaHoy > 0 && hechoHoy != null ? Math.min(100, Math.round((hechoHoy / r.tocaHoy) * 100)) : cumplidaMes ? 100 : 0
            return (
              <div key={g.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[0.8125rem] text-fg" title={g.nombre}>
                    {g.metrica && <Zap className="mr-1 inline h-3 w-3 text-muted" />}{g.nombre}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {cumplidaMes ? <span className="font-semibold text-[rgb(var(--ok))]">mes cumplido</span>
                      : !r.laborableHoy ? 'hoy libre'
                        : hechoHoy != null ? <><span className="font-semibold text-fg">{fmt(hechoHoy)}</span> / {fmt(r.tocaHoy)} hoy</>
                          : <>toca {fmt(r.tocaHoy)} hoy</>}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pctHoy}%`, background: pctHoy >= 100 ? '#16a34a' : '#ff7448' }} />
                </div>
                {pctHoy >= 100 && !cumplidaMes && r.laborableHoy && <p className="mt-0.5 flex items-center gap-1 text-[0.6875rem] text-[rgb(var(--ok))]"><Check className="h-3 w-3" />Lo de hoy, hecho</p>}
              </div>
            )
          })}
          <p className="text-[0.6875rem] text-muted">
            {metas.some((g) => g.metrica) ? 'Las metas con ⚡ se cuentan solas. ' : ''}
            El objetivo de hoy reparte lo que falta entre los días laborables que quedan del mes.
          </p>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------
// Tareas: las de hoy y atrasadas, y añadir una rápida
// ---------------------------------------------------------------

function TareasHoy({ tareas, cargando, hoy }: { tareas: Tarea[]; cargando: boolean; hoy: string }) {
  const [nueva, setNueva] = useState('')
  const crear = useCreateTarea()
  const actualizar = useUpdateTarea()
  const lista = tareas
    .filter((t) => t.estado !== 'hecha' && t.fechaVencimiento && t.fechaVencimiento.slice(0, 10) <= hoy)
    .sort((a, b) => (a.fechaVencimiento ?? '').localeCompare(b.fechaVencimiento ?? ''))

  const anadir = async () => {
    const t = nueva.trim()
    if (!t) return
    try {
      await crear.mutateAsync({ titulo: t, fechaVencimiento: hoy })
      setNueva('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la tarea')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tareas{lista.length ? <span className="ml-1.5 font-normal text-muted">· {lista.length}</span> : null}</CardTitle>
        <Enlace to="/productividad/tareas">Todas</Enlace>
      </CardHeader>
      <form onSubmit={(e) => { e.preventDefault(); anadir() }} className="mb-3 flex gap-2">
        <Input value={nueva} onChange={(e) => setNueva(e.target.value)} placeholder="Añadir tarea para hoy…" />
        <Button type="submit" size="icon" disabled={!nueva.trim() || crear.isPending} aria-label="Añadir tarea"><Plus className="h-4 w-4" /></Button>
      </form>
      {cargando ? <Lista n={3} /> : !lista.length ? (
        <Vacio texto="Ninguna tarea para hoy." />
      ) : (
        <ul className="space-y-0.5">
          {lista.map((t) => {
            const atrasada = (t.fechaVencimiento ?? '').slice(0, 10) < hoy
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl px-2 py-2 row-hover">
                <Casilla
                  hecho={false}
                  onClick={() => actualizar.mutate({ id: t.id, estado: 'hecha' }, { onSuccess: () => toast.success('Tarea hecha') })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg" title={t.titulo}>{t.titulo}</span>
                  {(atrasada || t.leadNombre) && (
                    <span className="block truncate text-xs text-muted">
                      {atrasada && <span className="font-medium text-[rgb(var(--danger))]">atrasada · </span>}{t.leadNombre}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Lista({ n = 4 }: { n?: number }) {
  return <div className="space-y-2">{Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
      <CheckCircle2 className="h-4 w-4 text-[rgb(var(--ok))]" />{texto}
    </p>
  )
}

