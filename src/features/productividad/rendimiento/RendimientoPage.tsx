import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  endOfMonth, format, getDate, min as minFecha, startOfMonth, startOfWeek, subDays, subMonths,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { ArrowRight, Lightbulb, TrendingDown, TrendingUp, Minus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle, Skeleton } from '@/components/ui'
import {
  useEntradasDelRango, useMetricasCrm, useMetricasEmbudo, useMetricasRitmo,
} from '@/hooks/useData'
import { TIPO_META } from '@/lib/followUps'
import { cn, formatNumber } from '@/lib/utils'
import type { MetricasCrm, MetricasEmbudo, MetricasRitmo } from '@/types'
import { fmtDuracion } from '../tiempo/tiempoMeta'

/**
 * Rendimiento — sustituye a «Métricas y rendimiento».
 *
 * Aquella pantalla tenía quince cajas de cifras y había que saber leerlas.
 * Esta contesta en frases a lo que de verdad se pregunta uno al final de la
 * semana: ¿trabajé lo suficiente?, ¿qué está funcionando?, ¿cuándo y por dónde
 * contesta la gente?, ¿en qué se me fue el tiempo?
 *
 * Los números son los mismos (motor de métricas en SQL), así que cuadran con
 * el Resumen y con Analíticas.
 */

type Periodo = 'semana' | 'mes' | 'mes_pasado'
const iso = (d: Date) => format(d, 'yyyy-MM-dd')

function rangos(p: Periodo) {
  const hoy = new Date()
  if (p === 'semana') {
    const ini = startOfWeek(hoy, { weekStartsOn: 1 })
    const dias = Math.round((hoy.getTime() - ini.getTime()) / 86_400_000)
    return {
      actual: { desde: iso(ini), hasta: iso(hoy) },
      anterior: { desde: iso(subDays(ini, 7)), hasta: iso(subDays(ini, 7 - dias)) },
      texto: 'esta semana', antes: 'la semana pasada a estas alturas',
    }
  }
  if (p === 'mes') {
    const ini = startOfMonth(hoy)
    const iniAnt = startOfMonth(subMonths(hoy, 1))
    const finAnt = minFecha([new Date(iniAnt.getFullYear(), iniAnt.getMonth(), getDate(hoy)), endOfMonth(iniAnt)])
    return {
      actual: { desde: iso(ini), hasta: iso(hoy) },
      anterior: { desde: iso(iniAnt), hasta: iso(finAnt) },
      texto: 'este mes', antes: 'los mismos días del mes pasado',
    }
  }
  const m = subMonths(hoy, 1)
  const m2 = subMonths(hoy, 2)
  return {
    actual: { desde: iso(startOfMonth(m)), hasta: iso(endOfMonth(m)) },
    anterior: { desde: iso(startOfMonth(m2)), hasta: iso(endOfMonth(m2)) },
    texto: `en ${format(m, 'LLLL', { locale: es })}`, antes: format(m2, 'LLLL', { locale: es }),
  }
}

const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos']
const CATEGORIA: Record<string, string> = {
  desarrollo: 'Desarrollo', ventas: 'Ventas', marketing: 'Marketing', reuniones: 'Reuniones',
  investigacion: 'Investigación', aprendizaje: 'Aprendizaje', libre: 'Tiempo libre',
}

