import type { ReactNode } from 'react'
import { AlertTriangle, Compass, FileSignature, Radio } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { useMetricasEmbudo } from '@/hooks/useData'
import { TIPO_META } from '@/lib/followUps'
import { origenLabel, ORIGEN_META } from '@/lib/origen'
import { cn, formatCurrency } from '@/lib/utils'
import type { EmbudoCanal, EmbudoOrigen, LeadOrigen, MetricasEmbudo } from '@/types'

/**
 * Qué está funcionando: canal de contacto, origen del cliente y contratos.
 * Todo sale del RPC `metricas_embudo` (migración 0065).
 *
 * El canal se lee de dos formas y las dos se enseñan:
 *   - «Respondieron» es sobre los toques de ESE canal en el periodo.
 *   - Reuniones, ventas y dinero se atribuyen al canal que consiguió la
 *     PRIMERA respuesta del lead: el que abrió la conversación.
 */
export function PanelEmbudo({ desde, hasta }: { desde: string; hasta: string }) {
  const { data, isLoading, isError } = useMetricasEmbudo(desde, hasta)

  if (isError) {
    return (
      <div className="card flex items-center gap-2 text-sm text-muted">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
        No se pudo cargar el embudo por canal y origen. Falta aplicar la migración 0065 en Supabase.
      </div>
    )
  }
  if (isLoading || !data) return <Skeleton className="h-64 w-full" />

  return (
    <div className="space-y-4">
      <PorCanal filas={data.por_canal} />
      <div className="grid gap-4 lg:grid-cols-2">
        <PorOrigen filas={data.por_origen} />
        <Contratos m={data} />
      </div>
    </div>
  )
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

function Seccion({ icon, titulo, sub, children }: { icon: ReactNode; titulo: string; sub: string; children: ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-fg">{icon} {titulo}</h3>
      <p className="mb-3 mt-0.5 text-[11px] text-muted">{sub}</p>
      {children}
    </section>
  )
}

/** Una cifra con su porcentaje debajo. */
function Cifra({ label, n, de, dinero }: { label: string; n: number; de?: number; dinero?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="truncate text-base font-semibold tabular-nums text-fg">{dinero ? formatCurrency(n) : n}</p>
      {de !== undefined && <p className="text-[10px] tabular-nums text-muted">{pct(n, de)}%</p>}
    </div>
  )
}

/* ---------------------------------------------------------------- Canal */

function PorCanal({ filas }: { filas: EmbudoCanal[] }) {
  // El mejor canal por tasa de respuesta, solo entre los que tienen muestra
  // suficiente: un 100 % sobre un envío no es un ganador.
  const conMuestra = filas.filter((f) => f.toques >= 10)
  const mejor = conMuestra.length > 1
    ? conMuestra.reduce((a, b) => (pct(b.respuestas, b.toques) > pct(a.respuestas, a.toques) ? b : a))
    : undefined

  return (
    <Seccion
      icon={<Radio className="h-4 w-4 text-primary-400" />}
      titulo="Canal de contacto: qué convierte"
      sub="Respuestas sobre los toques de cada canal. Reuniones, ventas y dinero van al canal que consiguió la primera respuesta del lead."
    >
      {filas.length === 0 ? (
        <p className="text-sm text-muted">Sin toques registrados en este periodo.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((f) => {
            const meta = TIPO_META[f.canal]
            const tasa = pct(f.respuestas, f.toques)
            return (
              <li key={f.canal} className="py-3 first:pt-0 last:pb-0">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                    <span aria-hidden>{meta?.emoji ?? '•'}</span> {meta?.label ?? f.canal}
                    {mejor?.canal === f.canal && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Mejor respuesta
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-muted">{tasa}% responde</span>
                </div>
                <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-primary-400" style={{ width: `${Math.min(100, tasa)}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <Cifra label="Toques" n={f.toques} />
                  <Cifra label="Respondieron" n={f.respuestas} de={f.toques} />
                  <Cifra label="Abrió conversación" n={f.abrieron} />
                  <Cifra label="Reuniones" n={f.reuniones} de={f.abrieron || undefined} />
                  <Cifra label="Ventas" n={f.ganados} de={f.abrieron || undefined} />
                  <Cifra label="Dinero" n={f.valor} dinero />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Seccion>
  )
}

/* --------------------------------------------------------------- Origen */

function PorOrigen({ filas }: { filas: EmbudoOrigen[] }) {
  return (
    <Seccion
      icon={<Compass className="h-4 w-4 text-primary-400" />}
      titulo="Origen del cliente"
      sub="Leads que entraron en el periodo según por dónde llegaron, y hasta dónde avanzaron."
    >
      {filas.length === 0 ? (
        <p className="text-sm text-muted">No entraron leads en este periodo.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((f) => (
            <li key={f.origen} className="py-3 first:pt-0 last:pb-0">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-fg">
                <span aria-hidden>{f.origen !== 'sin_dato' ? ORIGEN_META[f.origen as LeadOrigen]?.emoji : '·'}</span>
                {origenLabel(f.origen)}
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                <Cifra label="Leads" n={f.leads} />
                <Cifra label="Contactados" n={f.contactados} de={f.leads} />
                <Cifra label="Respondieron" n={f.respondieron} de={f.contactados || undefined} />
                <Cifra label="Ventas" n={f.ganados} de={f.leads} />
                <Cifra label="Dinero" n={f.valor} dinero />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Seccion>
  )
}

/* ------------------------------------------------------------ Contratos */

function Contratos({ m }: { m: MetricasEmbudo }) {
  const c = m.contratos
  const maxMotivo = Math.max(1, ...c.motivos_perdida.map((x) => x.n))
  return (
    <Seccion
      icon={<FileSignature className="h-4 w-4 text-primary-400" />}
      titulo="Contratos"
      sub="Cerrados en el periodo. El precio es el del proyecto; si no tiene, el valor estimado del lead."
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Cifra label="Ganados" n={c.ganados} />
        <Cifra label="Vendido" n={c.valor_total} dinero />
        <Cifra label="Ticket medio" n={c.ticket_medio} dinero />
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">Ciclo de venta</p>
          <p className="text-base font-semibold tabular-nums text-fg">{c.dias_ciclo} días</p>
          <p className="text-[10px] text-muted">primer contacto → cierre</p>
        </div>
        <Cifra label="Cobrado" n={c.cobrado} dinero />
        <Cifra label="Por cobrar" n={c.pendiente} dinero />
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 text-xs font-medium text-muted">
          Por qué se perdieron <span className="tabular-nums">({c.perdidos})</span>
        </p>
        {c.motivos_perdida.length === 0 ? (
          <p className="text-xs text-muted">Ninguno perdido en el periodo.</p>
        ) : (
          <ul className="space-y-1.5">
            {c.motivos_perdida.map((x) => (
              <li key={x.motivo} className="text-xs">
                <div className="mb-0.5 flex justify-between gap-2">
                  <span className="truncate text-fg">{x.motivo}</span>
                  <span className="tabular-nums text-muted">{x.n}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className={cn('h-full rounded-full bg-rose-400')} style={{ width: `${(x.n / maxMotivo) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Seccion>
  )
}
