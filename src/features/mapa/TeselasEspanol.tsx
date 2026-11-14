import { createLayerComponent, type LayerProps } from '@react-leaflet/core'
import type L from 'leaflet'
import type { ExpressionSpecification, Map as MapaGL } from 'maplibre-gl'
import './leafletGlobal'
import 'maplibre-gl/dist/maplibre-gl.css'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'

/**
 * Capa base del mapa con las etiquetas en ESPAÑOL.
 *
 * Las teselas de OpenStreetMap vienen ya dibujadas con el nombre local: en un
 * país árabe, el país sale en árabe. Aquí se usa OpenFreeMap (gratis, sin
 * clave), que sirve el mapa en vectores y deja decidir qué idioma se escribe.
 * Cada etiqueta usa, por este orden: español, inglés, nombre en alfabeto
 * latino y, solo si no hay otro, el nombre local.
 *
 * Es una capa de Leaflet (no un mapa aparte) para que los puntos, el calor,
 * los círculos y el selector Mapa/Satélite sigan funcionando como antes.
 */

const ESTILO = 'https://tiles.openfreemap.org/styles/positron'
const ATRIBUCION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> ' +
  'Datos de <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

const NOMBRE_ES: ExpressionSpecification = [
  'coalesce', ['get', 'name:es'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name'],
]

/** Reescribe el texto de todas las capas que escriben un nombre. */
function ponerEnEspanol(mapa: MapaGL) {
  for (const capa of mapa.getStyle().layers ?? []) {
    if (capa.type !== 'symbol') continue
    // Se saltan las que no son nombres (escudos de carretera: «ref»).
    if (!JSON.stringify(capa.layout?.['text-field'] ?? '').includes('name')) continue
    mapa.setLayoutProperty(capa.id, 'text-field', NOMBRE_ES)
  }
}

interface Props extends LayerProps {
  /** El estilo es claro; en oscuro se invierte con CSS (como antes con OSM). */
  oscuro?: boolean
}

const marcarTema = (capa: L.MaplibreGL, oscuro?: boolean) => {
  try { capa.getCanvas().classList.toggle('teselas-oscuras', !!oscuro) } catch { /* aún sin mapa */ }
}

export const TeselasEspanol = createLayerComponent<L.MaplibreGL, Props>(
  ({ oscuro }, ctx) => {
    const capa = maplibreGL({
      style: ESTILO,
      attributionControl: { customAttribution: ATRIBUCION },
      // `className` lo entiende la capa (va al canvas) pero no sale en sus tipos.
      ...({ className: oscuro ? 'teselas-oscuras' : undefined } as object),
    })
    // El mapa interno se crea al AÑADIR la capa (y se rehace al volver de
    // «Satélite»): los avisos se enganchan cada vez.
    capa.on('add', () => {
      const gl = capa.getMaplibreMap()
      gl.on('style.load', () => ponerEnEspanol(gl))
    })
    return { instance: capa, context: ctx }
  },
  (capa, props, anteriores) => {
    if (props.oscuro !== anteriores.oscuro) marcarTema(capa, props.oscuro)
  },
)
