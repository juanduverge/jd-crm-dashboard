/**
 * Opciones de la encuesta al colgar (0074). Viven aquí y no en la BD para que
 * Juan pueda añadir una estrategia o un tipo de proyecto sin migración: la
 * columna es texto libre y el análisis agrupa por lo que haya guardado.
 *
 * Las claves (`v`) no se cambian nunca una vez usadas: son lo que queda
 * guardado. La etiqueta (`l`) sí se puede reescribir.
 */

export interface OpcionEncuesta { v: string; l: string }

export const ANIMO: { v: number; emoji: string; l: string }[] = [
  { v: 1, emoji: '😣', l: 'Muy mal' },
  { v: 2, emoji: '😕', l: 'Regular' },
  { v: 3, emoji: '😐', l: 'Normal' },
  { v: 4, emoji: '🙂', l: 'Bien' },
  { v: 5, emoji: '😄', l: 'Genial' },
]

export const INTERES: { v: 'frio' | 'tibio' | 'caliente'; l: string; tono: 'danger' | 'primary' | 'ok' }[] = [
  { v: 'frio', l: '🧊 Frío', tono: 'danger' },
  { v: 'tibio', l: '🌤️ Tibio', tono: 'primary' },
  { v: 'caliente', l: '🔥 Caliente', tono: 'ok' },
]

export const TIPO_PROYECTO: OpcionEncuesta[] = [
  { v: 'web_nueva', l: 'Web nueva' },
  { v: 'rediseno', l: 'Rediseño de web' },
  { v: 'tienda', l: 'Tienda online' },
  { v: 'remodelacion', l: 'Remodelación / construcción' },
  { v: 'seo', l: 'SEO / Google' },
  { v: 'app', l: 'App / sistema' },
  { v: 'otro', l: 'Otro' },
]

export const ESTRATEGIA: OpcionEncuesta[] = [
  { v: 'auditoria_gratis', l: 'Auditoría gratis' },
  { v: 'caso_exito', l: 'Caso de éxito' },
  { v: 'precio', l: 'Precio / oferta' },
  { v: 'pregunta_abierta', l: 'Preguntas abiertas' },
  { v: 'problema_web', l: 'Fallo en su web' },
  { v: 'competencia', l: 'Su competencia' },
  { v: 'recomendacion', l: 'Recomendación' },
  { v: 'directo', l: 'Directo al grano' },
]

export const ATENDIO: OpcionEncuesta[] = [
  { v: 'dueno', l: 'Dueño / decisor' },
  { v: 'encargado', l: 'Encargado' },
  { v: 'recepcion', l: 'Recepción' },
  { v: 'otro', l: 'Otra persona' },
]

export const OBJECION: OpcionEncuesta[] = [
  { v: 'ninguna', l: 'Ninguna' },
  { v: 'precio', l: 'Precio' },
  { v: 'ya_tiene_web', l: 'Ya tiene web' },
  { v: 'no_es_momento', l: 'No es el momento' },
  { v: 'mandar_info', l: 'Mándame información' },
  { v: 'consultar', l: 'Tiene que consultarlo' },
  { v: 'desconfianza', l: 'Desconfianza' },
  { v: 'otra', l: 'Otra' },
]

/** Etiqueta legible de una clave guardada; si ya no está en la lista, la clave tal cual. */
export function etiquetaDe(lista: OpcionEncuesta[], v?: string): string {
  if (!v) return ''
  return lista.find((o) => o.v === v)?.l ?? v
}
