/** Configuración central leída de variables de entorno (Vite). */

export const config = {
  n8n: {
    // Solo para armar el link "abrir en n8n" del panel de Settings, nunca se
    // usa para llamar a la API (esa va siempre por /n8n-api, ver abajo).
    url: import.meta.env.VITE_N8N_URL || 'http://localhost:5678',
    // La API key de n8n NUNCA se lee en el cliente (no hay VITE_N8N_API_KEY
    // aquí): la inyecta nginx server-side en el proxy /n8n-api. Ver n8nService.ts.
    // La API de n8n va SIEMPRE por ruta relativa: en dev la proxia vite, en prod
    // la proxia el nginx del dashboard (server-side, inyecta X-N8N-API-KEY y llega
    // a n8n por red interna). Así no depende de que el navegador alcance backoffice
    // (protegido por Access) y la API key sale del bundle.
    base: '/n8n-api',
    // Los webhooks (CRM API) van SIEMPRE por ruta relativa /n8n-hook: en dev
    // los proxia vite, en prod los proxia el nginx del dashboard (server-side,
    // inyecta X-CRM-TOKEN y llega a n8n por red interna). Antes esto pegaba
    // directo a VITE_N8N_URL desde el navegador en prod, lo que además de
    // depender de un build-arg que nunca se pasaba (siempre caía al fallback
    // localhost:5678) violaba la CSP (connect-src no incluye backoffice).
    hookBase: '/n8n-hook',
    // Solo se envía en dev: el proxy de vite no inyecta el header, así que el
    // cliente debe mandarlo si el webhook de n8n valida token. En prod nginx
    // ya lo inyecta server-side vía CRM_HOOK_TOKEN, así que no hace falta.
    hookToken: import.meta.env.VITE_N8N_HOOK_TOKEN || '',
  },
  workflows: {
    // Único workflow que la app dispara por ID: envío de emails al crear campaña.
    // El seguimiento por email (Fase 4) se retiró: Juan lo apagó en n8n por coste
    // de tokens. El de WhatsApp no se dispara desde la app.
    envioEmails: import.meta.env.VITE_WF_ENVIO_EMAILS || 'ITdsEWd94R8ptUlb',
  },
  business: {
    name: 'JD Developer',
    emailMain: import.meta.env.VITE_BUSINESS_EMAIL_MAIN || 'info@jddeveloper.com',
    emailOutreach: import.meta.env.VITE_BUSINESS_EMAIL_OUTREACH || 'sales@jddeveloper.com',
    whatsapp: import.meta.env.VITE_BUSINESS_WHATSAPP || '+1 849 576 4367',
    booking: import.meta.env.VITE_BUSINESS_BOOKING || 'https://calendar.app.google/QQ17ujMKjNXePb1a8',
    instagram: '@jddeveloper_',
    web: 'https://jddeveloper.com',
    logo: 'https://cdn.prod.website-files.com/680a3c1f38949058853afc9c/6824de62e60758ee1d3acd4f_Logo%20JD%20Developer%20(256%20x%20256%20px).jpg',
  },
}

/** Etapas del pipeline con probabilidad para forecast. */
export const PIPELINE_STAGES = [
  { id: 'nuevo', label: 'Nuevo', color: '#94a3b8', probability: 0.05 },
  { id: 'contactado', label: 'Contactado', color: '#0082f3', probability: 0.1 },
  { id: 'seguimiento', label: 'Seguimiento', color: '#6248ff', probability: 0.2 },
  { id: 'respondio', label: 'Respondió', color: '#f38744', probability: 0.4 },
  { id: 'reunion', label: 'Reunión Agendada', color: '#ff7448', probability: 0.6 },
  { id: 'propuesta', label: 'Propuesta Enviada', color: '#ef6820', probability: 0.75 },
  { id: 'negociacion', label: 'Negociación', color: '#f59e0b', probability: 0.9 },
  { id: 'ganado', label: 'Cerrado Ganado', color: '#16a34a', probability: 1 },
  { id: 'perdido', label: 'Cerrado Perdido', color: '#ff4848', probability: 0 },
] as const

/**
 * Nichos (categorías de lead) que trae el CRM de fábrica.
 *
 * Con seis opciones casi todo acababa en "Otros", que es la forma de perder la
 * dimensión más útil para segmentar campañas. La lista se agrupa por sector
 * para que el desplegable siga siendo navegable siendo largo, y el usuario
 * puede añadir los suyos desde el propio formulario (se guardan en `settings`,
 * clave `nichos_personalizados`; ver `useNichos` en hooks/useData.ts).
 *
 * Los `id` son estables: son lo que queda escrito en `leads.nicho`. Cambiar uno
 * huérfana los leads que ya lo tenían, así que se añaden, no se renombran.
 * "Otros" va siempre el último, y por eso vive fuera de los grupos.
 */
export interface Niche {
  id: string
  nombre: string
  emoji: string
  color: string
  grupo: string
}

