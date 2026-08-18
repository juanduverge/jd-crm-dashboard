import { supabase } from '@/lib/supabaseClient'
import type { ActivityEvent } from '@/types'

interface SettingRow {
  key: string
  value: string | null
}

interface OutreachActivityRow {
  id: string
  lead_id: string | null
  asunto: string | null
  status: string
  sent_at: string | null
  created_at: string
}

interface InboxActivityRow {
  id: string
  lead_id: string | null
  remitente: string | null
  asunto: string | null
  created_at: string
}

export const settingsService = {
  async getConfig(): Promise<Record<string, string>> {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .is('user_id', null)
    if (error) throw error
    return Object.fromEntries(((data ?? []) as SettingRow[]).map((r) => [r.key, r.value ?? '']))
  },

  /**
   * Guarda un ajuste GLOBAL (user_id null).
   *
   * Update y luego insert, en vez de `upsert`: la unicidad de los ajustes
   * globales la da un índice parcial (`uq_settings_global`, migración 0028) y
   * PostgREST no puede inferir un índice parcial desde `on_conflict`. La
   * carrera entre los dos pasos la corta ese mismo índice, que rechazaría el
   * segundo insert.
   */
  async updateConfig(clave: string, valor: string): Promise<void> {
    const { data, error } = await supabase
      .from('settings')
      .update({ value: valor })
      .eq('key', clave)
      .is('user_id', null)
      .select('key')
    if (error) throw error
    if (data && data.length > 0) return

    const { error: insErr } = await supabase
      .from('settings')
      .insert({ key: clave, value: valor, user_id: null })
    if (insErr) throw insErr
  },

  async getActivity(): Promise<ActivityEvent[]> {
    const [{ data: outreach, error: outErr }, { data: inbox, error: inErr }] = await Promise.all([
      supabase
        .from('outreach_messages')
        .select('id, lead_id, asunto, status, sent_at, created_at')
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('inbox_messages')
        .select('id, lead_id, remitente, asunto, created_at')
        .order('created_at', { ascending: false })
        .limit(12),
    ])
    if (outErr) throw outErr
    if (inErr) throw inErr

    const outEvents: ActivityEvent[] = ((outreach ?? []) as OutreachActivityRow[]).map((row) => ({
      id: `out-${row.id}`,
      type: 'email',
      title: `${row.asunto || 'Mensaje'} enviado`,
      detail: row.status,
      timestamp: row.sent_at ?? row.created_at,
    }))
    const inEvents: ActivityEvent[] = ((inbox ?? []) as InboxActivityRow[]).map((row) => ({
      id: `in-${row.id}`,
      type: 'email',
      title: `Respuesta recibida (${row.remitente || row.asunto || 'sin remitente'})`,
      detail: row.asunto ?? undefined,
      timestamp: row.created_at,
    }))

    return [...outEvents, ...inEvents]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 12)
  },
}

export default settingsService
