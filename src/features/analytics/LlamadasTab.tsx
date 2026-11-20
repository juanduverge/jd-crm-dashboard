import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Clock, Lightbulb, Phone, PhoneIncoming, Smile, Sparkles, Target } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { useContactosHechos } from '@/hooks/useData'
import { ANIMO, ATENDIO, ESTRATEGIA, INTERES, OBJECION, TIPO_PROYECTO, type OpcionEncuesta } from '@/lib/encuestaLlamada'
import { cn } from '@/lib/utils'
import { DETALLE_LABEL } from '@/features/leads/acciones/HistorialLead'
import type { DetalleContacto, FollowUp, Lead } from '@/types'

/**
 * Pestaña «Llamadas» de Analíticas (20-nov).
 *
 * Las llamadas son conversación libre, sin plantilla, así que lo único que
 * permite aprender de ellas es lo que Juan apunta al colgar: el resultado
 * (0073) y la encuesta (0074). Aquí se cruza todo eso para responder:
 * ¿cuántas hago?, ¿cuántas contestan?, ¿qué estrategia y qué tipo de cliente
 * acaban en interés?, ¿a qué hora contestan?
 *
 * «Interesado» = detalle 'interesado' o 'pidio_info' (lo que mueve el lead a
 * «Respondió»). Las tablas de la encuesta solo cuentan llamadas con encuesta,
 * y una fila con menos de 3 llamadas se enseña pero no se corona.
 */

const TIPOS_LLAMADA = ['llamada', 'llamada_whatsapp', 'videollamada']
const MIN_FILA = 3

const esInteresado = (f: FollowUp) => f.detalle === 'interesado' || f.detalle === 'pidio_info'
const contesto = (f: FollowUp) => !!f.resultado && f.resultado !== 'sin_respuesta'
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

