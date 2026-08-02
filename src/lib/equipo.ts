/**
 * Equipo — quién puede ser responsable de un lead, un seguimiento o una tarea.
 *
 * Por qué no es una tabla todavía: hoy el CRM tiene un solo operador y el campo
 * `responsable` es texto libre en las cinco tablas que lo usan (leads,
 * follow_ups, tasks, goals, time_entries). Convertirlo en una FK a `usuarios`
 * es una migración de datos real, y este no es el momento (v1.0 = estabilidad).
 *
 * Lo que sí se arregla ahora: dejar de escribir el nombre a mano cada vez. La
 * lista vive en `settings` (clave `responsables`, JSON de strings), igual que
 * los alias de email, y el día que exista tabla de usuarios este módulo es lo
 * único que hay que cambiar — la UI ya consume una lista, no un input.
 */

/** Se rellena solo en cualquier formulario que pida responsable. */
export const RESPONSABLE_POR_DEFECTO = 'Juan Duvergé'

/** Clave en la tabla `settings`. */
export const CLAVE_RESPONSABLES = 'responsables'

/**
 * Normaliza para comparar: quita acentos, espacios de más y mayúsculas. Sin
 * esto, "Juan Duverge" y "juan duvergé" serían dos responsables distintos, que
 * es exactamente cómo se ensucia un campo de texto libre.
 */
/**
 * Rango Unicode de marcas diacríticas combinantes (U+0300–U+036F), que es lo
 * que `normalize('NFD')` separa de cada letra. Se construye desde una cadena a
 * propósito: escrito como literal de expresión regular, el fichero quedaría
 * lleno de caracteres invisibles que cualquier editor puede corromper.
 */
const DIACRITICOS = new RegExp('[̀-ͯ]', 'g')

export function claveResponsable(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(DIACRITICOS, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Une la lista guardada con el valor por defecto y con el que ya tenga la
 * ficha. Ese último caso importa: un lead antiguo puede llevar un responsable
 * que nadie ha dado de alta, y si no aparece en el desplegable el formulario lo
 * borraría en silencio al guardar.
 */
export function componerResponsables(guardados: string[], actual?: string): string[] {
  const vistos = new Set<string>()
  const salida: string[] = []
  for (const n of [RESPONSABLE_POR_DEFECTO, ...guardados, ...(actual ? [actual] : [])]) {
    const limpio = n?.trim()
    if (!limpio) continue
    const k = claveResponsable(limpio)
    if (vistos.has(k)) continue
    vistos.add(k)
    salida.push(limpio)
  }
  return salida
}
