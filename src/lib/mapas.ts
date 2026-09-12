/**
 * Enlaces de Google Maps: uno para ver el mapa aquí dentro (iframe) y otro
 * para abrirlo en Google, que es lo que hace falta cuando se quiere navegar
 * o dejar una reseña.
 *
 * El enlace que trae Apify (`google_maps`, con `cid=`) NO se puede meter en
 * un iframe: Google lo bloquea con X-Frame-Options. El único embebido que
 * funciona sin clave de API es `maps.google.com/maps?q=...&output=embed`,
 * así que el visor siempre se construye a partir del texto de la dirección.
 */

/** Texto a buscar en el mapa a partir de las piezas que haya (empresa, calle, ciudad…). */
export function consultaMapa(...partes: (string | undefined | null)[]): string {
  return partes.map((p) => (p ?? '').trim()).filter(Boolean).join(', ')
}

/** URL para el iframe del visor. Devuelve undefined si no hay nada que buscar. */
export function urlEmbebido(consulta: string): string | undefined {
  const q = consulta.trim()
  if (!q) return undefined
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=15&hl=es&output=embed`
}

/** URL para abrir en Google Maps (pestaña nueva o la app del móvil). */
export function urlExterna(consulta: string): string | undefined {
  const q = consulta.trim()
  if (!q) return undefined
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

/** URL de «Cómo llegar» (abre la navegación en Google Maps o en la app). */
export function urlComoLlegar(consulta: string): string | undefined {
  const q = consulta.trim()
  if (!q) return undefined
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`
}
