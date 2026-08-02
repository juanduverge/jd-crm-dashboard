import { supabase } from '@/lib/supabaseClient'
import type { Goal, GoalPeriodo, GoalTipo, HorarioBloque } from '@/types'

/**
 * goalsService — módulo Tareas: metas en cascada (mes -> semana -> día) y
 * plantilla de horario diario. Ver `supabase/migrations/0015_goals_module.sql`.
 *
 * Regla que este servicio NO puede saltarse: el avance se registra siempre en
 * la meta hoja (normalmente la diaria) vía el RPC `registrar_avance`; la BD lo
 * sube en cascada a la semanal y la mensual. Escribir `valor_actual` a mano
 * sobre una meta con hijas no sirve de nada — el trigger lo sobreescribe.
 */

interface GoalRow {
  id: string
  nombre: string
  descripcion: string | null
  periodo: GoalPeriodo
  parent_id: string | null
  tipo: GoalTipo
  target: string | number
  valor_actual: string | number
  unidad: string | null
  fecha_inicio: string
  fecha_fin: string
  responsable: string | null
  orden: number
  created_at: string
  updated_at: string
}

interface BloqueRow {
  id: string
  titulo: string
  descripcion: string | null
  hora_inicio: string
  hora_fin: string
  dias_semana: number[]
  goal_id: string | null
  aporte: string | number
  orden: number
  activo: boolean
}

const num = (v: string | number): number => (typeof v === 'number' ? v : Number(v) || 0)

function rowToGoal(row: GoalRow, conHijas: Set<string>): Goal {
  return {
    id: row.id,
    nombre: row.nombre,
    descripcion: row.descripcion ?? undefined,
    periodo: row.periodo,
    parentId: row.parent_id ?? undefined,
    tipo: row.tipo,
    target: num(row.target),
    valorActual: num(row.valor_actual),
    unidad: row.unidad ?? undefined,
    fechaInicio: row.fecha_inicio,
    fechaFin: row.fecha_fin,
    responsable: row.responsable ?? undefined,
    orden: row.orden,
    tieneHijas: conHijas.has(row.id),
    creado: row.created_at,
    actualizado: row.updated_at,
  }
}

function rowToBloque(row: BloqueRow): HorarioBloque {
  return {
    id: row.id,
    titulo: row.titulo,
    descripcion: row.descripcion ?? undefined,
    horaInicio: (row.hora_inicio || '').slice(0, 5),
    horaFin: (row.hora_fin || '').slice(0, 5),
    diasSemana: row.dias_semana ?? [],
    goalId: row.goal_id ?? undefined,
    aporte: num(row.aporte),
    orden: row.orden,
    activo: row.activo,
  }
}

