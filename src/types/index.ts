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
  telefono2?: string          // Segundo teléfono / versión sin formato (Apify: phoneUnformatted)
  telefonos?: string[]        // Todos los teléfonos detectados por el scraping (migración 0025)
  email?: string              // Email Contacto (primer email si hay varios)
  emails?: string[]           // Todos los emails detectados (para elegir cuál usar)
  placeId?: string            // Google Place ID: clave de negocio para importar sin duplicar
  categoria?: string          // categoryName de Google Maps
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
  /**
   * Clave del hilo: el id del lead, o —si el mensaje no está emparejado con
   * ninguno— la dirección de correo en minúsculas. Ver `messagesService`.
   */
  idLead: string
  fecha: string
  canal: Channel
  tipo: string                // Tipo de mensaje
  /** Asunto del correo. Sin él el hilo no se puede leer. */
  asunto?: string
  /** Dirección del remitente, en los mensajes recibidos. */
  remitente?: string
  contenido: string           // Mensaje generado
  estadoEnvio?: string
  /** Motivo del fallo cuando `estadoEnvio === 'failed'`. */
  error?: string
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

/**
 * Medio de contacto del toque. `reunion` es la presencial; la remota es
 * `videollamada`. Los cinco primeros son los originales de la 0013 y no se
 * renombran: hay filas históricas con esos valores. Los cuatro últimos llegan
 * con la 0020.
 */
export type FollowUpTipo =
  | 'llamada' | 'email' | 'whatsapp' | 'reunion' | 'otro'
  | 'videollamada' | 'linkedin' | 'instagram' | 'sms'
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

  // --- Migración 0020 ---
  /** HH:MM. Opcional a propósito: "mañana, cuando pueda" es un toque válido. */
  hora?: string
  prioridad?: Priority
  /** Qué se busca del toque. Se escribe antes; `resultado` se rellena después. */
  resultadoEsperado?: string
  /** Notas privadas del equipo, distintas de `nota` (contexto del toque). */
  comentariosInternos?: string
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
  /** Contexto libre de la tarea (columna `descripcion`, existe desde la 0001). */
  descripcion?: string
  notas?: string
  /** Instante en que pasó a hecha; lo sella la BD (migración 0017). */
  completadaEn?: string
  /** Referencias externas (documento, diseño, ticket). Migración 0021. */
  enlaces?: string[]
  /**
   * Duración ESTIMADA en minutos. Distinta del tiempo realmente dedicado, que
   * vive en `time_entries`: el tiempo mide, no puntúa. Migración 0021.
   */
  duracionMin?: number
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
  /** Contexto libre: qué cuenta como avance y por qué existe (migración 0017). */
  descripcion?: string
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
  /** Prioridad declarada del objetivo (migración 0022). */
  prioridad?: Priority
  /**
   * Estado declarativo (migración 0022). No lo deriva el progreso: sirve para
   * pausar o cancelar un objetivo sin borrarlo ni perder su historial.
   */
  estado: GoalEstado
  /** Derivado en el cliente: si tiene hijas, su valor no se edita a mano. */
  tieneHijas: boolean
  creado?: string
  actualizado?: string
}

/** Estado declarativo de una meta (migración 0022). */
export type GoalEstado = 'activa' | 'pausada' | 'completada' | 'cancelada'

/** Bloque de la plantilla de horario diario. */
export interface HorarioBloque {
  id: string
  titulo: string
  /** Qué se hace exactamente en el bloque; el título es sólo la etiqueta. */
  descripcion?: string
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

// -------------------------------------------------------------
// REGISTRO DE TIEMPO (migración 0016)
// -------------------------------------------------------------

/** Medida en vivo (`cronometro`) o escrita a mano después (`manual`). */
export type TimeEntryFuente = 'cronometro' | 'manual'

/**
 * Un tramo de tiempo trabajado. Mide, no puntúa: parar el cronómetro NO suma
 * a ninguna meta — para eso están los +/− de la meta diaria y los bloques del
 * horario. Esto responde a "¿en qué se me fue el día?".
 *
 * `fecha` es la jornada a la que se imputa y la pone el cliente: el servidor
 * está en UTC y un tramo de las 23:30 pertenece al día de quien lo trabajó.
 */
// -----------------------------------------------------------
// CALENDARIO — migración 0018
// -----------------------------------------------------------

export type EventoTipo = 'evento' | 'reunion' | 'recordatorio'
/** Incluye 'urgente', que `Priority` (de 0001) no tiene. */
export type EventoPrioridad = 'baja' | 'media' | 'alta' | 'urgente'
export type EventoEstado = 'pendiente' | 'confirmado' | 'hecho' | 'cancelado'

/**
 * Lo que vive en el calendario por derecho propio. Las tareas, las metas y
 * los bloques del horario NO son eventos: el calendario los lee de su tabla
 * de siempre y los pinta al lado (ver `ItemCalendario`).
 */
export interface Evento {
  id: string
  titulo: string
  descripcion?: string
  notas?: string
  tipo: EventoTipo
  estado: EventoEstado
  /** ISO timestamptz: un evento sí es un instante absoluto. */
  inicio: string
  fin: string
  todoElDia: boolean
  color?: string
  prioridad?: EventoPrioridad
  categoria?: string
  etiquetas: string[]
  enlace?: string
  ubicacion?: string
  goalId?: string
  taskId?: string
  leadId?: string
  responsable?: string
  /** Presente sólo si el evento vino de (o se subió a) Google Calendar. */
  googleEventId?: string
  creado: string
  actualizado: string
}

export interface TimeEntry {
  id: string
  descripcion: string
  fecha: string             // YYYY-MM-DD
  inicio: string            // ISO timestamptz
  /** Ausente mientras el cronómetro corre. */
  fin?: string
  /** Ausente mientras el cronómetro corre; la calcula la BD, nunca el cliente. */
  duracionSeg?: number
  fuente: TimeEntryFuente
  goalId?: string
  bloqueId?: string
  taskId?: string
  responsable?: string
  notas?: string
  /**
   * Tipo de trabajo (reuniones, desarrollo, ventas...). Agrupa el tiempo, y es
   * una pregunta distinta de `goalId` («¿para qué objetivo?») y de
   * `descripcion` («¿qué cosa concreta?»). Migración 0019.
   */
  categoria?: string
}

/**
 * Fila de `v_tiempo_diario`: el tiempo ya agregado por día, responsable y
 * meta. Lo agrega la BD para que el dashboard de Métricas no se traiga miles
 * de tramos sueltos. Sólo cuenta tiempo cerrado.
 */
export interface TiempoDiario {
  fecha: string
  responsable?: string
  goalId?: string
  goalNombre?: string
  entradas: number
  segundos: number
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
