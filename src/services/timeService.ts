import { supabase } from '@/lib/supabaseClient'
import type { TiempoDiario, TimeEntry, TimeEntryFuente } from '@/types'

/**
 * timeService — registro de tiempo. Ver `supabase/migrations/0016_time_tracking.sql`.
 *
 * Dos reglas que este servicio no puede saltarse:
 *
 * - La duración NO se envía: la deriva un trigger de inicio/fin. Mandarla
 *   sería mentir, porque la BD la reescribe igual.
 * - Arrancar y parar van por RPC (`iniciar_tiempo` / `parar_tiempo`), que son
 *   quienes garantizan que sólo hay un cronómetro abierto por responsable.
 */

interface EntryRow {
  id: string
  descripcion: string
  fecha: string
  inicio: string
  fin: string | null
  duracion_seg: number | null
  fuente: TimeEntryFuente
  goal_id: string | null
  bloque_id: string | null
  task_id: string | null
  responsable: string | null
  notas: string | null
  categoria: string | null
}

function rowToEntry(row: EntryRow): TimeEntry {
  return {
    id: row.id,
    descripcion: row.descripcion,
    fecha: row.fecha,
    inicio: row.inicio,
    fin: row.fin ?? undefined,
    duracionSeg: row.duracion_seg ?? undefined,
    fuente: row.fuente,
    goalId: row.goal_id ?? undefined,
    bloqueId: row.bloque_id ?? undefined,
    taskId: row.task_id ?? undefined,
    responsable: row.responsable ?? undefined,
    notas: row.notas ?? undefined,
    categoria: row.categoria ?? undefined,
  }
}

const SELECT = 'id, descripcion, fecha, inicio, fin, duracion_seg, fuente, goal_id, bloque_id, task_id, responsable, notas, categoria'

export interface IniciarTiempoPayload {
  descripcion: string
  /** Jornada a la que se imputa; la pone el cliente, no el servidor. */
  fecha: string
  goalId?: string
  bloqueId?: string
  taskId?: string
  responsable?: string
  /** Tipo de trabajo, para agrupar el tiempo. Ver la migración 0019. */
  categoria?: string
}

