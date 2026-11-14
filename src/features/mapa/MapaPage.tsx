import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, LayersControl, MapContainer, Popup, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngBoundsExpression, Map as LeafletMap } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ExternalLink, Eye, Flame, Info, MapPin, Store, Target } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui'
import { useLeads, useNichos } from '@/hooks/useData'
import { useUiStore } from '@/store/uiStore'
import { PIPELINE_STAGES } from '@/lib/config'
import { today } from '@/lib/followUps'
import { cn, formatCurrency } from '@/lib/utils'
import { LeadFiltros, crearCategorias, pasaFiltros, type FiltrosSel } from '@/features/leads/LeadFiltros'
import { LeadDetailHost } from '@/features/leads/LeadDetailHost'
import { CapaCalor } from './CapaCalor'
import {
  METRICAS_MAPA, pesoLead, ranking, tasa, ubicarLeads, urlStreetView,
  type Agrupacion, type FilaRanking, type MetricaMapa, type PuntoLead,
} from './mapaDatos'

/**
 * Mapa — dónde están los leads y dónde funciona lo que hacemos.
 *
 * Tres formas de mirar el mismo dato:
 *   - Calor:    densidad de la métrica elegida (buscados, respondieron, ventas…).
 *   - Ciudades: un círculo por ciudad; tamaño = volumen, color = % que convierte.
 *               El calor solo engaña (donde más se buscó siempre sale más
 *               caliente); el color del círculo corrige eso.
 *   - Negocios: cada lead, con su etapa, para entrar a la calle con Street View.
 *
 * Mapa con Leaflet y teselas de CARTO / Esri: gratis, sin clave. Google Maps
 * embebido cobra por carga y retiró su capa de calor; Street View y la ficha
 * de Google se abren desde cada negocio.
 */

const ETAPA_COLOR = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, s.color])) as Record<string, string>
const ETAPA_LABEL = Object.fromEntries(PIPELINE_STAGES.map((s) => [s.id, s.label])) as Record<string, string>

type Vista = 'calor' | 'ciudades' | 'negocios'

/** Sobre qué se calcula el % de cada métrica. */
function base(f: FilaRanking, m: MetricaMapa): number {
  if (m === 'buscados' || m === 'contactados') return f.leads
  return f.contactados
}
function valor(f: FilaRanking, m: MetricaMapa): number {
  switch (m) {
    case 'buscados': return f.leads
    case 'contactados': return f.contactados
    case 'respondieron': return f.respondieron
    case 'reuniones': return f.reuniones
    case 'ganados': return f.ganados
    case 'dinero': return f.dinero
  }
}

/** Rojo → ámbar → verde según el %. Escala corta: las tasas reales son bajas. */
function colorTasa(p: number, m: MetricaMapa): string {
  if (m === 'buscados') return '#6366f1'
  const tope = m === 'contactados' ? 100 : m === 'respondieron' ? 30 : 10
  const t = Math.min(1, p / tope)
  if (t < 0.33) return '#ef4444'
  if (t < 0.66) return '#f59e0b'
  return '#16a34a'
}

