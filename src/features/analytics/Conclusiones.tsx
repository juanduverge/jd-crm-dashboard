import type { ReactNode } from 'react'
import {
  CalendarClock, Clock, Compass, Globe2, Languages, Lightbulb, Radio, Repeat, Tags, Timer,
} from 'lucide-react'
import { TIPO_META } from '@/lib/followUps'
import { origenLabel } from '@/lib/origen'
import { cn, formatMontos } from '@/lib/utils'
import { tasa, type FilaRanking } from '@/features/mapa/mapaDatos'
import type { EmbudoCanal, MetricasEmbudo, MetricasRitmo } from '@/types'
import { Abrible, Explica } from './DetallePanel'
import type { Agrupar, Consulta } from './detalle'
import type { ClaveGlosario } from './glosario'

/**
 * Conclusiones: la respuesta directa a «¿qué funciona?», sin tener que leer
 * las tablas. Cada tarjeta enseña hasta tres cosas:
 *   - Base:          lo que MÁS se usa (dónde se pone el esfuerzo).
 *   - Más interés:   lo que mejor responde, en %.
 *   - Más contratos: lo que más ventas cierra.
 * Que la base y el ganador no coincidan es justo la pista: se está
 * trabajando más donde no es más rentable.
 *
 * Un porcentaje sobre dos casos no es una conclusión. Por debajo del mínimo
 * de muestra se dice que aún no hay datos, en vez de coronar a un ganador.
 */

const MIN_TOQUES = 10
const MIN_CONTACTADOS = 5

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const DIAS_CORTO = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D']

const canalNombre = (c: string) => TIPO_META[c as keyof typeof TIPO_META]?.label ?? c

function mejor<T>(xs: T[], valor: (x: T) => number, desempate?: (x: T) => number): T | undefined {
  let m: T | undefined
  for (const x of xs) {
    if (!m || valor(x) > valor(m) || (valor(x) === valor(m) && desempate && desempate(x) > desempate(m))) m = x
  }
  return m
}

type Linea = { etiqueta: string; valor?: string; detalle?: string; destacado?: boolean; q?: Consulta }