export const goalsService = {
  /**
   * Metas que se solapan con el rango [desde, hasta]. Un solo viaje sirve para
   * las tres vistas de metas del mes en curso: mensual, semanales y diarias
   * caen todas dentro del mismo rango, y de ahí se deriva `tieneHijas`.
   */
  async getGoals(desde: string, hasta: string): Promise<Goal[]> {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .is('deleted_at', null)
      .lte('fecha_inicio', hasta)
      .gte('fecha_fin', desde)
      .order('fecha_inicio', { ascending: true })
      .order('orden', { ascending: true })
    if (error) throw error

    const rows = (data ?? []) as unknown as GoalRow[]
    const conHijas = new Set<string>()
    for (const r of rows) if (r.parent_id) conHijas.add(r.parent_id)
    return rows.map((r) => rowToGoal(r, conHijas))
  },

  /** Crea la meta mensual y, si es contador, toda su cascada, en una transacción. */
  async crearMetaMensual(payload: {
    nombre: string
    descripcion?: string
    tipo: GoalTipo
    target: number
    unidad?: string
    mes: string                 // cualquier día del mes, YYYY-MM-DD
    generarCascada?: boolean
    diasLaborables?: number[]   // ISO dow, por defecto lunes a viernes
    responsable?: string
  }): Promise<string> {
    const { data, error } = await supabase.rpc('crear_meta_mensual', {
      p_nombre: payload.nombre,
      p_tipo: payload.tipo,
      p_target: payload.tipo === 'toggle' ? 1 : payload.target,
      p_unidad: payload.unidad || null,
      p_mes: payload.mes,
      p_generar_cascada: payload.generarCascada ?? true,
      p_dias: payload.diasLaborables ?? [1, 2, 3, 4, 5],
      p_responsable: payload.responsable || null,
    })
    if (error) throw error

    const id = data as string
    // La cascada ya existe cuando vuelve el RPC, así que la descripción se
    // baja aparte a toda la rama: una meta diaria sin contexto obliga a subir
    // a la mensual para entender qué hay que hacer ese día.
    if (payload.descripcion?.trim()) {
      await this.setDescripcionCascada(id, payload.descripcion)
    }
    return id
  },

  /** Escribe la descripción en una meta y en todas sus descendientes. */
  async setDescripcionCascada(id: string, descripcion: string): Promise<void> {
    const { error } = await supabase.rpc('set_descripcion_cascada', {
      p_goal_id: id,
      p_descripcion: descripcion,
    })
    if (error) throw error
  },

  /** Meta suelta de una semana o un día, sin madre (fuera de la cascada). */
  async crearMetaSuelta(payload: {
    nombre: string
    descripcion?: string
    periodo: 'semana' | 'dia'
    tipo: GoalTipo
    target: number
    unidad?: string
    fechaInicio: string
    fechaFin: string
    responsable?: string
  }): Promise<void> {
    const { error } = await supabase.from('goals').insert({
      nombre: payload.nombre,
      descripcion: payload.descripcion || null,
      periodo: payload.periodo,
      tipo: payload.tipo,
      target: payload.tipo === 'toggle' ? 1 : payload.target,
      unidad: payload.unidad || null,
      fecha_inicio: payload.fechaInicio,
      fecha_fin: payload.fechaFin,
      responsable: payload.responsable || null,
    })
    if (error) throw error
  },

  /**
   * Edita una meta. Si cambia el target y se pide `redistribuir`, la BD reparte
   * el nuevo target entre las hijas existentes (sin borrarlas ni perder su
   * progreso) y baja hasta las diarias.
   */
  async actualizarMeta(payload: {
    id: string
    nombre?: string
    descripcion?: string
    target?: number
    unidad?: string
    responsable?: string
    redistribuir?: boolean
  }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (payload.nombre !== undefined) row.nombre = payload.nombre
    if (payload.target !== undefined) row.target = payload.target
    if (payload.unidad !== undefined) row.unidad = payload.unidad || null
    if (payload.responsable !== undefined) row.responsable = payload.responsable || null

    if (Object.keys(row).length) {
      const { error } = await supabase.from('goals').update(row).eq('id', payload.id)
      if (error) throw error
    }

    // La descripción baja a toda la rama: es el mismo objetivo visto a tres
    // alturas, no tres objetivos distintos.
    if (payload.descripcion !== undefined) {
      await this.setDescripcionCascada(payload.id, payload.descripcion)
    }

    if (payload.redistribuir) {
      const { error } = await supabase.rpc('redistribuir_hijos', { p_goal_id: payload.id })
      if (error) throw error
    }
  },

  /** Suma (o resta) avance sobre una meta hoja. Devuelve el nuevo valor. */
  async registrarAvance(id: string, delta: number): Promise<number> {
    const { data, error } = await supabase.rpc('registrar_avance', {
      p_goal_id: id,
      p_delta: delta,
    })
    if (error) throw error
    return num(data as string | number)
  },

  /** Genera la cascada de una mensual que se creó sin ella. */
  async generarCascada(id: string, diasLaborables?: number[]): Promise<number> {
    const { data, error } = await supabase.rpc('generar_cascada_goal', {
      p_goal_id: id,
      p_dias: diasLaborables ?? [1, 2, 3, 4, 5],
    })
    if (error) throw error
    return (data as number) ?? 0
  },

  /** Soft delete. El `on delete cascade` de la FK sólo aplica al borrado físico,
   *  así que aquí se marcan también las descendientes. */
  async eliminarMeta(id: string): Promise<void> {
    const ahora = new Date().toISOString()
    const { data: semanas, error: e1 } = await supabase
      .from('goals').select('id').eq('parent_id', id).is('deleted_at', null)
    if (e1) throw e1

    const ids = [id, ...(semanas ?? []).map((s) => s.id as string)]
    if (semanas?.length) {
      const { data: dias, error: e2 } = await supabase
        .from('goals').select('id').in('parent_id', ids).is('deleted_at', null)
      if (e2) throw e2
      for (const d of dias ?? []) if (!ids.includes(d.id as string)) ids.push(d.id as string)
    }

    const { error } = await supabase.from('goals').update({ deleted_at: ahora }).in('id', ids)
    if (error) throw error
  },

  // -----------------------------------------------------------
  // HORARIO
  // -----------------------------------------------------------

  async getBloques(): Promise<HorarioBloque[]> {
    const { data, error } = await supabase
      .from('horario_bloques')
      .select('*')
      .is('deleted_at', null)
      .order('hora_inicio', { ascending: true })
      .order('orden', { ascending: true })
    if (error) throw error
    return ((data ?? []) as unknown as BloqueRow[]).map(rowToBloque)
  },

  /** IDs de los bloques ya completados en una fecha. */
  async getCompletadosDelDia(fecha: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('horario_completions')
      .select('bloque_id')
      .eq('fecha', fecha)
    if (error) throw error
    return (data ?? []).map((r) => r.bloque_id as string)
  },

  /**
   * Completions de un rango, para el «plan contra realidad» de Métricas.
   * Se devuelven crudas (bloque + fecha) en vez de un contador: el mismo dato
   * sirve para el total del mes y para el detalle por bloque.
   */
  async getCompletadosDelRango(
    desde: string,
    hasta: string,
  ): Promise<{ bloqueId: string; fecha: string }[]> {
    const { data, error } = await supabase
      .from('horario_completions')
      .select('bloque_id, fecha')
      .gte('fecha', desde)
      .lte('fecha', hasta)
    if (error) throw error
    return (data ?? []).map((r) => ({
      bloqueId: r.bloque_id as string,
      fecha: r.fecha as string,
    }))
  },

  async crearBloque(payload: {
    titulo: string
    descripcion?: string
    horaInicio: string
    horaFin: string
    diasSemana: number[]
    goalId?: string
    aporte?: number
  }): Promise<void> {
    const { error } = await supabase.from('horario_bloques').insert({
      titulo: payload.titulo,
      descripcion: payload.descripcion || null,
      hora_inicio: payload.horaInicio,
      hora_fin: payload.horaFin,
      dias_semana: payload.diasSemana,
      goal_id: payload.goalId || null,
      aporte: payload.aporte ?? 1,
    })
    if (error) throw error
  },

  async actualizarBloque(payload: {
    id: string
    titulo?: string
    descripcion?: string
    horaInicio?: string
    horaFin?: string
    diasSemana?: number[]
    goalId?: string | null
    aporte?: number
    activo?: boolean
  }): Promise<void> {
    const row: Record<string, unknown> = {}
    if (payload.titulo !== undefined) row.titulo = payload.titulo
    if (payload.descripcion !== undefined) row.descripcion = payload.descripcion || null
    if (payload.horaInicio !== undefined) row.hora_inicio = payload.horaInicio
    if (payload.horaFin !== undefined) row.hora_fin = payload.horaFin
    if (payload.diasSemana !== undefined) row.dias_semana = payload.diasSemana
    if (payload.goalId !== undefined) row.goal_id = payload.goalId || null
    if (payload.aporte !== undefined) row.aporte = payload.aporte
    if (payload.activo !== undefined) row.activo = payload.activo
    const { error } = await supabase.from('horario_bloques').update(row).eq('id', payload.id)
    if (error) throw error
  },

  async eliminarBloque(id: string): Promise<void> {
    const { error } = await supabase
      .from('horario_bloques')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  /** Marca/desmarca un bloque en una fecha; el RPC ajusta la meta diaria ligada. */
  async completarBloque(bloqueId: string, fecha: string): Promise<void> {
    const { error } = await supabase.rpc('completar_bloque', {
      p_bloque_id: bloqueId,
      p_fecha: fecha,
    })
    if (error) throw error
  },

  async descompletarBloque(bloqueId: string, fecha: string): Promise<void> {
    const { error } = await supabase.rpc('descompletar_bloque', {
      p_bloque_id: bloqueId,
      p_fecha: fecha,
    })
    if (error) throw error
  },
}

export default goalsService
