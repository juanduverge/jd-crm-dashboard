/** Configuración central leída de variables de entorno (Vite). */

export const config = {
  appPassword: import.meta.env.VITE_APP_PASSWORD || 'JDDeveloper2026',
  n8n: {
    url: import.meta.env.VITE_N8N_URL || 'http://localhost:5678',
    apiKey: import.meta.env.VITE_N8N_API_KEY || '',
    // En dev usamos el proxy de vite (/n8n-api) para evitar CORS.
    base: import.meta.env.DEV ? '/n8n-api' : `${import.meta.env.VITE_N8N_URL || 'http://localhost:5678'}/api/v1`,
  },
  sheets: {
    id: import.meta.env.VITE_GOOGLE_SHEETS_ID || '',
    apiKey: import.meta.env.VITE_GOOGLE_API_KEY || '',
    tabs: ['prospects', 'outreach', 'pipeline', 'messages', 'config'] as const,
  },
  workflows: {
    envioEmails: import.meta.env.VITE_WF_ENVIO_EMAILS || 'ITdsEWd94R8ptUlb',
    seguimientoEmail: import.meta.env.VITE_WF_SEGUIMIENTO_EMAIL || 'ZMQkvDXtD2tdMuYN',
    whatsappSeguimiento: import.meta.env.VITE_WF_WHATSAPP_SEGUIMIENTO || 'JM3bEVBWajjmcCvV',
  },
  business: {
    name: 'JDDeveloper',
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
  { id: 'respondio', label: 'Respondió', color: '#f38744', probability: 0.35 },
  { id: 'reunion', label: 'Reunión Agendada', color: '#ff7448', probability: 0.55 },
  { id: 'propuesta', label: 'Propuesta Enviada', color: '#ef6820', probability: 0.7 },
  { id: 'negociacion', label: 'Negociación', color: '#f59e0b', probability: 0.85 },
  { id: 'ganado', label: 'Cerrado Ganado', color: '#16a34a', probability: 1 },
  { id: 'perdido', label: 'Cerrado Perdido', color: '#ff4848', probability: 0 },
] as const

export const DEFAULT_NICHES = [
  { id: 'real-estate', nombre: 'Real Estate', emoji: '🏠', color: '#ff7448' },
  { id: 'restaurantes', nombre: 'Restaurantes', emoji: '🍽️', color: '#f38744' },
  { id: 'clinicas', nombre: 'Clínicas', emoji: '🏥', color: '#0082f3' },
  { id: 'abogados', nombre: 'Abogados', emoji: '⚖️', color: '#6248ff' },
  { id: 'fitness', nombre: 'Fitness', emoji: '💪', color: '#16a34a' },
  { id: 'otros', nombre: 'Otros', emoji: '📦', color: '#94a3b8' },
]
