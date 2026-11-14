import type { Channel, LeadIdioma, LeadOrigen } from '@/types'

/**
 * Por dónde llegó el cliente (migración 0065). Los valores son los del CHECK
 * de `leads.origen`; cambiar uno aquí sin cambiarlo en SQL rompe el guardado.
 */
export const ORIGENES: { id: LeadOrigen; label: string; emoji: string }[] = [
  { id: 'apify', label: 'Apify / Google Maps', emoji: '🔎' },
  { id: 'recomendacion', label: 'Recomendación', emoji: '🤝' },
  { id: 'contacto_directo', label: 'Me contactó él', emoji: '📥' },
  { id: 'formulario_web', label: 'Formulario web', emoji: '🌐' },
  { id: 'instagram', label: 'Instagram', emoji: '📸' },
  { id: 'facebook', label: 'Facebook', emoji: '📘' },
  { id: 'google', label: 'Google (búsqueda)', emoji: '🔍' },
  { id: 'evento', label: 'Evento / en persona', emoji: '🎤' },
  { id: 'otro', label: 'Otro', emoji: '•' },
]

export const ORIGEN_META = Object.fromEntries(ORIGENES.map((o) => [o.id, o])) as Record<LeadOrigen, (typeof ORIGENES)[number]>

export function origenLabel(o?: string | null): string {
  if (!o || o === 'sin_dato') return 'Sin dato'
  return ORIGEN_META[o as LeadOrigen]?.label ?? o
}

/**
 * Idioma probable del lead. Sin bandera de país a propósito: el español no
 * es de un solo país y el lead de Miami puede hablar cualquiera de los dos.
 */
export const IDIOMAS: { id: LeadIdioma; label: string; corto: string }[] = [
  { id: 'es', label: 'Español', corto: 'ES' },
  { id: 'en', label: 'Inglés', corto: 'EN' },
  { id: 'pt', label: 'Portugués', corto: 'PT' },
  { id: 'fr', label: 'Francés', corto: 'FR' },
  { id: 'it', label: 'Italiano', corto: 'IT' },
  { id: 'de', label: 'Alemán', corto: 'DE' },
  { id: 'otro', label: 'Otro', corto: '…' },
]

export const IDIOMA_META = Object.fromEntries(IDIOMAS.map((i) => [i.id, i])) as Record<LeadIdioma, (typeof IDIOMAS)[number]>

/** Canal principal del Pipeline, con las llamadas que añadió la 0065. */
export const CANALES_PIPELINE: { id: Channel; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'llamada', label: 'Llamada normal' },
  { id: 'llamada_whatsapp', label: 'Llamada por WhatsApp' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'linkedin', label: 'LinkedIn' },
]
