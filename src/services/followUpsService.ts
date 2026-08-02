import { supabase } from '@/lib/supabaseClient'
import type {
  FollowUp, FollowUpAgendaItem, FollowUpResultado, FollowUpTipo, LeadStatus,
} from '@/types'

/**
 * followUpsService — Módulo Seguimientos contra Supabase (migración 0013).
 *
 * Diseño: a diferencia del pipeline (que vive denormalizado dentro de `leads`),
 * un seguimiento SÍ es una entidad propia: un lead tiene varios en su historial
 * — la secuencia de 3-4 toques — y solo uno pendiente a la vez.
 *
 * Las mutaciones van por RPC en vez de UPDATE directo porque cada una es
 * compuesta y debe ser atómica: completar libera el hueco del pendiente,
 * programar calcula el `orden` de la secuencia, y cerrar un lead además cancela
 * su seguimiento pendiente y deja rastro en `pipeline_events`. Mismo patrón que
 * los RPCs de 0003_functions.sql (convert_web_lead, soft_delete_lead...).
 *
 * `leads.proximo_seguimiento` se mantiene sola, por trigger en la BD: no hay
 * que escribirla desde aquí, y la UI que ya la leía sigue funcionando igual.
 */

interface FollowUpRow {
  id: string
  lead_id: string
  fecha_programada: string
  tipo: string
  nota: string | null
  estado: string
  resultado: string | null
  orden: number
  responsable: string | null
  created_at: string
  completed_at: string | null
  // Migración 0020
  hora: string | null
  prioridad: string | null
  resultado_esperado: string | null
  comentarios_internos: string | null
}

interface AgendaRow extends Omit<FollowUpRow, 'resultado' | 'completed_at'> {
  lead_empresa: string
  lead_estado: string
  lead_prioridad: string | null
  lead_telefono: string | null
  lead_email: string | null
  lead_whatsapp: string | null
  urgencia: string
  dias_vencido: number
}

function rowToFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    leadId: row.lead_id,
    fechaProgramada: row.fecha_programada,
    tipo: row.tipo as FollowUpTipo,
    nota: row.nota ?? undefined,
    estado: row.estado as FollowUp['estado'],
    resultado: (row.resultado as FollowUp['resultado']) ?? undefined,
    orden: row.orden,
    responsable: row.responsable ?? undefined,
    creadoEn: row.created_at,
    completadoEn: row.completed_at ?? undefined,
    ...camposEditables(row),
  }
}

/**
 * Los cuatro campos de la 0020. Se extraen aparte porque la agenda y el
 * historial los mapean igual, y `hora` llega de Postgres como 'HH:MM:SS':
 * la UI trabaja con 'HH:MM', que es lo que acepta un input[type=time].
 */
function camposEditables(row: Pick<FollowUpRow, 'hora' | 'prioridad' | 'resultado_esperado' | 'comentarios_internos'>) {
  return {
    hora: row.hora ? row.hora.slice(0, 5) : undefined,
    prioridad: (row.prioridad as FollowUp['prioridad']) ?? undefined,
    resultadoEsperado: row.resultado_esperado ?? undefined,
    comentariosInternos: row.comentarios_internos ?? undefined,
  }
}

function rowToAgendaItem(row: AgendaRow): FollowUpAgendaItem {
  return {
    id: row.id,
    leadId: row.lead_id,
    fechaProgramada: row.fecha_programada,
    tipo: row.tipo as FollowUpTipo,
    nota: row.nota ?? undefined,
    estado: 'pendiente',
    orden: row.orden,
    responsable: row.responsable ?? undefined,
    creadoEn: row.created_at,
    leadEmpresa: row.lead_empresa,
    leadEstado: row.lead_estado as LeadStatus,
    leadPrioridad: (row.lead_prioridad as FollowUpAgendaItem['leadPrioridad']) ?? undefined,
    leadTelefono: row.lead_telefono ?? undefined,
    leadEmail: row.lead_email ?? undefined,
    leadWhatsapp: row.lead_whatsapp ?? undefined,
    urgencia: row.urgencia as FollowUpAgendaItem['urgencia'],
    diasVencido: row.dias_vencido,
    ...camposEditables(row),
  }
}