export default function RendimientoPage() {
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const r = useMemo(() => rangos(periodo), [periodo])
  const crm = useMetricasCrm(r.actual.desde, r.actual.hasta)
  const ant = useMetricasCrm(r.anterior.desde, r.anterior.hasta)
  const embudo = useMetricasEmbudo(r.actual.desde, r.actual.hasta)
  const ritmo = useMetricasRitmo(r.actual.desde, r.actual.hasta)
  const tiempo = useEntradasDelRango(r.actual.desde, r.actual.hasta)

  const cargando = crm.isLoading || embudo.isLoading || ritmo.isLoading

  return (
    <div>
      <PageHeader title="Rendimiento" subtitle="Cuánto trabajaste, qué funciona y en qué se te va el tiempo. Explicado en frases." />

      <div className="mb-5 inline-flex rounded-xl border border-border bg-surface p-1">
        {([['semana', 'Esta semana'], ['mes', 'Este mes'], ['mes_pasado', 'Mes pasado']] as [Periodo, string][]).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setPeriodo(v)}
            className={cn('rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors', v === periodo ? 'bg-primary-500 text-white shadow-sm' : 'text-muted hover:text-fg')}
          >
            {l}
          </button>
        ))}
      </div>

      {cargando || !crm.data ? (
        <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-64" /></div>
      ) : (
        <div className="space-y-5">
          <Conclusiones crm={crm.data} ant={ant.data} embudo={embudo.data} ritmo={ritmo.data} segundos={sumaSegundos(tiempo.data)} texto={r.texto} antes={r.antes} />
          <Esfuerzo crm={crm.data} ant={ant.data} segundos={sumaSegundos(tiempo.data)} antes={r.antes} />
          <div className="grid gap-4 lg:grid-cols-2">
            <DelContactoAlCliente crm={crm.data} />
            <PorCanal embudo={embudo.data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Cuando ritmo={ritmo.data} />
            <Tiempo entradas={tiempo.data ?? []} cargando={tiempo.isLoading} />
          </div>
          <p className="text-center text-xs text-muted">
            ¿Quieres el detalle lead a lead? Está en <Link to="/analytics" className="font-medium text-primary-600 hover:underline">Analíticas</Link>.
          </p>
        </div>
      )}
    </div>
  )
}

function sumaSegundos(e?: { duracionSeg?: number }[]) {
  return (e ?? []).reduce((s, x) => s + (x.duracionSeg ?? 0), 0)
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)
function cambio(a?: number, b?: number): number | null {
  if (a == null || b == null || b === 0) return null
  return Math.round(((a - b) / b) * 100)
}

// ---------------------------------------------------------------
// Las conclusiones: lo único que hay que leer si no hay tiempo
// ---------------------------------------------------------------

