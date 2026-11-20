import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info, Lightbulb } from 'lucide-react'
import { TIPO_META } from '@/lib/followUps'
import { cn, formatMontos } from '@/lib/utils'
import { tasa, type FilaRanking } from '@/features/mapa/mapaDatos'
import type { MetricasEmbudo, MetricasPeriodo, MetricasRitmo } from '@/types'
import { Abrible } from './DetallePanel'
import type { Consulta } from './detalle'

/**
 * «Lo que dicen tus datos» — las conclusiones del periodo escritas como
 * frases, no como tarjetas de «base / más interés / más contratos» que Juan
 * no entendía (20-nov). Cada frase dice qué pasa y, si toca, qué hacer.
 *
 * Una frase solo sale si hay muestra suficiente: un 50 % sobre dos casos no
 * es una conclusión. Lo que aún no se puede decir va a «Faltan datos», con
 * cuánto falta, para que se sepa qué registrar.
 */

const MIN_TOQUES = 10
const MIN_CONTACTADOS = 5
const DIAS = ['', 'los lunes', 'los martes', 'los miércoles', 'los jueves', 'los viernes', 'los sábados', 'los domingos']

const canal = (c: string) => TIPO_META[c as keyof typeof TIPO_META]?.label ?? c

function mejor<T>(xs: T[], valor: (x: T) => number, desempate?: (x: T) => number): T | undefined {
  let m: T | undefined
  for (const x of xs) {
    if (!m || valor(x) > valor(m) || (valor(x) === valor(m) && desempate && desempate(x) > desempate(m))) m = x
  }
  return m
}

export interface Hallazgo { tono: 'ok' | 'aviso' | 'info'; texto: ReactNode; q?: Consulta }

const B = ({ children }: { children: ReactNode }) => <b className="font-semibold text-fg">{children}</b>

