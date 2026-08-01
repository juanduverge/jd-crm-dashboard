/**
 * Tipos del dominio CRM JD Developer.
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
  cargo?: string              // Cargo del contacto principal (col Cargo)
  nicho?: string              // Categoria / nicho
  ciudad?: string
  pais?: string
  direccion?: string
  telefono?: string
  email?: string              // Email Contacto (primer email si hay varios en la celda)
  emails?: string[]           // Todos los emails detectados en la celda (para elegir cuál usar)
  web?: string                // Sitio web
  whatsapp?: string
  instagram?: string
  facebook?: string
  linkedin?: string
  googleMaps?: string
  etiquetas?: string[]        // Etiquetas libres (col Etiquetas, separadas por coma)
  ratingGoogle?: number
  numResenas?: number
  pageSpeedMovil?: number
  pageSpeedDesktop?: number
  tieneSSL?: boolean
  diagnosticoIA?: string
  scoreIA?: number             // Puntuación IA (0-100), botón manual "Puntuación IA"
  scoreManual?: number         // Puntuación Manual (0-100); col 'Score Manual' en pipeline
  observacionesIA?: string
  recomendacionesIA?: string
  oportunidadesIA?: string
  erroresIA?: string
  score: number               // Score lead (0-100) / Score Final Combinado
  fuente?: string             // Fuente Apify
  notas?: string
  screenshotUrl?: string
  // Pipeline
  estado: LeadStatus
  prioridad?: Priority
  canalPrincipal?: Channel
  valorEstimado?: number      // Valor estimado (USD)
  probabilidad?: number       // % de cierre (override de la etapa); col Probabilidad
  fechaCierreEstimada?: string // Fecha estimada de cierre; col Fecha cierre estimada
  responsable?: string
  ultimaAccion?: string
  proximoSeguimiento?: string
  fechaUltimoMovimiento?: string   // ISO; cuándo entró a la etapa actual (para "días en columna")
  favorito?: boolean          // Marcado como favorito (col Favorito en pipeline)
  // Archivo / cierre (ver migración 0013). Un lead está archivado cuando
  // `estado` es 'ganado' o 'perdido'; estos campos guardan el contexto del
  // cierre y permiten reactivarlo a su etapa previa sin perder historial.
  cerradoEn?: string          // ISO; cuándo pasó a ganado/perdido
  motivoCierre?: string       // Por qué se cerró
  etapaPrevia?: LeadStatus    // Etapa desde la que se cerró (destino al reactivar)
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

/** Email = fila de la hoja "inbox" (leída vía IMAP, sin marcar como leído en el servidor) */
export interface InboxMessage {
  id: string           // ID Msg
  fecha: string
  deEmail: string      // De Email
  deNombre?: string     // De Nombre
  asunto: string
  cuerpo: string
  idLead?: string       // ID Lead (vacío si no coincide con ningún lead conocido)
  leido: boolean        // Leido (estado local de la app, no del servidor IMAP)
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

export type WebLeadStatus = 'nuevo' | 'en_proceso' | 'respondido' | 'cerrado'
export type WebLeadPriority = 'baja' | 'media' | 'alta' | 'urgente'

/** Solicitud recibida desde el formulario de la web pública (hoja "web_leads"). */
export interface WebLead {
  id: string
  fechaHora: string
  nombre: string
  email: string
  empresa?: string
  telefono?: string
  asunto?: string
  mensaje: string
  pagina?: string
  url?: string
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  ip?: string
  userAgent?: string
  fuente: string
  formulario?: string
  estado: WebLeadStatus
  prioridad: WebLeadPriority
  etiquetas: string[]
  responsable?: string
  notasInternas?: string
  actualizado?: string
}

export type FollowUpTipo = 'llamada' | 'email' | 'whatsapp' | 'reunion' | 'otro'
export type FollowUpEstado = 'pendiente' | 'completado' | 'cancelado'
export type FollowUpResultado = 'positivo' | 'negativo' | 'sin_respuesta'
/** Urgencia derivada en SQL por la vista `follow_ups_agenda`. */
export type FollowUpUrgencia = 'vencido' | 'hoy' | 'proximo'

/**
 * Seguimiento (tabla `follow_ups`, migración 0013). Entidad propia, no un
 * campo del lead: un lead tiene VARIOS en su historial (secuencia de toques),
 * pero solo UNO pendiente a la vez (índice único en la BD).
 *
 * Distinto de `Tarea`: una Tarea es un to-do suelto del equipo; un FollowUp es
 * un toque comercial de la secuencia sobre un lead, con resultado registrado.
 */
export interface FollowUp {
  id: string
  leadId: string
  fechaProgramada: string     // YYYY-MM-DD
  tipo: FollowUpTipo
  nota?: string
  estado: FollowUpEstado
  resultado?: FollowUpResultado  // solo si estado = 'completado'
  orden: number               // nº de toque en la secuencia (1, 2, 3...)
  responsable?: string
  creadoEn?: string           // ISO
  completadoEn?: string       // ISO; solo si estado = 'completado'
}

/** Fila de la vista `follow_ups_agenda`: follow-up pendiente + datos del lead. */
export interface FollowUpAgendaItem extends FollowUp {
  estado: 'pendiente'
  leadEmpresa: string
  leadEstado: LeadStatus
  leadPrioridad?: Priority
  leadTelefono?: string
  leadEmail?: string
  leadWhatsapp?: string
  urgencia: FollowUpUrgencia
  diasVencido: number         // >0 si está vencido, 0 hoy, <0 si es futuro
}

export type TareaEstado = 'pendiente' | 'en_progreso' | 'hecha'
export type TareaTipo = 'seguimiento' | 'llamada' | 'email' | 'reunion' | 'whatsapp' | 'otro'
/** Bloque del tablero: prioritaria / secundaria / idea (migración 0015). */
export type TareaSeccion = 'prioritaria' | 'secundaria' | 'idea'

/** Tarea / seguimiento manual (hoja "tareas"). Nunca envía nada por sí sola. */
export interface Tarea {
  id: string
  titulo: string
  tipo: TareaTipo
  leadId?: string
  leadNombre?: string
  fechaVencimiento?: string
  estado: TareaEstado
  prioridad: WebLeadPriority
  seccion: TareaSeccion
  /** Meta a la que alimenta esta tarea, si está ligada a una (opcional). */
  goalId?: string
  responsable?: string
  notas?: string
  creado?: string
  actualizado?: string
}

// -------------------------------------------------------------
// METAS / HORARIO — módulo Tareas (migración 0015)
// -------------------------------------------------------------

export type GoalPeriodo = 'mes' | 'semana' | 'dia'
export type GoalTipo = 'contador' | 'toggle'

/**
 * Meta numérica con progreso, en cascada mes -> semana -> día.
 *
 * `valorActual` de una meta con hijas es SIEMPRE la suma de sus hijas (lo
 * garantiza un trigger en la BD): el avance se registra una sola vez, en la
 * meta diaria, y sube solo. Por eso la UI sólo ofrece +/− en metas hoja
 * (`tieneHijas === false`).
 */
export interface Goal {
  id: string
  nombre: string
  periodo: GoalPeriodo
  parentId?: string
  tipo: GoalTipo
  target: number
  valorActual: number
  unidad?: string
  fechaInicio: string   // YYYY-MM-DD
  fechaFin: string      // YYYY-MM-DD
  responsable?: string
  orden: number
  /** Derivado en el cliente: si tiene hijas, su valor no se edita a mano. */
  tieneHijas: boolean
  creado?: string
  actualizado?: string
}

/** Bloque de la plantilla de horario diario. */
export interface HorarioBloque {
  id: string
  titulo: string
  horaInicio: string        // HH:MM
  horaFin: string           // HH:MM
  diasSemana: number[]      // ISO dow: 1 = lunes ... 7 = domingo
  /** Meta mensual que alimenta el bloque al completarlo (opcional). */
  goalId?: string
  aporte: number
  orden: number
  activo: boolean
}

/** Bloque del horario resuelto para un día concreto, con su estado. */
export interface HorarioBloqueDia extends HorarioBloque {
  completado: boolean
}

export type ContactType = 'principal' | 'ventas' | 'soporte' | 'facturacion' | 'personal' | 'otro'

/** Contacto = fila de la hoja "contactos" (varios contactos por lead) */
export interface Contact {
  id: string           // ID Contacto
  leadId: string        // ID Lead
  nombre: string
  cargo?: string
  email?: string
  telefono?: string
  tipo: ContactType
  notas?: string
  creado?: string       // Fecha creacion
}

/** Nota = fila de la hoja "notas" (historial de notas por lead) */
export interface Note {
  id: string           // ID Nota
  leadId: string        // ID Lead
  autor: string
  texto: string
  creado: string        // Fecha creacion
  editado?: string       // Fecha edicion
  fueEditado: boolean
}

export type TrashModule = 'lead' | 'pipeline' | 'campaign' | 'tarea' | 'web_lead'

/** Registro eliminado (soft-delete) pendiente de purga, mostrado en la Papelera. */
export interface TrashItem {
  /** id compuesto único (módulo + id real), para usarlo como key de lista. */
  key: string
  module: TrashModule
  id: string
  label: string
  detail?: string
  eliminadoEn?: string
  eliminadoPor?: string
}
