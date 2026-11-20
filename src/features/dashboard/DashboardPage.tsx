import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import {
  ArrowRight, CalendarClock, Inbox, MailCheck, ListTodo, Route, FolderKanban,
  TrendingUp, TrendingDown, Minus, CircleCheck, Mail, MessageCircle, Phone, PhoneCall,
  Users, Video, Briefcase, Camera, MessageSquare, Circle, Target, CalendarDays, type LucideIcon,
} from 'lucide-react'
import { startOfMonth, subMonths, format, getDate, endOfMonth, min as minFecha } from 'date-fns'
import { es } from 'date-fns/locale'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuthStore } from '@/store/authStore'
import { Card, CardHeader, CardTitle, Skeleton } from '@/components/ui'
import { BrandTooltip, ChartGradients, axisTick, gridProps } from '@/components/charts/chartTheme'
import {
  useLeads, useMetricasCrm, useMetricasEmbudo, useFollowUpsAgenda, useWebLeads, useTareas,
  useGoals, useEventos, useSincronizarGoogle,
} from '@/hooks/useData'
import { pctTranscurrido, progreso, valorProgreso } from '@/features/productividad/shared/goalMeta'
import { COLORES, clasesPunto, type ColorItem } from '@/features/productividad/calendario/itemCalendario'

const COLOR_OK = Object.fromEntries(COLORES.map((c) => [c.valor, true])) as Record<ColorItem, true>
import { useProyectos } from '@/features/proyectos/useProyectos'
import { analyticsService } from '@/services/analyticsService'
import { secuenciasService } from '@/services/secuenciasService'
import { today, TIPO_META } from '@/lib/followUps'
import { STAGE_BY_ID, daysInStage, isStale, weightedValue } from '@/lib/pipeline'
import {
  ETAPA_PROYECTO_META, resumenCobros, situacionEntrega, textoEntrega,
} from '@/lib/proyectos'
import { formatCurrency, formatMontos, formatNumber, cn, type Montos } from '@/lib/utils'
import type { Evento, FollowUpTipo, Goal, Lead, LeadStatus, MetricasPeriodo } from '@/types'

/**
 * Resumen — la pantalla que se abre cada mañana.
 *
 * Responde a tres preguntas, en este orden:
 *   1. ¿Qué tengo que hacer hoy?  (cosas pendientes, cada una lleva a su sitio)
 *   2. ¿Cómo va el mes?            (actividad y resultados frente al mes pasado)
 *   3. ¿Dónde está el dinero?      (pipeline abierto, proyectos y cobros)
 *
 * Los números del mes salen del motor de métricas en SQL (`metricas_crm`,
 * `metricas_embudo`), el mismo que usan Analíticas y las metas: si aquí dice
 * 12 respuestas, en Analíticas también. Antes esta página contaba por su
 * cuenta en el navegador con la tabla `messages`, que dejó de recibir los
 * toques cuando todo el contacto pasó a `follow_ups` (0038).
 *
 * Se quitó el «Leads por nicho»: es un total histórico que solo crece y no
 * cambia lo que se hace mañana. Vive en Analíticas.
 */

const ETAPAS_ABIERTAS: LeadStatus[] = ['contactado', 'seguimiento', 'respondio', 'reunion', 'propuesta', 'negociacion']
const ETAPAS_CALIENTES: LeadStatus[] = ['respondio', 'reunion', 'propuesta', 'negociacion']

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

/**
 * Iconos de canal. `TIPO_META` trae emojis y en Windows varios (correo,
 * WhatsApp) salían como un cuadrado vacío. Un icono de línea se ve igual en
 * todas partes.
 */
const CANAL_ICON: Record<FollowUpTipo, LucideIcon> = {
  whatsapp: MessageCircle, email: Mail, llamada: Phone, llamada_whatsapp: PhoneCall,
  reunion: Users, videollamada: Video, linkedin: Briefcase, instagram: Camera,
  sms: MessageSquare, otro: Circle,
}

function IconoCanal({ tipo }: { tipo: FollowUpTipo }) {
  const Icon = CANAL_ICON[tipo] ?? Circle
  return <Icon className="h-4 w-4 shrink-0 text-muted" aria-label={TIPO_META[tipo]?.label} />
}

/**
 * El mes en curso hasta hoy y el MISMO tramo del mes pasado. Comparar el 20 de
 * noviembre con octubre entero haría que todo pareciera ir peor hasta fin de mes.
 */
function rangos() {
  const hoy = new Date()
  const ini = startOfMonth(hoy)
  const iniAnt = startOfMonth(subMonths(hoy, 1))
  const finAnt = minFecha([new Date(iniAnt.getFullYear(), iniAnt.getMonth(), getDate(hoy)), endOfMonth(iniAnt)])
  return {
    actual: { desde: iso(ini), hasta: iso(hoy) },
    anterior: { desde: iso(iniAnt), hasta: iso(finAnt) },
    mes: format(hoy, 'LLLL', { locale: es }),
  }
}

