import { supabase } from '@/lib/supabaseClient'
import type { Tarea, TareaEstado, TareaTipo, WebLeadPriority } from '@/types'

/**
 * tasksService — CRUD del módulo Tareas (seguimientos manuales) contra
 * Supabase (tabla `tasks`). Ver `supabase/migrations/0010_tasks_module.sql`
 * para las columnas añadidas (tipo/estado/notas/updated_at) sobre el
 * esquema base de 0001_schema.sql.
 *
 * `lead_nombre` no existe como columna — se resuelve con un join a `leads`
 * cuando la tarea tiene `lead_id`.
 */

interface TaskRow {
  id: string
  lead_id: string | null
  titulo: string
  descripcion: string | null
  vencimiento: string | null
  prioridad: string | null
  responsable: string | null
  completada: boolean
  tipo: string
  estado: string
  notas: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  leads?: { empresa: string } | null
}

function rowToTarea(row: TaskRow): Tarea {
  return {
    id: row.id,
    titulo: row.titulo,
    tipo: (row.tipo as TareaTipo) || 'seguimiento',
    leadId: row.lead_id ?? undefined,
    leadNombre: row.leads?.empresa ?? undefined,
    fechaVencimiento: row.vencimiento ? row.vencimiento.slice(0, 10) : undefined,
    estado: (row.estado as TareaEstado) || 'pendiente',
    prioridad: (row.prioridad as WebLeadPriority) || 'media',
    responsable: row.responsable ?? undefined,
    notas: row.notas ?? undefined,
    creado: row.created_at,
    actualizado: row.updated_at,
  }
}

export const tasksService = {
  /** Lee las tareas activas (no eliminadas) de Supabase. */
  async getTareas(): Promise<Tarea[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('*, leads(empresa)')
      .is('deleted_at', null)
      .order('vencimiento', { ascending: true, nullsFirst: false })
    if (error) throw error
    return (data ?? []).map((r) => rowToTarea(r as unknown as TaskRow))
  },

  async createTarea(payload: {
    titulo: string
    tipo?: TareaTipo
    leadId?: string
    fechaVencimiento?: string
    prioridad?: string
    responsable?: string
    notas?: string
  }): Promise<Tarea> {
    const row: Record<string, unknown> = {
      titulo: payload.titulo,
      tipo: payload.tipo || 'seguimiento',
      lead_id: payload.leadId || null,
      vencimiento: payload.fechaVencimiento || null,
      prioridad: payload.prioridad || 'media',
      responsable: payload.responsable || null,
      notas: payload.notas || null,
    }
    const { data, error } = await supabase.from('tasks').insert(row).select('*, leads(empresa)').single()
    if (error) throw error
    return rowToTarea(data as unknown as TaskRow)
  },

  async updateTarea(payload: {
    id: string
    estado?: TareaEstado
    titulo?: string
    fechaVencimiento?: string
    prioridad?: string
    notas?: string
    responsable?: string
  }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (payload.estado !== undefined) row.estado = payload.estado
    if (payload.titulo !== undefined) row.titulo = payload.titulo
    if (payload.fechaVencimiento !== undefined) row.vencimiento = payload.fechaVencimiento || null
    if (payload.prioridad !== undefined) row.prioridad = payload.prioridad
    if (payload.notas !== undefined) row.notas = payload.notas
    if (payload.responsable !== undefined) row.responsable = payload.responsable
    const { error } = await supabase.from('tasks').update(row).eq('id', payload.id)
    if (error) throw error
  },

  async deleteTarea(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  },

  async restoreTarea(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').update({ deleted_at: null }).eq('id', id)
    if (error) throw error
  },

  /** Borrado físico — sólo permitido (RLS) para admin, y sólo si ya está en papelera. */
  async purgeTarea(id: string): Promise<void> {
    const { error } = await supabase.from('tasks').delete().eq('id', id).not('deleted_at', 'is', null)
    if (error) throw error
  },

  /** Tareas eliminadas (papelera), para la vista de Papelera. */
  async getDeletedTareas(): Promise<{ id: string; titulo: string; deletedAt: string | null }[]> {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, titulo, deleted_at')
      .not('deleted_at', 'is', null)
    if (error) throw error
    return (data ?? []).map((r) => ({ id: r.id, titulo: r.titulo, deletedAt: r.deleted_at }))
  },
}

export default tasksService