function Conclusiones({ crm, ant, embudo, ritmo, segundos, texto, antes }: {
  crm: MetricasCrm; ant?: MetricasCrm; embudo?: MetricasEmbudo; ritmo?: MetricasRitmo; segundos: number; texto: string; antes: string
}) {
  const p = crm.periodo
  const frases: { tono: 'bien' | 'mal' | 'neutro'; texto: ReactNode }[] = []

  // 1. Esfuerzo
  const c = cambio(p.contactos_realizados, ant?.periodo.contactos_realizados)
  frases.push({
    tono: c == null ? 'neutro' : c >= 0 ? 'bien' : 'mal',
    texto: <>Hiciste <b>{p.contactos_realizados} contactos</b> {texto}{p.leads_contactados ? <>, {p.leads_contactados} a leads nuevos</> : null}
      {c != null && <> — un <b>{Math.abs(c)}% {c >= 0 ? 'más' : 'menos'}</b> que {antes}</>}.</>,
  })

  // 2. Respuesta y canal
  const canales = (embudo?.por_canal ?? []).filter((x) => x.toques >= 5)
  if (p.contactos_realizados > 0) {
    const tasa = Math.round(crm.ratios.tasa_respuesta)
    const mejor = [...canales].sort((a, b) => b.respuestas / b.toques - a.respuestas / a.toques)
    let extra: ReactNode = null
    if (mejor.length >= 2) {
      const [m, ...resto] = mejor
      const peor = resto[resto.length - 1]
      extra = <> Mejor canal: <b>{TIPO_META[m.canal]?.label ?? m.canal}</b> ({pct(m.respuestas, m.toques)}%), frente a {TIPO_META[peor.canal]?.label ?? peor.canal} ({pct(peor.respuestas, peor.toques)}%).</>
    }
    frases.push({
      tono: tasa >= 10 ? 'bien' : 'mal',
      texto: <>Te respondió <b>1 de cada {tasa ? Math.max(1, Math.round(100 / tasa)) : '∞'}</b> ({p.leads_respondieron} leads).{extra}</>,
    })
  }

  // 3. Insistencia
  const toques = ritmo?.por_toque ?? []
  const totalResp = toques.reduce((s, t) => s + t.leads, 0)
  if (totalResp >= 3) {
    const despues = toques.filter((t) => t.toque >= 2).reduce((s, t) => s + t.leads, 0)
    frases.push({
      tono: 'neutro',
      texto: despues > 0
        ? <><b>{pct(despues, totalResp)}%</b> de las respuestas llegaron en el segundo contacto o después: insistir funciona.</>
        : <>Todas las respuestas llegaron al primer contacto. Si no responden al primero, prueba otro canal en vez de repetir.</>,
    })
  }

  // 4. Mejor día
  const dias = (ritmo?.por_dia ?? []).filter((d) => d.toques >= 5)
  if (dias.length >= 2) {
    const mejor = [...dias].sort((a, b) => b.respuestas / b.toques - a.respuestas / a.toques)[0]
    if (mejor.respuestas > 0) frases.push({ tono: 'neutro', texto: <>Los <b>{DIAS[mejor.dia]}</b> es cuando más te responden ({pct(mejor.respuestas, mejor.toques)}%). Concentra ahí los primeros contactos.</> })
  }

  // 5. Resultados
  if (p.reuniones_agendadas || p.leads_ganados) {
    frases.push({ tono: 'bien', texto: <>Conseguiste <b>{p.reuniones_agendadas} {p.reuniones_agendadas === 1 ? 'reunión' : 'reuniones'}</b> y <b>{p.leads_ganados} {p.leads_ganados === 1 ? 'cliente' : 'clientes'}</b>.</> })
  } else if (p.contactos_realizados > 20) {
    frases.push({ tono: 'mal', texto: <>Aún ninguna reunión {texto}. Revisa las oportunidades calientes del pipeline: son las más cercanas a una.</> })
  }

  // 6. Tiempo
  frases.push(segundos > 0
    ? { tono: 'neutro', texto: <>Registraste <b>{fmtDuracion(segundos)}</b> de trabajo con el cronómetro.</> }
    : { tono: 'neutro', texto: <>No hay tiempo registrado. Usa el cronómetro de <Link to="/productividad/hoy" className="font-medium text-primary-600 hover:underline">Mi día</Link> para saber en qué se te va el día.</> })

  return (
    <Card className="p-5">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg"><Lightbulb className="h-4 w-4 text-primary-500" />En resumen</p>
      <ul className="space-y-2.5">
        {frases.map((f, i) => (
          <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-fg">
            <span className={cn('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', f.tono === 'bien' ? 'bg-green-500' : f.tono === 'mal' ? 'bg-[rgb(var(--danger))]' : 'bg-slate-400')} />
            <span>{f.texto}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------
// Esfuerzo: cuatro cifras, cada una con su explicación
// ---------------------------------------------------------------

function Esfuerzo({ crm, ant, segundos, antes }: { crm: MetricasCrm; ant?: MetricasCrm; segundos: number; antes: string }) {
  const p = crm.periodo
  const a = ant?.periodo
  const cifras = [
    { label: 'Contactos hechos', v: formatNumber(p.contactos_realizados), d: cambio(p.contactos_realizados, a?.contactos_realizados), ayuda: 'Cada mensaje, correo o llamada a un lead. Escribir dos veces al mismo cuenta dos.' },
    { label: 'Leads nuevos contactados', v: formatNumber(p.leads_contactados), d: cambio(p.leads_contactados, a?.leads_contactados), ayuda: 'Leads a los que escribiste por primera vez. Es lo que llena el embudo.' },
    { label: 'Insistencia', v: (crm.ratios.toques_por_lead ?? 0).toFixed(1), d: null, ayuda: `Contactos de media a cada lead. Cada ${Math.round(p.dias_entre_contactos || 0)} días entre uno y otro.` },
    { label: 'Tareas terminadas', v: formatNumber(p.tareas_completadas), d: cambio(p.tareas_completadas, a?.tareas_completadas), ayuda: segundos ? `Y ${fmtDuracion(segundos)} de trabajo registrado.` : 'Tareas marcadas como hechas.' },
  ]
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-fg">Tu esfuerzo <span className="font-normal text-muted">· comparado con {antes}</span></h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cifras.map((c) => (
          <Card key={c.label} className="p-4">
            <p className="t-eyebrow truncate">{c.label}</p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="t-num text-[1.75rem] leading-none">{c.v}</p>
              {c.d != null && <Delta pct={c.d} />}
            </div>
            <p className="mt-2 text-[0.6875rem] leading-snug text-muted">{c.ayuda}</p>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Delta({ pct: v }: { pct: number }) {
  const Icon = v > 0 ? TrendingUp : v < 0 ? TrendingDown : Minus
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', v > 0 ? 'text-[rgb(var(--ok))]' : v < 0 ? 'text-[rgb(var(--danger))]' : 'text-muted')}>
      <Icon className="h-3 w-3" />{Math.abs(v)}%
    </span>
  )
}

// ---------------------------------------------------------------
// Del contacto al cliente: el embudo, contado «de cada 100»
// ---------------------------------------------------------------

function DelContactoAlCliente({ crm }: { crm: MetricasCrm }) {
  const p = crm.periodo
  const base = p.leads_contactados || p.contactos_realizados
  const pasos = [
    { label: 'Contactados', v: p.leads_contactados, color: '#0082f3' },
    { label: 'Respondieron', v: p.leads_respondieron, color: '#f38744' },
    { label: 'Reunión', v: p.reuniones_agendadas, color: '#ff7448' },
    { label: 'Propuesta', v: p.propuestas_enviadas, color: '#ef6820' },
    { label: 'Clientes', v: p.leads_ganados, color: '#16a34a' },
  ]
  const max = Math.max(1, ...pasos.map((x) => x.v))
  const de100 = (v: number) => (base ? Math.round((v / base) * 100) : 0)
  return (
    <Card>
      <CardHeader><CardTitle>Del contacto al cliente</CardTitle></CardHeader>
      {base > 0 && (
        <p className="-mt-1 mb-4 text-sm text-fg">
          De cada <b>100</b> leads contactados, <b>{de100(p.leads_respondieron)}</b> responden, <b>{de100(p.reuniones_agendadas)}</b> llegan a reunión y <b>{de100(p.leads_ganados)}</b> se hacen clientes.
        </p>
      )}
      <div className="space-y-2.5">
        {pasos.map((x) => (
          <div key={x.label}>
            <div className="flex items-baseline justify-between text-[0.8125rem]">
              <span className="text-fg">{x.label}</span>
              <span className="tabular-nums text-muted"><b className="text-fg">{x.v}</b></span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full" style={{ width: `${Math.max(x.v ? 3 : 0, (x.v / max) * 100)}%`, background: x.color }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function PorCanal({ embudo }: { embudo?: MetricasEmbudo }) {
  const lista = (embudo?.por_canal ?? []).filter((c) => c.toques > 0).sort((a, b) => b.toques - a.toques)
  const max = Math.max(1, ...lista.map((c) => pct(c.respuestas, c.toques)))
  return (
    <Card>
      <CardHeader><CardTitle>¿Por dónde responden?</CardTitle></CardHeader>
      {!lista.length ? <p className="py-6 text-center text-sm text-muted">Sin contactos en este periodo.</p> : (
        <>
          <p className="-mt-1 mb-4 text-xs text-muted">Porcentaje de mensajes de cada canal que recibieron respuesta.</p>
          <div className="space-y-3">
            {lista.map((c) => {
              const t = pct(c.respuestas, c.toques)
              return (
                <div key={c.canal}>
                  <div className="flex items-baseline justify-between text-[0.8125rem]">
                    <span className="text-fg">{TIPO_META[c.canal]?.label ?? c.canal}</span>
                    <span className="tabular-nums text-muted">{c.respuestas} de {c.toques} · <b className={t === 0 ? 'text-[rgb(var(--danger))]' : 'text-fg'}>{t}%</b></span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-primary-500" style={{ width: `${Math.max(t ? 3 : 0, (t / max) * 100)}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------
// Cuándo responden y en qué se va el tiempo
// ---------------------------------------------------------------

const ALTO_BARRAS = 112

function Cuando({ ritmo }: { ritmo?: MetricasRitmo }) {
  const dias = [1, 2, 3, 4, 5, 6, 7].map((d) => ritmo?.por_dia.find((x) => x.dia === d) ?? { dia: d, toques: 0, respuestas: 0 })
  const max = Math.max(1, ...dias.map((d) => d.toques))
  const corto = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D']
  return (
    <Card>
      <CardHeader><CardTitle>¿Qué día responden?</CardTitle></CardHeader>
      <p className="-mt-1 mb-4 text-xs text-muted">Barra clara: contactos que hiciste ese día de la semana. Oscura: los que obtuvieron respuesta.</p>
      <div className="flex items-end gap-2">
        {dias.map((d) => (
          <div key={d.dia} className="flex flex-1 flex-col items-center gap-1">
            {/* Alturas en píxeles: un % dentro de un flex sin alto fijo da 0. */}
            <div className="relative w-full" style={{ height: ALTO_BARRAS }}>
              <div className="absolute bottom-0 w-full rounded-t-md bg-primary-200 dark:bg-primary-500/25" style={{ height: Math.max(d.toques ? 3 : 0, (d.toques / max) * ALTO_BARRAS) }} title={`${d.toques} contactos`} />
              <div className="absolute bottom-0 w-full rounded-t-md bg-primary-500" style={{ height: Math.max(d.respuestas ? 3 : 0, (d.respuestas / max) * ALTO_BARRAS) }} title={`${d.respuestas} respuestas`} />
            </div>
            <span className="text-[0.6875rem] text-muted">{corto[d.dia]}</span>
            <span className="text-[0.625rem] tabular-nums text-muted">{d.toques ? `${pct(d.respuestas, d.toques)}%` : '—'}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function Tiempo({ entradas, cargando }: { entradas: { duracionSeg?: number; categoria?: string }[]; cargando: boolean }) {
  const porCat = new Map<string, number>()
  for (const e of entradas) porCat.set(e.categoria || 'sin', (porCat.get(e.categoria || 'sin') ?? 0) + (e.duracionSeg ?? 0))
  const lista = [...porCat.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])
  const total = lista.reduce((s, [, v]) => s + v, 0)
  return (
    <Card>
      <CardHeader>
        <CardTitle>¿En qué se te fue el tiempo?</CardTitle>
        <Link to="/productividad/tiempo" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Registro completo <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      {cargando ? <Skeleton className="h-32" /> : !total ? (
        <p className="py-6 text-center text-sm text-muted">
          Nada registrado. Pulsa «Empezar» en el cronómetro de{' '}
          <Link to="/productividad/hoy" className="font-medium text-primary-600 hover:underline">Mi día</Link> cuando te pongas con algo.
        </p>
      ) : (
        <div className="space-y-2.5">
          <p className="-mt-1 text-sm text-fg"><b>{fmtDuracion(total)}</b> registradas en total.</p>
          {lista.map(([cat, s]) => (
            <div key={cat}>
              <div className="flex items-baseline justify-between text-[0.8125rem]">
                <span className="text-fg">{cat === 'sin' ? 'Sin categoría' : CATEGORIA[cat] ?? cat}</span>
                <span className="tabular-nums text-muted">{fmtDuracion(s)} · {pct(s, total)}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-sky-500" style={{ width: `${pct(s, total)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
