import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'
import { PIPELINE_STAGES } from '@/lib/config'
import { FILTROS_TOQUE } from '@/lib/touches'
import { PREF_FILTERS } from '@/components/PrefFilterBar'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

/**
 * Filtros de Leads por categorías, con casillas.
 *
 * Antes eran pestañas y pills sueltas: sólo cabía una etapa a la vez y no se
 * podía preguntar «nuevos o contactados, con WhatsApp y sin web». Ahora cada
 * categoría es un desplegable con casillas:
 *   - dentro de una categoría, las casillas se SUMAN (OR): Nuevo + Contactado;
 *   - entre categorías se CRUZAN (AND): (Nuevo o Contactado) Y con WhatsApp.
 * El número de cada casilla es cuántos leads verías al marcarla, contando ya
 * con lo que tengas puesto en las otras categorías.
 */

const tieneTel = (l: Lead) => !!(l.telefono?.trim() || l.telefono2?.trim() || l.telefonos?.length)
const tieneEmail = (l: Lead) => !!(l.email?.trim() || l.emails?.length)
const tieneWeb = (l: Lead) => !!l.web?.trim()
const REDES = ['instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'twitter', 'pinterest'] as const
const tieneRedes = (l: Lead) => REDES.some((r) => !!l[r]?.trim())

type Opcion = { key: string; label: string; test: (l: Lead, hoy: string) => boolean }
export type Categoria = { key: string; label: string; opciones: Opcion[] }

const toques = (grupo: string) =>
  FILTROS_TOQUE.filter((f) => f.grupo === grupo).map((f) => ({ key: f.key, label: f.label, test: f.test }))

export function crearCategorias(nichos: { id: string; nombre: string; emoji?: string }[]): Categoria[] {
  return [
    {
      key: 'estado', label: 'Estado',
      opciones: PIPELINE_STAGES.map((s) => ({ key: s.id, label: s.label, test: (l: Lead) => l.estado === s.id })),
    },
    {
      key: 'canales', label: 'Canales',
      opciones: [
        { key: 'whatsapp', label: 'Tiene WhatsApp', test: (l) => !!l.whatsapp?.trim() },
        { key: 'telefono', label: 'Tiene teléfono', test: tieneTel },
        { key: 'email', label: 'Tiene email', test: tieneEmail },
        { key: 'web', label: 'Tiene página web', test: tieneWeb },
        { key: 'sin_web', label: 'Sin página web', test: (l) => !tieneWeb(l) },
        { key: 'redes', label: 'Tiene redes sociales', test: tieneRedes },
        { key: 'instagram', label: 'Instagram', test: (l) => !!l.instagram?.trim() },
        { key: 'facebook', label: 'Facebook', test: (l) => !!l.facebook?.trim() },
        { key: 'linkedin', label: 'LinkedIn', test: (l) => !!l.linkedin?.trim() },
        { key: 'tiktok', label: 'TikTok', test: (l) => !!l.tiktok?.trim() },
        { key: 'solo_tel', label: 'Solo teléfono', test: (l) => tieneTel(l) && !tieneEmail(l) && !tieneWeb(l) && !tieneRedes(l) && !l.whatsapp?.trim() },
        { key: 'sin_contacto', label: 'Sin ningún dato de contacto', test: (l) => !tieneTel(l) && !tieneEmail(l) && !l.whatsapp?.trim() && !tieneRedes(l) },
      ],
    },
    { key: 'toque', label: 'Contacto', opciones: toques('toque') },
    { key: 'seguimiento', label: 'Seguimiento', opciones: toques('situacion') },
    { key: 'resultado', label: 'Resultado', opciones: toques('resultado') },
    {
      key: 'marcas', label: 'Marcas',
      opciones: PREF_FILTERS.map((p) => ({ key: p.key, label: p.label, test: p.on })),
    },
    {
      key: 'mas', label: 'Más',
      opciones: [
        { key: 'prioridad', label: 'Alta prioridad', test: (l) => l.prioridad === 'alta' },
        { key: 'conIA', label: 'Con puntuación IA', test: (l) => l.scoreIA !== undefined },
        { key: 'sinIA', label: 'Sin puntuación IA', test: (l) => l.scoreIA === undefined },
        // Sin responsable de verdad: vacío (0028 unificó los responsables).
        { key: 'sinResponsable', label: 'Sin responsable', test: (l) => !l.responsable?.trim() },
      ],
    },
    {
      key: 'nicho', label: 'Nicho',
      opciones: nichos.map((n) => ({ key: n.id, label: `${n.emoji ?? ''} ${n.nombre}`.trim(), test: (l: Lead) => l.nicho === n.id })),
    },
  ]
}

export type FiltrosSel = Record<string, string[]>

/** Pasa si cumple todas las categorías con algo marcado (OR dentro, AND entre). */
export function pasaFiltros(l: Lead, cats: Categoria[], sel: FiltrosSel, hoy: string, saltar?: string): boolean {
  for (const c of cats) {
    if (c.key === saltar) continue
    const marcadas = sel[c.key]
    if (!marcadas?.length) continue
    if (!c.opciones.some((o) => marcadas.includes(o.key) && o.test(l, hoy))) return false
  }
  return true
}

type Props = {
  leads: Lead[]
  categorias: Categoria[]
  value: FiltrosSel
  onChange: (v: FiltrosSel) => void
  hoy: string
  scoreMin: number
  onScoreMin: (n: number) => void
}

export function LeadFiltros({ leads, categorias, value, onChange, hoy, scoreMin, onScoreMin }: Props) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierta) return
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierta(null) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierta(null) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierta])

  // Conteo facetado sólo de la categoría abierta: es la única que se ve.
  const conteos = useMemo(() => {
    const c = categorias.find((x) => x.key === abierta)
    if (!c) return {} as Record<string, number>
    const pool = leads.filter((l) => pasaFiltros(l, categorias, value, hoy, c.key))
    return Object.fromEntries(c.opciones.map((o) => [o.key, pool.filter((l) => o.test(l, hoy)).length]))
  }, [abierta, leads, categorias, value, hoy])

  const toggle = (cat: string, opt: string) => {
    const cur = value[cat] ?? []
    const next = cur.includes(opt) ? cur.filter((k) => k !== opt) : [...cur, opt]
    onChange({ ...value, [cat]: next })
  }

  const activos = categorias.flatMap((c) =>
    (value[c.key] ?? []).map((k) => ({ cat: c.key, key: k, label: c.opciones.find((o) => o.key === k)?.label ?? k })),
  )
  const hayAlgo = activos.length > 0 || scoreMin > 0

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {categorias.filter((c) => c.opciones.length > 0).map((c) => {
          const n = value[c.key]?.length ?? 0
          const open = abierta === c.key
          return (
            <div key={c.key} className="relative">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setAbierta(open ? null : c.key)}
                className={cn(
                  'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  n > 0 ? 'border-primary-400 bg-primary-400/10 text-primary-600 dark:text-primary-300' : 'border-border text-muted hover:text-fg',
                )}
              >
                {c.label}
                {n > 0 && <span className="rounded-full bg-primary-400 px-1.5 text-[10px] text-white tabular-nums">{n}</span>}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
              </button>
              {open && (
                <div className="absolute left-0 z-30 mt-1 max-h-80 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
                  {c.opciones.map((o) => {
                    const on = value[c.key]?.includes(o.key) ?? false
                    const cnt = conteos[o.key] ?? 0
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => toggle(c.key, o.key)}
                        className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2', !on && cnt === 0 && 'opacity-50')}
                      >
                        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary-400 bg-primary-400 text-white' : 'border-border')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1">{o.label}</span>
                        <span className="text-xs tabular-nums text-muted">{cnt}</span>
                      </button>
                    )
                  })}
                  {c.key === 'mas' && (
                    <label className="block border-t border-border px-2 py-2 text-xs text-muted">
                      Score mínimo: {scoreMin}
                      <input type="range" min={0} max={100} value={scoreMin} onChange={(e) => onScoreMin(+e.target.value)} className="mt-1 block w-full accent-primary-400" />
                    </label>
                  )}
                  {(value[c.key]?.length ?? 0) > 0 && (
                    <button type="button" onClick={() => onChange({ ...value, [c.key]: [] })} className="mt-1 w-full rounded-lg border-t border-border px-2 py-2 text-left text-xs text-muted hover:text-fg">
                      Quitar {c.label.toLowerCase()}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {hayAlgo && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activos.map((a) => (
            <button
              key={`${a.cat}:${a.key}`}
              type="button"
              onClick={() => toggle(a.cat, a.key)}
              className="inline-flex items-center gap-1 rounded-full bg-primary-400/10 px-2.5 py-1 text-[11px] font-medium text-primary-600 dark:text-primary-300"
            >
              {a.label} <X className="h-3 w-3" />
            </button>
          ))}
          {scoreMin > 0 && (
            <button type="button" onClick={() => onScoreMin(0)} className="inline-flex items-center gap-1 rounded-full bg-primary-400/10 px-2.5 py-1 text-[11px] font-medium text-primary-600 dark:text-primary-300">
              Score ≥ {scoreMin} <X className="h-3 w-3" />
            </button>
          )}
          <button type="button" onClick={() => { onChange({}); onScoreMin(0) }} className="px-2 text-[11px] text-muted hover:text-fg">
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  )
}