export const followUpsService = {
  /**
   * Agenda de seguimientos pendientes, ya sin leads archivados ni en papelera
   * (la vista `follow_ups_agenda` los excluye en SQL, no hace falta filtrar
   * aquí ni arriesgarse a que se cuelen en la UI).
   */
  async getAgenda(): Promise<FollowUpAgendaItem[]> {
    const { data, error } = await supabase
      .from('follow_ups_agenda')
      .select('*')
      .order('fecha_programada', { ascending: true })
    if (error) throw error
    return (data ?? []).map((r) => rowToAgendaItem(r as unknown as AgendaRow))
  },

  /** Historial completo de un lead: todos sus toques, del más reciente al más antiguo. */
  async getByLead(leadId: string): Promise<FollowUp[]> {
    const { data, error } = await supabase
      .from('follow_ups')
      .select('*')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('orden', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => rowToFollowUp(r as unknown as FollowUpRow))
  },

  /** Programa el siguiente toque. Falla si el lead ya tiene uno pendiente. */
  async programar(payload: {
    leadId: string
    fecha: string
    tipo: FollowUpTipo
    nota?: string
    responsable?: string
    hora?: string
    prioridad?: string
    resultadoEsperado?: string
  }): Promise<string> {
    // Siempre la firma de 8 argumentos (0020): mandar los cuatro nombres
    // nuevos, aunque vayan en null, evita que PostgREST resuelva a la de 5.
    const { data, error } = await supabase.rpc('programar_follow_up', {
      p_lead_id: payload.leadId,
      p_fecha: payload.fecha,
      p_tipo: payload.tipo,
      p_nota: payload.nota ?? null,
      p_responsable: payload.responsable ?? null,
      p_hora: payload.hora || null,
      p_prioridad: payload.prioridad || null,
      p_resultado_esperado: payload.resultadoEsperado || null,
    })
    if (error) throw error
    return data as string
  },

  /**
   * Edita un seguimiento pendiente entero de una vez (migración 0020).
   *
   * Convención del RPC: `undefined` = no tocar; cadena vacía = borrar el texto.
   * Por eso los campos de texto se mandan tal cual y NO con `|| null`: un `''`
   * deliberado tiene que llegar como `''`, no convertirse en "no tocar".
   */
  async actualizar(payload: {
    id: string
    fecha?: string
    hora?: string
    /** true borra la hora; sin esto, `hora: ''` sería indistinguible de "no tocar". */
    limpiarHora?: boolean
    tipo?: FollowUpTipo
    estado?: 'pendiente' | 'cancelado'
    prioridad?: string
    responsable?: string
    nota?: string
    resultadoEsperado?: string
    comentariosInternos?: string
  }): Promise<void> {
    const { error } = await supabase.rpc('actualizar_follow_up', {
      p_id: payload.id,
      p_fecha: payload.fecha ?? null,
      p_hora: payload.hora || null,
      p_limpiar_hora: payload.limpiarHora ?? false,
      p_tipo: payload.tipo ?? null,
      p_estado: payload.estado ?? null,
      p_prioridad: payload.prioridad ?? null,
      p_responsable: payload.responsable ?? null,
      p_nota: payload.nota ?? null,
      p_resultado_esperado: payload.resultadoEsperado ?? null,
      p_comentarios_internos: payload.comentariosInternos ?? null,
    })
    if (error) throw error
  },

  /** Marca un pendiente como completado con su resultado. */
  async completar(id: string, resultado: FollowUpResultado, nota?: string): Promise<void> {
    const { error } = await supabase.rpc('completar_follow_up', {
      p_id: id,
      p_resultado: resultado,
      p_nota: nota ?? null,
    })
    if (error) throw error
  },

  /** Mueve la fecha de un pendiente sin perder el número de toque. */
  async reprogramar(id: string, fecha: string): Promise<void> {
    const { error } = await supabase.rpc('reprogramar_follow_up', { p_id: id, p_fecha: fecha })
    if (error) throw error
  },

  /**
   * Cierra un lead (ganado/perdido): sale del pipeline y de la agenda, se
   * archiva con fecha y motivo, y su seguimiento pendiente queda `cancelado`.
   * Nada se borra.
   */
  async cerrarLead(leadId: string, estado: 'ganado' | 'perdido', motivo?: string): Promise<void> {
    const { error } = await supabase.rpc('cerrar_lead', {
      p_id: leadId,
      p_estado: estado,
      p_motivo: motivo ?? null,
    })
    if (error) throw error
  },

  /** Devuelve un lead archivado a su etapa previa, con todo su historial intacto. */
  async reactivarLead(leadId: string): Promise<void> {
    const { error } = await supabase.rpc('reactivar_lead', { p_id: leadId })
    if (error) throw error
  },
}

export default followUpsService
