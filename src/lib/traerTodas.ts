import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Trae TODAS las filas de una consulta, de mil en mil.
 *
 * Supabase (PostgREST) entrega como máximo 1000 filas por petición y corta
 * sin avisar: una lista que pide la tabla entera deja de mostrar lo más
 * antiguo al pasar de mil, sin error. Este ayudante pide página tras página
 * hasta que una llega incompleta.
 *
 * `pagina` recibe el rango y debe devolver la consulta con `.range(desde,
 * hasta)` y un orden ESTABLE (terminar en `.order('id')`): sin desempate, dos
 * filas con la misma fecha pueden saltar de página y salir dos veces o
 * ninguna.
 */
export async function traerTodas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  tam = 1000,
): Promise<T[]> {
  const todas: T[] = []
  for (let desde = 0; ; desde += tam) {
    const { data, error } = await pagina(desde, desde + tam - 1)
    if (error) throw error
    const filas = data ?? []
    todas.push(...filas)
    if (filas.length < tam) return todas
  }
}
