import { supabase } from '@/lib/supabaseClient'
import type { Evento, EventoEstado, EventoPrioridad, EventoTipo } from '@/types'

/**
 * eventosService — el calendario. Ver `supabase/migrations/0018_eventos_calendario.sql`.
 *
 * Dos reglas que este servicio no puede saltarse:
 *
 * - Aquí SÓLO viven eventos, reuniones y recordatorios. Crear una tarea o una
 *   meta desde el calendario escribe en `tasks` / `goals`; duplicarlas aquí
 *   sería tener el mismo dato en dos sitios y que uno de los dos mienta.
 * - Mover y duplicar van por RPC, no por update suelto: mover cambia inicio y
 *   fin a la vez, y duplicar tiene que NO heredar el rastro de Google.
 */

interface EventoRow {
  id: string
  titulo: string
  descripcion: string | null
  notas: string | null
  tipo: EventoTipo
  estado: EventoEstado
  inicio: string
  fin: string
  todo_el_dia: boolean
  color: string | null
  prioridad: EventoPrioridad | null
  categoria: string | null
  etiquetas: string[] | null
  enlace: string | null
  ubicacion: string | null
  goal_id: string | null
  task_id: string | null
  lead_id: string | null
  responsable: string | null
  google_event_id: string | null
  created_at: string
  updated_at: string
}

const SELECT =
  'id, titulo, descripcion, notas, tipo, estado, inicio, fin, todo_el_dia, color, prioridad, ' +
  'categoria, etiquetas, enlace, ubicacion, goal_id, task_id, lead_id, responsable, ' +
  'google_event_id, created_at, updated_at'

function rowToEvento(row: EventoRow): Evento {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion ?? undefined,
    notas: row.notas ?? undefined,
    tipo: row.tipo,
    estado: row.estado,
    inicio: row.inicio,
    fin: row.fin,
    todoElDia: row.todo_el_dia,
    color: row.color ?? undefined,
    prioridad: row.prioridad ?? undefined,
    categoria: row.categoria ?? undefined,
    etiquetas: row.etiquetas ?? [],
    enlace: row.enlace ?? undefined,
    ubicacion: row.ubicacion ?? undefined,
    goalId: row.goal_id ?? undefined,
    taskId: row.task_id ?? undefined,
    leadId: row.lead_id ?? undefined,
    responsable: row.responsable ?? undefined,
    googleEventId: row.google_event_id ?? undefined,
    creado: row.created_at,
    actualizado: row.updated_at,
  }
}

export interface EventoPayload {
  titulo: string
  descripcion?: string
  notas?: string
  tipo?: EventoTipo
  estado?: EventoEstado
  /** ISO completos. La vista decide la hora; el servicio no la inventa. */
  inicio: string
  fin: string
  todoElDia?: boolean
  color?: string
  prioridad?: EventoPrioridad
  categoria?: string
  etiquetas?: string[]
  enlace?: string
  ubicacion?: string
  goalId?: string
  taskId?: string
  leadId?: string
  responsable?: string
}

/** Sólo las claves presentes se mandan: un update parcial no debe borrar campos. */
function payloadToRow(p: Partial<EventoPayload>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  if (p.titulo !== undefined) row.titulo = p.titulo.trim()
  if (p.descripcion !== undefined) row.descripcion = p.descripcion || null
  if (p.notas !== undefined) row.notas = p.notas || null
  if (p.tipo !== undefined) row.tipo = p.tipo
  if (p.estado !== undefined) row.estado = p.estado
  if (p.inicio !== undefined) row.inicio = p.inicio
  if (p.fin !== undefined) row.fin = p.fin
  if (p.todoElDia !== undefined) row.todo_el_dia = p.todoElDia
  if (p.color !== undefined) row.color = p.color || null
  if (p.prioridad !== undefined) row.prioridad = p.prioridad || null
  if (p.categoria !== undefined) row.categoria = p.categoria || null
  if (p.etiquetas !== undefined) row.etiquetas = p.etiquetas
  if (p.enlace !== undefined) row.enlace = p.enlace || null
  if (p.ubicacion !== undefined) row.ubicacion = p.ubicacion || null
  if (p.goalId !== undefined) row.goal_id = p.goalId || null
  if (p.taskId !== undefined) row.task_id = p.taskId || null
  if (p.leadId !== undefined) row.lead_id = p.leadId || null
  if (p.responsable !== undefined) row.responsable = p.responsable || null
  return row
}

export const eventosService = {
  /**
   * Eventos que se SOLAPAN con el rango, no los que empiezan dentro: una
   * reunión que arrancó ayer y termina hoy tiene que salir en el día de hoy.
   */
  async getDelRango(desdeIso: string, hastaIso: string): Promise<Evento[]> {
    const { data, error } = await supabase
      .from('eventos')
      .select(SELECT)
      .is('deleted_at', null)
      .lt('inicio', hastaIso)
      .gt('fin', desdeIso)
      .order('inicio', { ascending: true })
    if (error) throw error
    return ((data ?? []) as unknown as EventoRow[]).map(rowToEvento)
  },

  async crear(p: EventoPayload): Promise<string> {
    const { data, error } = await supabase
      .from('eventos')
      .insert(payloadToRow(p))
      .select('id')
      .single()
    if (error) throw error
    return (data as { id: string }).id
  },

  async actualizar(id: string, p: Partial<EventoPayload>): Promise<void> {
    const row = payloadToRow(p)
    if (!Object.keys(row).length) return
    const { error } = await supabase.from('eventos').update(row).eq('id', id)
    if (error) throw error
  },

  /** Arrastrar. Sin `finIso` conserva la duración; con él, la cambia (resize). */
  async mover(id: string, inicioIso: string, finIso?: string): Promise<void> {
    const { error } = await supabase.rpc('mover_evento', {
      p_id: id,
      p_inicio: inicioIso,
      p_fin: finIso ?? null,
    })
    if (error) throw error
  },

  async duplicar(id: string, inicioIso?: string): Promise<string> {
    const { data, error } = await supabase.rpc('duplicar_evento', {
      p_id: id,
      p_inicio: inicioIso ?? null,
    })
    if (error) throw error
    return data as string
  },

  /** Soft delete, como el resto del CRM. */
  async eliminar(id: string): Promise<void> {
    const { error } = await supabase
      .from('eventos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
}

export default eventosService
