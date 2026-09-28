import { supabase } from '@/lib/supabaseClient'

/**
 * Cola de trabajos de Supabase (migración 0050, Supabase Queues).
 *
 * El CRM solo mira las tareas que fallaron 5 veces: el resto las hace n8n
 * («Trabajador de tareas») sin que haga falta enterarse. Una fallida es algo
 * que no salió solo —p. ej. el aviso de un formulario— y hay que mirarlo a mano.
 */
export interface TareaFallida {
  id: number
  tipo: string
  datos: Record<string, unknown>
  ultimoError: string | null
  fallidaEn: string
}

const NOMBRE_TIPO: Record<string, string> = {
  avisar_formulario: 'Aviso de formulario web',
}

export function nombreTipoTarea(tipo: string): string {
  return NOMBRE_TIPO[tipo] ?? tipo
}

export const colaService = {
  async fallidas(): Promise<TareaFallida[]> {
    const { data, error } = await supabase.rpc('tareas_fallidas_lista')
    if (error) throw error
    return ((data ?? []) as { id: number; tipo: string; datos: Record<string, unknown>; ultimo_error: string | null; fallida_en: string }[])
      .map((r) => ({ id: r.id, tipo: r.tipo, datos: r.datos, ultimoError: r.ultimo_error, fallidaEn: r.fallida_en }))
  },

  async descartar(id: number): Promise<void> {
    const { error } = await supabase.rpc('tareas_fallida_descartar', { p_id: id })
    if (error) throw error
  },
}
