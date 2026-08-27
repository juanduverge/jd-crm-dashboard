import { supabase } from '@/lib/supabaseClient'
import type { Niche } from '@/lib/config'

/**
 * Catálogo de nichos (migración 0033).
 *
 * Hasta la 0033 el catálogo vivía en TypeScript (`DEFAULT_NICHES`) y los que
 * creaba el usuario en un JSON dentro de `settings`. Eso funcionaba para
 * pintar el desplegable, pero dejaba fuera al único sitio donde de verdad
 * hacía falta: el importador de Apify, que corre en SQL y no puede leer un
 * array de TypeScript. De ahí que `leads.nicho` acabara con "Roofing
 * contractor" y la columna Nicho saliera vacía en el CRM.
 *
 * Ahora el catálogo es una tabla y `normalizar_nicho()` la usa al importar.
 * `DEFAULT_NICHES` sigue existiendo como semilla y como red: si la consulta
 * falla, la interfaz pinta algo en vez de un desplegable vacío.
 */

export interface NichoRow {
  id: string
  nombre: string
  emoji: string
  color: string
  grupo: string
  orden: number
  origen: 'fabrica' | 'usuario' | 'auto'
  pendiente: boolean
}

function rowToNiche(r: NichoRow): Niche {
  return {
    id: r.id,
    nombre: r.nombre,
    emoji: r.emoji,
    color: r.color,
    grupo: r.grupo,
    orden: r.orden,
    origen: r.origen,
    pendiente: r.pendiente,
  }
}

export const nichosService = {
  /**
   * Todo el catálogo, ya ordenado como se va a pintar. El orden lo decide la
   * BD (`grupo, orden, nombre`) y no el cliente: así el desplegable, la tabla
   * y cualquier informe futuro coinciden sin repetir el criterio en cada uno.
   */
  async listar(): Promise<Niche[]> {
    const { data, error } = await supabase
      .from('nichos')
      .select('id, nombre, emoji, color, grupo, orden, origen, pendiente')
      .order('orden', { ascending: true })
      .order('nombre', { ascending: true })
    if (error) throw error
    return (data as NichoRow[]).map(rowToNiche)
  },

  /**
   * Crea o edita un nicho. El `id` no se toca nunca al editar: es lo que está
   * escrito en `leads.nicho`, y cambiarlo huerfanaría todos los leads que ya
   * lo tenían. Para renombrar está `nombre`; para reagrupar, `grupo`.
   */
  async guardar(n: Partial<Niche> & { id: string }): Promise<void> {
    const { error } = await supabase.from('nichos').upsert({
      id: n.id,
      ...(n.nombre !== undefined ? { nombre: n.nombre } : {}),
      ...(n.emoji !== undefined ? { emoji: n.emoji } : {}),
      ...(n.color !== undefined ? { color: n.color } : {}),
      ...(n.grupo !== undefined ? { grupo: n.grupo } : {}),
      ...(n.orden !== undefined ? { orden: n.orden } : {}),
      ...(n.origen !== undefined ? { origen: n.origen } : {}),
      ...(n.pendiente !== undefined ? { pendiente: n.pendiente } : {}),
    })
    if (error) throw error
  },

  /** Reordena varios de una vez (arrastrar y soltar en la pantalla de nichos). */
  async reordenar(ordenes: { id: string; orden: number; grupo?: string }[]): Promise<void> {
    // Uno a uno y no en un `upsert` masivo: el upsert exigiría mandar la fila
    // completa (nombre, emoji, color…) y un campo que se olvidara se pisaría
    // con el valor por defecto de la columna.
    for (const o of ordenes) {
      const { error } = await supabase
        .from('nichos')
        .update({ orden: o.orden, ...(o.grupo !== undefined ? { grupo: o.grupo } : {}) })
        .eq('id', o.id)
      if (error) throw error
    }
  },

  /**
   * Mueve los leads de un nicho a otro y borra el de origen. Es la operación
   * real detrás de "esto en verdad era Construcción": un nicho no se puede
   * borrar sin decidir antes dónde van sus leads.
   *
   * De regalo se aprende el alias, para que la próxima importación que traiga
   * ese mismo texto de Google ya caiga bien sin preguntar.
   */
  async fusionar(desde: string, hacia: string): Promise<number> {
    if (desde === hacia) return 0
    const { data: origen } = await supabase
      .from('nichos').select('nombre').eq('id', desde).single()

    const { data: movidos, error: eLeads } = await supabase
      .from('leads').update({ nicho: hacia }).eq('nicho', desde).select('id')
    if (eLeads) throw eLeads

    if (origen?.nombre) {
      // `clave_nicho` normaliza igual que la 0033; si el alias ya existe se
      // deja el que hay (ignoreDuplicates), porque el primero que se aprendió
      // es tan válido como este y no hay motivo para pisarlo.
      const { data: clave } = await supabase.rpc('clave_nicho', { p_txt: origen.nombre })
      if (clave) {
        await supabase.from('nicho_alias')
          .upsert({ alias: clave, nicho_id: hacia, origen: 'usuario' }, { ignoreDuplicates: true })
      }
    }

    const { error } = await supabase.from('nichos').delete().eq('id', desde)
    if (error) throw error
    return movidos?.length ?? 0
  },

  /** Cuántos leads vivos hay en cada nicho (para la bandeja de revisión). */
  async conteos(): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from('leads').select('nicho').is('deleted_at', null)
    if (error) throw error
    const c: Record<string, number> = {}
    for (const r of data as { nicho: string | null }[]) {
      if (r.nicho) c[r.nicho] = (c[r.nicho] ?? 0) + 1
    }
    return c
  },
}
