/* ============================================================
   Embudo de conversión — barras horizontales decrecientes,
   simples y legibles. Prioriza claridad: label + número grandes,
   % de conversión respecto a la etapa anterior, buen espaciado.
   ============================================================ */
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type FunnelStage = { name: string; value: number; fill: string }

export function ConversionFunnel({ data }: { data: FunnelStage[] }) {
  const top = Math.max(data[0]?.value ?? 0, 1)

  return (
    <div className="flex h-full flex-col justify-center gap-4 py-2">
      {data.map((stage, i) => {
        // Ancho proporcional al total, con un mínimo visible para etapas pequeñas.
        const pctOfTop = Math.min(100, Math.max((stage.value / top) * 100, 6))
        const prev = i > 0 ? data[i - 1].value : stage.value
        const stepPct = prev > 0 ? Math.round((stage.value / prev) * 100) : 0
        const dropoff = i > 0 && stepPct < 100
        return (
          <div key={stage.name}>
            {/* Fila de etiqueta: nombre a la izquierda, número + % a la derecha */}
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-fg">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: stage.fill }} />
                {stage.name}
              </span>
              <span className="flex items-baseline gap-2 tabular-nums">
                <span className="text-base font-bold text-fg">{stage.value}</span>
                {i > 0 && (
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
                      dropoff
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300'
                        : 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400',
                    )}
                    title="Conversión desde la etapa anterior"
                  >
                    {stepPct}%
                  </span>
                )}
              </span>
            </div>
            {/* Barra */}
            <div className="h-7 w-full overflow-hidden rounded-lg bg-surface-2">
              <motion.div
                className="h-full rounded-lg"
                style={{ background: stage.fill }}
                initial={{ width: 0 }}
                animate={{ width: `${pctOfTop}%` }}
                transition={{ duration: 0.6, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
