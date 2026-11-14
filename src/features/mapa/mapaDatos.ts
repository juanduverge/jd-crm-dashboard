import type { Lead } from '@/types'

/**
 * Cálculos del Mapa. Aquí sí se cuenta en el navegador: el mapa trabaja sobre
 * los leads que ya están cargados y filtrados en pantalla, y lo que mide es
 * dónde están y hasta qué etapa llegaron, no actividad por fechas (eso es el
 * motor de métricas, en SQL).
 */

/** Lo que puede pintar el calor. */
export type MetricaMapa = 'buscados' | 'contactados' | 'respondieron' | 'reuniones' | 'ganados' | 'dinero'

export const METRICAS_MAPA: { id: MetricaMapa; label: string; corto: string }[] = [
  { id: 'buscados', label: 'Leads buscados', corto: 'Buscados' },
  { id: 'contactados', label: 'Contactados', corto: 'Contactados' },
  { id: 'respondieron', label: 'Respondieron', corto: 'Respondieron' },
  { id: 'reuniones', label: 'Reunión o más', corto: 'Reuniones' },
  { id: 'ganados', label: 'Ventas', corto: 'Ventas' },
  { id: 'dinero', label: 'Dinero vendido', corto: 'Dinero' },
]

const AVANZADAS = new Set(['reunion', 'propuesta', 'negociacion', 'ganado'])

export const esContactado = (l: Lead) => l.touchActual > 0 || !!l.primerContactoEn
export const respondio = (l: Lead) => !!l.respondioEn
// Un ganado o perdido que había llegado a reunión cuenta por su etapa previa.
export const llegoReunion = (l: Lead) =>
  AVANZADAS.has(l.estado) || (l.estado === 'perdido' && !!l.etapaPrevia && AVANZADAS.has(l.etapaPrevia))
export const ganado = (l: Lead) => l.estado === 'ganado'

/** Peso del lead en la métrica elegida (0 = no cuenta). */
export function pesoLead(l: Lead, m: MetricaMapa): number {
  switch (m) {
    case 'buscados': return 1
    case 'contactados': return esContactado(l) ? 1 : 0
    case 'respondieron': return respondio(l) ? 1 : 0
    case 'reuniones': return llegoReunion(l) ? 1 : 0
    case 'ganados': return ganado(l) ? 1 : 0
    case 'dinero': return ganado(l) ? (l.valorEstimado ?? 0) : 0
  }
}

/** Texto normalizado para agrupar «Miami», «miami » y «Miámi». */
export const norm = (s?: string) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

export interface PuntoLead {
  lead: Lead
  lat: number
  lng: number
  /** true = no tenía coordenadas y se puso en el centro de su ciudad. */
  aproximado: boolean
}

/**
 * Coloca cada lead en el mapa. Los de Apify traen sus coordenadas; a los
 * manuales se les pone en el centro de su ciudad, calculado con los demás
 * leads de esa misma ciudad. Sin ningún vecino con coordenadas no se pueden
 * ubicar y se cuentan aparte (no se inventa una posición).
 */
export function ubicarLeads(leads: Lead[]): { puntos: PuntoLead[]; sinUbicar: Lead[] } {
  const centros = new Map<string, { lat: number; lng: number; n: number }>()
  const valida = (l: Lead) =>
    typeof l.latitud === 'number' && typeof l.longitud === 'number'
    && Number.isFinite(l.latitud) && Number.isFinite(l.longitud)
    && !(l.latitud === 0 && l.longitud === 0)

  for (const l of leads) {
    if (!valida(l) || !l.ciudad) continue
    const k = `${norm(l.ciudad)}|${norm(l.pais)}`
    const c = centros.get(k) ?? { lat: 0, lng: 0, n: 0 }
    c.lat += l.latitud!; c.lng += l.longitud!; c.n += 1
    centros.set(k, c)
  }

  const puntos: PuntoLead[] = []
  const sinUbicar: Lead[] = []
  for (const l of leads) {
    if (valida(l)) { puntos.push({ lead: l, lat: l.latitud!, lng: l.longitud!, aproximado: false }); continue }
    const c = l.ciudad ? centros.get(`${norm(l.ciudad)}|${norm(l.pais)}`) : undefined
    if (c) puntos.push({ lead: l, lat: c.lat / c.n, lng: c.lng / c.n, aproximado: true })
    else sinUbicar.push(l)
  }
  return { puntos, sinUbicar }
}

export type Agrupacion = 'ciudad' | 'pais' | 'nicho'

export interface FilaRanking {
  clave: string
  nombre: string
  sub?: string
  leads: number
  contactados: number
  respondieron: number
  reuniones: number
  ganados: number
  dinero: number
  /** Centro geográfico del grupo (no aplica a nichos). */
  lat?: number
  lng?: number
  /** Nicho con más respuestas dentro del grupo (solo ciudad/país). */
  mejorNicho?: string
}

/** Agrupa los puntos por ciudad, país o nicho, con su embudo. */
export function ranking(puntos: PuntoLead[], por: Agrupacion, nombreNicho: (id?: string) => string): FilaRanking[] {
  const grupos = new Map<string, FilaRanking & { _lat: number; _lng: number; _nichos: Map<string, number> }>()
  for (const p of puntos) {
    const l = p.lead
    const clave = por === 'ciudad' ? `${norm(l.ciudad)}|${norm(l.pais)}`
      : por === 'pais' ? norm(l.pais)
      : (l.nicho ?? '')
    const nombre = por === 'ciudad' ? (l.ciudad?.trim() || 'Sin ciudad')
      : por === 'pais' ? (l.pais?.trim() || 'Sin país')
      : nombreNicho(l.nicho)
    let g = grupos.get(clave)
    if (!g) {
      g = {
        clave, nombre, sub: por === 'ciudad' ? l.pais?.trim() : undefined,
        leads: 0, contactados: 0, respondieron: 0, reuniones: 0, ganados: 0, dinero: 0,
        _lat: 0, _lng: 0, _nichos: new Map(),
      }
      grupos.set(clave, g)
    }
    g.leads += 1
    g._lat += p.lat; g._lng += p.lng
    if (esContactado(l)) g.contactados += 1
    if (respondio(l)) {
      g.respondieron += 1
      if (l.nicho) g._nichos.set(l.nicho, (g._nichos.get(l.nicho) ?? 0) + 1)
    }
    if (llegoReunion(l)) g.reuniones += 1
    if (ganado(l)) { g.ganados += 1; g.dinero += l.valorEstimado ?? 0 }
  }
  return [...grupos.values()].map(({ _lat, _lng, _nichos, ...g }) => {
    const top = [..._nichos.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      ...g,
      lat: por === 'nicho' ? undefined : _lat / g.leads,
      lng: por === 'nicho' ? undefined : _lng / g.leads,
      mejorNicho: por !== 'nicho' && top ? nombreNicho(top[0]) : undefined,
    }
  })
}

export const tasa = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

/** Street View en el punto exacto. Si Google no tiene imagen ahí, abre el mapa. */
export const urlStreetView = (lat: number, lng: number) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`
