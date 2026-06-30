import type { Lead, Campaign, Message, ActivityEvent, EmailTemplate } from '@/types'

/**
 * Datos de ejemplo coherentes con el esquema real de las hojas.
 * Se usan como fallback cuando no hay VITE_GOOGLE_API_KEY configurada
 * o la lectura directa del Sheet falla, para que la UI sea siempre demostrable.
 */

const empresas = [
  ['Sunset Realty Miami', 'real-estate', 'Miami', 78, 'nuevo', 4500],
  ['Brickell Law Group', 'abogados', 'Miami', 84, 'contactado', 7200],
  ['Doral Family Clinic', 'clinicas', 'Doral', 62, 'seguimiento', 3800],
  ['La Pequeña Habana Grill', 'restaurantes', 'Miami', 45, 'respondio', 2600],
  ['Aventura Dental Care', 'clinicas', 'Aventura', 71, 'reunion', 5100],
  ['Coral Gables Properties', 'real-estate', 'Coral Gables', 90, 'propuesta', 9800],
  ['Wynwood Fitness Co', 'fitness', 'Miami', 38, 'nuevo', 2200],
  ['Kendall Legal Advisors', 'abogados', 'Kendall', 67, 'negociacion', 6400],
  ['Bayside Seafood House', 'restaurantes', 'Miami Beach', 55, 'contactado', 3100],
  ['Hialeah Smile Studio', 'clinicas', 'Hialeah', 73, 'ganado', 4900],
  ['Palmetto Realty Pros', 'real-estate', 'Palmetto Bay', 81, 'seguimiento', 5600],
  ['Little River Tacos', 'restaurantes', 'Miami', 41, 'perdido', 1800],
]

export const mockLeads: Lead[] = empresas.map(([empresa, nicho, ciudad, score, estado, valor], i) => ({
  id: `L-${1000 + i}`,
  fechaCaptura: `2026-06-${(i % 27) + 1}`.padStart(10, '0'),
  empresa: empresa as string,
  nicho: nicho as string,
  ciudad: ciudad as string,
  pais: 'USA',
  email: `contacto@${(empresa as string).toLowerCase().replace(/[^a-z]/g, '')}.com`,
  telefono: `+1 305 ${100 + i}-${1000 + i}`,
  web: `https://${(empresa as string).toLowerCase().replace(/[^a-z]/g, '')}.com`,
  whatsapp: `+1305${1000000 + i}`,
  pageSpeedMovil: 30 + ((i * 7) % 60),
  pageSpeedDesktop: 50 + ((i * 5) % 45),
  tieneSSL: i % 3 !== 0,
  diagnosticoIA: 'Sitio lento en móvil, sin CTA claro, diseño desactualizado.',
  score: score as number,
  fuente: 'Apify Google Maps',
  estado: estado as Lead['estado'],
  prioridad: (['alta', 'media', 'baja'] as const)[i % 3],
  canalPrincipal: (['email', 'whatsapp', 'instagram'] as const)[i % 3],
  valorEstimado: valor as number,
  responsable: 'JD',
  ultimaAccion: i % 2 ? 'Email enviado' : 'WhatsApp enviado',
  proximoSeguimiento: `2026-07-${(i % 27) + 1}`,
}))

export const mockCampaigns: Campaign[] = [
  { id: 'C-01', nombre: 'Real Estate Miami Q3', nicho: 'real-estate', ciudad: 'Miami', idioma: 'es', estado: 'activa', totalLeads: 120, enviados: 98, respondieron: 14, conversion: 14.3, valorGenerado: 18500 },
  { id: 'C-02', nombre: 'Restaurantes Brickell', nicho: 'restaurantes', ciudad: 'Miami', idioma: 'es', estado: 'activa', totalLeads: 64, enviados: 64, respondieron: 7, conversion: 10.9, valorGenerado: 6200 },
  { id: 'C-03', nombre: 'Clínicas Doral', nicho: 'clinicas', ciudad: 'Doral', idioma: 'es', estado: 'pausada', totalLeads: 40, enviados: 22, respondieron: 3, conversion: 13.6, valorGenerado: 4900 },
  { id: 'C-04', nombre: 'Abogados Kendall', nicho: 'abogados', ciudad: 'Kendall', idioma: 'es', estado: 'borrador', totalLeads: 0, enviados: 0, respondieron: 0, conversion: 0, valorGenerado: 0 },
]

export const mockMessages: Message[] = [
  { idLead: 'L-1003', fecha: '2026-06-27T14:20:00', canal: 'email', tipo: 'outreach', contenido: 'Hola, vi su restaurante y noté que la web tarda en cargar...', estadoEnvio: 'enviado', direccion: 'enviado' },
  { idLead: 'L-1003', fecha: '2026-06-28T09:10:00', canal: 'email', tipo: 'respuesta', contenido: '¿Cuánto costaría rehacer el sitio?', respuestaRecibida: 'sí', direccion: 'recibido' },
  { idLead: 'L-1004', fecha: '2026-06-28T11:00:00', canal: 'whatsapp', tipo: 'seguimiento', contenido: 'Le comparto una propuesta breve por aquí.', estadoEnvio: 'enviado', direccion: 'enviado' },
]

export const mockActivity: ActivityEvent[] = [
  { id: 'a1', type: 'email', title: 'Email enviado a Doral Family Clinic', timestamp: '2026-06-29T08:40:00' },
  { id: 'a2', type: 'lead', title: 'Nuevo lead: Sunset Realty Miami', detail: 'Score 78', timestamp: '2026-06-29T08:10:00' },
  { id: 'a3', type: 'pipeline', title: 'Coral Gables Properties → Propuesta Enviada', timestamp: '2026-06-28T18:30:00' },
  { id: 'a4', type: 'whatsapp', title: 'Respuesta de La Pequeña Habana Grill', detail: 'Interesado 🔥', timestamp: '2026-06-28T16:05:00' },
  { id: 'a5', type: 'workflow', title: 'Fase 3 - Envío de Emails ejecutado', detail: '12 emails', timestamp: '2026-06-28T09:00:00' },
  { id: 'a6', type: 'meeting', title: 'Reunión agendada con Aventura Dental Care', timestamp: '2026-06-27T15:00:00' },
]

export const mockTemplates: EmailTemplate[] = [
  { id: 'T-real-estate', nombre: 'Real Estate — Web lenta', nicho: 'real-estate', asunto: 'Su web de {{empresa}} pierde clientes en móvil', cuerpo: 'Hola {{nombre}},\n\nRevisé {{web}} y detecté {{problema_detectado}}. En JDDeveloper ayudamos a inmobiliarias de {{ciudad}} a captar más leads...\n\n— JDDeveloper' },
  { id: 'T-restaurantes', nombre: 'Restaurantes — Reservas online', nicho: 'restaurantes', asunto: '{{empresa}}: más reservas con una web rápida', cuerpo: 'Hola {{nombre}},\n\nNoté que {{web}} {{problema_detectado}}. Podemos modernizarla y agregar reservas online...\n\n— JDDeveloper' },
]
