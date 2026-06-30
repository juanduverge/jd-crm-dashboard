/**
 * Tipos del dominio CRM JDDeveloper.
 * Mapeados a las hojas reales del Google Sheet:
 *   prospects, outreach, pipeline, messages, config
 */

export type LeadStatus =
  | 'nuevo'
  | 'contactado'
  | 'seguimiento'
  | 'respondio'
  | 'reunion'
  | 'propuesta'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

export type Channel = 'email' | 'whatsapp' | 'instagram' | 'linkedin'

export type Priority = 'alta' | 'media' | 'baja'

/** Lead = fila de la hoja "prospects" enriquecida con pipeline */
export interface Lead {
  id: string                  // ID Lead
  fechaCaptura?: string
  empresa: string             // Nombre empresa
  nicho?: string              // Categoria / nicho
  ciudad?: string
  pais?: string
  direccion?: string
  telefono?: string
  email?: string              // Email Contacto
  web?: string                // Sitio web
  whatsapp?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  googleMaps?: string
  ratingGoogle?: number
  numResenas?: number
  pageSpeedMovil?: number
  pageSpeedDesktop?: number
  tieneSSL?: boolean
  diagnosticoIA?: string
  score: number               // Score lead (0-100) / Score Final Combinado
  fuente?: string             // Fuente Apify
  notas?: string
  screenshotUrl?: string
  // Pipeline
  estado: LeadStatus
  prioridad?: Priority
  canalPrincipal?: Channel
  valorEstimado?: number      // Valor estimado (USD)
  responsable?: string
  ultimaAccion?: string
  proximoSeguimiento?: string
  fechaUltimoMovimiento?: string   // ISO; cuándo entró a la etapa actual (para "días en columna")
}

/** Mensaje = fila de la hoja "messages" */
export interface Message {
  idLead: string
  fecha: string
  canal: Channel
  tipo: string                // Tipo de mensaje
  contenido: string           // Mensaje generado
  estadoEnvio?: string
  respuestaRecibida?: string
  direccion?: 'enviado' | 'recibido'
}

export type CampaignStatus = 'borrador' | 'activa' | 'pausada' | 'completada'

export interface CampaignEvent {
  label: string
  timestamp: string
}

export interface Campaign {
  id: string
  nombre: string
  nicho: string
  ciudad?: string
  idioma?: 'es' | 'en'
  estado: CampaignStatus
  totalLeads: number
  enviados: number
  respondieron: number
  conversion: number          // %
  valorGenerado: number       // USD
  templateId?: string
  createdAt?: string
  leadIds?: string[]
  scheduledAt?: string        // ISO; vacío = enviar ahora
  events?: CampaignEvent[]
}

export interface EmailTemplate {
  id: string
  nombre: string
  nicho?: string
  asunto: string
  cuerpo: string
  variante?: 'A' | 'B'
}

export interface WorkflowInfo {
  id: string
  name: string
  active: boolean
  description?: string
  updatedAt?: string
  lastExecution?: { status: 'success' | 'error' | 'running'; startedAt: string } | null
}

export interface ActivityEvent {
  id: string
  type: 'email' | 'whatsapp' | 'lead' | 'workflow' | 'pipeline' | 'meeting'
  title: string
  detail?: string
  timestamp: string
}

export interface Kpi {
  key: string
  label: string
  value: number
  format?: 'number' | 'currency' | 'percent'
  change?: number             // % vs mes anterior
  spark?: number[]
}

export interface NicheConfig {
  id: string
  nombre: string
  emoji: string
  color: string
}

export interface PipelineStage {
  id: LeadStatus
  label: string
  color: string
  probability: number         // 0-1 para forecast
}
