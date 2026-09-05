import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Activity, AlertTriangle, CalendarClock, Flame, MessageSquare, Search, Send, Target, TrendingUp,
} from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { useMetricasCrm } from '@/hooks/useData'
import { fmtMetrica } from '@/lib/metricas'
import { touchColor } from '@/lib/touches'
import { cn } from '@/lib/utils'
import { iso, rangoMes, rangoSemana } from '../shared/goalMeta'
import type { MetricasCrm } from '@/types'

/**
 * Panel comercial — el "qué hice / qué estoy haciendo / qué me falta" del mes.
 *
 * Todos los números salen de un único RPC (`metricas_crm`, migración 0028) que
 * los deriva de las acciones reales: dar de alta un lead, completar un toque,
 * mover una etapa. Aquí no se cuenta nada a mano ni se recalcula en el
 * navegador; si un número no cuadra, el sitio donde mirar es `metrica_valor()`.
 *
 * El orden de la pantalla es el orden de las preguntas que se hacen de verdad:
 * primero cómo va el embudo, luego el ritmo de contacto, y al final —lo único
 * accionable hoy mismo— lo que está esperando.
 */
export function PanelComercial({ mes, esActual }: { mes: Date; esActual: boolean }) {
  // Sólo se ofrecen día y semana en el mes en curso: "hoy" dentro de un mes
  // pasado no significa nada y sólo daría ceros confusos.
  const [periodo, setPeriodo] = useState<'dia' | 'semana' | 'mes'>('mes')
  const efectivo = esActual ? periodo : 'mes'

  const rango = useMemo(() => {
    if (efectivo === 'mes') return rangoMes(mes)
    if (efectivo === 'semana') return rangoSemana(new Date())
    const hoy = iso(new Date())
    return { desde: hoy, hasta: hoy }
  }, [efectivo, mes])

  const { data, isLoading, isError } = useMetricasCrm(rango.desde, rango.hasta)

  if (isError) {
    return (
      <div className="card flex items-center gap-2 text-sm text-muted">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        No se pudieron cargar las métricas comerciales. Comprueba que la migración 0028 esté aplicada.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {esActual && (
        <div className="flex w-fit overflow-hidden rounded-lg border border-border text-xs">
          {([['dia', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes']] as const).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriodo(k)}
              className={cn(
                'px-3 py-1.5 transition-colors',
                periodo === k ? 'bg-primary-400 text-white' : 'hover:bg-surface-2',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {isLoading || !data ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : (
        <>
          <Kpis m={data} />
          <Canales m={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <Embudo m={data} />
            <Toques m={data} />
          </div>
          <QueMeFalta m={data} />
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- KPIs */

function Kpis({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  const wa = p.contactos_whatsapp
  const email = p.contactos_email

  // El canal que MÁS RESPUESTA saca, no el que más se usa. Es la diferencia
  // entre "por dónde estoy trabajando" y "por dónde debería trabajar", y la
  // segunda es la que cambia lo que se hace mañana. Sólo se declara ganador
  // cuando ambos canales tienen envíos: con uno a cero no hay comparación,
  // hay una muestra.
  const hayComparacion = wa > 0 && email > 0
  const mejor = m.ratios.tasa_respuesta_whatsapp >= m.ratios.tasa_respuesta_email
    ? { nombre: 'WhatsApp', tasa: m.ratios.tasa_respuesta_whatsapp }
    : { nombre: 'Correo', tasa: m.ratios.tasa_respuesta_email }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi
        icon={<Search className="h-4 w-4" />}
        label="Leads encontrados"
        valor={String(p.leads_encontrados)}
        pie={`${p.leads_contactados} recibieron su primer contacto`}
      />
      <Kpi
        icon={<Activity className="h-4 w-4" />}
        label="Contactos realizados"
        valor={String(p.contactos_realizados)}
        pie={
          m.ratios.toques_por_lead > 0
            ? `${fmtMetrica(undefined, m.ratios.toques_por_lead)} toques por lead`
            : 'Todavía sin toques en el periodo'
        }
      />
      <Kpi
        icon={<MessageSquare className="h-4 w-4" />}
        label="Tasa de respuesta"
        valor={`${Math.round(m.ratios.tasa_respuesta)}%`}
        pie={`${p.respuestas_recibidas} respuestas sobre los toques dados`}
        acento={m.ratios.tasa_respuesta >= 15 ? 'text-emerald-500' : undefined}
      />
      <Kpi
        icon={<TrendingUp className="h-4 w-4" />}
        label="Tasa de conversión"
        valor={`${Math.round(m.ratios.tasa_conversion)}%`}
        pie={`${p.leads_ganados} ganados · ${p.leads_perdidos} perdidos`}
        acento={p.leads_ganados > 0 ? 'text-emerald-500' : undefined}
      />
      <Kpi
        icon={<Send className="h-4 w-4" />}
        label="WhatsApp · correo"
        valor={`${wa} · ${email}`}
        pie={
          hayComparacion
            ? `Responde mejor ${mejor.nombre} (${Math.round(mejor.tasa)}%)`
            : wa + email > 0
              ? 'Todavía sin envíos por los dos canales'
              : 'Sin envíos por WhatsApp ni correo'
        }
        acento={hayComparacion ? 'text-emerald-500' : undefined}
      />
    </div>
  )
}

function Kpi({
  icon, label, valor, pie, acento,
}: { icon: ReactNode; label: string; valor: string; pie: string; acento?: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </div>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums text-fg', acento)}>{valor}</p>
      <p className="mt-0.5 text-[11px] text-muted">{pie}</p>
    </div>
  )
}

/* ------------------------------------------------------------- Canales */

/**
 * WhatsApp contra correo, lado a lado. Va justo debajo de los KPIs porque la
 * pregunta que responde —dónde meter las horas de mañana— es más accionable
 * que cualquier otra cosa del panel.
 *
 * Se enseñan las tres cifras juntas (envíos, respuestas y tasa) a propósito:
 * una tasa suelta engaña. Un 50% sobre dos envíos no es mejor que un 18%
 * sobre ciento cuarenta, y con los tres números delante eso se ve solo.
 *
 * Los toques de llamada, reunión y 'otro' no aparecen aquí; por eso los dos
 * canales no tienen por qué sumar el total de contactos del periodo.
 */
function Canales({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  const canales = [
    {
      nombre: 'WhatsApp',
      enviados: p.contactos_whatsapp,
      respuestas: p.respuestas_whatsapp,
      tasa: m.ratios.tasa_respuesta_whatsapp,
      barra: 'bg-emerald-500',
      punto: 'bg-emerald-500',
    },
    {
      nombre: 'Correo',
      enviados: p.contactos_email,
      respuestas: p.respuestas_email,
      tasa: m.ratios.tasa_respuesta_email,
      barra: 'bg-sky-500',
      punto: 'bg-sky-500',
    },
  ]
  // Escala compartida por los dos: barras con escalas distintas no se pueden
  // comparar de un vistazo, que es lo único que hace este bloque.
  const max = Math.max(...canales.map((c) => c.enviados), 1)
  const totalCanal = canales.reduce((a, c) => a + c.enviados, 0)

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Send className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Por dónde se contactó</h3>
      </div>

      {totalCanal === 0 ? (
        <p className="py-2 text-xs text-muted">
          Ningún contacto por WhatsApp ni por correo en el periodo. En cuanto
          salga el primer mensaje, aquí sale la comparación.
        </p>
      ) : (
        <div className="space-y-4">
          {canales.map((c) => (
            <div key={c.nombre}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="flex items-center gap-1.5 text-fg">
                  <span className={cn('h-2 w-2 rounded-full', c.punto)} />
                  {c.nombre}
                </span>
                <span className="text-muted">
                  <span className="font-semibold tabular-nums text-fg">{c.enviados}</span> enviados ·{' '}
                  <span className="font-semibold tabular-nums text-fg">{c.respuestas}</span> respuestas
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  {/* Dentro de la barra de envíos, la parte que respondió: la
                      proporción se lee sin tener que dividir mentalmente. */}
                  <div
                    className={cn('h-full rounded-full', c.barra, 'opacity-30')}
                    style={{ width: `${Math.max((c.enviados / max) * 100, c.enviados > 0 ? 3 : 0)}%` }}
                  >
                    <div
                      className={cn('h-full rounded-full', c.barra)}
                      style={{
                        width: c.enviados > 0 ? `${(c.respuestas / c.enviados) * 100}%` : '0%',
                      }}
                    />
                  </div>
                </div>
                <span
                  className={cn(
                    'w-12 shrink-0 text-right text-xs font-semibold tabular-nums',
                    c.tasa >= 15 ? 'text-emerald-500' : 'text-muted',
                  )}
                >
                  {c.enviados > 0 ? `${Math.round(c.tasa)}%` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalCanal > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          Cuenta los mensajes que salieron de verdad y los toques registrados,
          sin contar dos veces al mismo lead el mismo día. El porcentaje es
          cuántos consiguieron respuesta; la parte sólida de la barra, esas
          respuestas dentro de lo enviado.
        </p>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- Embudo */

/**
 * El embudo con barras proporcionales al escalón más ancho, y la conversión
 * respecto al escalón ANTERIOR, no respecto al total: lo que se quiere ver es
 * dónde se rompe la cadena, y un porcentaje sobre el total esconde el salto
 * concreto que está fallando.
 */
function Embudo({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  const pasos = [
    { label: 'Encontrados', valor: p.leads_encontrados },
    { label: 'Contactados', valor: p.leads_contactados },
    { label: 'Respondieron', valor: p.leads_respondieron },
    { label: 'Reuniones', valor: p.reuniones_agendadas },
    { label: 'Propuestas', valor: p.propuestas_enviadas },
    { label: 'Ganados', valor: p.leads_ganados },
  ]
  const max = Math.max(...pasos.map((s) => s.valor), 1)

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Target className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Embudo del periodo</h3>
      </div>
      <div className="space-y-2">
        {pasos.map((s, i) => {
          const prev = i > 0 ? pasos[i - 1].valor : 0
          const conv = i > 0 && prev > 0 ? Math.round((s.valor / prev) * 100) : null
          return (
            <div key={s.label}>
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-muted">{s.label}</span>
                <span className="font-semibold tabular-nums text-fg">
                  {s.valor}
                  {conv !== null && (
                    <span className={cn('ml-2 font-normal', conv < 20 ? 'text-amber-500' : 'text-muted')}>
                      {conv}%
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-primary-400"
                  style={{ width: `${Math.max((s.valor / max) * 100, s.valor > 0 ? 3 : 0)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        El porcentaje es la conversión respecto al escalón anterior: señala dónde
        se rompe la cadena, no cuánto queda del total.
      </p>
    </div>
  )
}

/* -------------------------------------------------------------- Toques */

function Toques({ m }: { m: MetricasCrm }) {
  const p = m.periodo
  const barras = [
    { toque: 1, n: p.touch_1 }, { toque: 2, n: p.touch_2 }, { toque: 3, n: p.touch_3 },
    { toque: 4, n: p.touch_4 }, { toque: 5, n: p.touch_5 },
  ]
  const max = Math.max(...barras.map((b) => b.n), 1)

  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <Flame className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Insistencia por toque</h3>
      </div>
      <div className="space-y-2">
        {barras.map((b) => (
          <div key={b.toque} className="flex items-center gap-2">
            <span className={cn('w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold', touchColor(b.toque))}>
              {b.toque === 5 ? 'Touch 5+' : `Touch ${b.toque}`}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-primary-400/80"
                style={{ width: `${Math.max((b.n / max) * 100, b.n > 0 ? 3 : 0)}%` }}
              />
            </div>
            <span className="w-8 text-right text-xs tabular-nums text-muted">{b.n}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
        <div>
          <span className="block text-muted">Días entre contactos</span>
          <span className="font-semibold text-fg">
            {p.dias_entre_contactos > 0 ? `${fmtMetrica(undefined, p.dias_entre_contactos)} días` : '—'}
          </span>
        </div>
        <div>
          <span className="block text-muted">Tiempo dedicado</span>
          <span className="font-semibold text-fg">
            {fmtMetrica('tiempo_prospeccion_min', p.tiempo_prospeccion_min)}
          </span>
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------- Qué me falta */

/**
 * Lo único de este panel que no mira al pasado. `situacion` es la foto de HOY
 * de toda la cartera, no del periodo elegido: un seguimiento atrasado lo está
 * ahora mismo, se mire el mes que se mire.
 */
function QueMeFalta({ m }: { m: MetricasCrm }) {
  const s = m.situacion
  const items = [
    { label: 'Seguimientos atrasados', n: s.seg_atrasados, tono: 'text-red-500' },
    { label: 'Para hoy', n: s.seg_hoy, tono: 'text-primary-500' },
    { label: 'Sin contactar', n: s.sin_contactar, tono: 'text-slate-500' },
    { label: 'Contactados sin próximo toque', n: s.sin_proximo, tono: 'text-amber-500' },
    { label: 'En negociación', n: s.negociacion, tono: 'text-emerald-500' },
  ]
  return (
    <div className="card">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-muted" />
        <h3 className="text-sm font-semibold text-fg">Qué me falta ahora mismo</h3>
        <span className="ml-auto text-[11px] text-muted">{s.total_activos} leads activos</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((i) => (
          <div key={i.label} className="rounded-xl border border-border p-3">
            <p className={cn('text-xl font-bold tabular-nums', i.n > 0 ? i.tono : 'text-muted')}>{i.n}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{i.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default PanelComercial
