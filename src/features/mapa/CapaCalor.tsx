import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from './leafletGlobal'
import 'leaflet.heat'
import type { PuntoLead, MetricaMapa } from './mapaDatos'
import { pesoLead } from './mapaDatos'

/**
 * Capa de calor sobre el mapa. El peso de cada lead sale de la métrica
 * elegida; el dinero se normaliza contra la venta más grande para que una
 * sola venta no sature todo el mapa.
 */
export function CapaCalor({ puntos, metrica }: { puntos: PuntoLead[]; metrica: MetricaMapa }) {
  const map = useMap()

  useEffect(() => {
    const pesos = puntos.map((p) => pesoLead(p.lead, metrica))
    const max = metrica === 'dinero' ? Math.max(1, ...pesos) : 1
    const datos: [number, number, number][] = []
    puntos.forEach((p, i) => {
      if (pesos[i] > 0) datos.push([p.lat, p.lng, metrica === 'dinero' ? 0.3 + 0.7 * (pesos[i] / max) : 0.6])
    })
    if (datos.length === 0) return
    const capa = L.heatLayer(datos, {
      radius: 22,
      blur: 18,
      maxZoom: 12,
      minOpacity: 0.35,
      gradient: { 0.2: '#3b82f6', 0.45: '#22c55e', 0.65: '#facc15', 0.85: '#f97316', 1: '#dc2626' },
    })
    capa.addTo(map)
    return () => { capa.remove() }
  }, [map, puntos, metrica])

  return null
}
