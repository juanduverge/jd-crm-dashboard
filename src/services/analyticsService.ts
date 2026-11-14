import { supabase } from '@/lib/supabaseClient'
import { traerTodas } from '@/lib/traerTodas'
import type { FollowUpResultado, FollowUpTipo, LeadStatus } from '@/types'

/**
 * analyticsService — los datos crudos que hay detrás de cada cifra de
 * Analíticas, para poder abrirla y ver qué leads la forman.
 *
 * Los totales siguen saliendo del motor de métricas en SQL (0028/0065/0067).
 * Esto solo trae las filas para LISTARLAS, y el desglose de cada lista usa
 * las mismas reglas que esos RPC, para que la lista cuadre con el número.
 */

export interface ToqueCrudo {
  id: string
  leadId: string
  canal: FollowUpTipo
  resultado?: FollowUpResultado
  completadoEn: string
  respondidoEn?: string
}

export interface EventoCrudo {
  leadId: string
  etapa: LeadStatus
  en: string
}

export const analyticsService = {
  /** Todos los toques completados. Columnas mínimas: son miles de filas como mucho. */
  async toques(): Promise<ToqueCrudo[]> {
    const filas = await traerTodas((desde, hasta) => supabase
      .from('follow_ups')
      .select('id, lead_id, tipo, resultado, completed_at, respondido_en')
      .eq('estado', 'completado')
      .is('deleted_at', null)
      .order('completed_at', { ascending: true })
      .order('id')
      .range(desde, hasta))
    return (filas as unknown as {
      id: string; lead_id: string; tipo: string; resultado: string | null
      completed_at: string; respondido_en: string | null
    }[]).map((r) => ({
      id: r.id,
      leadId: r.lead_id,
      canal: r.tipo as FollowUpTipo,
      resultado: (r.resultado as FollowUpResultado) ?? undefined,
      completadoEn: r.completed_at,
      respondidoEn: r.respondido_en ?? undefined,
    }))
  },

  /** Pasos por reunión, propuesta, negociación y ganado (historial del pipeline). */
  async eventosAvance(): Promise<EventoCrudo[]> {
    const filas = await traerTodas((desde, hasta) => supabase
      .from('pipeline_events')
      .select('lead_id, etapa, changed_at')
      .in('etapa', ['reunion', 'propuesta', 'negociacion', 'ganado'])
      .order('changed_at', { ascending: true })
      .range(desde, hasta))
    return (filas as unknown as { lead_id: string; etapa: string; changed_at: string }[]).map((r) => ({
      leadId: r.lead_id,
      etapa: r.etapa as LeadStatus,
      en: r.changed_at,
    }))
  },
}