export function MapaPage() {
  const { leads, isLoading } = useLeads()
  const nichos = useNichos()
  const tema = useUiStore((s) => s.theme)
  const [metrica, setMetrica] = useState<MetricaMapa>('respondieron')
  const [vista, setVista] = useState<Vista>('calor')
  const [agrupar, setAgrupar] = useState<Agrupacion>('ciudad')
  const [filtros, setFiltros] = useState<FiltrosSel>({})
  const [scoreMin, setScoreMin] = useState(0)
  const [abierto, setAbierto] = useState<string | null>(null)
  const [mapa, setMapa] = useState<LeafletMap | null>(null)
  const [zoom, setZoom] = useState(3)

  const hoy = today()
  const categorias = useMemo(() => crearCategorias(nichos, { estado: true, prioridad: true }), [nichos])
  const nombreNicho = useMemo(() => {
    const m = new Map(nichos.map((n) => [n.id, `${n.emoji ?? ''} ${n.nombre}`.trim()]))
    return (id?: string) => (id ? m.get(id) ?? id : 'Sin nicho')
  }, [nichos])

  const filtrados = useMemo(
    () => leads.filter((l) => l.score >= scoreMin && pasaFiltros(l, categorias, filtros, hoy)),
    [leads, categorias, filtros, hoy, scoreMin],
  )
  const { puntos, sinUbicar } = useMemo(() => ubicarLeads(filtrados), [filtrados])
  const filas = useMemo(() => ranking(puntos, agrupar, nombreNicho), [puntos, agrupar, nombreNicho])
  const ciudades = useMemo(() => ranking(puntos, 'ciudad', nombreNicho), [puntos, nombreNicho])

  const ordenadas = useMemo(
    () => [...filas].sort((a, b) => valor(b, metrica) - valor(a, metrica) || b.leads - a.leads),
    [filas, metrica],
  )

  const total = useMemo(() => puntos.reduce((s, p) => s + pesoLead(p.lead, metrica), 0), [puntos, metrica])
  const meta = METRICAS_MAPA.find((m) => m.id === metrica)!

  // Encuadre inicial: todos los puntos a la vista, una sola vez.
  const [encuadrado, setEncuadrado] = useState(false)
  useEffect(() => {
    if (!mapa || encuadrado || puntos.length === 0) return
    const lats = puntos.map((p) => p.lat)
    const lngs = puntos.map((p) => p.lng)
    const b: LatLngBoundsExpression = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]]
    mapa.fitBounds(b, { padding: [30, 30], maxZoom: 11 })
    setEncuadrado(true)
  }, [mapa, puntos, encuadrado])

  const irA = (f: FilaRanking) => {
    if (!mapa || f.lat === undefined || f.lng === undefined) return
    mapa.flyTo([f.lat, f.lng], agrupar === 'pais' ? 6 : 12, { duration: 0.8 })
    if (window.innerWidth < 1024) document.getElementById('mapa-lienzo')?.scrollIntoView({ behavior: 'smooth' })
  }

  // En vista de calor, al acercarse lo bastante aparecen los negocios: el
  // calor deja de decir nada a nivel de calle.
  const verNegocios = vista === 'negocios' || (vista === 'calor' && zoom >= 13)
  const oscuro = tema === 'dark'

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mapa"
        subtitle="Dónde están los leads, dónde responden y dónde se vende. Mismos filtros que en Leads."
      />

      {/* Qué se mide y cómo se ve */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sin-barra lg:mx-0 lg:px-0">
          {METRICAS_MAPA.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMetrica(m.id)}
              className={cn(
                'min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-medium transition-colors',
                metrica === m.id ? 'border-primary-400 bg-primary-400 text-white' : 'border-border text-muted hover:text-fg',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="flex w-fit overflow-hidden rounded-lg border border-border text-xs">
          {([['calor', 'Calor', Flame], ['ciudades', 'Ciudades', Target], ['negocios', 'Negocios', Store]] as const).map(([k, l, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              className={cn('flex min-h-[36px] items-center gap-1.5 px-3 transition-colors', vista === k ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}
            >
              <Icon className="h-3.5 w-3.5" /> {l}
            </button>
          ))}
        </div>
      </div>

      <LeadFiltros
        leads={leads}
        categorias={categorias}
        value={filtros}
        onChange={setFiltros}
        hoy={hoy}
        scoreMin={scoreMin}
        onScoreMin={setScoreMin}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ---------------- Mapa ---------------- */}
        <div id="mapa-lienzo" className="card relative overflow-hidden p-0">
          {isLoading && leads.length === 0 ? (
            <Skeleton className="h-[60vh] w-full lg:h-[calc(100dvh-260px)]" />
          ) : (
            <MapContainer
              center={[20, -40]}
              zoom={3}
              minZoom={2}
              worldCopyJump
              preferCanvas
              ref={setMapa}
              className="z-0 h-[60vh] w-full lg:h-[calc(100dvh-260px)] lg:min-h-[480px]"
            >
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Mapa">
                  <TileLayer
                    key={oscuro ? 'oscuro' : 'claro'}
                    url={oscuro
                      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
                      : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'}
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                    subdomains="abcd"
                    maxZoom={20}
                  />
                </LayersControl.BaseLayer>
                <LayersControl.BaseLayer name="Satélite">
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    attribution="Imágenes &copy; Esri"
                    maxZoom={19}
                  />
                </LayersControl.BaseLayer>
              </LayersControl>

              <SeguirZoom onZoom={setZoom} />

              {vista === 'calor' && <CapaCalor puntos={puntos} metrica={metrica} />}

              {vista === 'ciudades' && ciudades.map((f) => {
                const v = valor(f, metrica)
                if (v === 0 && metrica !== 'buscados') return null
                const p = tasa(metrica === 'dinero' ? f.ganados : v, base(f, metrica))
                const r = Math.max(6, Math.min(34, 5 + Math.sqrt(metrica === 'dinero' ? f.ganados * 4 : v) * 3))
                return (
                  <CircleMarker
                    key={f.clave}
                    center={[f.lat!, f.lng!]}
                    radius={r}
                    pathOptions={{ color: colorTasa(p, metrica), fillColor: colorTasa(p, metrica), fillOpacity: 0.45, weight: 1.5 }}
                    eventHandlers={{ click: () => mapa?.flyTo([f.lat!, f.lng!], 12, { duration: 0.8 }) }}
                  >
                    <Tooltip direction="top">
                      <div className="text-xs">
                        <b>{f.nombre}</b>{f.sub ? ` · ${f.sub}` : ''}<br />
                        {f.leads} leads · {f.contactados} contactados · {f.respondieron} respondieron<br />
                        {f.reuniones} reuniones · {f.ganados} ventas{f.dinero ? ` · ${formatCurrency(f.dinero)}` : ''}
                        {f.mejorNicho && <><br />Mejor nicho: {f.mejorNicho}</>}
                      </div>
                    </Tooltip>
                  </CircleMarker>
                )
              })}

              {verNegocios && puntos.map((p) => (
                <PuntoNegocio key={p.lead.id} p={p} nicho={nombreNicho(p.lead.nicho)} onAbrir={() => setAbierto(p.lead.id)} />
              ))}
            </MapContainer>
          )}

          {/* Leyenda */}
          <div className="pointer-events-none absolute bottom-2 left-2 z-[400] max-w-[calc(100%-1rem)] rounded-lg bg-surface/90 px-2.5 py-1.5 text-[11px] text-muted shadow backdrop-blur">
            {vista === 'calor' && <>Calor: <b className="text-fg">{meta.label.toLowerCase()}</b> · acerca para ver los negocios</>}
            {vista === 'ciudades' && <>Tamaño = {meta.corto.toLowerCase()} · color = % <span className="text-red-500">bajo</span> / <span className="text-amber-500">medio</span> / <span className="text-emerald-600">alto</span></>}
            {vista === 'negocios' && <>Color = etapa del pipeline · borde punteado = ubicación aproximada</>}
          </div>
        </div>

        {/* ---------------- Panel ---------------- */}
        <aside className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Dato label="En el mapa" valor={String(puntos.length)} />
            <Dato label={meta.corto} valor={metrica === 'dinero' ? formatCurrency(total) : String(total)} />
            <Dato label="Sin ubicar" valor={String(sinUbicar.length)} title="Leads sin coordenadas ni otros leads en su ciudad para ubicarlos" />
          </div>

          <div className="card p-0">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <p className="text-sm font-semibold text-fg">Ranking</p>
              <div className="flex overflow-hidden rounded-lg border border-border text-[11px]">
                {([['ciudad', 'Ciudades'], ['pais', 'Países'], ['nicho', 'Nichos']] as const).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setAgrupar(k)}
                    className={cn('min-h-[32px] px-2.5', agrupar === k ? 'bg-primary-400 text-white' : 'hover:bg-surface-2')}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <p className="flex items-start gap-1.5 px-3 pt-2 text-[11px] text-muted">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              Ordenado por {meta.label.toLowerCase()}. El % de respuesta y de venta es sobre los contactados.
            </p>
            {ordenadas.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted">Ningún lead con ubicación para estos filtros.</p>
            ) : (
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto scroll-aislado lg:max-h-[calc(100dvh-420px)]">
                {ordenadas.slice(0, 100).map((f, i) => (
                  <li key={f.clave}>
                    <button
                      type="button"
                      onClick={() => irA(f)}
                      disabled={agrupar === 'nicho'}
                      className="w-full px-3 py-2.5 text-left hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-medium text-fg">
                          <span className="mr-1.5 text-xs tabular-nums text-muted">{i + 1}</span>
                          {f.nombre}
                          {f.sub && <span className="font-normal text-muted"> · {f.sub}</span>}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-fg">
                          {metrica === 'dinero' ? formatCurrency(f.dinero) : valor(f, metrica)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted">
                        <span>{f.leads} leads</span>
                        <span>{f.contactados} contact.</span>
                        <span>{tasa(f.respondieron, f.contactados)}% resp.</span>
                        <span>{f.reuniones} reun.</span>
                        <span className={f.ganados ? 'font-medium text-emerald-600 dark:text-emerald-400' : undefined}>{f.ganados} ventas</span>
                      </div>
                      {f.mejorNicho && <p className="mt-0.5 truncate text-[11px] text-muted">Responde más: {f.mejorNicho}</p>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <LeadDetailHost leadId={abierto} onClose={() => setAbierto(null)} />
    </div>
  )
}

function Dato({ label, valor, title }: { label: string; valor: string; title?: string }) {
  return (
    <div className="card p-3" title={title}>
      <p className="truncate text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="truncate text-lg font-bold tabular-nums text-fg">{valor}</p>
    </div>
  )
}

function SeguirZoom({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap()
  useEffect(() => { onZoom(map.getZoom()) }, [map, onZoom])
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) })
  return null
}

function PuntoNegocio({ p, nicho, onAbrir }: { p: PuntoLead; nicho: string; onAbrir: () => void }) {
  const l = p.lead
  const color = ETAPA_COLOR[l.estado] ?? '#94a3b8'
  return (
    <CircleMarker
      center={[p.lat, p.lng]}
      radius={6}
      pathOptions={{ color: '#ffffff', weight: 1.5, fillColor: color, fillOpacity: 0.95, dashArray: p.aproximado ? '2 3' : undefined }}
    >
      <Popup>
        <div className="min-w-[200px] space-y-1.5 text-xs">
          <p className="text-sm font-semibold">{l.empresa}</p>
          <p className="text-slate-500">{nicho} · {l.ciudad ?? '—'}</p>
          <p>
            <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold text-white" style={{ background: color }}>
              {ETAPA_LABEL[l.estado] ?? l.estado}
            </span>
            {l.touchActual > 0 && <span className="ml-1.5 text-slate-500">{l.touchActual} toques</span>}
          </p>
          {p.aproximado && <p className="text-[10px] text-amber-600">Ubicación aproximada (centro de su ciudad)</p>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button type="button" onClick={onAbrir} className="inline-flex items-center gap-1 rounded-md bg-primary-400 px-2 py-1 font-medium text-white">
              <Eye className="h-3 w-3" /> Ficha
            </button>
            {!p.aproximado && (
              <a href={urlStreetView(p.lat, p.lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700">
                <MapPin className="h-3 w-3" /> Street View
              </a>
            )}
            {l.googleMaps && (
              <a href={l.googleMaps} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-700">
                <ExternalLink className="h-3 w-3" /> Google Maps
              </a>
            )}
          </div>
        </div>
      </Popup>
    </CircleMarker>
  )
}

export default MapaPage