function Tarjeta({ icon, titulo, lineas, t }: { icon: ReactNode; titulo: string; lineas: Linea[]; t?: ClaveGlosario }) {
  return (
    <div className="card p-4">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{icon} {titulo}{t && <Explica t={t} className="ml-auto" />}</p>
      <dl className="space-y-2">
        {lineas.map((l) => (
          <div key={l.etiqueta}>
            <dt className="text-[10px] uppercase tracking-wide text-muted">{l.etiqueta}</dt>
            <dd className={cn('text-sm font-semibold leading-tight', l.valor ? (l.destacado ? 'text-emerald-600 dark:text-emerald-400' : 'text-fg') : 'font-normal text-muted')}>
              <Abrible q={l.valor ? l.q : undefined} className="-mx-1 px-1">
                {l.valor ?? 'Aún sin datos suficientes'}
                {l.detalle && <span className="ml-1 text-[11px] font-normal text-muted">{l.detalle}</span>}
              </Abrible>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

/** Base / más interés / más contratos de una tabla de reparto. */
function lineasReparto(filas: FilaRanking[], por: Agrupar, excluir?: (f: FilaRanking) => boolean): Linea[] {
  const fs = filas.filter((f) => !excluir?.(f))
  const base = mejor(fs, (f) => f.leads)
  const interes = mejor(fs.filter((f) => f.contactados >= MIN_CONTACTADOS), (f) => tasa(f.respondieron, f.contactados), (f) => f.contactados)
  const ventas = mejor(fs.filter((f) => f.ganados > 0), (f) => f.ganados, (f) => f.dinero)
  const g = (f?: FilaRanking) => (f ? { por, clave: f.clave, nombre: f.nombre } : undefined)
  return [
    { etiqueta: 'Base (más leads)', valor: base?.nombre, detalle: base ? `${base.leads} leads` : undefined, q: base && { k: 'cohorte', paso: 'leads', grupo: g(base) } },
    { etiqueta: 'Más interés', valor: interes?.nombre, detalle: interes ? `${tasa(interes.respondieron, interes.contactados)}% responde` : undefined, q: interes && { k: 'cohorte', paso: 'respondieron', grupo: g(interes) } },
    {
      etiqueta: 'Más contratos', valor: ventas?.nombre, destacado: true, q: ventas && { k: 'cohorte', paso: 'ganados', grupo: g(ventas) },
      detalle: ventas ? `${ventas.ganados} ${ventas.ganados === 1 ? 'venta' : 'ventas'}${ventas.dinero ? ` · ${formatMontos(ventas.dineroMon, ventas.dinero)}` : ''}` : undefined,
    },
  ]
}

function lineasCanal(filas: EmbudoCanal[]): Linea[] {
  const base = mejor(filas, (f) => f.toques)
  const responde = mejor(filas.filter((f) => f.toques >= MIN_TOQUES), (f) => tasa(f.respuestas, f.toques), (f) => f.toques)
  const cierra = mejor(filas.filter((f) => f.ganados > 0), (f) => f.ganados, (f) => f.valor)
  return [
    { etiqueta: 'Base (más usado)', valor: base && base.toques ? canalNombre(base.canal) : undefined, detalle: base?.toques ? `${base.toques} toques` : undefined, q: base && { k: 'toques', canal: base.canal } },
    { etiqueta: 'Más respuesta', valor: responde ? canalNombre(responde.canal) : undefined, detalle: responde ? `${tasa(responde.respuestas, responde.toques)}% de ${responde.toques}` : undefined, q: responde && { k: 'toques', canal: responde.canal, conRespuesta: true } },
    {
      etiqueta: 'Más contratos', valor: cierra ? canalNombre(cierra.canal) : undefined, destacado: true, q: cierra && { k: 'abrieron', canal: cierra.canal, paso: 'ganados' },
      detalle: cierra ? `${cierra.ganados} ${cierra.ganados === 1 ? 'venta' : 'ventas'}${cierra.valor ? ` · ${formatMontos(cierra.valor_mon, cierra.valor)}` : ''}` : undefined,
    },
  ]
}

export function Conclusiones({ embudo, ritmo, porNicho, porCiudad, porIdioma }: {
  embudo?: MetricasEmbudo
  ritmo?: MetricasRitmo
  porNicho: FilaRanking[]
  porCiudad: FilaRanking[]
  porIdioma: FilaRanking[]
}) {
  // Origen: base por leads, interés por % de respuesta, contratos por ventas.
  const origenes: FilaRanking[] = (embudo?.por_origen ?? []).map((o) => ({
    clave: o.origen, nombre: origenLabel(o.origen), leads: o.leads, contactados: o.contactados,
    respondieron: o.respondieron, reuniones: o.reuniones, ganados: o.ganados, dinero: o.valor, dineroMon: o.valor_mon,
  }))

  // Cuándo: mejor día y hora por % de respuesta, con muestra mínima.
  const dia = mejor((ritmo?.por_dia ?? []).filter((d) => d.toques >= MIN_TOQUES), (d) => tasa(d.respuestas, d.toques), (d) => d.toques)
  const hora = mejor((ritmo?.por_hora ?? []).filter((h) => h.toques >= MIN_TOQUES), (h) => tasa(h.respuestas, h.toques), (h) => h.toques)
  const diaBase = mejor(ritmo?.por_dia ?? [], (d) => d.toques)

  // Cuánto insistir: en qué toque se alcanza el 80 % de las primeras respuestas.
  const pt = ritmo?.por_toque ?? []
  const totalResp = pt.reduce((s, t) => s + t.leads, 0)
  let acum = 0
  let toque80: number | undefined
  for (const t of pt) { acum += t.leads; if (toque80 === undefined && acum / Math.max(1, totalResp) >= 0.8) toque80 = t.toque }
  const enPrimero = pt.find((t) => t.toque === 1)?.leads ?? 0

  const tr = ritmo?.tiempo_respuesta ?? []
  const nTr = tr.reduce((s, x) => s + x.n, 0)
  const mediaTr = nTr ? Math.round((tr.reduce((s, x) => s + x.dias * x.n, 0) / nTr) * 10) / 10 : undefined
  const rapido = mejor(tr.filter((x) => x.n >= 3), (x) => -x.dias)

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
        <Lightbulb className="h-4 w-4 text-amber-500" /> Conclusiones del periodo <Explica t="base" />
      </h2>
      <p className="-mt-2 text-[11px] text-muted">
        «Base» es donde más esfuerzo pones; «más interés» y «más contratos», lo que mejor rinde. Si no coinciden, ahí hay una decisión que tomar. Toca cualquier respuesta para ver los leads.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta icon={<Radio className="h-3.5 w-3.5" />} titulo="Canal" t="abrio_conversacion" lineas={lineasCanal(embudo?.por_canal ?? [])} />
        <Tarjeta icon={<Tags className="h-3.5 w-3.5" />} titulo="Nicho" lineas={lineasReparto(porNicho, 'nicho')} />
        <Tarjeta icon={<Globe2 className="h-3.5 w-3.5" />} titulo="Ciudad" lineas={lineasReparto(porCiudad, 'ciudad')} />
        <Tarjeta icon={<Compass className="h-3.5 w-3.5" />} titulo="Origen" t="origen" lineas={lineasReparto(origenes, 'origen', (f) => f.clave === 'sin_dato')} />
        <Tarjeta icon={<Languages className="h-3.5 w-3.5" />} titulo="Idioma" lineas={lineasReparto(porIdioma, 'idioma', (f) => f.clave === 'sin')} />
        <Tarjeta
          icon={<CalendarClock className="h-3.5 w-3.5" />} titulo="Cuándo contactar" t="hora_toque"
          lineas={[
            { etiqueta: 'Día que más trabajas', valor: diaBase?.toques ? DIAS[diaBase.dia] : undefined, detalle: diaBase?.toques ? `${diaBase.toques} toques` : undefined, q: diaBase && { k: 'toques', dia: diaBase.dia } },
            { etiqueta: 'Día que más responden', valor: dia ? DIAS[dia.dia] : undefined, detalle: dia ? `${tasa(dia.respuestas, dia.toques)}%` : undefined, destacado: true, q: dia && { k: 'toques', dia: dia.dia, conRespuesta: true } },
            { etiqueta: 'Hora que más responden', valor: hora ? `${hora.hora}:00 – ${hora.hora + 1}:00` : undefined, detalle: hora ? `${tasa(hora.respuestas, hora.toques)}%` : undefined, destacado: true, q: hora && { k: 'toques', hora: hora.hora, conRespuesta: true } },
          ]}
        />
        <Tarjeta
          icon={<Repeat className="h-3.5 w-3.5" />} titulo="Cuánto insistir" t="primera_respuesta_toque"
          lineas={[
            { etiqueta: 'Responden al primer toque', valor: totalResp >= MIN_CONTACTADOS ? `${tasa(enPrimero, totalResp)}%` : undefined, detalle: totalResp >= MIN_CONTACTADOS ? `de ${totalResp} respuestas` : undefined, q: { k: 'primera_respuesta', toque: 1 } },
            { etiqueta: 'El 80 % responde antes del', valor: totalResp >= MIN_CONTACTADOS && toque80 ? `toque ${toque80}${toque80 === 6 ? ' o más' : ''}` : undefined, destacado: true, q: toque80 ? { k: 'primera_respuesta', toque: toque80 } : undefined },
          ]}
        />
        <Tarjeta
          icon={<Timer className="h-3.5 w-3.5" />} titulo="Tiempo de respuesta" t="tiempo_respuesta"
          lineas={[
            { etiqueta: 'Tardan en contestar', valor: mediaTr !== undefined && nTr >= 3 ? `${mediaTr} días` : undefined, detalle: nTr >= 3 ? `media de ${nTr}` : undefined, q: { k: 'respuestas' } },
            { etiqueta: 'Canal más rápido', valor: rapido ? canalNombre(rapido.canal) : undefined, detalle: rapido ? `${rapido.dias} días` : undefined, destacado: true, q: rapido && { k: 'tiempo', canal: rapido.canal } },
          ]}
        />
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ Ritmo */

function Barras({ filas }: { filas: { etiqueta: string; toques: number; respuestas: number; q?: Consulta; qResp?: Consulta }[] }) {
  const maxT = Math.max(1, ...filas.map((f) => f.toques))
  return (
    <ul className="space-y-1.5">
      {filas.map((f) => {
        const t = tasa(f.respuestas, f.toques)
        return (
          <li key={f.etiqueta} className="grid grid-cols-[2.5rem_1fr_5rem] items-center gap-2 text-xs">
            <span className="tabular-nums text-muted">{f.etiqueta}</span>
            <Abrible q={f.toques ? f.q : undefined} title={`${f.toques} toques · ${f.respuestas} respuestas`} className="!no-underline block">
              <div className="relative h-4 overflow-hidden rounded bg-surface-2">
                <div className="absolute inset-y-0 left-0 rounded bg-primary-400/25" style={{ width: `${(f.toques / maxT) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded bg-primary-400" style={{ width: `${(f.respuestas / maxT) * 100}%` }} />
              </div>
            </Abrible>
            <span className="text-right tabular-nums text-fg">
              <Abrible q={f.respuestas ? f.qResp : undefined}>{f.toques ? `${t}%` : '—'}</Abrible>{' '}
              <Abrible q={f.toques ? f.q : undefined} className="text-muted">({f.toques})</Abrible>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

export function Ritmo({ ritmo }: { ritmo: MetricasRitmo }) {
  const dias = Array.from({ length: 7 }, (_, i) => {
    const d = ritmo.por_dia.find((x) => x.dia === i + 1)
    return {
      etiqueta: DIAS_CORTO[i + 1], toques: d?.toques ?? 0, respuestas: d?.respuestas ?? 0,
      q: { k: 'toques', dia: i + 1 } as Consulta, qResp: { k: 'toques', dia: i + 1, conRespuesta: true } as Consulta,
    }
  })
  const horasConDatos = ritmo.por_hora.filter((h) => h.toques > 0)
  const hMin = Math.min(8, ...horasConDatos.map((h) => h.hora))
  const hMax = Math.max(19, ...horasConDatos.map((h) => h.hora))
  const horas = Array.from({ length: hMax - hMin + 1 }, (_, i) => {
    const h = ritmo.por_hora.find((x) => x.hora === hMin + i)
    return {
      etiqueta: `${hMin + i}h`, toques: h?.toques ?? 0, respuestas: h?.respuestas ?? 0,
      q: { k: 'toques', hora: hMin + i } as Consulta, qResp: { k: 'toques', hora: hMin + i, conRespuesta: true } as Consulta,
    }
  })
  const totalPt = ritmo.por_toque.reduce((s, t) => s + t.leads, 0)
  const maxPt = Math.max(1, ...ritmo.por_toque.map((t) => t.leads))

  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><Clock className="h-4 w-4 text-primary-400" /> Cuándo contactar y cuánto insistir <Explica t="hora_toque" /></h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted">
        Barra clara = toques enviados, barra fuerte = respondieron. El % es la tasa de respuesta; entre paréntesis, cuántos toques.
        La hora es la de cuando se marcó el toque como hecho.
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Por día de la semana</p>
          <Barras filas={dias} />
        </div>
        <div>
          <p className="mb-2 text-xs font-medium text-muted">Por hora</p>
          <div className="max-h-72 overflow-y-auto pr-1 scroll-aislado"><Barras filas={horas} /></div>
        </div>
        <div className="space-y-5">
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted">En qué toque llega la primera respuesta <Explica t="primera_respuesta_toque" /></p>
            {totalPt === 0 ? <p className="text-xs text-muted">Sin respuestas en el periodo.</p> : (
              <ul className="space-y-1.5">
                {ritmo.por_toque.map((t) => (
                  <li key={t.toque} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs">
                    <Abrible q={{ k: 'primera_respuesta', toque: t.toque }} className="text-muted">Toque {t.toque}{t.toque === 6 ? '+' : ''}</Abrible>
                    <div className="h-3 overflow-hidden rounded bg-surface-2">
                      <div className="h-full rounded bg-emerald-500" style={{ width: `${(t.leads / maxPt) * 100}%` }} />
                    </div>
                    <Abrible q={{ k: 'primera_respuesta', toque: t.toque }} className="text-right tabular-nums text-fg" title={`${t.leads} leads`}>{tasa(t.leads, totalPt)}%</Abrible>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted">Días hasta que contestan, por canal <Explica t="tiempo_respuesta" /></p>
            {ritmo.tiempo_respuesta.length === 0 ? <p className="text-xs text-muted">Sin datos de respuesta en el periodo.</p> : (
              <ul className="space-y-1 text-xs">
                {ritmo.tiempo_respuesta.map((x) => (
                  <li key={x.canal} className="flex justify-between gap-2">
                    <Abrible q={{ k: 'tiempo', canal: x.canal }} className="text-fg">{canalNombre(x.canal)}</Abrible>
                    <Abrible q={{ k: 'tiempo', canal: x.canal }} className="tabular-nums text-muted">{x.dias} días <span className="text-[10px]">({x.n})</span></Abrible>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
