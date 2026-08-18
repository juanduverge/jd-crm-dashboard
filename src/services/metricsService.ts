import { supabase } from '@/lib/supabaseClient'
import type { MetricasCrm } from '@/types'

/**
 * metricsService — lectura del motor de métricas (migración 0028).
 *
 * Aquí NO se calcula nada. Todos los números vienen ya resueltos del RPC
 * `metricas_crm`, que a su vez sale de `metrica_valor()`: una sola definición
 * de cada métrica, en SQL, compartida por el dashboard de Productividad y por
 * las metas automáticas.
 *
 * Ese reparto es deliberado. La alternativa —traerse los leads y los toques al
 * navegador y contarlos aquí— es justo la "segunda lógica en paralelo" que
 * hace que el panel y las metas acaben diciendo cosas distintas del mismo mes.
 */
export const metricsService = {
  /**
   * Panel completo de un rango: lo que pasó en el periodo, la situación actual
   * de la cartera y los ratios. Una sola llamada porque las tres cosas se
   * leen juntas y separarlas sólo añadiría estados de carga desincronizados.
   */
  async getMetricas(desde: string, hasta: string): Promise<MetricasCrm> {
    const { data, error } = await supabase.rpc('metricas_crm', {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) throw error
    return data as MetricasCrm
  },

  /**
   * Progreso real de las metas automáticas que tocan el rango. Cada meta se
   * mide sobre SUS propias fechas (la semanal cuenta su semana, la mensual su
   * mes), que es lo que impide que se mezclen los periodos.
   */
  async getProgresoMetas(desde: string, hasta: string): Promise<Record<string, number>> {
    const { data, error } = await supabase.rpc('metricas_goals', {
      p_desde: desde,
      p_hasta: hasta,
    })
    if (error) throw error
    const filas = (data ?? []) as { goal_id: string; valor: string | number }[]
    return Object.fromEntries(filas.map((f) => [f.goal_id, Number(f.valor) || 0]))
  },
}

export default metricsService
