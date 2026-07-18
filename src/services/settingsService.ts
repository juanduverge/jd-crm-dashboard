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

  async updateConfig(clave: string, valor: string): Promise<void> {
    const { error } = await supabase
      .from('settings')
      .upsert({ key: clave, value: valor, user_id: null }, { onConflict: 'key,user_id' })
    if (error) throw error
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
