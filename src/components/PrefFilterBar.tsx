import { Star, ThumbsUp, ThumbsDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

/**
 * Filtro por marcas personales (⭐ favorito / 👍 me gusta / 👎 no me gusta).
 *
 * En Leads esto eran pestañas, así que elegir «Me gusta» te sacaba de
 * «Contactado»: no había forma de ver los que te gustan DENTRO de una etapa.
 * Aquí son un filtro aparte que se SUMA a lo que ya tengas puesto (etapa,
 * nicho, toque…), y varios a la vez suman entre sí: ⭐ + 👍 enseña los que
 * sean una cosa u otra, no los que sean las dos.
 *
 * Vive en `components/` porque Leads y Pipeline miran los mismos leads y
 * deben responder igual a la misma marca.
 */
export type PrefKey = 'favoritos' | 'megusta' | 'descartados'

export const PREF_FILTERS: {
  key: PrefKey
  label: string
  icon: typeof Star
  on: (l: Lead) => boolean
  color: string
}[] = [
  { key: 'favoritos', label: 'Favoritos', icon: Star, on: (l) => !!l.favorito, color: 'border-amber-400 bg-amber-400/10 text-amber-500' },
  { key: 'megusta', label: 'Me gusta', icon: ThumbsUp, on: (l) => !!l.meGusta, color: 'border-emerald-400 bg-emerald-400/10 text-emerald-600 dark:text-emerald-400' },
  { key: 'descartados', label: 'No me gusta', icon: ThumbsDown, on: (l) => !!l.descartado, color: 'border-rose-400 bg-rose-400/10 text-rose-600 dark:text-rose-400' },
]

/** Sin marcas activas pasan todos; con varias, basta con cumplir una (OR). */
export function pasaPrefs(l: Lead, prefs: PrefKey[]): boolean {
  return prefs.length === 0 || PREF_FILTERS.some((f) => prefs.includes(f.key) && f.on(l))
}

type Props = {
  /** Leads sobre los que contar: lo demás ya filtrado, para que el número
   *  de cada marca sea el que verás al pulsarla. */
  leads: Lead[]
  value: PrefKey[]
  onChange: (v: PrefKey[]) => void
  className?: string
}

export function PrefFilterBar({ leads, value, onChange, className }: Props) {
  return (
    <div className={cn('-mx-3 flex gap-1.5 overflow-x-auto px-3 sin-barra scroll-aislado sm:-mx-1 sm:px-1', className)}>
      {PREF_FILTERS.map((f) => {
        const active = value.includes(f.key)
        const Icon = f.icon
        return (
          <button
            key={f.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? value.filter((k) => k !== f.key) : [...value, f.key])}
            className={cn(
              'inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
              active ? f.color : 'border-border text-muted hover:text-fg',
            )}
          >
            <Icon className={cn('h-3.5 w-3.5', active && 'fill-current')} />
            {f.label}
            <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/50 text-fg dark:bg-black/25' : 'bg-surface-2 text-muted')}>
              {leads.filter(f.on).length}
            </span>
          </button>
        )
      })}
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-full px-2 text-[11px] text-muted hover:text-fg"
        >
          <X className="h-3.5 w-3.5" /> Quitar marcas
        </button>
      )}
    </div>
  )
}
