/* ============================================================
   Tema compartido de gráficos — marca JD Developer
   Paleta categórica en orden fijo (validada colorblind-safe),
   tooltip de marca, defs de gradientes y props de ejes/grid.
   ============================================================ */
import type { ReactNode } from 'react'

/** Orden categórico fijo. NUNCA se cicla: la 6.ª ranura (gris) es el neutro "Otros". */
export const CHART_SERIES = ['#ff7448', '#6248ff', '#0082f3', '#16a34a', '#f59e0b', '#94a3b8'] as const

/** Coral de marca — serie principal / hero. */
export const BRAND_CORAL = '#ff7448'
export const BRAND_VIOLET = '#6248ff'

export const CHANNEL_COLORS: Record<string, string> = {
  email: '#0082f3',
  whatsapp: '#16a34a',
  instagram: '#e1306c',
  linkedin: '#0a66c2',
}

/** Props comunes de ejes (fuente de marca, ticks discretos, sin línea de eje dura). */
export const axisTick = { fontSize: 11, fontFamily: 'Relative, Inter, sans-serif', fill: 'rgb(var(--muted))' }
export const gridProps = {
  strokeDasharray: '2 6',
  stroke: 'rgb(var(--border))',
  strokeOpacity: 0.7,
} as const

/** Defs SVG de gradientes de marca. Montar una vez dentro de cada <*Chart>. */
export function ChartGradients() {
  return (
    <defs>
      <linearGradient id="gradCoral" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff7448" stopOpacity={0.9} />
        <stop offset="100%" stopColor="#ef6820" stopOpacity={0.85} />
      </linearGradient>
      <linearGradient id="gradCoralArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff7448" stopOpacity={0.28} />
        <stop offset="100%" stopColor="#ff7448" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="gradVioletArea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6248ff" stopOpacity={0.22} />
        <stop offset="100%" stopColor="#6248ff" stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="gradBarCoral" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#ff7448" stopOpacity={0.95} />
        <stop offset="100%" stopColor="#ffa17d" stopOpacity={0.9} />
      </linearGradient>
    </defs>
  )
}

type TooltipRow = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> }

/** Tooltip de marca: superficie oscura, texto claro, punto de color por serie. */
export function BrandTooltip({
  active,
  payload,
  label,
  valueFormatter,
  labelFormatter,
}: {
  active?: boolean
  payload?: TooltipRow[]
  label?: string | number
  valueFormatter?: (v: number | string, row: TooltipRow) => ReactNode
  labelFormatter?: (l: string | number) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="pointer-events-none rounded-xl border border-white/10 bg-[#1c1c20] px-3 py-2 text-xs shadow-[0_8px_28px_rgba(0,0,0,0.35)]">
      {label != null && (
        <p className="mb-1.5 font-semibold text-white/90">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: row.color || (row.payload?.fill as string) || BRAND_CORAL }}
            />
            <span className="text-white/60">{row.name}</span>
            <span className="ml-auto pl-3 font-semibold tabular-nums text-white">
              {valueFormatter && row.value != null ? valueFormatter(row.value, row) : row.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
