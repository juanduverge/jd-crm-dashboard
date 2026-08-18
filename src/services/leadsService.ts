import { supabase } from '@/lib/supabaseClient'
import { crmApi } from './crmApi'
import { RESPONSABLE_POR_DEFECTO } from '@/lib/equipo'
import type { Lead, Contact, ContactType, Note } from '@/types'

/**
 * leadsService — CRUD del módulo Leads (leads + contactos + notas) contra
 * Supabase (tabla `leads`, `contacts`, `notes`, RPCs de papelera).
 *
 * Pipeline (etapa/valor/prioridad/canal/responsable/próximo seguimiento) ya
 * vive en Supabase también: son columnas denormalizadas en la propia tabla
 * `leads` (ver migración 0008 y `pipelineService.ts`), porque un lead y su
 * oportunidad de pipeline son la misma fila. `pipeline_events` guarda el
 * historial append-only de cambios de etapa (auditoría), no el estado actual.
 *
 * `puntuarLead` / `analizarLead` siguen llamando al workflow n8n (Claude),
 * pero el resultado se persiste en Supabase (`leads.score`, `score_reasoning`)
 * en lugar de en la hoja de cálculo.
 */

interface LeadRow {
  id: string
  empresa: string
  nicho: string | null
  ciudad: string | null
  pais: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
  web: string | null
  email_contacto: string | null
  whatsapp: string | null
  instagram: string | null
  facebook: string | null
  linkedin: string | null
  google_maps: string | null
  cargo: string | null
  rating_google: number | null
  num_resenas: number | null
  pagespeed_movil: number | null
  pagespeed_desktop: number | null
  tiene_ssl: boolean | null
  diagnostico_ia: string | null
  score: number | null
  score_reasoning: string | null
  scored_at: string | null
  fuente: string | null
  notas: string | null
  etiquetas: string[] | null
  screenshot_url: string | null
  favorito: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
  // Pipeline (columnas denormalizadas; ver migración 0008).
  estado: string
  prioridad: string | null
  canal_principal: string | null
  fecha_primer_contacto: string | null
  proximo_seguimiento: string | null
  valor_estimado: number | null
  responsable: string | null
  probabilidad: number | null
  fecha_cierre_estimada: string | null
  score_manual: number | null
  // Archivo / cierre (migración 0013). Solo lectura desde aquí: se escriben
  // exclusivamente vía los RPCs cerrar_lead / reactivar_lead.
  cerrado_en: string | null
  motivo_cierre: string | null
  etapa_previa: string | null
  // Contacto derivado de `follow_ups` por trigger (migración 0028). Sólo
  // lectura: escribir aquí no sirve de nada, el trigger lo recalcula.
  touch_actual: number | null
  primer_contacto_en: string | null
  ultimo_contacto_en: string | null
  ultimo_contacto_tipo: string | null
  ultimo_contacto_resultado: string | null
  respondio_en: string | null
  // Datos del scraping (migración 0025). Apify ya los entregaba; hasta ahora
  // no había columna donde guardarlos y se perdían en el mapeo de n8n.
  place_id: string | null
  telefono_2: string | null
  telefonos: string[] | null
  emails: string[] | null
  categoria: string | null
  codigo_pais: string | null
  // Redes y procedencia (migración 0026). Las redes en plural las trae Apify
  // sólo cuando el actor recibe `scrapeContacts: true`.
  youtube: string | null
  tiktok: string | null
  twitter: string | null
  pinterest: string | null
  email_source: string | null
  phone_source: string | null
  social_source: string | null
  whatsapp_source: string | null
  last_enriched_at: string | null
  enrichment_status: string | null
}

/** El análisis IA (observaciones/recomendaciones/oportunidades/errores) se guarda como JSON en score_reasoning. */
interface ScoreReasoning {
  observaciones?: string
  recomendaciones?: string
  oportunidades?: string
  errores?: string
}