export function LlamadasTab({ desde, hasta, leads }: { desde: string; hasta: string; leads: Lead[] }) {
  const desdeIso = useMemo(() => new Date(`${desde}T00:00:00`).toISOString(), [desde])
  const hastaIso = useMemo(() => new Date(`${hasta}T23:59:59`).toISOString(), [hasta])
  const q = useContactosHechos(desdeIso, hastaIso)

  const llamadas = useMemo(() => (q.data ?? []).filter((f) => TIPOS_LLAMADA.includes(f.tipo)).sort((a, b) => (b.completadoEn ?? '').localeCompare(a.completadoEn ?? '')), [q.data])
  const nombre = useMemo(() => new Map(leads.map((l) => [l.id, l.empresa])), [leads])

  const r = useMemo(() => {
    const contestadas = llamadas.filter(contesto)
    const interesados = llamadas.filter(esInteresado)
    const seg = contestadas.reduce((s, f) => s + (f.duracionSeg ?? 0), 0)
    const conDuracion = contestadas.filter((f) => f.duracionSeg).length
    const conEncuesta = llamadas.filter((f) => f.encuesta)
    return {
      total: llamadas.length, contestadas: contestadas.length, interesados: interesados.length,
      minutos: Math.round(llamadas.reduce((s, f) => s + (f.duracionSeg ?? 0), 0) / 60),
      mediaMin: conDuracion ? Math.round((seg / conDuracion / 60) * 10) / 10 : 0,
      conEncuesta,
    }
  }, [llamadas])

  if (q.isLoading) return <Skeleton className="h-96" />

  if (!llamadas.length) {
    return (
      <div className="card flex flex-col items-center gap-2 p-10 text-center text-sm text-muted">
        <Phone className="h-6 w-6 text-muted/60" />
        <p>No hay llamadas registradas en este periodo.</p>
        <p className="text-xs">Llama desde la ficha del lead (botón «Llamar») y al terminar pulsa «Finalizar llamada»: todo lo que apuntes aparecerá aquí.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra icon={<Phone className="h-4 w-4" />} label="Llamadas hechas" valor={r.total} pie={`${r.conEncuesta.length} con encuesta`} />
        <Cifra icon={<PhoneIncoming className="h-4 w-4" />} label="Contestaron" valor={`${pct(r.contestadas, r.total)} %`} pie={`${r.contestadas} de ${r.total}`} />
        <Cifra icon={<Sparkles className="h-4 w-4" />} label="Interesados" valor={r.interesados} pie={r.contestadas ? `${pct(r.interesados, r.contestadas)} % de las que contestaron` : 'nadie contestó todavía'} acento />
        <Cifra icon={<Clock className="h-4 w-4" />} label="Minutos al teléfono" valor={r.minutos} pie={r.mediaMin ? `${r.mediaMin} min de media cuando contestan` : 'aún sin duración guardada'} />
      </div>

      <Conclusion llamadas={llamadas} conEncuesta={r.conEncuesta} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloque titulo="Qué pasó en tus llamadas" pregunta="Cómo terminó cada llamada, según lo que marcaste al colgar.">
          <ResultadoLlamadas llamadas={llamadas} />
        </Bloque>
        <Bloque titulo="A qué hora contestan" pregunta="Barra clara = llamadas hechas a esa hora; barra fuerte = las que contestaron.">
          <PorHora llamadas={llamadas} />
        </Bloque>
      </div>

      <div className="card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-fg"><Target className="h-4 w-4 text-primary-400" />Qué funciona en tus llamadas</h3>
        <p className="mb-3 mt-0.5 text-[11px] text-muted">
          Sale de la encuesta al colgar. «% interesados» = de esas llamadas, cuántas acabaron en «Interesado» o «Pidió información».
          {r.conEncuesta.length < 10 && <> Llevas <b className="text-fg">{r.conEncuesta.length}</b> con encuesta: a partir de 10 las comparaciones empiezan a ser fiables.</>}
        </p>
        {!r.conEncuesta.length ? (
          <p className="rounded-lg bg-surface-2 p-3 text-sm text-muted">Aún no hay llamadas con encuesta. Rellénala al colgar (tarda 10 segundos) y aquí verás qué estrategia y qué tipo de cliente te funcionan.</p>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            <Reparto titulo="Estrategia que usaste" lista={ESTRATEGIA} llamadas={r.conEncuesta} campo={(f) => f.encuesta?.estrategia} />
            <Reparto titulo="Tipo de proyecto" lista={TIPO_PROYECTO} llamadas={r.conEncuesta} campo={(f) => f.encuesta?.tipoProyecto} />
            <Reparto titulo="Quién atendió" lista={ATENDIO} llamadas={r.conEncuesta} campo={(f) => f.encuesta?.atendio} />
            <Reparto titulo="Objeción principal" lista={OBJECION} llamadas={r.conEncuesta} campo={(f) => f.encuesta?.objecion} />
          </div>
        )}
      </div>

      {r.conEncuesta.some((f) => f.encuesta?.animo || f.encuesta?.interes) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Bloque titulo="Cómo te sentiste" pregunta="Tu ánimo en cada llamada y cuántas acabaron en interés.">
            <Animo llamadas={r.conEncuesta} />
          </Bloque>
          <Bloque titulo="Interés del cliente" pregunta="Cómo viste al cliente al colgar.">
            <Interes llamadas={r.conEncuesta} />
          </Bloque>
        </div>
      )}

      <Bloque titulo="Últimas llamadas" pregunta="Toca una para abrir la ficha del lead.">
        <ul className="divide-y divide-border">
          {llamadas.slice(0, 10).map((f) => (
            <li key={f.id}>
              <Link to={`/pipeline?lead=${f.leadId}`} className="flex items-center gap-3 py-2 row-hover">
                <span className="w-20 shrink-0 text-xs tabular-nums text-muted">{f.completadoEn ? format(new Date(f.completadoEn), 'd MMM HH:mm', { locale: es }) : ''}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{nombre.get(f.leadId) ?? 'Lead'}</span>
                <span className={cn('shrink-0 text-xs', esInteresado(f) ? 'font-semibold text-[rgb(var(--ok))]' : 'text-muted')}>
                  {f.detalle ? DETALLE_LABEL[f.detalle] : contesto(f) ? 'Contestó' : 'Sin respuesta'}
                </span>
                {f.duracionSeg ? <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{Math.max(1, Math.round(f.duracionSeg / 60))} min</span> : <span className="w-12" />}
              </Link>
            </li>
          ))}
        </ul>
      </Bloque>
    </div>
  )
}

/* ------------------------------------------------------------------ piezas */

function Cifra({ icon, label, valor, pie, acento }: { icon: ReactNode; label: string; valor: ReactNode; pie?: string; acento?: boolean }) {
  return (
    <div className="card p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted">{icon}{label}</p>
      <p className={cn('mt-1 text-2xl font-bold tabular-nums text-fg', acento && 'text-emerald-600 dark:text-emerald-400')}>{valor}</p>
      {pie && <p className="mt-0.5 text-[11px] text-muted">{pie}</p>}
    </div>
  )
}

function Bloque({ titulo, pregunta, children }: { titulo: string; pregunta: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-fg">{titulo}</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted">{pregunta}</p>
      {children}
    </section>
  )
}

