import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { ResponsiveContainer, LineChart, Line } from 'recharts'
import type { Kpi } from '@/types'
import { formatCurrency, formatNumber, formatPercent, cn } from '@/lib/utils'

export function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const fmt = (v: number) =>
    kpi.format === 'currency' ? formatCurrency(v)
    : kpi.format === 'percent' ? formatPercent(v)
    : formatNumber(v)

  const up = (kpi.change ?? 0) >= 0
  const spark = (kpi.spark ?? []).map((v, i) => ({ i, v }))

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card p-4"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted">{kpi.label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-fg">{fmt(kpi.value)}</p>
        </div>
        {kpi.change != null && (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
              up ? 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400'
                 : 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400',
            )}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(kpi.change)}%
          </span>
        )}
      </div>
      {spark.length > 1 && (
        <div className="mt-2 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={up ? '#16a34a' : '#ff4848'}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