function parseReasoning(raw: string | null): ScoreReasoning {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Convierte una fila `leads` de Supabase (con sus columnas de pipeline) en un Lead completo. */
function rowToLead(row: LeadRow): Lead {
  const reasoning = parseReasoning(row.score_reasoning)
  const scoreIA = row.score ?? undefined
  const scoreManual = row.score_manual ?? undefined
  const score = Math.min(100, (scoreIA ?? 0) + (scoreManual ?? 0))
  return {
    id: row.id,
    fechaCaptura: row.created_at?.slice(0, 10),
    empresa: row.empresa,
    cargo: row.cargo ?? undefined,
    nicho: row.nicho ?? undefined,
    ciudad: row.ciudad ?? undefined,
    pais: row.pais ?? undefined,
    direccion: row.direccion ?? undefined,
    telefono: row.telefono ?? undefined,
    telefono2: row.telefono_2 ?? undefined,
    // Todos los teléfonos que trajo el scraping, sin perder el principal.
    telefonos: [...new Set([row.telefono, row.telefono_2, ...(row.telefonos ?? [])].filter((t): t is string => !!t))],
    email: row.email_contacto || row.email || (row.emails?.[0] ?? undefined),
    // `emails` era una lista de dos elementos cosida a mano a partir de las
    // dos columnas escalares. Ahora incluye también el array real de la BD
    // (0025), que es donde caen los correos que Apify encuentra en la web.
    emails: [...new Set([row.email_contacto, row.email, ...(row.emails ?? [])].filter((e): e is string => !!e))],
    placeId: row.place_id ?? undefined,
    categoria: row.categoria ?? undefined,
    web: row.web ?? undefined,
    whatsapp: row.whatsapp ?? undefined,
    instagram: row.instagram ?? undefined,
    facebook: row.facebook ?? undefined,
    linkedin: row.linkedin ?? undefined,
    youtube: row.youtube ?? undefined,
    tiktok: row.tiktok ?? undefined,
    twitter: row.twitter ?? undefined,
    pinterest: row.pinterest ?? undefined,
    googleMaps: row.google_maps ?? undefined,
    emailSource: row.email_source ?? undefined,
    phoneSource: row.phone_source ?? undefined,
    socialSource: row.social_source ?? undefined,
    whatsappSource: row.whatsapp_source ?? undefined,
    lastEnrichedAt: row.last_enriched_at ?? undefined,
    enrichmentStatus: row.enrichment_status ?? undefined,
    etiquetas: row.etiquetas ?? [],
    ratingGoogle: row.rating_google ?? undefined,
    numResenas: row.num_resenas ?? undefined,
    pageSpeedMovil: row.pagespeed_movil ?? undefined,
    pageSpeedDesktop: row.pagespeed_desktop ?? undefined,
    tieneSSL: row.tiene_ssl ?? undefined,
    diagnosticoIA: row.diagnostico_ia ?? undefined,
    scoreIA,
    scoreManual,
    observacionesIA: reasoning.observaciones,
    recomendacionesIA: reasoning.recomendaciones,
    oportunidadesIA: reasoning.oportunidades,
    erroresIA: reasoning.errores,
    score,
    fuente: row.fuente ?? undefined,
    notas: row.notas ?? undefined,
    screenshotUrl: row.screenshot_url ?? undefined,
    // Pipeline (columnas denormalizadas en `leads`; ver migración 0008).
    estado: (row.estado as Lead['estado']) || 'nuevo',
    prioridad: (row.prioridad as Lead['prioridad']) || 'media',
    canalPrincipal: (row.canal_principal as Lead['canalPrincipal']) || 'email',
    valorEstimado: row.valor_estimado ?? 0,
    probabilidad: row.probabilidad ?? undefined,
    fechaCierreEstimada: row.fecha_cierre_estimada ?? undefined,
    responsable: row.responsable || RESPONSABLE_POR_DEFECTO,
    proximoSeguimiento: row.proximo_seguimiento ?? undefined,
    ultimaAccion: row.updated_at,
    favorito: row.favorito,
    // Archivo / cierre (migración 0013).
    cerradoEn: row.cerrado_en ?? undefined,
    motivoCierre: row.motivo_cierre ?? undefined,
    etapaPrevia: (row.etapa_previa as Lead['etapaPrevia']) ?? undefined,
    // Contacto (migración 0028). `touch_actual` cae a 0 y no a undefined: un
    // lead sin contactar tiene cero toques, que es un dato, no una ausencia.
    touchActual: row.touch_actual ?? 0,
    primerContactoEn: row.primer_contacto_en ?? undefined,
    ultimoContactoEn: row.ultimo_contacto_en ?? undefined,
    ultimoContactoTipo: (row.ultimo_contacto_tipo as Lead['ultimoContactoTipo']) ?? undefined,
    ultimoContactoResultado: (row.ultimo_contacto_resultado as Lead['ultimoContactoResultado']) ?? undefined,
    respondioEn: row.respondio_en ?? undefined,
  }
}

/** Traduce los campos "propios" del lead (no-pipeline) a columnas de la tabla `leads`. */
function leadPatchToRow(patch: Partial<Lead>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (patch.empresa !== undefined) row.empresa = patch.empresa
  if (patch.cargo !== undefined) row.cargo = patch.cargo
  if (patch.nicho !== undefined) row.nicho = patch.nicho
  if (patch.ciudad !== undefined) row.ciudad = patch.ciudad
  if (patch.pais !== undefined) row.pais = patch.pais
  if (patch.direccion !== undefined) row.direccion = patch.direccion
  if (patch.telefono !== undefined) row.telefono = patch.telefono
  if (patch.email !== undefined) row.email_contacto = patch.email
  if (patch.web !== undefined) row.web = patch.web
  if (patch.whatsapp !== undefined) row.whatsapp = patch.whatsapp
  if (patch.instagram !== undefined) row.instagram = patch.instagram
  if (patch.facebook !== undefined) row.facebook = patch.facebook
  if (patch.linkedin !== undefined) row.linkedin = patch.linkedin
  if (patch.youtube !== undefined) row.youtube = patch.youtube
  if (patch.tiktok !== undefined) row.tiktok = patch.tiktok
  if (patch.twitter !== undefined) row.twitter = patch.twitter
  if (patch.pinterest !== undefined) row.pinterest = patch.pinterest
  if (patch.googleMaps !== undefined) row.google_maps = patch.googleMaps
  if (patch.ratingGoogle !== undefined) row.rating_google = patch.ratingGoogle
  if (patch.numResenas !== undefined) row.num_resenas = patch.numResenas
  if (patch.pageSpeedMovil !== undefined) row.pagespeed_movil = patch.pageSpeedMovil
  if (patch.pageSpeedDesktop !== undefined) row.pagespeed_desktop = patch.pageSpeedDesktop
  if (patch.tieneSSL !== undefined) row.tiene_ssl = patch.tieneSSL
  if (patch.diagnosticoIA !== undefined) row.diagnostico_ia = patch.diagnosticoIA
  if (patch.fuente !== undefined) row.fuente = patch.fuente
  if (patch.notas !== undefined) row.notas = patch.notas
  if (patch.etiquetas !== undefined) row.etiquetas = patch.etiquetas
  if (patch.screenshotUrl !== undefined) row.screenshot_url = patch.screenshotUrl
  if (patch.favorito !== undefined) row.favorito = patch.favorito
  // Pipeline (columnas denormalizadas en `leads`; ver migración 0008 y pipelineService.ts).
  if (patch.estado !== undefined) row.estado = patch.estado
  if (patch.prioridad !== undefined) row.prioridad = patch.prioridad
  if (patch.canalPrincipal !== undefined) row.canal_principal = patch.canalPrincipal
  if (patch.valorEstimado !== undefined) row.valor_estimado = patch.valorEstimado
  if (patch.responsable !== undefined) row.responsable = patch.responsable
  if (patch.proximoSeguimiento !== undefined) row.proximo_seguimiento = patch.proximoSeguimiento || null
  if (patch.probabilidad !== undefined) row.probabilidad = patch.probabilidad
  if (patch.fechaCierreEstimada !== undefined) row.fecha_cierre_estimada = patch.fechaCierreEstimada || null
  if (patch.scoreManual !== undefined) row.score_manual = patch.scoreManual
  return row
}

async function currentUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

/**
 * Resumen de una corrida de `importar_leads` (tabla `lead_imports`). Sirve para
 * explicar el hueco entre "Apify encontro 20" y "en el CRM aparecen 16": la
 * diferencia son leads ya conocidos (actualizados) o descartados, y el motivo
 * de cada descarte queda en `detalle`.
 */
export interface LeadImport {
  id: string
  fecha: string
  fuente: string
  consulta?: string
  recibidos: number
  insertados: number
  actualizados: number
  descartados: number
  motivos: { motivo: string; empresa?: string; cantidad: number }[]
}

function rowToImport(r: any): LeadImport {
  const detalle: any[] = Array.isArray(r.detalle) ? r.detalle : []
  const conteo = new Map<string, { motivo: string; empresa?: string; cantidad: number }>()
  for (const d of detalle) {
    const motivo = String(d?.motivo ?? 'sin motivo')
    const prev = conteo.get(motivo)
    if (prev) prev.cantidad += 1
    else conteo.set(motivo, { motivo, empresa: d?.empresa, cantidad: 1 })
  }
  return {
    id: r.id,
    fecha: r.created_at,
    fuente: r.fuente ?? 'google_maps',
    consulta: r.consulta ?? undefined,
    recibidos: r.recibidos ?? 0,
    insertados: r.insertados ?? 0,
    actualizados: r.actualizados ?? 0,
    descartados: r.descartados ?? 0,
    motivos: [...conteo.values()].sort((a, b) => b.cantidad - a.cantidad),
  }
}

export const leadsService = {
  /** Ultima importacion de Apify, para saber que paso con el lote completo. */
  async getUltimaImportacion(): Promise<LeadImport | null> {
    const { data, error } = await supabase
      .from('lead_imports')
      .select('id, created_at, fuente, consulta, recibidos, insertados, actualizados, descartados, detalle')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data ? rowToImport(data) : null
  },

  /** Lee los leads activos de Supabase (incluye sus columnas de pipeline). */
  async getLeads(): Promise<Lead[]> {
    const { data: rows, error } = await supabase
      .from('leads')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (rows ?? []).map((r) => rowToLead(r as LeadRow))
  },

  /** Crea un lead nuevo en Supabase (incluye sus campos de pipeline si vienen en el patch). */
  async createLead(patch: Partial<Lead>): Promise<Lead> {
    const row = leadPatchToRow(patch)
    if (!row.empresa) throw new Error('empresa es obligatoria')
    if (row.estado === undefined) row.estado = 'nuevo'
    const { data, error } = await supabase.from('leads').insert(row).select().single()
    if (error) throw error
    return rowToLead(data as LeadRow)
  },

  /** Edita los campos de un lead (propios + pipeline) en Supabase. */
  async updateLead(id: string, patch: Partial<Lead>): Promise<Lead> {
    const row = leadPatchToRow(patch)
    const { data, error } = await supabase.from('leads').update(row).eq('id', id).select().single()
    if (error) throw error
    return rowToLead(data as LeadRow)
  },

  async toggleFavorito(id: string, favorito: boolean): Promise<void> {
    const { error } = await supabase.from('leads').update({ favorito }).eq('id', id)
    if (error) throw error
  },

  async deleteLead(id: string): Promise<void> {
    const { error } = await supabase.rpc('soft_delete_lead', { p_id: id })
    if (error) throw error
  },

  async restoreLead(id: string): Promise<void> {
    const { error } = await supabase.rpc('restore_lead', { p_id: id })
    if (error) throw error
  },

  async purgeLead(id: string): Promise<void> {
    const { error } = await supabase.rpc('purge_lead', { p_id: id })
    if (error) throw error
  },

  /** Puntuación IA bajo demanda (Claude vía n8n); el resultado se guarda en Supabase. */
  async puntuarLead(payload: {
    leadId: string; empresa?: string; nicho?: string; web?: string
    pageSpeedMovil?: number; pageSpeedDesktop?: number; tieneSSL?: boolean
    ratingGoogle?: number; numResenas?: number
  }): Promise<{ ok: boolean; scoreIA: number }> {
    const r = await crmApi.puntuarLead(payload)
    const { error } = await supabase
      .from('leads')
      .update({ score: r.scoreIA, scored_at: new Date().toISOString() })
      .eq('id', payload.leadId)
    if (error) throw error
    return r
  },

  /** Análisis IA completo (Claude vía n8n); el resultado se guarda en Supabase (score_reasoning en JSON). */
  async analizarLead(payload: {
    leadId: string; empresa?: string; nicho?: string; web?: string; score?: number
    pageSpeedMovil?: number; pageSpeedDesktop?: number; tieneSSL?: boolean
    ratingGoogle?: number; numResenas?: number; diagnosticoIA?: string; notas?: string
  }): Promise<{ ok: boolean; scoreIA: number; observaciones: string; recomendaciones: string; oportunidades: string; errores: string }> {
    const r = await crmApi.analizarLead(payload)
    const reasoning: ScoreReasoning = {
      observaciones: r.observaciones, recomendaciones: r.recomendaciones,
      oportunidades: r.oportunidades, errores: r.errores,
    }
    const { error } = await supabase
      .from('leads')
      .update({ score: r.scoreIA, score_reasoning: JSON.stringify(reasoning), scored_at: new Date().toISOString() })
      .eq('id', payload.leadId)
    if (error) throw error
    return r
  },

  // ---- Contactos --------------------------------------------------------

  async getContacts(leadId: string): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      nombre: r.nombre || '(sin nombre)',
      cargo: r.cargo ?? undefined,
      email: r.email ?? undefined,
      telefono: r.telefono ?? undefined,
      tipo: (r.tipo as ContactType) || 'otro',
      notas: r.notas ?? undefined,
      creado: r.created_at,
    }))
  },

  async createContact(payload: { leadId: string; nombre: string; cargo?: string; email?: string; telefono?: string; tipo?: string; notas?: string }): Promise<{ ok: boolean; id: string }> {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        lead_id: payload.leadId, nombre: payload.nombre, cargo: payload.cargo || null,
        email: payload.email || null, telefono: payload.telefono || null,
        tipo: payload.tipo || 'otro', notas: payload.notas || null,
      })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: data.id }
  },

  async updateContact(payload: { leadId: string; id: string; nombre?: string; cargo?: string; email?: string; telefono?: string; tipo?: string; notas?: string }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (payload.nombre !== undefined) row.nombre = payload.nombre
    if (payload.cargo !== undefined) row.cargo = payload.cargo || null
    if (payload.email !== undefined) row.email = payload.email || null
    if (payload.telefono !== undefined) row.telefono = payload.telefono || null
    if (payload.tipo !== undefined) row.tipo = payload.tipo
    if (payload.notas !== undefined) row.notas = payload.notas || null
    const { error } = await supabase.from('contacts').update(row).eq('id', payload.id)
    if (error) throw error
  },

  async deleteContact(payload: { leadId: string; id: string }): Promise<void> {
    const { error } = await supabase.from('contacts').update({ deleted_at: new Date().toISOString() }).eq('id', payload.id)
    if (error) throw error
  },

  // ---- Notas --------------------------------------------------------------

  async getNotes(leadId: string): Promise<Note[]> {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      autor: r.autor || RESPONSABLE_POR_DEFECTO,
      texto: r.contenido || '',
      creado: r.created_at,
      editado: r.updated_at ?? undefined,
      fueEditado: !!r.updated_at,
    }))
  },

  async createNote(payload: { leadId: string; autor?: string; texto: string }): Promise<{ ok: boolean; id: string }> {
    const user = await currentUser()
    const { data, error } = await supabase
      .from('notes')
      .insert({ lead_id: payload.leadId, contenido: payload.texto, created_by: user?.id ?? null, autor: payload.autor ?? user?.email ?? RESPONSABLE_POR_DEFECTO })
      .select('id')
      .single()
    if (error) throw error
    return { ok: true, id: data.id }
  },

  async updateNote(payload: { leadId: string; id: string; texto: string }): Promise<void> {
    const { error } = await supabase
      .from('notes')
      .update({ contenido: payload.texto, updated_at: new Date().toISOString() })
      .eq('id', payload.id)
    if (error) throw error
  },

  async deleteNote(payload: { leadId: string; id: string }): Promise<void> {
    const { error } = await supabase.from('notes').update({ deleted_at: new Date().toISOString() }).eq('id', payload.id)
    if (error) throw error
  },
}

export default leadsService
