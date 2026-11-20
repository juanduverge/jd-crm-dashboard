import axios from 'axios'
import { addDays, format } from 'date-fns'
import { config } from '@/lib/config'
import { supabase } from '@/lib/supabaseClient'

/**
 * googleCalendarService — el puente del Calendario con Google Calendar.
 *
 * Todo pasa por el webhook `crm-calendario` de n8n (workflow
 * `n8n/crm-calendario-google.json`), que es quien tiene la credencial de
 * Google. El CRM nunca ve un token de Google.
 *
 * Regla de oro: el CRM guarda SIEMPRE primero en `eventos` y después intenta
 * Google. Si n8n está caído o el workflow aún no está conectado, la reunión
 * queda en el CRM igual y se avisa; nunca se pierde lo que escribiste.
 *
 * Google → CRM: no hay webhook de Google. Al abrir el calendario (y cada
 * pocos minutos mientras está abierto) se piden a Google los eventos del rango
 * a la vista y se igualan con `eventos`. Lo creado desde el móvil aparece así.
 */

const CALENDARIO = 'primary'

const http = axios.create({
  baseURL: config.n8n.hookBase,
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
    ...(config.n8n.hookToken ? { 'X-CRM-TOKEN': config.n8n.hookToken } : {}),
  },
})

/** Lo que n8n devuelve de cada evento de Google (nodo «Responder»). */
interface EventoGoogle {
  googleEventId: string
  etag: string | null
  estado: 'confirmed' | 'tentative' | 'cancelled'
  titulo: string
  descripcion: string | null
  ubicacion: string | null
  inicio: string | null
  fin: string | null
  todoElDia: boolean
  enlace: string | null
  htmlLink: string | null
  actualizado: string | null
  invitados: string[]
}

interface RespuestaN8n {
  ok: boolean
  error?: string
  calendario?: string | null
  eventos?: EventoGoogle[]
  evento?: EventoGoogle
}

export interface EstadoGoogle {
  conectado: boolean
  /** Nombre del calendario (suele ser el correo de la cuenta). */
  calendario?: string
  motivo?: string
}

export interface OpcionesGoogle {
  /** Pedir a Google que cree la sala de Meet al guardar. */
  meet?: boolean
  /** Correos de los invitados. */
  invitados?: string[]
  /** Que Google les mande la invitación por correo. */
  invitar?: boolean
}

async function llamar(cuerpo: Record<string, unknown>): Promise<RespuestaN8n> {
  const { data } = await http.post<RespuestaN8n>('/crm-calendario', { calendarId: CALENDARIO, ...cuerpo })
  // n8n con el workflow apagado devuelve 404, y a veces un 200 con HTML de
  // Cloudflare Access: si no hay `ok` booleano, no es nuestro workflow.
  if (!data || typeof data.ok !== 'boolean') throw new Error('Google Calendar no está conectado todavía')
  if (!data.ok) throw new Error(data.error || 'Google Calendar rechazó la petición')
  return data
}

// ---------- Fechas: CRM ↔ Google ----------

/**
 * En el CRM un evento de todo el día va de 00:00 a 23:59 en hora local. Google
 * quiere la fecha suelta y el fin EXCLUSIVO (el día siguiente).
 */
function fechasParaGoogle(inicio: string, fin: string, todoElDia: boolean) {
  if (!todoElDia) return { inicio, fin }
  return {
    inicio: format(new Date(inicio), 'yyyy-MM-dd'),
    fin: format(addDays(new Date(fin), 1), 'yyyy-MM-dd'),
  }
}

function fechasDesdeGoogle(g: EventoGoogle): { inicio: string; fin: string } | null {
  if (!g.inicio || !g.fin) return null
  if (!g.todoElDia) return { inicio: new Date(g.inicio).toISOString(), fin: new Date(g.fin).toISOString() }
  const ini = new Date(`${g.inicio}T00:00:00`)
  const fin = new Date(`${g.fin}T00:00:00`)
  fin.setMinutes(fin.getMinutes() - 1) // fin exclusivo → 23:59 del último día
  return { inicio: ini.toISOString(), fin: fin.toISOString() }
}

// ---------- Estado de la conexión (con caché corta) ----------

let cacheEstado: { en: number; valor: EstadoGoogle } | null = null
const VIDA_CACHE = 5 * 60_000

