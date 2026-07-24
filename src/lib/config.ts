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

export const DEFAULT_NICHES = [
  { id: 'real-estate', nombre: 'Real Estate', emoji: '🏠', color: '#ff7448' },
  { id: 'restaurantes', nombre: 'Restaurantes', emoji: '🍽️', color: '#f38744' },
  { id: 'clinicas', nombre: 'Clínicas', emoji: '🏥', color: '#0082f3' },
  { id: 'abogados', nombre: 'Abogados', emoji: '⚖️', color: '#6248ff' },
  { id: 'fitness', nombre: 'Fitness', emoji: '💪', color: '#16a34a' },
  { id: 'otros', nombre: 'Otros', emoji: '📦', color: '#94a3b8' },
]