/** Una frase con lo más útil que ya se puede decir de las llamadas. */
function Conclusion({ llamadas, conEncuesta }: { llamadas: FollowUp[]; conEncuesta: FollowUp[] }) {
  const frases: ReactNode[] = []
  const contestadas = llamadas.filter(contesto)
  frases.push(<>De cada <b className="text-fg">10</b> llamadas, te contestan <b className="text-fg">{Math.round((contestadas.length / llamadas.length) * 10)}</b>.</>)
  const mejorDe = (lista: OpcionEncuesta[], campo: (f: FollowUp) => string | undefined) => {
    let top: { l: string; p: number; n: number } | undefined
    for (const o of lista) {
      const del = conEncuesta.filter((f) => campo(f) === o.v)
      if (del.length < MIN_FILA) continue
      const p = pct(del.filter(esInteresado).length, del.length)
      if (!top || p > top.p) top = { l: o.l, p, n: del.length }
    }
    return top
  }
  const est = mejorDe(ESTRATEGIA, (f) => f.encuesta?.estrategia)
  if (est) frases.push(<>La estrategia que más interés genera es <b className="text-fg">{est.l}</b> ({est.p} % de {est.n} llamadas).</>)
  const tipo = mejorDe(TIPO_PROYECTO, (f) => f.encuesta?.tipoProyecto)
  if (tipo) frases.push(<>Los clientes de <b className="text-fg">{tipo.l.toLowerCase()}</b> son los que más se interesan ({tipo.p} %).</>)
  const dueno = conEncuesta.filter((f) => f.encuesta?.atendio === 'dueno')
  const otros = conEncuesta.filter((f) => f.encuesta?.atendio && f.encuesta.atendio !== 'dueno')
  if (dueno.length >= MIN_FILA && otros.length >= MIN_FILA) {
    frases.push(<>Cuando atiende el dueño, se interesan el <b className="text-fg">{pct(dueno.filter(esInteresado).length, dueno.length)} %</b>; si atiende otra persona, el {pct(otros.filter(esInteresado).length, otros.length)} %.</>)
  }
  return (
    <div className="card flex gap-2.5 p-4 text-sm leading-relaxed text-muted">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
      <p>{frases.map((f, i) => <span key={i}>{f} </span>)}{frases.length === 1 && 'Con más llamadas con encuesta te diré qué estrategia y qué tipo de cliente funcionan mejor.'}</p>
    </div>
  )
}

const ORDEN_DETALLE: DetalleContacto[] = ['interesado', 'pidio_info', 'llamar_luego', 'no_interesa', 'no_contesto', 'buzon', 'ocupado', 'numero_equivocado']
const COLOR_DETALLE: Partial<Record<DetalleContacto, string>> = {
  interesado: 'bg-emerald-500', pidio_info: 'bg-emerald-400', llamar_luego: 'bg-primary-400', no_interesa: 'bg-red-400',
}

function ResultadoLlamadas({ llamadas }: { llamadas: FollowUp[] }) {
  const sinDetalle = llamadas.filter((f) => !f.detalle).length
  const filas = ORDEN_DETALLE.map((d) => ({ d, n: llamadas.filter((f) => f.detalle === d).length })).filter((x) => x.n)
  const max = Math.max(1, ...filas.map((x) => x.n), sinDetalle)
  return (
    <ul className="space-y-1.5">
      {filas.map((x) => (
        <li key={x.d} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
          <span className="truncate text-fg">{DETALLE_LABEL[x.d]}</span>
          <div className="h-3 overflow-hidden rounded bg-surface-2"><div className={cn('h-full rounded', COLOR_DETALLE[x.d] ?? 'bg-slate-400')} style={{ width: `${(x.n / max) * 100}%` }} /></div>
          <span className="text-right tabular-nums text-muted">{x.n}</span>
        </li>
      ))}
      {sinDetalle > 0 && (
        <li className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 text-xs">
          <span className="truncate text-muted">Sin detalle (antiguas)</span>
          <div className="h-3 overflow-hidden rounded bg-surface-2"><div className="h-full rounded bg-slate-300" style={{ width: `${(sinDetalle / max) * 100}%` }} /></div>
          <span className="text-right tabular-nums text-muted">{sinDetalle}</span>
        </li>
      )}
    </ul>
  )
}

