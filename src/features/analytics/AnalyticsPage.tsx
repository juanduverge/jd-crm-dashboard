import { useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import {
  AlertTriangle, ArrowRight, Banknote, CalendarRange, Clock, Filter, Globe2, Handshake,
  Languages, LayoutDashboard, Map as MapIcon, MessageSquare, Phone, Search, Send, Tags, Trophy, Users,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui'
import { BrandTooltip, ChartGradients, axisTick, gridProps } from '@/components/charts/chartTheme'
import { useContactosHechos, useLeads, useMetricasCrm, useMetricasEmbudo, useMetricasRitmo, useNichos } from '@/hooks/useData'
import { IDIOMA_META } from '@/lib/origen'
import { cn, formatCurrency, formatMontos } from '@/lib/utils'
import { PorCanal, PorOrigen, Contratos } from '@/features/productividad/metricas/PanelEmbudo'
import { Ritmo } from './Conclusiones'
import { Hallazgos, calcularHallazgos } from './Hallazgos'
import { LlamadasTab } from './LlamadasTab'
import { Abrible, DetalleProvider, Explica } from './DetallePanel'
import { GlosarioBoton } from './GlosarioBoton'
import type { Agrupar, Consulta, Paso } from './detalle'
import type { ClaveGlosario } from './glosario'
import {
  esContactado, respondio, llegoReunion, ganado, ranking, tasa, type FilaRanking, type PuntoLead,
} from '@/features/mapa/mapaDatos'
import type { Lead, LeadIdioma } from '@/types'

/**
 * Analíticas — entender el negocio: qué convierte, dónde y por qué canal.
 *
 * Cada bloque responde UNA pregunta y lo dice en su cabecera. Las cifras de
 * actividad (toques, respuestas, contratos) salen del motor de métricas en
 * SQL (`metricas_crm` y `metricas_embudo`); los repartos por nicho, ciudad e
 * idioma se cuentan aquí sobre los leads que entraron en el periodo, con las
 * mismas definiciones que el Mapa (`mapaDatos`).
 *
 * Sustituye a la versión anterior, que contaba como «contactado» cualquier
 * lead fuera de «Nuevo» y sacaba la tasa de respuesta de la bandeja de correo.
 */

type Periodo = '30' | '90' | 'anio' | 'todo'
type Pestana = 'resumen' | 'llamadas' | 'mensajes' | 'clientes'

/**
 * Pestañas (20-nov): antes todo iba en una sola página larguísima y Juan no
 * encontraba ni entendía las cosas. Cada pestaña responde a una pregunta.
 */
const PESTANAS: { id: Pestana; label: string; icon: typeof Phone; pregunta: string }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard, pregunta: '¿Cómo voy y qué debería cambiar?' },
  { id: 'llamadas', label: 'Llamadas', icon: Phone, pregunta: '¿Cuántas llamadas hago y qué funciona en ellas?' },
  { id: 'mensajes', label: 'Mensajes', icon: MessageSquare, pregunta: '¿Por dónde responden, cuándo escribir y cuántas veces insistir?' },
  { id: 'clientes', label: 'Clientes y ventas', icon: Users, pregunta: '¿De dónde vienen los clientes que compran y cuánto he vendido?' },
]

const PERIODOS: { id: Periodo; label: string }[] = [
  { id: '30', label: '30 días' },
  { id: '90', label: '90 días' },
  { id: 'anio', label: 'Este año' },
  { id: 'todo', label: 'Todo' },
]

const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

function rangoDe(p: Periodo): { desde: string; hasta: string } {
  const hoy = new Date()
  const hasta = isoLocal(hoy)
  if (p === 'todo') return { desde: '2020-01-01', hasta }
  if (p === 'anio') return { desde: `${hoy.getFullYear()}-01-01`, hasta }
  const d = new Date(hoy)
  d.setDate(d.getDate() - (Number(p) - 1))
  return { desde: isoLocal(d), hasta }
}

/** Fecha de alta del lead en YYYY-MM-DD local. */
const altaDe = (l: Lead) => l.fechaCaptura ?? ''

