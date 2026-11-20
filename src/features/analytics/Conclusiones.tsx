import { Clock } from 'lucide-react'
import { TIPO_META } from '@/lib/followUps'
import { tasa } from '@/features/mapa/mapaDatos'
import type { MetricasRitmo } from '@/types'
import { Abrible, Explica } from './DetallePanel'
import type { Consulta } from './detalle'

/**
 * Bloque «Cuándo contactar y cuánto insistir» (pestaña Mensajes).
 * Las conclusiones en frases viven ahora en `Hallazgos.tsx`.
 */

const DIAS_CORTO = ['', 'L', 'M', 'X', 'J', 'V', 'S', 'D']

const canalNombre = (c: string) => TIPO_META[c as keyof typeof TIPO_META]?.label ?? c

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
            <Abrible q={f.toques ? f.q : undefined} title={`${f.toques} contactos · ${f.respuestas} respuestas`} className="!no-underline block">
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
        Barra clara = contactos que hiciste; barra fuerte = los que te respondieron. El % es cuántos respondieron y,
        entre paréntesis, cuántos contactos hubo. La hora es la de cuando registraste el contacto.
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
            <p className="mb-2 flex items-center gap-1 text-xs font-medium text-muted">Con qué mensaje responden (1.º, 2.º…) <Explica t="primera_respuesta_toque" /></p>
            {totalPt === 0 ? <p className="text-xs text-muted">Sin respuestas en el periodo.</p> : (
              <ul className="space-y-1.5">
                {ritmo.por_toque.map((t) => (
                  <li key={t.toque} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-2 text-xs">
                    <Abrible q={{ k: 'primera_respuesta', toque: t.toque }} className="text-muted">{t.toque}.º mensaje{t.toque === 6 ? ' o más' : ''}</Abrible>
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