export const timeService = {
  /** Entradas de una jornada, la más reciente primero. */
  async getEntradasDelDia(fecha: string): Promise<TimeEntry[]> {
    const { data, error } = await supabase
      .from('time_entries')
      .select(SELECT)
      .eq('fecha', fecha)
      .is('deleted_at', null)
      .order('inicio', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as EntryRow[]).map(rowToEntry)
  },

  /**
   * El cronómetro que esté corriendo, si lo hay. No se filtra por fecha a
   * propósito: un tramo abierto anoche sigue abierto hoy y hay que verlo.
   */
  async getEntradaAbierta(responsable?: string): Promise<TimeEntry | null> {
    let q = supabase
      .from('time_entries')
      .select(SELECT)
      .is('fin', null)
      .is('deleted_at', null)
      .order('inicio', { ascending: false })
      .limit(1)

    // Sin responsable se busca la entrada sin responsable, que es la misma
    // fila que crearía `iniciar_tiempo` sin él.
    q = responsable ? q.eq('responsable', responsable) : q.is('responsable', null)

    const { data, error } = await q
    if (error) throw error
    const rows = (data ?? []) as unknown as EntryRow[]
    return rows.length ? rowToEntry(rows[0]) : null
  },

  /** Arranca el cronómetro; si había otro abierto, la BD lo cierra. */
  async iniciar(p: IniciarTiempoPayload): Promise<string> {
    const { data, error } = await supabase.rpc('iniciar_tiempo', {
      p_descripcion: p.descripcion,
      p_fecha: p.fecha,
      p_goal_id: p.goalId || null,
      p_bloque_id: p.bloqueId || null,
      p_task_id: p.taskId || null,
      p_responsable: p.responsable || null,
      p_categoria: p.categoria || null,
    })
    if (error) throw error
    return data as string
  },

  /** Para el cronómetro (el indicado, o el abierto). Devuelve los segundos. */
  async parar(id?: string, responsable?: string): Promise<number> {
    const { data, error } = await supabase.rpc('parar_tiempo', {
      p_id: id || null,
      p_responsable: responsable || null,
    })
    if (error) throw error
    return Number(data) || 0
  },

  /** Tramo escrito a mano (se olvidó el cronómetro). Queda marcado 'manual'. */
  async registrarManual(p: {
    descripcion: string
    fecha: string
    inicio: string          // ISO
    fin: string             // ISO
    goalId?: string
    bloqueId?: string
    taskId?: string
    responsable?: string
    notas?: string
    categoria?: string
  }): Promise<string> {
    const { data, error } = await supabase.rpc('registrar_tiempo_manual', {
      p_descripcion: p.descripcion,
      p_fecha: p.fecha,
      p_inicio: p.inicio,
      p_fin: p.fin,
      p_goal_id: p.goalId || null,
      p_bloque_id: p.bloqueId || null,
      p_task_id: p.taskId || null,
      p_responsable: p.responsable || null,
      p_notas: p.notas || null,
      p_categoria: p.categoria || null,
    })
    if (error) throw error
    return data as string
  },

  /**
   * Corrige un tramo ya registrado, horas incluidas.
   *
   * Va por RPC (`editar_tiempo`, migración 0023) y no por UPDATE directo: es
   * quien impide cerrar un cronómetro en marcha por la puerta de atrás y
   * quien comprueba que la jornada siga cuadrando con el inicio. La duración
   * nunca se manda — la deriva el trigger de inicio/fin.
   *
   * `null` significa "no tocar". Para VACIAR meta o categoría hay que pasar
   * explícitamente `null`, y el servicio lo traduce a la bandera de limpieza
   * que espera el RPC.
   */
  async actualizar(p: {
    id: string
    descripcion?: string
    /** YYYY-MM-DD */
    fecha?: string
    /** ISO */
    inicio?: string
    /** ISO. Sólo en tramos ya cerrados. */
    fin?: string
    goalId?: string | null
    notas?: string
    categoria?: string | null
  }): Promise<void> {
    const { error } = await supabase.rpc('editar_tiempo', {
      p_id: p.id,
      p_descripcion: p.descripcion ?? null,
      p_fecha: p.fecha ?? null,
      p_inicio: p.inicio ?? null,
      p_fin: p.fin ?? null,
      p_goal_id: p.goalId || null,
      p_notas: p.notas ?? null,
      p_categoria: p.categoria || null,
      p_limpiar_goal: p.goalId === null,
      p_limpiar_categoria: p.categoria === null,
    })
    if (error) throw error
  },

  /**
   * Tiempo agregado por día y meta (`v_tiempo_diario`). Para las Métricas:
   * un mes son ~30 filas por meta en vez de todos los tramos del mes.
   */
  async getResumenDiario(desde: string, hasta: string): Promise<TiempoDiario[]> {
    const { data, error } = await supabase
      .from('v_tiempo_diario')
      .select('fecha, responsable, goal_id, goal_nombre, entradas, segundos')
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .order('fecha', { ascending: true })
    if (error) throw error

    return (data ?? []).map((r) => ({
      fecha: r.fecha as string,
      responsable: (r.responsable as string | null) ?? undefined,
      goalId: (r.goal_id as string | null) ?? undefined,
      goalNombre: (r.goal_nombre as string | null) ?? undefined,
      entradas: Number(r.entradas) || 0,
      segundos: Number(r.segundos) || 0,
    }))
  },

  /**
   * Tramos cerrados de un rango. `v_tiempo_diario` agrupa por meta, y para
   * "¿qué me comió el mes?" hace falta el detalle por actividad: dos tareas
   * distintas de la misma meta se agrupan ahí en una sola fila.
   */
  async getEntradasDelRango(desde: string, hasta: string): Promise<TimeEntry[]> {
    const { data, error } = await supabase
      .from('time_entries')
      .select(SELECT)
      .gte('fecha', desde)
      .lte('fecha', hasta)
      .not('fin', 'is', null)
      .is('deleted_at', null)
      .order('inicio', { ascending: false })
    if (error) throw error
    return ((data ?? []) as unknown as EntryRow[]).map(rowToEntry)
  },

  /** Soft delete, como el resto del CRM. */
  async eliminar(id: string): Promise<void> {
    const { error } = await supabase
      .from('time_entries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },
}

export default timeService
