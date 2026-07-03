import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Users, Activity, Send, MessageSquareReply,
  DollarSign, Trophy, Mail, Receipt, type LucideIcon,
} from 'lucide-react'
import { ResponsiveContainer, AreaChart, Area } from 'recharts'
import type { Kpi } from '@/types'
import { formatCurrency, formatNumber, formatPercent, cn } from '@/lib/utils'

/** Ícono por clave de KPI (cubre Resumen y Analíticas). */
const KPI_ICON: Record<string, LucideIcon> = {
  total: Users, leads: Users,
  activos: Activity,
  contactados: Send, msgs: Mail,
  resp: MessageSquareReply,
  pipeline: DollarSign,
  cerrados: Trophy, clientes: Trophy,
  ticket: Receipt,
}

export function KpiCard({ kpi, index }: { kpi: Kpi; index: number }) {
  const fmt = (v: number) =>
    kpi.format === 'currency' ? formatCurrency(v)
    : kpi.format === 'percent' ? formatPercent(v)
    : formatNumber(v)

  const up = (kpi.change ?? 0) >= 0
  const spark = (kpi.spark ?? []).map((v, i) => ({ i, v }))
  const Icon = KPI_ICON[kpi.key] ?? Activity
  const gid = `kpiSpark-${kpi.key}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group card relative overflow-hidden p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      {/* Acento coral lateral que aparece en hover */}
      <span className="absolute inset-y-0 left-0 w-1 origin-top scale-y-0 bg-primary-400 transition-transform duration-200 group-hover:scale-y-100" />

      <div className="flex items-start justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-100 text-primary-600 transition-colors group-hover:bg-primary-400 group-hover:text-white dark:bg-primary-500/15 dark:text-primary-300">
          <Icon className="h-[18px] w-[18px]" />
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

      <p className="mt-3 text-2xl font-bold tracking-tight text-fg">{fmt(kpi.value)}</p>
      <p className="mt-0.5 text-xs font-medium text-muted">{kpi.label}</p>

      {spark.length > 1 && (
        <div className="mt-2 h-9">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={up ? '#16a34a' : '#ff4848'} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={up ? '#16a34a' : '#ff4848'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={up ? '#16a34a' : '#ff4848'}
                strokeWidth={2}
                fill={`url(#${gid})`}
                dot={false}
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
