/* ============================================================
   Embudo de conversión de marca — barras decrecientes con
   % de conversión entre etapas. Más intuitivo para ventas que
   el FunnelChart genérico de Recharts.
   ============================================================ */
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type FunnelStage = { name: string; value: number; fill: string }

export function ConversionFunnel({ data }: { data: FunnelStage[] }) {
  const top = Math.max(data[0]?.value ?? 0, 1)

  return (
    <div className="flex h-full flex-col justify-center gap-2 py-1">
      {data.map((stage, i) => {
        const pctOfTop = Math.max((stage.value / top) * 100, 2)
        const prev = i > 0 ? data[i - 1].value : stage.value
        const stepPct = prev > 0 ? Math.round((stage.value / prev) * 100) : 0
        const dropoff = i > 0 && stepPct < 100
        return (
          <div key={stage.name} className="group">
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-2 text-xs font-medium text-fg">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: stage.fill }} />
                {stage.name}
              </span>
              <span className="flex items-baseline gap-1.5 tabular-nums">
                <span className="text-sm font-bold text-fg">{stage.value}</span>
                {i > 0 && (
                  <span
                    className={cn(
                      'rounded-md px-1.5 py-0.5 text-[10px] font-semibold',
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
            <div className="h-6 w-full overflow-hidden rounded-lg bg-surface-2">
              <motion.div
                className="h-full rounded-lg transition-[filter] duration-200 group-hover:brightness-110"
                style={{ background: stage.fill }}
                initial={{ width: 0 }}
                animate={{ width: `${pctOfTop}%` }}
                transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