export const googleCalendarService = {
  async estado(forzar = false): Promise<EstadoGoogle> {
    if (!forzar && cacheEstado && Date.now() - cacheEstado.en < VIDA_CACHE) return cacheEstado.valor
    let valor: EstadoGoogle
    try {
      const r = await llamar({ accion: 'estado' })
      valor = { conectado: true, calendario: r.calendario ?? undefined }
    } catch (e) {
      valor = { conectado: false, motivo: e instanceof Error ? e.message : 'Sin conexión' }
    }
    cacheEstado = { en: Date.now(), valor }
    return valor
  },

  async conectado(): Promise<boolean> {
    return (await this.estado()).conectado
  },

  /**
   * Sube (crea o actualiza) en Google el evento `id` del CRM y guarda de vuelta
   * el id de Google y, si se pidió Meet, el enlace. Devuelve el enlace de Meet.
   */
  async subir(id: string, op: OpcionesGoogle = {}): Promise<{ enlace?: string }> {
    const { data: row, error } = await supabase
      .from('eventos')
      .select('titulo, descripcion, ubicacion, inicio, fin, todo_el_dia, enlace, google_event_id')
      .eq('id', id)
      .single()
    if (error) throw error
    const ev = row as {
      titulo: string; descripcion: string | null; ubicacion: string | null; inicio: string; fin: string
      todo_el_dia: boolean; enlace: string | null; google_event_id: string | null
    }
    const f = fechasParaGoogle(ev.inicio, ev.fin, ev.todo_el_dia)
    // Meet solo si se pide y el evento no tiene ya un enlace propio (Zoom…).
    const meet = !!op.meet && !ev.enlace
    const r = await llamar({
      accion: ev.google_event_id ? 'actualizar' : 'crear',
      googleEventId: ev.google_event_id ?? undefined,
      meet,
      invitar: !!op.invitar,
      evento: {
        titulo: ev.titulo,
        descripcion: ev.descripcion ?? '',
        ubicacion: ev.ubicacion ?? '',
        inicio: f.inicio,
        fin: f.fin,
        todoElDia: ev.todo_el_dia,
        ...(op.invitados ? { invitados: op.invitados } : {}),
      },
    })
    const g = r.evento
    if (!g) return {}
    const cambios: Record<string, unknown> = {
      google_event_id: g.googleEventId,
      google_calendar_id: CALENDARIO,
      google_etag: g.etag,
      sincronizado_en: new Date().toISOString(),
    }
    if (g.enlace && !ev.enlace) cambios.enlace = g.enlace
    const { error: e2 } = await supabase.from('eventos').update(cambios).eq('id', id)
    if (e2) throw e2
    return { enlace: g.enlace ?? undefined }
  },

  /** Borra en Google. Si ya no existía allí, también cuenta como borrado. */
  async borrar(googleEventId: string): Promise<void> {
    await llamar({ accion: 'borrar', googleEventId })
  },

  /**
   * Iguala `eventos` con lo que hay en Google en un rango. Devuelve cuántos
   * eventos cambió, para saber si hay que refrescar la vista.
   */
  async sincronizar(desdeIso: string, hastaIso: string): Promise<number> {
    const r = await llamar({ accion: 'listar', desde: desdeIso, hasta: hastaIso })
    const remotos = r.eventos ?? []
    if (!remotos.length) return 0

    const ids = remotos.map((g) => g.googleEventId)
    const { data, error } = await supabase
      .from('eventos')
      .select('id, google_event_id, google_etag, deleted_at')
      .in('google_event_id', ids)
    if (error) throw error
    const locales = new Map(
      ((data ?? []) as { id: string; google_event_id: string; google_etag: string | null; deleted_at: string | null }[])
        .map((l) => [l.google_event_id, l]),
    )

    let cambios = 0
    const ahora = new Date().toISOString()
    for (const g of remotos) {
      const local = locales.get(g.googleEventId)

      if (g.estado === 'cancelled') {
        if (local && !local.deleted_at) {
          await supabase.from('eventos').update({ deleted_at: ahora }).eq('id', local.id)
          cambios++
        }
        continue
      }

      const f = fechasDesdeGoogle(g)
      if (!f) continue
      const campos = {
        titulo: g.titulo,
        descripcion: g.descripcion,
        ubicacion: g.ubicacion,
        inicio: f.inicio,
        fin: f.fin,
        todo_el_dia: g.todoElDia,
        google_etag: g.etag,
        sincronizado_en: ahora,
        ...(g.enlace ? { enlace: g.enlace } : {}),
      }

      if (!local) {
        const { error: e } = await supabase.from('eventos').insert({
          ...campos,
          tipo: g.enlace || g.invitados.length ? 'reunion' : 'evento',
          // Lo que ya pasó en Google entra como hecho: es actividad realizada.
          estado: Date.parse(f.fin) < Date.now() ? 'hecho' : 'confirmado',
          google_event_id: g.googleEventId,
          google_calendar_id: CALENDARIO,
        })
        if (!e) cambios++
      } else if (local.deleted_at) {
        // Borrado en el CRM a propósito: no resucitarlo desde Google.
        continue
      } else if (local.google_etag !== g.etag) {
        await supabase.from('eventos').update(campos).eq('id', local.id)
        cambios++
      }
    }
    return cambios
  },
}

export default googleCalendarService
