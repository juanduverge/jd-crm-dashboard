/* ============================================================
   Embudo de conversión — una sola secuencia, un solo tono.

   Antes cada etapa tenía su propio color: seis colores para seis
   pasos del MISMO camino. El color categórico dice «esto es otra
   cosa», y aquí no lo es — sugería seis series independientes
   donde hay una que se va estrechando. Ahora el tono es uno y lo
   que cambia es la intensidad, que es justo lo que hace el
   embudo. Y la barra fantasma detrás enseña lo que se pierde en
   cada paso, que es la pregunta real de un embudo: dónde se cae
   la gente.
   ============================================================ */
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type FunnelStage = { name: string; value: number; fill: string }

export function ConversionFunnel({ data }: { data: FunnelStage[] }) {
  const top = Math.max(data[0]?.value ?? 0, 1)

  return (
    <div className="flex h-full flex-col justify-center gap-3.5 py-2">
      {data.map((stage, i) => {
        const pctOfTop = (stage.value / top) * 100
        const prev = i > 0 ? data[i - 1].value : stage.value
        const stepPct = prev > 0 ? Math.round((stage.value / prev) * 100) : 0
        const perdidos = i > 0 ? prev - stage.value : 0
        // La última etapa es el cliente: se gana el acento de marca. El resto
        // baja en intensidad conforme se avanza.
        const esFinal = i === data.length - 1
        const alpha = 0.3 + (0.55 * i) / Math.max(data.length - 1, 1)

        return (
          <div key={stage.name}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.8125rem] font-medium text-fg">{stage.name}</span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-base font-bold text-fg">{stage.value}</span>
                {i > 0 && (
                  <span
                    className="text-[11px] font-semibold text-muted"
                    title={`${stepPct}% desde ${data[i - 1].name}${perdidos > 0 ? ` · ${perdidos} se quedan por el camino` : ''}`}
                  >
                    {stepPct}%
                  </span>
                )}
              </span>
            </div>
            <div className="relative h-6 w-full overflow-hidden rounded-md bg-surface-2">
              {/* Fantasma: hasta dónde llegaba la etapa anterior. Sin esto no
                  se ve la caída, que es lo único que un embudo tiene que
                  contar. */}
              {i > 0 && (
                <div
                  className="absolute inset-y-0 left-0 rounded-md border border-dashed border-border"
                  style={{ width: `${(prev / top) * 100}%` }}
                />
              )}
              <motion.div
                className={cn('relative h-full rounded-md', esFinal && 'shadow-sm')}
                style={{ background: esFinal ? 'rgb(var(--ok))' : `rgb(255 116 72 / ${alpha})` }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(pctOfTop, 1.5)}%` }}
                transition={{ duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