function saludo() {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function DashboardPage() {
  const r = useMemo(rangos, [])
  const hoy = today()
  // Sin nombre en el perfil, authStore cae en el usuario del correo
  // («juanduvergedeveloper»): eso no es un nombre y queda raro en el saludo.
  const nombreCompleto = useAuthStore((s) => s.user?.name) ?? ''
  const nombre = /[A-ZÁÉÍÓÚÑ ]/.test(nombreCompleto) ? nombreCompleto.split(' ')[0] : ''

  const { leads, isLoading: cargandoLeads, isError: errorLeads } = useLeads()
  const mes = useMetricasCrm(r.actual.desde, r.actual.hasta)
  const mesAnt = useMetricasCrm(r.anterior.desde, r.anterior.hasta)
  const embudo = useMetricasEmbudo(r.actual.desde, r.actual.hasta)
  const agenda = useFollowUpsAgenda()
  const webLeads = useWebLeads()
  const tareas = useTareas()
  const proyectos = useProyectos()
  // Misma clave que la pantalla de Correos programados: comparten caché.
  const secuencias = useQuery({ queryKey: ['secuencias'], queryFn: secuenciasService.listar, retry: 1 })
  const metas = useGoals(r.actual.desde, iso(endOfMonth(new Date())))
  const hoyDesde = new Date(`${hoy}T00:00:00`).toISOString()
  const hoyHasta = new Date(`${hoy}T23:59:59`).toISOString()
  const eventosHoy = useEventos(hoyDesde, hoyHasta)
  // Lo creado en Google (o desde el móvil) entra en la agenda de hoy.
  useSincronizarGoogle(hoyDesde, hoyHasta)
  const toques = useQuery({ queryKey: ['resumen', 'toques'], queryFn: analyticsService.toques, staleTime: 60_000, retry: 1 })

  // ---------- 1. Hoy ----------
  const pendientes = useMemo(() => {
    const ag = agenda.data ?? []
    const vencidos = ag.filter((f) => f.diasVencido > 0).length
    const deHoy = ag.filter((f) => f.diasVencido === 0).length
    const formularios = (webLeads.data ?? []).filter((w) => w.estado === 'nuevo').length
    const porAprobar = (secuencias.data ?? []).filter((s) => s.correos.some((c) => c.status === 'por_aprobar')).length
    const tareasHoy = (tareas.data ?? []).filter(
      (t) => t.estado !== 'hecha' && t.fechaVencimiento && t.fechaVencimiento.slice(0, 10) <= hoy,
    ).length
    const sinProximo = mes.data?.situacion.sin_proximo ?? 0
    const proy = proyectos.data ?? []
    const proyAtrasados = proy.filter((p) => !p.enPausa && situacionEntrega(p, hoy).sit === 'atrasado').length
    const cobrosVencidos = proy.reduce((s, p) => s + resumenCobros(p, hoy).vencidos, 0)
    return { vencidos, deHoy, formularios, porAprobar, tareasHoy, sinProximo, proyAtrasados, cobrosVencidos }
  }, [agenda.data, webLeads.data, secuencias.data, tareas.data, mes.data, proyectos.data, hoy])

  // ---------- 3. Dinero ----------
  const dinero = useMemo(() => {
    const abiertos = leads.filter((l) => ETAPAS_ABIERTAS.includes(l.estado))
    const bruto = abiertos.reduce((s, l) => s + (l.valorEstimado || 0), 0)
    const ponderado = abiertos.reduce((s, l) => s + weightedValue(l), 0)
    const sinValor = leads.filter((l) => ETAPAS_CALIENTES.includes(l.estado) && !l.valorEstimado).length
    const pendienteCobro: Montos = {}
    const cobrado: Montos = {}
    for (const p of proyectos.data ?? []) {
      const c = resumenCobros(p, hoy)
      if (c.pendiente) pendienteCobro[p.moneda] = (pendienteCobro[p.moneda] ?? 0) + c.pendiente
      if (c.cobrado) cobrado[p.moneda] = (cobrado[p.moneda] ?? 0) + c.cobrado
    }
    return { bruto, ponderado, sinValor, pendienteCobro, cobrado }
  }, [leads, proyectos.data, hoy])

  const subtitulo = `${format(new Date(), "EEEE d 'de' LLLL", { locale: es })}`

  return (
    <div>
      <PageHeader title={nombre ? `${saludo()}, ${nombre}` : saludo()} subtitle={subtitulo.charAt(0).toUpperCase() + subtitulo.slice(1)} />

      {errorLeads && (
        <p className="aviso-error mb-4">No se pudieron cargar los leads. Revisa tu conexión y vuelve a intentar.</p>
      )}

      {/* ========== 1. HOY ========== */}
      <Seccion titulo="Para hoy">
        <PendientesHoy p={pendientes} cargando={agenda.isLoading || mes.isLoading} />
      </Seccion>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <CalendarioHoy eventos={eventosHoy.data ?? []} cargando={eventosHoy.isLoading} />
        <AgendaHoy items={agenda.data ?? []} cargando={agenda.isLoading} />
        <LeadsCalientes leads={leads} cargando={cargandoLeads} className="lg:col-span-2 xl:col-span-1" />
      </div>

      {/* ========== 2. EL MES ========== */}
      <Seccion titulo={`Cómo va ${r.mes}`} nota="comparado con los mismos días del mes pasado" className="mt-8">
        <KpisMes actual={mes.data?.periodo} anterior={mesAnt.data?.periodo} tasa={mes.data?.ratios.tasa_respuesta} tasaAnt={mesAnt.data?.ratios.tasa_respuesta} cargando={mes.isLoading} />
      </Seccion>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActividadDiaria toques={toques.data} cargando={toques.isLoading} className="lg:col-span-2" />
        <EmbudoMes periodo={mes.data?.periodo} cargando={mes.isLoading} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MetasMes metas={metas.data ?? []} cargando={metas.isLoading} />
        <CanalesMes canales={embudo.data?.por_canal ?? []} />
      </div>

      {/* ========== 3. DINERO ========== */}
      <Seccion titulo="Dinero" className="mt-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra
            label="Pipeline abierto"
            valor={formatCurrency(dinero.bruto)}
            detalle={dinero.sinValor ? `${dinero.sinValor} leads calientes sin valor puesto` : 'valor estimado de los leads vivos'}
            to="/pipeline"
            cargando={cargandoLeads}
          />
          <Cifra
            label="Previsión ponderada"
            valor={formatCurrency(dinero.ponderado)}
            detalle="valor × probabilidad de cada etapa"
            to="/pipeline"
            cargando={cargandoLeads}
          />
          <Cifra
            label={`Ganado en ${r.mes}`}
            valor={formatMontos(embudo.data?.contratos.valor_total_mon, mes.data?.periodo.valor_ganado ?? 0)}
            detalle={(mes.data?.periodo.leads_ganados ?? 0) === 1 ? '1 contrato cerrado' : `${mes.data?.periodo.leads_ganados ?? 0} contratos cerrados`}
            to="/analytics"
            cargando={mes.isLoading}
          />
          <Cifra
            label="Por cobrar"
            valor={formatMontos(dinero.pendienteCobro)}
            detalle={pendientes.cobrosVencidos ? `${pendientes.cobrosVencidos} pagos vencidos` : `cobrado: ${formatMontos(dinero.cobrado)}`}
            alerta={pendientes.cobrosVencidos > 0}
            to="/proyectos"
            cargando={proyectos.isLoading}
          />
        </div>
      </Seccion>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CarteraAhora situacion={mes.data?.situacion} leads={leads} cargando={mes.isLoading} />
        <ProyectosEnCurso proyectos={proyectos.data ?? []} cargando={proyectos.isLoading} hoy={hoy} />
      </div>
    </div>
  )
}

// =====================================================================
// Piezas
// =====================================================================

function Seccion({ titulo, nota, className, children }: { titulo: string; nota?: string; className?: string; children: ReactNode }) {
  return (
    <section className={className}>
      <div className="mb-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="text-base font-semibold text-fg">{titulo}</h2>
        {nota && <span className="t-hint text-xs">· {nota}</span>}
      </div>
      {children}
    </section>
  )
}

type Pendientes = {
  vencidos: number; deHoy: number; formularios: number; porAprobar: number
  tareasHoy: number; sinProximo: number; proyAtrasados: number; cobrosVencidos: number
}

/**
 * Cada casilla es algo que se puede despachar hoy y lleva a la pantalla donde
 * se despacha. Las que están a cero se apagan en vez de desaparecer: ver
 * «0 formularios» también es información.
 */
function PendientesHoy({ p, cargando }: { p: Pendientes; cargando: boolean }) {
  const items = [
    { to: '/seguimientos', icon: CalendarClock, n: p.vencidos + p.deHoy, label: 'Seguimientos', detalle: p.vencidos ? `${p.vencidos} vencidos · ${p.deHoy} de hoy` : `${p.deHoy} de hoy`, alerta: p.vencidos > 0 },
    { to: '/web-leads', icon: Inbox, n: p.formularios, label: 'Formularios web nuevos', detalle: 'sin atender', alerta: p.formularios > 0 },
    { to: '/correos', icon: MailCheck, n: p.porAprobar, label: 'Correos por aprobar', detalle: 'secuencias esperando tu ok', alerta: false },
    { to: '/productividad/tareas', icon: ListTodo, n: p.tareasHoy, label: 'Tareas', detalle: 'para hoy o atrasadas', alerta: false },
    { to: '/pipeline', icon: Route, n: p.sinProximo, label: 'Leads sin próximo paso', detalle: 'en curso, sin seguimiento', alerta: false },
    { to: '/proyectos', icon: FolderKanban, n: p.proyAtrasados, label: 'Proyectos atrasados', detalle: 'pasada la fecha de entrega', alerta: p.proyAtrasados > 0 },
  ]
  if (cargando) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map((i) => <Skeleton key={i.to} className="h-[5.5rem]" />)}
      </div>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((i) => {
        const Icon = i.icon
        const apagado = i.n === 0
        return (
          <Link
            key={i.to}
            to={i.to}
            className={cn(
              'card group flex flex-col gap-1 p-3.5 transition-all hover:-translate-y-0.5 hover:shadow-card-hover',
              i.alerta && 'ring-1 ring-[rgb(var(--danger))]/40',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <Icon className={cn('h-4 w-4', i.alerta ? 'text-[rgb(var(--danger))]' : 'text-muted')} />
              <ArrowRight className="h-3.5 w-3.5 text-muted/0 transition-colors group-hover:text-muted" />
            </div>
            <p className={cn('t-num text-2xl leading-none', apagado && 'text-muted/60', i.alerta && 'text-[rgb(var(--danger))]')}>{i.n}</p>
            <p className="text-[0.8125rem] font-medium leading-tight text-fg">{i.label}</p>
            <p className="truncate text-[0.6875rem] text-muted">{i.detalle}</p>
          </Link>
        )
      })}
    </div>
  )
}