function PorHora({ llamadas }: { llamadas: FollowUp[] }) {
  const porHora = new Map<number, { t: number; c: number }>()
  for (const f of llamadas) {
    if (!f.completadoEn) continue
    const h = new Date(f.completadoEn).getHours()
    const x = porHora.get(h) ?? { t: 0, c: 0 }
    x.t++; if (contesto(f)) x.c++
    porHora.set(h, x)
  }
  const horas = [...porHora.keys()]
  const desde = Math.min(9, ...horas)
  const hasta = Math.max(18, ...horas)
  const max = Math.max(1, ...[...porHora.values()].map((x) => x.t))
  return (
    <ul className="space-y-1">
      {Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i).map((h) => {
        const x = porHora.get(h) ?? { t: 0, c: 0 }
        return (
          <li key={h} className="grid grid-cols-[2.5rem_1fr_4.5rem] items-center gap-2 text-xs">
            <span className="tabular-nums text-muted">{h}h</span>
            <div className="relative h-3 overflow-hidden rounded bg-surface-2">
              <div className="absolute inset-y-0 left-0 rounded bg-primary-400/25" style={{ width: `${(x.t / max) * 100}%` }} />
              <div className="absolute inset-y-0 left-0 rounded bg-primary-500" style={{ width: `${(x.c / max) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums text-muted">{x.t ? `${x.c} de ${x.t}` : '—'}</span>
          </li>
        )
      })}
    </ul>
  )
}

function Reparto({ titulo, lista, llamadas, campo }: {
  titulo: string; lista: OpcionEncuesta[]; llamadas: FollowUp[]; campo: (f: FollowUp) => string | undefined
}) {
  const filas = lista
    .map((o) => {
      const del = llamadas.filter((f) => campo(f) === o.v)
      const seg = del.reduce((s, f) => s + (f.duracionSeg ?? 0), 0)
      return { o, n: del.length, int: del.filter(esInteresado).length, min: del.length ? Math.round(seg / del.length / 60) : 0 }
    })
    .filter((x) => x.n)
    .sort((a, b) => pct(b.int, b.n) - pct(a.int, a.n) || b.n - a.n)
  const top = filas.find((x) => x.n >= MIN_FILA)
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-fg">{titulo}</p>
      {!filas.length ? <p className="text-xs text-muted">Sin respuestas todavía.</p> : (
        <table className="w-full text-xs">
          <thead className="text-[10px] uppercase tracking-wide text-muted">
            <tr><th className="pb-1 text-left font-medium"></th><th className="pb-1 text-right font-medium">Llamadas</th><th className="pb-1 text-right font-medium">% interesados</th><th className="pb-1 text-right font-medium">Min</th></tr>
          </thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.o.v} className="border-t border-border">
                <td className={cn('py-1.5 pr-2', top?.o.v === x.o.v ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-fg')}>{x.o.l}{top?.o.v === x.o.v && ' ★'}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{x.n}</td>
                <td className="py-1.5 text-right tabular-nums text-fg">{pct(x.int, x.n)} %</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{x.min || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Animo({ llamadas }: { llamadas: FollowUp[] }) {
  return (
    <ul className="space-y-1.5">
      {ANIMO.map((a) => {
        const del = llamadas.filter((f) => f.encuesta?.animo === a.v)
        return (
          <li key={a.v} className="flex items-center gap-2 text-xs">
            <span className="w-6 text-base">{a.emoji}</span>
            <span className="w-16 text-fg">{a.l}</span>
            <span className="flex-1 tabular-nums text-muted">{del.length ? `${del.length} llamadas · ${pct(del.filter(esInteresado).length, del.length)} % interesados` : '—'}</span>
          </li>
        )
      })}
      <li className="pt-1 text-[11px] text-muted"><Smile className="mr-1 inline h-3 w-3" />Si los días buenos conviertes más, merece la pena llamar cuando estás con energía.</li>
    </ul>
  )
}

function Interes({ llamadas }: { llamadas: FollowUp[] }) {
  const total = llamadas.filter((f) => f.encuesta?.interes).length
  return (
    <ul className="space-y-2">
      {INTERES.map((i) => {
        const n = llamadas.filter((f) => f.encuesta?.interes === i.v).length
        return (
          <li key={i.v} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-2 text-xs">
            <span className="text-fg">{i.l}</span>
            <div className="h-3 overflow-hidden rounded bg-surface-2">
              <div className={cn('h-full rounded', i.v === 'caliente' ? 'bg-emerald-500' : i.v === 'tibio' ? 'bg-amber-400' : 'bg-sky-400')} style={{ width: `${pct(n, total)}%` }} />
            </div>
            <span className="text-right tabular-nums text-muted">{n}</span>
          </li>
        )
      })}
      <li className="text-[11px] text-muted">Los «🔥 Calientes» deberían tener ya una reunión o un próximo contacto cercano.</li>
    </ul>
  )
}
