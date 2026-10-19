import { supabase } from '@/lib/supabaseClient'
import { traerTodas } from '@/lib/traerTodas'

/**
 * secuenciasService — correos en frío de tres toques (migración 0053).
 *
 * ChatGPT redacta los tres correos de cada lead y entran en
 * `outreach_messages` como `por_aprobar`. Juan los aprueba aquí y pasan a
 * `programado`; el workflow de n8n «Envío programado de correos» los manda
 * respetando horario, tope por hora y la regla de WhatsApp. Este servicio no
 * envía nada.
 */

export type EstadoSecuencia = 'por_aprobar' | 'programado' | 'enviando' | 'enviado' | 'error' | 'cancelado'

export interface CorreoSecuencia {
  id: string
  leadId: string
  toque: number
  asunto: string
  cuerpo: string
  destinatario: string | null
  status: EstadoSecuencia
  revisar: boolean
  notaRevision: string | null
  aprobadoEn: string | null
  sentAt: string | null
  motivoCancelacion: string | null
  error: string | null
}

export interface LeadSecuencia {
  leadId: string
  empresa: string
  ciudad: string | null
  web: string | null
  whatsappEstado: string | null
  correos: CorreoSecuencia[]
}

interface Fila {
  id: string
  lead_id: string
  toque: number
  asunto: string | null
  cuerpo: string | null
  destinatario: string | null
  status: EstadoSecuencia
  revisar: boolean
  nota_revision: string | null
  aprobado_en: string | null
  sent_at: string | null
  motivo_cancelacion: string | null
  error: string | null
  leads: { empresa: string | null; ciudad: string | null; web: string | null; whatsapp_estado: string | null } | null
}

/** Claves de Ajustes que gobiernan el envío (0053). */
export const CLAVES_ENVIO = [
  'envio_auto_activo', 'envio_max_hora', 'envio_min_dia', 'envio_max_dia',
  'envio_hora_inicio', 'envio_hora_fin', 'envio_dias', 'envio_zona', 'envio_remitente',
  'direccion_fisica',
] as const
export type ClaveEnvio = (typeof CLAVES_ENVIO)[number]
export type ConfigEnvio = Record<ClaveEnvio, string>

export const secuenciasService = {
  async listar(): Promise<LeadSecuencia[]> {
    // Antes de enseñar nada, que caduque lo que ya no debe salir (respondió,
    // tiene WhatsApp, se descartó): lo que se ve tiene que estar al día.
    await supabase.rpc('cancelar_secuencias_caducadas')

    const filas = (await traerTodas((desde, hasta) => supabase
      .from('outreach_messages')
      .select('id, lead_id, toque, asunto, cuerpo, destinatario, status, revisar, nota_revision, aprobado_en, sent_at, motivo_cancelacion, error, leads(empresa, ciudad, web, whatsapp_estado)')
      .not('toque', 'is', null)
      .order('lead_id')
      .order('toque')
      .order('id')
      .range(desde, hasta))) as unknown as Fila[]

    const porLead = new Map<string, LeadSecuencia>()
    for (const f of filas ?? []) {
      let g = porLead.get(f.lead_id)
      if (!g) {
        g = {
          leadId: f.lead_id,
          empresa: f.leads?.empresa ?? 'Lead sin nombre',
          ciudad: f.leads?.ciudad ?? null,
          web: f.leads?.web ?? null,
          whatsappEstado: f.leads?.whatsapp_estado ?? null,
          correos: [],
        }
        porLead.set(f.lead_id, g)
      }
      g.correos.push({
        id: f.id, leadId: f.lead_id, toque: f.toque,
        asunto: f.asunto ?? '', cuerpo: f.cuerpo ?? '', destinatario: f.destinatario,
        status: f.status, revisar: f.revisar, notaRevision: f.nota_revision,
        aprobadoEn: f.aprobado_en, sentAt: f.sent_at,
        motivoCancelacion: f.motivo_cancelacion, error: f.error,
      })
    }
    return [...porLead.values()].sort((a, b) => a.empresa.localeCompare(b.empresa))
  },

  /** Aprueba lo pendiente de esos leads: pasa a `programado`. */
  async aprobar(leadIds: string[]): Promise<void> {
    const { error } = await supabase
      .from('outreach_messages')
      .update({ status: 'programado', aprobado_en: new Date().toISOString() })
      .in('lead_id', leadIds)
      .eq('status', 'por_aprobar')
    if (error) throw error
  },

  /** Rechaza (o detiene) la secuencia: lo que no ha salido se cancela. */
  async cancelar(leadId: string, motivo = 'rechazado por Juan'): Promise<void> {
    const { error } = await supabase
      .from('outreach_messages')
      .update({ status: 'cancelado', cancelado_en: new Date().toISOString(), motivo_cancelacion: motivo })
      .eq('lead_id', leadId)
      .in('status', ['por_aprobar', 'programado'])
    if (error) throw error
  },

  async editar(id: string, cambios: { asunto: string; cuerpo: string }): Promise<void> {
    const { error } = await supabase
      .from('outreach_messages')
      .update({ asunto: cambios.asunto, cuerpo: cambios.cuerpo, revisar: false })
      .eq('id', id)
      .in('status', ['por_aprobar', 'programado'])
    if (error) throw error
  },

  async leerConfig(): Promise<ConfigEnvio> {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .is('user_id', null)
      .in('key', CLAVES_ENVIO as unknown as string[])
    if (error) throw error
    const cfg = {} as ConfigEnvio
    for (const r of data ?? []) cfg[r.key as ClaveEnvio] = r.value ?? ''
    return cfg
  },

  /** Las filas las crea la 0053; aquí solo se actualizan (globales, admin). */
  async guardarConfig(key: ClaveEnvio, value: string): Promise<void> {
    const { error } = await supabase.from('settings').update({ value }).eq('key', key).is('user_id', null)
    if (error) throw error
  },
}

export default secuenciasService
