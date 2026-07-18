/** Configuración central leída de variables de entorno (Vite). */

export const config = {
  n8n: {
    url: import.meta.env.VITE_N8N_URL || 'http://localhost:5678',
    // La API key de n8n NUNCA se lee en el cliente (no hay VITE_N8N_API_KEY
    // aquí): la inyecta nginx server-side en el proxy /n8n-api. Ver n8nService.ts.
    // En dev usamos el proxy de vite (/n8n-api) para evitar CORS. En prod el
    // dashboard habla directo con VITE_N8N_URL (backoffice). Sacar la API key
    // del bundle vía proxy nginx queda para la fase de CI/CD — ver
    // deploy/nginx.conf.template y docs/SEGURIDAD_FASE2.md.
    // La API de n8n va SIEMPRE por ruta relativa: en dev la proxia vite, en prod
    // la proxia el nginx del dashboard (server-side, inyecta X-N8N-API-KEY y llega
    // a n8n por red interna). Así no depende de que el navegador alcance backoffice
    // (protegido por Access) y la API key sale del bundle.
    base: '/n8n-api',
    // Los webhooks (CRM API) siguen yendo a backoffice directamente (tienen su
    // bypass de Access y funcionan). El formulario web también postea ahí.
    hookBase: import.meta.env.DEV ? '/n8n-hook' : `${import.meta.env.VITE_N8N_URL || 'http://localhost:5678'}/webhook`,
    hookToken: import.meta.env.VITE_N8N_HOOK_TOKEN || '',
  },
  workflows: {
    envioEmails: import.meta.env.VITE_WF_ENVIO_EMAILS || 'ITdsEWd94R8ptUlb',
    seguimientoEmail: import.meta.env.VITE_WF_SEGUIMIENTO_EMAIL || 'ZMQkvDXtD2tdMuYN',
    whatsappSeguimiento: import.meta.env.VITE_WF_WHATSAPP_SEGUIMIENTO || 'JM3bEVBWajjmcCvV',
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

export const DEFAULT_NICHES = [
  { id: 'real-estate', nombre: 'Real Estate', emoji: '🏠', color: '#ff7448' },
  { id: 'restaurantes', nombre: 'Restaurantes', emoji: '🍽️', color: '#f38744' },
  { id: 'clinicas', nombre: 'Clínicas', emoji: '🏥', color: '#0082f3' },
  { id: 'abogados', nombre: 'Abogados', emoji: '⚖️', color: '#6248ff' },
  { id: 'fitness', nombre: 'Fitness', emoji: '💪', color: '#16a34a' },
  { id: 'otros', nombre: 'Otros', emoji: '📦', color: '#94a3b8' },
]