function AgendaHoy({ items, cargando }: { items: import('@/types').FollowUpAgendaItem[]; cargando: boolean }) {
  // Lo vencido primero (lo más viejo arriba), luego lo de hoy por hora.
  const lista = useMemo(
    () => items
      .filter((f) => f.diasVencido >= 0)
      .sort((a, b) => b.diasVencido - a.diasVencido || (a.hora ?? '99').localeCompare(b.hora ?? '99'))
      .slice(0, 7),
    [items],
  )
  const total = items.filter((f) => f.diasVencido >= 0).length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Contactos pendientes</CardTitle>
        <Link to="/seguimientos" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          {total > lista.length ? `Ver los ${total}` : 'Seguimientos'} <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando ? <ListaSkeleton /> : !lista.length ? (
        <Vacio texto="Nada pendiente para hoy." />
      ) : (
        <ul className="-mx-1.5 space-y-0.5">
          {lista.map((f) => (
            <li key={f.id}>
              <Link to={`/pipeline?lead=${f.leadId}`} className="flex items-center gap-3 rounded-lg px-1.5 py-2 row-hover">
                <span className="flex w-6 shrink-0 justify-center" title={TIPO_META[f.tipo]?.label}><IconoCanal tipo={f.tipo} /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg" title={f.leadEmpresa}>{f.leadEmpresa}</p>
                  <p className="truncate text-xs text-muted">
                    Toque {f.orden} · {TIPO_META[f.tipo]?.label ?? f.tipo}{f.nota ? ` · ${f.nota}` : ''}
                  </p>
                </div>
                <span className={cn('shrink-0 text-xs tabular-nums', f.diasVencido > 0 ? 'font-semibold text-[rgb(var(--danger))]' : 'text-muted')}>
                  {f.diasVencido > 0 ? `hace ${f.diasVencido} d` : f.hora ? f.hora.slice(0, 5) : 'hoy'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Los que ya contestaron o están en reunión/propuesta/negociación: son los
 * pocos que acercan dinero. Ordenados por días parados, que es el riesgo.
 */
function LeadsCalientes({ leads, cargando, className }: { leads: Lead[]; cargando: boolean; className?: string }) {
  const lista = useMemo(
    () => leads
      .filter((l) => ETAPAS_CALIENTES.includes(l.estado))
      .sort((a, b) => daysInStage(b) - daysInStage(a))
      .slice(0, 7),
    [leads],
  )
  const total = leads.filter((l) => ETAPAS_CALIENTES.includes(l.estado)).length
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Oportunidades calientes{total ? <span className="ml-1.5 text-muted font-normal">· {total}</span> : null}</CardTitle>
        <Link to="/pipeline" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Pipeline <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando ? <ListaSkeleton /> : !lista.length ? (
        <Vacio texto="Ningún lead ha respondido todavía." />
      ) : (
        <ul className="-mx-1.5 space-y-0.5">
          {lista.map((l) => {
            const etapa = STAGE_BY_ID[l.estado]
            return (
              <li key={l.id}>
                <Link to={`/pipeline?lead=${l.id}`} className="flex items-center gap-3 rounded-lg px-1.5 py-2 row-hover">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: etapa?.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg" title={l.empresa}>{l.empresa}</p>
                    <p className="truncate text-xs text-muted">
                      {etapa?.label ?? l.estado}{l.valorEstimado ? ` · ${formatCurrency(l.valorEstimado)}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn('shrink-0 text-xs tabular-nums', isStale(l) ? 'font-semibold text-[rgb(var(--danger))]' : 'text-muted')}
                    title="Días en esta etapa"
                  >
                    {daysInStage(l)} d
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** Reuniones y bloques del calendario para hoy: lo que ya tiene hora fija. */
function CalendarioHoy({ eventos, cargando }: { eventos: Evento[]; cargando: boolean }) {
  const lista = eventos.filter((e) => e.estado !== 'cancelado')
  const ahora = Date.now()
  const hora = (valor: string) => format(new Date(valor), 'HH:mm')
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agenda de hoy{lista.length ? <span className="ml-1.5 font-normal text-muted">· {lista.length}</span> : null}</CardTitle>
        <Link to="/productividad/hoy" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Mi día <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando ? <ListaSkeleton /> : !lista.length ? (
        <Link to="/productividad/calendario" className="flex flex-col items-center gap-1.5 py-8 text-center text-sm text-muted hover:text-fg">
          <CalendarDays className="h-5 w-5 text-muted/60" />Nada en el calendario hoy.
        </Link>
      ) : (
        <ul className="-mx-1.5 space-y-0.5">
          {lista.slice(0, 7).map((e) => {
            const pasado = Date.parse(e.fin) < ahora || e.estado === 'hecho'
            const enCurso = !pasado && Date.parse(e.inicio) <= ahora
            return (
              <li key={e.id}>
                <Link
                  to={e.leadId ? `/pipeline?lead=${e.leadId}` : '/productividad/calendario'}
                  className={cn('flex items-center gap-3 rounded-lg px-1.5 py-2 row-hover', pasado && 'opacity-50')}
                >
                  <span className="w-[4.75rem] shrink-0 text-xs tabular-nums text-muted">
                    {e.todoElDia ? 'Todo el día' : `${hora(e.inicio)}–${hora(e.fin)}`}
                  </span>
                  <span className={cn('h-7 w-1 shrink-0 rounded-full', clasesPunto((e.color as ColorItem) in COLOR_OK ? (e.color as ColorItem) : 'coral'))} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-sm font-medium text-fg', pasado && 'line-through')} title={e.titulo}>{e.titulo}</p>
                    {e.ubicacion && <p className="truncate text-xs text-muted">{e.ubicacion}</p>}
                  </div>
                  {enCurso && (
                    <span className="shrink-0 rounded-full bg-[rgb(var(--ok))]/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-[rgb(var(--ok))]">ahora</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

// ---------- El mes ----------

/**
 * Metas mensuales con el ritmo al lado: un 40 % el día 20 va por detrás y el
 * día 5 va sobrado. La raya vertical marca dónde deberías ir hoy.
 */
function MetasMes({ metas, cargando }: { metas: Goal[]; cargando: boolean }) {
  const lista = metas
    .filter((g) => !g.parentId && g.tipo !== 'toggle' && g.estado !== 'cancelada' && g.estado !== 'pausada')
    .sort((a, b) => a.orden - b.orden)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metas del mes</CardTitle>
        <Link to="/productividad/metas" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Metas <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando ? <ListaSkeleton /> : !lista.length ? (
        <Link to="/productividad/metas" className="flex flex-col items-center gap-1.5 py-8 text-center text-sm text-muted hover:text-fg">
          <Target className="h-5 w-5 text-muted/60" />No hay metas este mes. Ponte una.
        </Link>
      ) : (
        <div className="space-y-3">
          {lista.slice(0, 6).map((g) => {
            const pct = progreso(g)
            const deberia = Math.round(pctTranscurrido(g))
            const porDetras = pct < 100 && pct < deberia - 10
            return (
              <div key={g.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[0.8125rem] text-fg" title={g.nombre}>{g.nombre}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    <span className="font-semibold text-fg">{formatNumber(valorProgreso(g))}</span> / {formatNumber(g.target)}
                    <span className={cn('ml-1.5', pct >= 100 ? 'font-semibold text-[rgb(var(--ok))]' : porDetras ? 'font-semibold text-[rgb(var(--danger))]' : '')}>
                      {pct}%
                    </span>
                  </span>
                </div>
                <div className="relative mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: pct >= 100 ? '#16a34a' : porDetras ? '#ff4848' : '#ff7448' }}
                  />
                  <div
                    className="absolute inset-y-0 w-0.5 bg-fg/40"
                    style={{ left: `${Math.min(99.5, deberia)}%` }}
                    title={`Hoy deberías ir por el ${deberia}%`}
                  />
                </div>
              </div>
            )
          })}
          <p className="t-hint pt-1 text-[0.6875rem]">La raya marca dónde deberías ir hoy según los días que han pasado. En rojo, las que van por detrás.</p>
        </div>
      )}
    </Card>
  )
}

function variacion(a?: number, b?: number): number | null {
  if (a == null || b == null) return null
  if (b === 0) return a === 0 ? 0 : null
  return Math.round(((a - b) / b) * 100)
}

function KpisMes({ actual, anterior, tasa, tasaAnt, cargando }: {
  actual?: MetricasPeriodo; anterior?: MetricasPeriodo; tasa?: number; tasaAnt?: number; cargando: boolean
}) {
  if (cargando || !actual) {
    return <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
  }
  const kpis = [
    { label: 'Leads nuevos', v: actual.leads_encontrados, a: anterior?.leads_encontrados, to: '/leads' },
    { label: 'Contactos hechos', v: actual.contactos_realizados, a: anterior?.contactos_realizados, extra: `${actual.leads_contactados} leads por primera vez`, to: '/seguimientos' },
    { label: 'Respondieron', v: actual.leads_respondieron, a: anterior?.leads_respondieron, extra: `tasa ${(tasa ?? 0).toFixed(1)}%`, extraDelta: variacion(tasa, tasaAnt), to: '/analytics' },
    { label: 'Reuniones', v: actual.reuniones_agendadas, a: anterior?.reuniones_agendadas, extra: `${actual.propuestas_enviadas} propuestas`, to: '/pipeline' },
    { label: 'Clientes ganados', v: actual.leads_ganados, a: anterior?.leads_ganados, extra: `${actual.leads_perdidos} perdidos`, to: '/analytics' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {kpis.map((k) => (
        <Link key={k.label} to={k.to} className="card p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
          <p className="t-eyebrow truncate">{k.label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="t-num text-[1.75rem] leading-none">{formatNumber(k.v)}</p>
            <Delta pct={variacion(k.v, k.a)} />
          </div>
          <p className="mt-1.5 truncate text-[0.6875rem] text-muted">
            {k.a != null ? `antes ${formatNumber(k.a)}` : ''}{k.extra ? `${k.a != null ? ' · ' : ''}${k.extra}` : ''}
          </p>
        </Link>
      ))}
    </div>
  )
}

function Delta({ pct }: { pct: number | null }) {
  if (pct == null) return null
  const Icon = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums',
      pct > 0 ? 'text-[rgb(var(--ok))]' : pct < 0 ? 'text-[rgb(var(--danger))]' : 'text-muted',
    )}>
      <Icon className="h-3 w-3" />{Math.abs(pct)}%
    </span>
  )
}

/**
 * Toques completados y respuestas por día, de `follow_ups`. Es la única tabla
 * por la que pasa TODO contacto (WhatsApp, correo de n8n, llamada a mano).
 */
function ActividadDiaria({ toques, cargando, className }: {
  toques?: Awaited<ReturnType<typeof analyticsService.toques>>; cargando: boolean; className?: string
}) {
  const datos = useMemo(() => {
    const dias = Array.from({ length: 30 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (29 - i))
      return iso(d)
    })
    const porDia = new Map(dias.map((d) => [d, { dia: format(new Date(`${d}T12:00:00`), 'd MMM', { locale: es }), toques: 0, respuestas: 0 }]))
    for (const t of toques ?? []) {
      const c = porDia.get(iso(new Date(t.completadoEn)))
      if (c) c.toques += 1
      if (t.respondidoEn) {
        const rr = porDia.get(iso(new Date(t.respondidoEn)))
        if (rr) rr.respuestas += 1
      }
    }
    return [...porDia.values()]
  }, [toques])
  const totT = datos.reduce((s, d) => s + d.toques, 0)
  const totR = datos.reduce((s, d) => s + d.respuestas, 0)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Actividad · últimos 30 días</CardTitle>
        <div className="flex shrink-0 items-center gap-4">
          <LeyendaSerie color="#ff7448" label="Contactos" value={totT} />
          <LeyendaSerie color="#6248ff" label="Respuestas" value={totR} />
        </div>
      </CardHeader>
      {cargando ? <Skeleton className="h-56" /> : totT + totR === 0 ? (
        <Vacio texto="Sin contactos registrados en los últimos 30 días." />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={datos} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
              <ChartGradients />
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="dia" tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} minTickGap={24} />
              <YAxis tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} allowDecimals={false} width={34} />
              <Tooltip content={<BrandTooltip />} cursor={{ stroke: 'rgb(var(--muted))', strokeDasharray: '3 3' }} />
              <Area type="monotone" dataKey="toques" stroke="#ff7448" strokeWidth={2.5} fill="url(#gradCoralArea)" name="Contactos" animationDuration={800} />
              <Area type="monotone" dataKey="respuestas" stroke="#6248ff" strokeWidth={2.5} fill="url(#gradVioletArea)" name="Respuestas" animationDuration={800} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/**
 * Embudo del mes: qué pasó ESTE mes en cada escalón (del motor de métricas).
 * El de antes empezaba en «Scrapeados» con todos los leads de la historia,
 * y «Abrieron» se deducía de la etapa, que no dice si alguien abrió nada.
 */
function EmbudoMes({ periodo, cargando }: { periodo?: MetricasPeriodo; cargando: boolean }) {
  const pasos = periodo ? [
    { label: 'Contactados', v: periodo.leads_contactados, color: '#0082f3' },
    { label: 'Respondieron', v: periodo.leads_respondieron, color: '#f38744' },
    { label: 'Reunión', v: periodo.reuniones_agendadas, color: '#ff7448' },
    { label: 'Propuesta', v: periodo.propuestas_enviadas, color: '#ef6820' },
    { label: 'Ganados', v: periodo.leads_ganados, color: '#16a34a' },
  ] : []
  const max = Math.max(1, ...pasos.map((p) => p.v))
  return (
    <Card>
      <CardHeader><CardTitle>Embudo del mes</CardTitle></CardHeader>
      {cargando || !periodo ? <ListaSkeleton /> : (
        <div className="space-y-3">
          {pasos.map((p, i) => {
            // Sobre los contactados, no sobre el escalón anterior: un lead
            // puede saltarse la reunión y recibir propuesta, y el paso a paso
            // daba porcentajes por encima del 100 %.
            const base = pasos[0].v
            const conv = i > 0 && base ? Math.round((p.v / base) * 100) : null
            return (
              <div key={p.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.8125rem] text-fg">{p.label}</span>
                  <span className="shrink-0 text-xs tabular-nums">
                    <span className="font-semibold text-fg">{p.v}</span>
                    {conv != null && <span className="ml-1.5 text-muted">{conv}%</span>}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(p.v ? 3 : 0, (p.v / max) * 100)}%`, background: p.color }} />
                </div>
              </div>
            )
          })}
          <p className="t-hint pt-1 text-[0.6875rem]">El % es sobre los leads contactados este mes.</p>
        </div>
      )}
    </Card>
  )
}

function CanalesMes({ canales }: { canales: import('@/types').EmbudoCanal[] }) {
  const lista = canales.filter((c) => c.toques > 0).sort((a, b) => b.toques - a.toques)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Por canal este mes</CardTitle>
        <Link to="/analytics" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Analíticas <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {!lista.length ? <Vacio texto="Sin envíos este mes." /> : (
        <div className="space-y-2">
          {lista.map((c) => {
            const tasa = c.toques ? (c.respuestas / c.toques) * 100 : 0
            return (
              <div key={c.canal} className="rounded-xl bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-fg">
                    <IconoCanal tipo={c.canal} /><span className="truncate">{TIPO_META[c.canal]?.label ?? c.canal}</span>
                  </p>
                  <span className={cn('shrink-0 text-sm font-semibold tabular-nums', tasa === 0 ? 'text-[rgb(var(--danger))]' : 'text-fg')}>
                    {tasa.toFixed(1)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {c.toques} envíos · {c.respuestas} respuestas
                  {(c.reuniones > 0 || c.ganados > 0) && ` · ${c.reuniones} reuniones · ${c.ganados} ganados`}
                </p>
              </div>
            )
          })}
          <p className="t-hint pt-1 text-[0.6875rem]">El % es la tasa de respuesta de cada canal.</p>
        </div>
      )}
    </Card>
  )
}

// ---------- Dinero ----------

function Cifra({ label, valor, detalle, to, alerta, cargando }: {
  label: string; valor: string; detalle: string; to: string; alerta?: boolean; cargando?: boolean
}) {
  if (cargando) return <Skeleton className="h-24" />
  return (
    <Link to={to} className="card min-w-0 p-4 transition-all hover:-translate-y-0.5 hover:shadow-card-hover">
      <p className="t-eyebrow truncate">{label}</p>
      <p className="t-num mt-2 truncate text-[1.5rem] leading-none" title={valor}>{valor}</p>
      <p className={cn('mt-1.5 truncate text-[0.6875rem]', alerta ? 'font-semibold text-[rgb(var(--danger))]' : 'text-muted')} title={detalle}>{detalle}</p>
    </Link>
  )
}

/** Dónde está parada la cartera ahora mismo (situación, no periodo). */
function CarteraAhora({ situacion, leads, cargando }: {
  situacion?: import('@/types').SituacionCrm; leads: Lead[]; cargando: boolean
}) {
  const valorEtapa = (e: LeadStatus) => leads.filter((l) => l.estado === e).reduce((s, l) => s + (l.valorEstimado || 0), 0)
  const filas = situacion ? [
    { label: 'Sin contactar', n: situacion.sin_contactar, color: '#94a3b8', valor: 0 },
    { label: 'En secuencia de contacto', n: situacion.en_curso, color: '#0082f3', valor: 0 },
    { label: 'Respondieron', n: situacion.interesados, color: '#f38744', valor: valorEtapa('respondio') },
    { label: 'Reunión agendada', n: situacion.reunion, color: '#ff7448', valor: valorEtapa('reunion') },
    { label: 'Propuesta enviada', n: situacion.propuesta, color: '#ef6820', valor: valorEtapa('propuesta') },
    { label: 'Negociación', n: situacion.negociacion, color: '#f59e0b', valor: valorEtapa('negociacion') },
  ] : []
  const max = Math.max(1, ...filas.map((f) => f.n))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cartera ahora{situacion ? <span className="ml-1.5 font-normal text-muted">· {formatNumber(situacion.total_activos)} activos</span> : null}</CardTitle>
        <Link to="/pipeline" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Pipeline <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando || !situacion ? <ListaSkeleton /> : (
        <div className="space-y-2.5">
          {filas.map((f) => (
            <div key={f.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-[0.8125rem] text-fg">{f.label}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">
                  {f.valor ? `${formatCurrency(f.valor)} · ` : ''}<span className="font-semibold text-fg">{formatNumber(f.n)}</span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full" style={{ width: `${Math.max(f.n ? 2 : 0, (f.n / max) * 100)}%`, background: f.color }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ProyectosEnCurso({ proyectos, cargando, hoy }: { proyectos: import('@/types').Proyecto[]; cargando: boolean; hoy: string }) {
  const enCurso = proyectos
    .filter((p) => p.etapa !== 'entregado' && p.etapa !== 'mantenimiento')
    .sort((a, b) => {
      // Atrasados y con entrega cercana arriba; sin fecha al final.
      const da = situacionEntrega(a, hoy).dias ?? 9999
      const db = situacionEntrega(b, hoy).dias ?? 9999
      return da - db
    })
  const mantenimiento = proyectos.filter((p) => p.etapa === 'mantenimiento').length
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proyectos en curso{enCurso.length ? <span className="ml-1.5 font-normal text-muted">· {enCurso.length}</span> : null}</CardTitle>
        <Link to="/proyectos" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Proyectos <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando ? <ListaSkeleton /> : !enCurso.length ? (
        <Vacio texto={mantenimiento ? `Ningún proyecto en marcha · ${mantenimiento} en mantenimiento.` : 'Ningún proyecto en marcha.'} />
      ) : (
        <ul className="-mx-1.5 space-y-0.5">
          {enCurso.slice(0, 6).map((p) => {
            const etapa = ETAPA_PROYECTO_META[p.etapa]
            const entrega = textoEntrega(p, hoy)
            const cobro = resumenCobros(p, hoy)
            return (
              <li key={p.id}>
                <Link to={`/proyectos/${p.id}`} className="flex items-center gap-3 rounded-lg px-1.5 py-2 row-hover">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: etapa?.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg" title={p.nombre}>
                      {p.nombre}{p.enPausa && <span className="ml-1.5 text-xs font-normal text-muted">(en pausa)</span>}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {etapa?.label ?? p.etapa}
                      {cobro.total ? ` · cobrado ${cobro.porcentaje}%` : ''}
                    </p>
                  </div>
                  {entrega && <span className={cn('shrink-0 text-xs tabular-nums', entrega.cls)}>{entrega.texto}</span>}
                </Link>
              </li>
            )
          })}
          {mantenimiento > 0 && <li className="t-hint px-1.5 pt-1 text-[0.6875rem]">+ {mantenimiento} en mantenimiento</li>}
        </ul>
      )}
    </Card>
  )
}

// ---------- Utilidades de pintado ----------

function LeyendaSerie({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-baseline gap-1.5">
      <span className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={{ background: color }} />
      <span className="text-xs text-muted">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-fg">{value}</span>
    </span>
  )
}

function ListaSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p className="flex items-center justify-center gap-2 py-8 text-center text-sm text-muted">
      <CircleCheck className="h-4 w-4 text-[rgb(var(--ok))]" />{texto}
    </p>
  )
}