export function calcularHallazgos({ periodo, embudo, ritmo, porNicho, porCiudad, llamadas }: {
  periodo?: MetricasPeriodo
  embudo?: MetricasEmbudo
  ritmo?: MetricasRitmo
  porNicho: FilaRanking[]
  porCiudad: FilaRanking[]
  llamadas: { total: number; conEncuesta: number }
}): { hallazgos: Hallazgo[]; faltan: string[] } {
  const h: Hallazgo[] = []
  const faltan: string[] = []

  // 1. Cuántos leads se quedan sin tocar.
  if (periodo && periodo.leads_encontrados > 0) {
    const sin = periodo.leads_encontrados - periodo.leads_contactados
    const pct = tasa(periodo.leads_contactados, periodo.leads_encontrados)
    if (sin > 0 && pct < 60) {
      h.push({ tono: 'aviso', q: { k: 'cohorte', paso: 'leads' }, texto: <>Entraron <B>{periodo.leads_encontrados}</B> leads y contactaste a <B>{periodo.leads_contactados}</B> ({pct} %). Hay <B>{sin}</B> esperando su primer mensaje: antes de buscar más, conviene contactar a esos.</> })
    }
  }

  // 2. Respuesta general, en «de cada 100».
  if (periodo && periodo.contactos_realizados >= MIN_TOQUES) {
    const t = tasa(periodo.respuestas_recibidas, periodo.contactos_realizados)
    h.push({ tono: 'info', q: { k: 'respuestas' }, texto: <>De cada <B>100</B> contactos que haces, responden <B>{t}</B>. En total, <B>{periodo.respuestas_recibidas}</B> respuestas de {periodo.contactos_realizados} contactos.</> })
  }

  // 3. Canal: dónde trabajas vs. dónde responden y dónde se vende.
  const canales = embudo?.por_canal ?? []
  const base = mejor(canales, (f) => f.toques)
  const responde = mejor(canales.filter((f) => f.toques >= MIN_TOQUES), (f) => tasa(f.respuestas, f.toques), (f) => f.toques)
  const vende = mejor(canales.filter((f) => f.ganados > 0), (f) => f.ganados, (f) => f.valor)
  if (base?.toques && responde) {
    const mismo = base.canal === responde.canal
    h.push({
      tono: mismo ? 'ok' : 'aviso',
      q: { k: 'toques', canal: responde.canal, conRespuesta: true },
      texto: mismo
        ? <>Donde más trabajas, <B>{canal(base.canal)}</B>, es también donde más responden ({tasa(responde.respuestas, responde.toques)} %). Vas bien encaminado.</>
        : <>Usas sobre todo <B>{canal(base.canal)}</B> ({base.toques} contactos), pero responden más por <B>{canal(responde.canal)}</B>: {tasa(responde.respuestas, responde.toques)} % frente a {tasa(base.respuestas, base.toques)} %. Prueba a mover parte del esfuerzo.</>,
    })
  } else if (canales.length) {
    faltan.push(`Para comparar canales hace falta al menos ${MIN_TOQUES} contactos por canal.`)
  }
  if (vende) {
    h.push({ tono: 'ok', q: { k: 'abrieron', canal: vende.canal, paso: 'ganados' }, texto: <>Tus ventas empezaron por <B>{canal(vende.canal)}</B>: {vende.ganados} {vende.ganados === 1 ? 'venta' : 'ventas'}{vende.valor ? <> por <B>{formatMontos(vende.valor_mon, vende.valor)}</B></> : null}.</> })
  }

  // 4. Cuánto insistir.
  const pt = ritmo?.por_toque ?? []
  const totalResp = pt.reduce((s, t) => s + t.leads, 0)
  if (totalResp >= MIN_CONTACTADOS) {
    const primero = pt.find((t) => t.toque === 1)?.leads ?? 0
    let acum = 0
    let t80: number | undefined
    for (const t of pt) { acum += t.leads; if (t80 === undefined && acum / totalResp >= 0.8) t80 = t.toque }
    h.push({
      tono: 'info', q: { k: 'primera_respuesta', toque: 1 },
      texto: <><B>{tasa(primero, totalResp)} %</B> de los que te responden lo hacen al primer mensaje{t80 && t80 > 1 ? <>, y casi todos (80 %) antes del <B>{t80}.º</B></> : null}. {t80 && t80 <= 2 ? 'Insistir más de 2 o 3 veces rinde poco: mejor usar ese tiempo en leads nuevos.' : 'Merece la pena insistir varias veces.'}</>,
    })
  } else {
    faltan.push(`Para saber cuántas veces insistir hacen falta ${MIN_CONTACTADOS} respuestas (hay ${totalResp}).`)
  }

  // 5. Mejor día y hora.
  const dia = mejor((ritmo?.por_dia ?? []).filter((d) => d.toques >= MIN_TOQUES), (d) => tasa(d.respuestas, d.toques), (d) => d.toques)
  const hora = mejor((ritmo?.por_hora ?? []).filter((x) => x.toques >= MIN_TOQUES), (x) => tasa(x.respuestas, x.toques), (x) => x.toques)
  if (dia || hora) {
    h.push({
      tono: 'ok', q: dia ? { k: 'toques', dia: dia.dia, conRespuesta: true } : undefined,
      texto: <>Responden más {dia && <><B>{DIAS[dia.dia]}</B> ({tasa(dia.respuestas, dia.toques)} %)</>}{dia && hora && ' y '}{hora && <>entre las <B>{hora.hora}:00 y las {hora.hora + 1}:00</B></>}. Es buen momento para tus contactos.</>,
    })
  }

  // 6. Tiempo hasta que contestan.
  const tr = ritmo?.tiempo_respuesta ?? []
  const nTr = tr.reduce((s, x) => s + x.n, 0)
  if (nTr >= 3) {
    const media = Math.round((tr.reduce((s, x) => s + x.dias * x.n, 0) / nTr) * 10) / 10
    h.push({ tono: 'info', q: { k: 'respuestas' }, texto: <>Cuando contestan, tardan de media <B>{media} días</B>. Si en ese tiempo no hay nada, toca el siguiente seguimiento.</> })
  }

  // 7. Nicho y ciudad con más interés.
  const nicho = mejor(porNicho.filter((f) => f.contactados >= MIN_CONTACTADOS), (f) => tasa(f.respondieron, f.contactados), (f) => f.contactados)
  const nichoBase = mejor(porNicho, (f) => f.leads)
  if (nicho) {
    const g = { por: 'nicho' as const, clave: nicho.clave, nombre: nicho.nombre }
    h.push({
      tono: 'ok', q: { k: 'cohorte', paso: 'respondieron', grupo: g },
      texto: nichoBase && nichoBase.clave !== nicho.clave
        ? <>El nicho que más responde es <B>{nicho.nombre}</B> ({tasa(nicho.respondieron, nicho.contactados)} %), aunque donde más leads tienes es <B>{nichoBase.nombre}</B>. Busca más leads de {nicho.nombre}.</>
        : <>El nicho que más responde es <B>{nicho.nombre}</B> ({tasa(nicho.respondieron, nicho.contactados)} % de {nicho.contactados} contactados).</>,
    })
  }
  const ciudad = mejor(porCiudad.filter((f) => f.contactados >= MIN_CONTACTADOS), (f) => tasa(f.respondieron, f.contactados), (f) => f.contactados)
  if (ciudad) {
    h.push({ tono: 'info', q: { k: 'cohorte', paso: 'respondieron', grupo: { por: 'ciudad', clave: ciudad.clave, nombre: ciudad.nombre } }, texto: <>La ciudad que mejor responde es <B>{ciudad.nombre}</B> ({tasa(ciudad.respondieron, ciudad.contactados)} % de {ciudad.contactados} contactados).</> })
  }

  // 8. Llamadas: lo que falta para poder concluir.
  if (llamadas.conEncuesta < 10) {
    faltan.push(`Llamadas: ${llamadas.total} en el periodo, ${llamadas.conEncuesta} con encuesta. Con 10 llamadas con encuesta podré decirte qué estrategia y qué tipo de cliente funcionan mejor.`)
  }

  return { hallazgos: h, faltan }
}

const TONO = {
  ok: { icon: CheckCircle2, cls: 'text-[rgb(var(--ok))]' },
  aviso: { icon: AlertCircle, cls: 'text-amber-500' },
  info: { icon: Info, cls: 'text-primary-500' },
}

export function Hallazgos({ hallazgos, faltan }: { hallazgos: Hallazgo[]; faltan: string[] }) {
  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><Lightbulb className="h-4 w-4 text-amber-500" />Lo que dicen tus datos</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted">Conclusiones del periodo elegido. Toca una frase para ver los leads que hay detrás.</p>
      {!hallazgos.length ? (
        <p className="text-sm text-muted">Todavía no hay datos suficientes en este periodo para sacar conclusiones.</p>
      ) : (
        <ul className="space-y-2.5">
          {hallazgos.map((x, i) => {
            const T = TONO[x.tono]
            return (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <T.icon className={cn('mt-0.5 h-4 w-4 shrink-0', T.cls)} />
                {x.q ? <Abrible q={x.q} className="!no-underline text-left">{x.texto}</Abrible> : <span>{x.texto}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {faltan.length > 0 && (
        <div className="mt-4 rounded-lg bg-surface-2 p-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Faltan datos</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted">
            {faltan.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
    </section>
  )
}
