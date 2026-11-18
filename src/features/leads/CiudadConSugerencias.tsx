import { useEffect, useRef, useState } from 'react'
import { MapPin, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui'
import { cn } from '@/lib/utils'

/**
 * Casilla de ciudad con sugerencias de lugares reales.
 *
 * Mientras se escribe, consulta Photon (buscador de OpenStreetMap, gratis y
 * sin clave) y enseña los sitios que coinciden: «Cartagena — Bolívar,
 * Colombia», «Cartagena — Murcia, España»… No rellena nada por su cuenta:
 * solo al hacer clic en una sugerencia se completan ciudad, estado y país.
 * Si no se elige ninguna, se busca con lo escrito, como siempre.
 */

export interface Lugar {
  ciudad: string
  region: string
  pais: string
}

interface Sugerencia extends Lugar {
  clave: string
  titulo: string
  detalle: string
}

interface PhotonProps {
  name?: string
  type?: string
  city?: string
  county?: string
  state?: string
  country?: string
}

/** Solo lugares: fuera calles, portales y comercios. */
const TIPOS_LUGAR = new Set(['city', 'district', 'locality', 'county', 'state', 'country'])

function aSugerencia(p: PhotonProps): Sugerencia | null {
  if (!p.name || !p.type || !TIPOS_LUGAR.has(p.type)) return null
  const pais = p.country ?? ''
  let lugar: Lugar
  if (p.type === 'country') lugar = { ciudad: '', region: '', pais: p.name }
  else if (p.type === 'state') lugar = { ciudad: '', region: p.name, pais }
  else lugar = { ciudad: p.name, region: p.state ?? p.county ?? '', pais }
  const detalle = [
    // Un barrio («Brooklyn») dice de qué ciudad es si no coincide con el estado.
    p.type === 'district' && p.city && p.city !== lugar.region ? p.city : '',
    lugar.region && lugar.ciudad ? lugar.region : '',
    lugar.pais && (lugar.ciudad || lugar.region) ? lugar.pais : '',
  ].filter(Boolean).join(', ')
  return {
    ...lugar,
    titulo: p.name,
    detalle,
    clave: `${p.name}|${detalle}`.toLowerCase(),
  }
}

async function buscarLugares(q: string, signal: AbortSignal): Promise<Sugerencia[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=12`
  const r = await fetch(url, { signal })
  if (!r.ok) return []
  const json = (await r.json()) as { features?: { properties?: PhotonProps }[] }
  const vistas = new Set<string>()
  const out: Sugerencia[] = []
  for (const f of json.features ?? []) {
    const s = f.properties ? aSugerencia(f.properties) : null
    if (!s || vistas.has(s.clave)) continue
    vistas.add(s.clave)
    out.push(s)
    if (out.length >= 6) break
  }
  return out
}

export function CiudadConSugerencias({
  valor, onChange, onElegir, contexto,
}: {
  valor: string
  onChange: (v: string) => void
  /** Al hacer clic en una sugerencia: rellena las tres casillas. */
  onElegir: (l: Lugar) => void
  /** Estado y país ya escritos: afinan la búsqueda («cartagena colombia»). */
  contexto: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  // Solo se busca cuando el usuario escribe, no cuando se carga una plantilla
  // o se elige una sugerencia (eso también cambia `valor`).
  const [escrito, setEscrito] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const q = [valor.trim(), contexto.trim()].filter(Boolean).join(' ')
    if (!escrito || valor.trim().length < 3) {
      setSugerencias([])
      setCargando(false)
      return
    }
    const ctrl = new AbortController()
    setCargando(true)
    const t = setTimeout(() => {
      buscarLugares(q, ctrl.signal)
        .then((s) => { setSugerencias(s); setCargando(false) })
        // Sin conexión o Photon caído: sin sugerencias, se escribe a mano.
        .catch(() => { if (!ctrl.signal.aborted) { setSugerencias([]); setCargando(false) } })
    }, 350)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [valor, contexto, escrito])

  const elegir = (s: Sugerencia) => {
    setEscrito(false)
    setAbierto(false)
    setSugerencias([])
    onElegir({ ciudad: s.ciudad, region: s.region, pais: s.pais })
  }

  const mostrar = abierto && escrito && valor.trim().length >= 3 && (cargando || sugerencias.length > 0)

  return (
    <div
      ref={contenedor}
      className="relative"
      onBlur={(e) => {
        if (!contenedor.current?.contains(e.relatedTarget as Node)) setAbierto(false)
      }}
    >
      <Input
        value={valor}
        onChange={(e) => { onChange(e.target.value); setEscrito(true); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => { if (e.key === 'Escape' && mostrar) { e.stopPropagation(); setAbierto(false) } }}
        placeholder="Ciudad o zona (ej. Brooklyn)"
        aria-label="Ciudad o zona"
        autoComplete="off"
      />

      {mostrar && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 min-w-[16rem] overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg p-1 shadow-lg">
          {cargando && sugerencias.length === 0 && (
            <p className="flex items-center gap-1.5 px-2 py-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando lugares…
            </p>
          )}
          {sugerencias.map((s) => (
            <button
              key={s.clave}
              type="button"
              onMouseDown={(e) => e.preventDefault()} // que no pierda el foco antes del clic
              onClick={() => elegir(s)}
              className={cn(
                'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                'hover:bg-primary-50 dark:hover:bg-primary-500/10',
              )}
            >
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block truncate">{s.titulo}</span>
                {s.detalle && <span className="block truncate text-[11px] text-muted">{s.detalle}</span>}
              </span>
            </button>
          ))}
          <p className="border-t border-border px-2 pt-1 text-[10px] text-muted">
            Toca uno para rellenar ciudad, estado y país. Si no está, escribe y busca igual.
          </p>
        </div>
      )}
    </div>
  )
}