export const DEFAULT_NICHES: Niche[] = [
  // Construcción y espacio
  { id: 'arquitectura', nombre: 'Arquitectura', emoji: '📐', color: '#ff7448', grupo: 'Construcción y espacio' },
  { id: 'ingenieria', nombre: 'Ingeniería', emoji: '⚙️', color: '#f38744', grupo: 'Construcción y espacio' },
  { id: 'construccion', nombre: 'Construcción', emoji: '🏗️', color: '#eab308', grupo: 'Construcción y espacio' },
  { id: 'real-estate', nombre: 'Bienes Raíces', emoji: '🏠', color: '#ff7448', grupo: 'Construcción y espacio' },
  { id: 'interiorismo', nombre: 'Interiorismo', emoji: '🛋️', color: '#d946ef', grupo: 'Construcción y espacio' },

  // Hostelería y turismo
  { id: 'restaurantes', nombre: 'Restaurantes', emoji: '🍽️', color: '#f38744', grupo: 'Hostelería y turismo' },
  { id: 'hoteles', nombre: 'Hoteles', emoji: '🏨', color: '#0ea5e9', grupo: 'Hostelería y turismo' },
  { id: 'turismo', nombre: 'Turismo', emoji: '🧳', color: '#06b6d4', grupo: 'Hostelería y turismo' },

  // Salud
  { id: 'clinicas', nombre: 'Clínicas', emoji: '🏥', color: '#0082f3', grupo: 'Salud' },
  { id: 'dentistas', nombre: 'Dentistas', emoji: '🦷', color: '#38bdf8', grupo: 'Salud' },
  { id: 'medicos', nombre: 'Médicos', emoji: '🩺', color: '#0284c7', grupo: 'Salud' },

  // Servicios profesionales
  { id: 'abogados', nombre: 'Abogados', emoji: '⚖️', color: '#6248ff', grupo: 'Servicios profesionales' },
  { id: 'contadores', nombre: 'Contadores', emoji: '🧮', color: '#7c3aed', grupo: 'Servicios profesionales' },
  { id: 'consultores', nombre: 'Consultores', emoji: '📊', color: '#8b5cf6', grupo: 'Servicios profesionales' },

  // Marketing y creatividad
  { id: 'agencias-marketing', nombre: 'Agencias de Marketing', emoji: '📣', color: '#ec4899', grupo: 'Marketing y creatividad' },
  { id: 'estudios-creativos', nombre: 'Estudios Creativos', emoji: '🎨', color: '#f472b6', grupo: 'Marketing y creatividad' },

  // Tecnología
  { id: 'software', nombre: 'Software', emoji: '💻', color: '#2563eb', grupo: 'Tecnología' },
  { id: 'saas', nombre: 'SaaS', emoji: '☁️', color: '#3b82f6', grupo: 'Tecnología' },
  { id: 'ia', nombre: 'Inteligencia Artificial', emoji: '🤖', color: '#6366f1', grupo: 'Tecnología' },

  // Educación
  { id: 'educacion', nombre: 'Educación', emoji: '📚', color: '#f59e0b', grupo: 'Educación' },
  { id: 'universidades', nombre: 'Universidades', emoji: '🎓', color: '#d97706', grupo: 'Educación' },
  { id: 'escuelas', nombre: 'Escuelas', emoji: '🏫', color: '#fbbf24', grupo: 'Educación' },

  // Comercio
  { id: 'ecommerce', nombre: 'Ecommerce', emoji: '🛒', color: '#10b981', grupo: 'Comercio' },
  { id: 'retail', nombre: 'Retail', emoji: '🏪', color: '#059669', grupo: 'Comercio' },

  // Industria y logística
  { id: 'manufactura', nombre: 'Manufactura', emoji: '🏭', color: '#64748b', grupo: 'Industria y logística' },
  { id: 'industriales', nombre: 'Empresas Industriales', emoji: '🔧', color: '#475569', grupo: 'Industria y logística' },
  { id: 'logistica', nombre: 'Logística', emoji: '📦', color: '#78716c', grupo: 'Industria y logística' },
  { id: 'transporte', nombre: 'Transporte', emoji: '🚚', color: '#57534e', grupo: 'Industria y logística' },

  // Automoción
  { id: 'automotriz', nombre: 'Automotriz', emoji: '🚗', color: '#dc2626', grupo: 'Automoción' },
  { id: 'talleres', nombre: 'Talleres', emoji: '🔩', color: '#b91c1c', grupo: 'Automoción' },

  // Bienestar y belleza
  { id: 'fitness', nombre: 'Gimnasios', emoji: '💪', color: '#16a34a', grupo: 'Bienestar y belleza' },
  { id: 'centros-deportivos', nombre: 'Centros Deportivos', emoji: '⚽', color: '#22c55e', grupo: 'Bienestar y belleza' },
  { id: 'barberias', nombre: 'Barberías', emoji: '💈', color: '#e11d48', grupo: 'Bienestar y belleza' },
  { id: 'salones-belleza', nombre: 'Salones de Belleza', emoji: '💅', color: '#f43f5e', grupo: 'Bienestar y belleza' },

  // Organizaciones
  { id: 'ong', nombre: 'ONG', emoji: '🤝', color: '#0d9488', grupo: 'Organizaciones' },
  { id: 'iglesias', nombre: 'Iglesias', emoji: '⛪', color: '#a16207', grupo: 'Organizaciones' },

  { id: 'otros', nombre: 'Otros', emoji: '📦', color: '#94a3b8', grupo: 'Otros' },
]

/** Clave en `settings` donde se guardan los nichos que crea el usuario. */
export const CLAVE_NICHOS = 'nichos_personalizados'