export function AnalyticsPage() {
  const [periodo, setPeriodo] = useState<Periodo>('90')
  // La pestaña va en la URL para que «atrás» en el móvil vuelva a la anterior.
  const [params, setParams] = useSearchParams()
  const pestana = (PESTANAS.some((x) => x.id === params.get('tab')) ? params.get('tab') : 'resumen') as Pestana
  const irA = (t: Pestana) => setParams(t === 'resumen' ? {} : { tab: t })
  const rango = useMemo(() => rangoDe(periodo), [periodo])

  const { leads, isLoading: cargandoLeads } = useLeads()
  const nichos = useNichos()
  const crm = useMetricasCrm(rango.desde, rango.hasta)
  const embudo = useMetricasEmbudo(rango.desde, rango.hasta)
  const ritmo = useMetricasRitmo(rango.desde, rango.hasta)

  const nombreNicho = useMemo(() => {
    const m = new Map(nichos.map((n) => [n.id, `${n.emoji ?? ''} ${n.nombre}`.trim()]))
    return (id?: string) => (id ? m.get(id) ?? id : 'Sin nicho')
  }, [nichos])

  // Cohorte: los leads que ENTRARON en el periodo, y hasta dónde llegaron.
  const cohorte = useMemo(
    () => leads.filter((l) => {
      const f = altaDe(l)
      return f >= rango.desde && f <= rango.hasta
    }),
    [leads, rango],
  )
  // `ranking` trabaja con puntos del mapa; aquí la posición no importa.
  const pseudo = useMemo<PuntoLead[]>(() => cohorte.map((lead) => ({ lead, lat: 0, lng: 0, aproximado: false })), [cohorte])
  const porNicho = useMemo(() => ranking(pseudo, 'nicho', nombreNicho), [pseudo, nombreNicho])
  const porCiudad = useMemo(() => ranking(pseudo, 'ciudad', nombreNicho), [pseudo, nombreNicho])
  const porIdioma = useMemo(() => {
    const g = new Map<string, FilaRanking>()
    for (const l of cohorte) {
      const k = l.idioma || 'sin'
      const f = g.get(k) ?? {
        clave: k, nombre: k === 'sin' ? 'Sin marcar' : IDIOMA_META[k as LeadIdioma]?.label ?? k,
        leads: 0, contactados: 0, respondieron: 0, reuniones: 0, ganados: 0, dinero: 0,
      }
      f.leads += 1
      if (esContactado(l)) f.contactados += 1
      if (respondio(l)) f.respondieron += 1
      if (llegoReunion(l)) f.reuniones += 1
      if (ganado(l)) { f.ganados += 1; f.dinero += l.valorEstimado ?? 0 }
      g.set(k, f)
    }
    return [...g.values()].sort((a, b) => b.leads - a.leads)
  }, [cohorte])

  const pasos = useMemo(() => {
    const c = cohorte
    return [
      { label: 'Buscados', paso: 'leads' as Paso, n: c.length, color: '#94a3b8' },
      { label: 'Contactados', paso: 'contactados' as Paso, n: c.filter(esContactado).length, color: '#0082f3' },
      { label: 'Respondieron', paso: 'respondieron' as Paso, n: c.filter(respondio).length, color: '#6248ff' },
      { label: 'Reunión o más', paso: 'reuniones' as Paso, n: c.filter(llegoReunion).length, color: '#f38744' },
      { label: 'Ventas', paso: 'ganados' as Paso, n: c.filter(ganado).length, color: '#16a34a' },
    ]
  }, [cohorte])

  // Ritmo semanal: primeros contactos y respuestas por semana (12 semanas).
  const semanal = useMemo(() => {
    const lunes = (d: Date) => { const x = new Date(d); const dia = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dia); return isoLocal(x) }
    const semanas: string[] = []
    const hoy = new Date()
    for (let i = 11; i >= 0; i--) { const d = new Date(hoy); d.setDate(d.getDate() - i * 7); semanas.push(lunes(d)) }
    const m = new Map(semanas.map((s) => [s, { semana: s.slice(5).split('-').reverse().join('/'), contactados: 0, respondieron: 0, nuevos: 0 }]))
    for (const l of leads) {
      const b = (iso?: string) => (iso ? m.get(lunes(new Date(iso))) : undefined)
      const alta = l.fechaCaptura ? m.get(lunes(new Date(`${l.fechaCaptura}T12:00:00`))) : undefined
      if (alta) alta.nuevos += 1
      const pc = b(l.primerContactoEn); if (pc) pc.contactados += 1
      const r = b(l.respondioEn); if (r) r.respondieron += 1
    }
    return [...m.values()]
  }, [leads])

  const p = crm.data?.periodo
  const c = embudo.data?.contratos
  const falla = crm.isError || embudo.isError || ritmo.isError

  // Misma consulta (y caché) que la pestaña Llamadas: aquí solo se cuenta.
  const desdeIso = useMemo(() => new Date(`${rango.desde}T00:00:00`).toISOString(), [rango.desde])
  const hastaIso = useMemo(() => new Date(`${rango.hasta}T23:59:59`).toISOString(), [rango.hasta])
  const hechos = useContactosHechos(desdeIso, hastaIso)
  const llamadas = useMemo(() => {
    const ll = (hechos.data ?? []).filter((f) => ['llamada', 'llamada_whatsapp', 'videollamada'].includes(f.tipo))
    return { total: ll.length, conEncuesta: ll.filter((f) => f.encuesta).length }
  }, [hechos.data])
  const conclusiones = useMemo(
    () => calcularHallazgos({ periodo: p, embudo: embudo.data, ritmo: ritmo.data, porNicho, porCiudad, llamadas }),
    [p, embudo.data, ritmo.data, porNicho, porCiudad, llamadas],
  )
  const actual = PESTANAS.find((x) => x.id === pestana) ?? PESTANAS[0]

  return (
    <DetalleProvider leads={leads} desde={rango.desde} hasta={rango.hasta} nombreNicho={nombreNicho}>
    <div className="space-y-4">
      <PageHeader
        title="Analíticas"
        subtitle="Qué te está funcionando y qué no, explicado con tus datos."
        actions={<GlosarioBoton />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange className="h-4 w-4 text-muted" />
        <div className="flex overflow-hidden rounded-lg border border-border text-xs">
          {PERIODOS.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setPeriodo(x.id)}
              className={cn('min-h-[36px] px-3 transition-colors', periodo === x.id ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}
            >
              {x.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted">{rango.desde.split('-').reverse().join('/')} – {rango.hasta.split('-').reverse().join('/')}</span>
        <span className="ml-auto hidden text-[11px] text-muted sm:inline">Toca un número subrayado para ver los leads · ⓘ explica qué significa</span>
      </div>

      {falla && (
        <div className="card flex items-center gap-2 text-sm text-muted">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          Parte de los números no cargó. Si persiste, revisa que las migraciones 0028, 0065 y 0067 estén aplicadas.
        </div>
      )}

      {/* ------------------------------------------------ Pestañas */}
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1" role="tablist">
        {PESTANAS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            aria-selected={pestana === x.id}
            onClick={() => irA(x.id)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              pestana === x.id ? 'border-primary-500 text-primary-700 dark:text-primary-300' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            <x.icon className="h-4 w-4" />{x.label}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-xs text-muted">{actual.pregunta}</p>

      {pestana === 'resumen' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              icon={<Send className="h-4 w-4" />} label="Contactos hechos" t="contactos_hechos" valor={p?.contactos_realizados} q={{ k: 'toques' }}
              pie={p && <>{p.llamadas_realizadas ?? 0} llamadas · {p.mensajes_enviados ?? 0} mensajes</>}
            />
            <Kpi
              icon={<MessageSquare className="h-4 w-4" />} label="Te responden" t="tasa_respuesta"
              valor={crm.data ? `${Math.round(crm.data.ratios.tasa_respuesta)} de 100` : undefined} q={{ k: 'respuestas' }}
              pie={p && <Abrible q={p.respuestas_recibidas ? { k: 'respuestas' } : undefined}>{p.respuestas_recibidas} respuestas en total</Abrible>}
            />
            <Kpi
              icon={<Handshake className="h-4 w-4" />} label="Reuniones" t="reuniones" valor={p?.reuniones_agendadas} q={{ k: 'etapa', etapa: 'reunion' }}
              pie={p && <Abrible q={p.propuestas_enviadas ? { k: 'etapa', etapa: 'propuesta' } : undefined}>{p.propuestas_enviadas} propuestas enviadas</Abrible>}
            />
            <Kpi
              icon={<Trophy className="h-4 w-4" />} label="Ventas" t="ventas" valor={c?.ganados} q={{ k: 'ganados' }} acento
              pie={c && (c.valor_total ? formatMontos(c.valor_total_mon, c.valor_total) : 'sin ventas aún')}
            />
          </div>

          <Hallazgos hallazgos={conclusiones.hallazgos} faltan={conclusiones.faltan} />

          <div className="grid gap-4 lg:grid-cols-5">
            <Bloque
              className="lg:col-span-2"
              icon={<Filter className="h-4 w-4 text-primary-400" />}
              titulo="Del lead a la venta"
              t="embudo"
              pregunta="De los leads que entraron en el periodo, cuántos llegaron a cada paso. El % es cuántos pasaron desde el paso anterior."
            >
              {cargandoLeads && leads.length === 0 ? <Skeleton className="h-56" /> : (
                <ul className="space-y-2.5">
                  {pasos.map((s, i) => {
                    const ancho = pasos[0].n ? Math.max(2, (s.n / pasos[0].n) * 100) : 0
                    const conv = i > 0 ? tasa(s.n, pasos[i - 1].n) : null
                    return (
                      <li key={s.label}>
                        <Abrible q={s.n ? { k: 'cohorte', paso: s.paso } : undefined} className="block w-full !no-underline px-1 -mx-1 py-0.5">
                          <div className="mb-1 flex items-baseline justify-between text-xs">
                            <span className="font-medium text-fg">{s.label}</span>
                            <span className="tabular-nums text-muted">
                              <b className="text-fg">{s.n}</b>{conv !== null && <> · pasó el {conv}%</>}
                            </span>
                          </div>
                          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2">
                            <div className="h-full rounded-full" style={{ width: `${ancho}%`, background: s.color }} />
                          </div>
                        </Abrible>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Bloque>

            <Bloque
              className="lg:col-span-3"
              icon={<CalendarRange className="h-4 w-4 text-primary-400" />}
              titulo="Semana a semana"
              pregunta="Últimas 12 semanas: leads nuevos, leads a los que escribiste por primera vez y leads que te respondieron."
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={semanal} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <ChartGradients />
                    <CartesianGrid {...gridProps} vertical={false} />
                    <XAxis dataKey="semana" tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} minTickGap={16} />
                    <YAxis tick={axisTick} stroke="rgb(var(--border))" tickLine={false} axisLine={false} allowDecimals={false} width={40} />
                    <Tooltip content={<BrandTooltip />} cursor={{ stroke: 'rgb(var(--muted))', strokeDasharray: '3 3' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                    <Area type="monotone" dataKey="nuevos" name="Nuevos" stroke="#94a3b8" strokeWidth={2} fill="transparent" />
                    <Area type="monotone" dataKey="contactados" name="Contactados" stroke="#ff7448" strokeWidth={2.5} fill="url(#gradCoralArea)" />
                    <Area type="monotone" dataKey="respondieron" name="Respondieron" stroke="#6248ff" strokeWidth={2.5} fill="url(#gradVioletArea)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Bloque>
          </div>
        </>
      )}

      {pestana === 'llamadas' && <LlamadasTab desde={rango.desde} hasta={rango.hasta} leads={leads} />}

      {pestana === 'mensajes' && (
        embudo.isLoading ? <Skeleton className="h-64" /> : (
          <>
            {embudo.data && <PorCanal filas={embudo.data.por_canal} />}
            {ritmo.data && <Ritmo ritmo={ritmo.data} />}
          </>
        )
      )}

      {pestana === 'clientes' && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi
              icon={<Trophy className="h-4 w-4" />} label="Ventas" t="ventas" valor={c?.ganados} q={{ k: 'ganados' }} acento
              pie={c && <Abrible q={c.perdidos ? { k: 'perdidos' } : undefined}>{c.perdidos} perdidas</Abrible>}
            />
            <Kpi
              icon={<Banknote className="h-4 w-4" />} label="Dinero vendido" t="dinero_vendido" valor={c ? formatMontos(c.valor_total_mon, c.valor_total) : undefined} q={{ k: 'ganados', vista: 'valor' }} acento
              pie={c && <Abrible q={c.cobrado ? { k: 'cobros', estado: 'cobrado' } : undefined}>{formatMontos(c.cobrado_mon, c.cobrado)} ya cobrado</Abrible>}
            />
            <Kpi icon={<Tags className="h-4 w-4" />} label="Lo que paga cada cliente" t="ticket_medio" valor={c ? formatMontos(c.ticket_medio_mon, c.ticket_medio) : undefined} q={{ k: 'ganados', vista: 'ticket' }} pie="de media (ticket medio)" />
            <Kpi icon={<Clock className="h-4 w-4" />} label="Tiempo hasta cerrar" t="ciclo_venta" valor={c ? `${c.dias_ciclo} días` : undefined} q={{ k: 'ganados', vista: 'ciclo' }} pie="del primer contacto a la venta" />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Search className="h-3.5 w-3.5" />
            <Abrible q={{ k: 'cohorte', paso: 'leads' }}>{p?.leads_encontrados ?? '…'} leads nuevos</Abrible> entraron en el periodo.
          </div>
          {embudo.isLoading ? <Skeleton className="h-64" /> : embudo.data && (
            <div className="grid gap-4 lg:grid-cols-2">
              <PorOrigen filas={embudo.data.por_origen} />
              <Contratos m={embudo.data} />
            </div>
          )}
          <TablaReparto
            por="nicho"
            icon={<Tags className="h-4 w-4 text-primary-400" />}
            titulo="¿Qué tipo de negocio funciona?"
            pregunta="Leads del periodo por nicho, ordenados por ventas y luego por cuántos responden."
            filas={porNicho}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <TablaReparto
              por="ciudad"
              icon={<Globe2 className="h-4 w-4 text-primary-400" />}
              titulo="¿En qué ciudades?"
              pregunta="Las 15 ciudades con más actividad del periodo."
              filas={porCiudad}
              limite={15}
              accion={<Link to="/mapa" className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"><MapIcon className="h-3.5 w-3.5" /> Ver en el mapa <ArrowRight className="h-3 w-3" /></Link>}
            />
            <TablaReparto
              por="idioma"
              icon={<Languages className="h-4 w-4 text-primary-400" />}
              titulo="¿En qué idioma?"
              pregunta="Según el idioma que marcaste en cada lead."
              filas={porIdioma}
            />
          </div>
        </>
      )}
    </div>
    </DetalleProvider>
  )
}

/* ------------------------------------------------------------------ piezas */

function Kpi({ icon, label, valor, pie, acento, q, t }: {
  icon: ReactNode; label: string; valor?: number | string; pie?: ReactNode; acento?: boolean; q?: Consulta; t?: ClaveGlosario
}) {
  const vacio = valor === 0 || valor === '0%' || valor === formatCurrency(0)
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">{icon} <span className="min-w-0 truncate">{label}</span>{t && <Explica t={t} className="ml-auto" />}</div>
      {valor === undefined ? <Skeleton className="mt-2 h-7 w-16" /> : (
        <Abrible
          q={vacio ? undefined : q}
          className={cn('-mx-1 mt-1 block max-w-full truncate px-1 text-2xl font-bold tabular-nums text-fg', acento && 'text-emerald-600 dark:text-emerald-400')}
        >
          <span title={typeof valor === 'string' ? valor : undefined}>{valor}</span>
        </Abrible>
      )}
      {pie && <div className="mt-0.5 truncate text-[11px] text-muted">{pie}</div>}
    </div>
  )
}

function Bloque({ icon, titulo, pregunta, children, className, accion, t }: {
  icon: ReactNode; titulo: string; pregunta: string; children: ReactNode; className?: string; accion?: ReactNode; t?: ClaveGlosario
}) {
  return (
    <section className={cn('card p-4', className)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">{icon} {titulo}{t && <Explica t={t} />}</h3>
        {accion}
      </div>
      <p className="mb-3 mt-0.5 text-[11px] text-muted">{pregunta}</p>
      {children}
    </section>
  )
}

function TablaReparto({ icon, titulo, pregunta, filas, limite, accion, por }: {
  icon: ReactNode; titulo: string; pregunta: string; filas: FilaRanking[]; limite?: number; accion?: ReactNode; por: Agrupar
}) {
  // Cada celda abre los leads de ese grupo en ese paso del embudo.
  const q = (f: FilaRanking, paso: Paso, n: number): Consulta | undefined =>
    n ? { k: 'cohorte', paso, grupo: { por, clave: f.clave, nombre: f.nombre } } : undefined
  const orden = [...filas]
    .sort((a, b) => b.ganados - a.ganados || tasa(b.respondieron, b.contactados) - tasa(a.respondieron, a.contactados) || b.leads - a.leads)
    .slice(0, limite ?? filas.length)
  const maxResp = Math.max(1, ...orden.map((f) => tasa(f.respondieron, f.contactados)))

  return (
    <Bloque icon={icon} titulo={titulo} pregunta={pregunta} accion={accion}>
      {orden.length === 0 ? <p className="text-sm text-muted">Sin leads en este periodo.</p> : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[520px] text-xs">
            <thead className="border-b border-border text-[10px] uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-2 text-left font-medium"></th>
                <th className="px-2 py-2 text-right font-medium">Leads</th>
                <th className="px-2 py-2 text-right font-medium">Contactados</th>
                <th className="px-2 py-2 text-left font-medium">Responden</th>
                <th className="px-2 py-2 text-right font-medium">Reuniones</th>
                <th className="px-2 py-2 text-right font-medium">Ventas</th>
                <th className="py-2 pl-2 text-right font-medium">Dinero</th>
              </tr>
            </thead>
            <tbody>
              {orden.map((f) => {
                const r = tasa(f.respondieron, f.contactados)
                return (
                  <tr key={f.clave} className="border-b border-border last:border-0">
                    <td className="max-w-[180px] truncate py-2 pr-2 font-medium text-fg" title={f.nombre}>
                      <Abrible q={q(f, 'leads', f.leads)} className="max-w-full truncate">{f.nombre}</Abrible>
                      {f.sub && <span className="font-normal text-muted"> · {f.sub}</span>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted"><Abrible q={q(f, 'leads', f.leads)}>{f.leads}</Abrible></td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted"><Abrible q={q(f, 'contactados', f.contactados)}>{f.contactados}</Abrible></td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2">
                          <div className="h-full rounded-full bg-primary-400" style={{ width: `${(r / maxResp) * 100}%` }} />
                        </div>
                        <Abrible q={q(f, 'respondieron', f.respondieron)} className="tabular-nums text-fg" title={`${f.respondieron} de ${f.contactados} contactados`}>{r}%</Abrible>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted"><Abrible q={q(f, 'reuniones', f.reuniones)}>{f.reuniones}</Abrible></td>
                    <td className={cn('px-2 py-2 text-right tabular-nums', f.ganados ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted')}><Abrible q={q(f, 'ganados', f.ganados)}>{f.ganados}</Abrible></td>
                    <td className="py-2 pl-2 text-right tabular-nums text-fg"><Abrible q={q(f, 'ganados', f.dinero)}>{f.dinero ? formatCurrency(f.dinero) : '—'}</Abrible></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Bloque>
  )
}
