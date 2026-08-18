import type { MetricaClave } from '@/types'

/**
 * Catálogo de métricas — el espejo en el cliente de `metrica_valor()` (0028).
 *
 * Aquí SÓLO vive la presentación: cómo se llama la métrica para un humano, qué
 * mide en una frase y cómo se formatea. El cálculo está en SQL y no se
 * duplica: si el número que ve el usuario no cuadra, hay un único sitio donde
 * mirar.
 *
 * Criterio para incluir una métrica: tiene que cambiar lo que Juan hace
 * mañana. Por eso están las de actividad (toques por escalón, respuestas,
 * seguimientos atrasados) y no están las de vanidad tipo "total histórico de
 * leads", que sólo suben y nunca sugieren una acción.
 */
export interface MetricaMeta {
  clave: MetricaClave
  label: string
  /** Qué cuenta exactamente. Se enseña como ayuda al elegir métrica en una meta. */
  ayuda: string
  unidad: string
  formato?: 'numero' | 'moneda' | 'minutos'
  /** Familia para agrupar en los desplegables y en el panel. */
  grupo: 'Prospección' | 'Contacto' | 'Resultado' | 'Esfuerzo'
}

export const METRICAS: MetricaMeta[] = [
  {
    clave: 'leads_encontrados', label: 'Leads encontrados', unidad: 'leads', grupo: 'Prospección',
    ayuda: 'Leads dados de alta en el periodo, vengan de Apify, del formulario web o a mano.',
  },
  {
    clave: 'leads_contactados', label: 'Leads contactados', unidad: 'leads', grupo: 'Prospección',
    ayuda: 'Leads que recibieron su PRIMER contacto en el periodo. Contactar dos veces al mismo lead no suma dos.',
  },
  {
    clave: 'contactos_realizados', label: 'Contactos realizados', unidad: 'toques', grupo: 'Contacto',
    ayuda: 'Todos los toques completados, incluidos los segundos y terceros contactos al mismo lead.',
  },
  { clave: 'touch_1', label: 'Touch 1 · primer contacto', unidad: 'toques', grupo: 'Contacto', ayuda: 'Primeros contactos completados en el periodo.' },
  { clave: 'touch_2', label: 'Touch 2 · segundo contacto', unidad: 'toques', grupo: 'Contacto', ayuda: 'Segundos contactos completados en el periodo.' },
  { clave: 'touch_3', label: 'Touch 3 · tercer contacto', unidad: 'toques', grupo: 'Contacto', ayuda: 'Terceros contactos completados en el periodo.' },
  { clave: 'touch_4', label: 'Touch 4 · cuarto contacto', unidad: 'toques', grupo: 'Contacto', ayuda: 'Cuartos contactos completados en el periodo.' },
  { clave: 'touch_5', label: 'Touch 5+ · quinto en adelante', unidad: 'toques', grupo: 'Contacto', ayuda: 'Quintos contactos y posteriores completados en el periodo.' },
  {
    clave: 'respuestas_recibidas', label: 'Respuestas recibidas', unidad: 'respuestas', grupo: 'Resultado',
    ayuda: 'Toques cuyo resultado no fue «sin respuesta». Un «no, gracias» también es una respuesta.',
  },
  {
    clave: 'leads_respondieron', label: 'Leads que respondieron', unidad: 'leads', grupo: 'Resultado',
    ayuda: 'Leads que dieron señales de vida por primera vez en el periodo.',
  },
  { clave: 'reuniones_agendadas', label: 'Reuniones agendadas', unidad: 'reuniones', grupo: 'Resultado', ayuda: 'Leads que entraron en la etapa Reunión agendada.' },
  { clave: 'propuestas_enviadas', label: 'Propuestas enviadas', unidad: 'propuestas', grupo: 'Resultado', ayuda: 'Leads que entraron en la etapa Propuesta enviada.' },
  { clave: 'leads_ganados', label: 'Leads ganados', unidad: 'leads', grupo: 'Resultado', ayuda: 'Leads cerrados como ganados en el periodo.' },
  { clave: 'leads_perdidos', label: 'Leads perdidos', unidad: 'leads', grupo: 'Resultado', ayuda: 'Leads cerrados como perdidos en el periodo.' },
  {
    clave: 'valor_ganado', label: 'Valor ganado', unidad: 'USD', formato: 'moneda', grupo: 'Resultado',
    ayuda: 'Suma del valor estimado de los leads ganados en el periodo.',
  },
  {
    clave: 'tiempo_prospeccion_min', label: 'Tiempo dedicado', unidad: 'min', formato: 'minutos', grupo: 'Esfuerzo',
    ayuda: 'Minutos medidos en el Registro de tiempo dentro del periodo.',
  },
  { clave: 'tareas_completadas', label: 'Tareas completadas', unidad: 'tareas', grupo: 'Esfuerzo', ayuda: 'Tareas marcadas como hechas en el periodo.' },
]

export const METRICA_BY_CLAVE = Object.fromEntries(
  METRICAS.map((m) => [m.clave, m]),
) as Record<MetricaClave, MetricaMeta>

/** Orden de los grupos en los desplegables; el catálogo se agrupa por aquí. */
export const GRUPOS_METRICA = ['Prospección', 'Contacto', 'Resultado', 'Esfuerzo'] as const

export function metricasPorGrupo(): { grupo: string; metricas: MetricaMeta[] }[] {
  return GRUPOS_METRICA.map((grupo) => ({
    grupo,
    metricas: METRICAS.filter((m) => m.grupo === grupo),
  }))
}

/** Formatea un valor según el formato declarado de su métrica. */
export function fmtMetrica(clave: MetricaClave | undefined, valor: number): string {
  const meta = clave ? METRICA_BY_CLAVE[clave] : undefined
  if (meta?.formato === 'moneda') {
    return valor.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  }
  if (meta?.formato === 'minutos') {
    const h = Math.floor(valor / 60)
    const m = Math.round(valor % 60)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(1)
}
