/**
 * Fechas para pantallas de correo y chat.
 *
 * Todo el CRM pintaba «03 sept, 13:04» en cualquier sitio: el correo de hace
 * diez minutos y el de hace ocho meses se leían igual de lejos. Una bandeja se
 * escanea con el rabillo del ojo, y para eso lo de hoy tiene que decir la hora
 * y lo viejo tiene que decir el año.
 */

/** Convierte lo que llega de la BD (`2026-09-04 12:01:00`) en una Date usable. */
export function aFecha(valor: string): Date | null {
  const d = new Date((valor || '').replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

const HORA = { hour: '2-digit', minute: '2-digit' } as const

function mismoDia(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Marca de tiempo corta para la fila de una lista.
 * Hoy → «13:04». Ayer → «Ayer». Esta semana → «lun». Este año → «3 sept».
 * Más atrás → «3/9/24».
 */
export function fechaCorta(valor: string): string {
  const d = aFecha(valor)
  if (!d) return valor
  const ahora = new Date()
  if (mismoDia(d, ahora)) return d.toLocaleTimeString('es-ES', HORA)

  const ayer = new Date(ahora)
  ayer.setDate(ahora.getDate() - 1)
  if (mismoDia(d, ayer)) return 'Ayer'

  const dias = (ahora.getTime() - d.getTime()) / 86_400_000
  if (dias < 7 && dias > 0) return d.toLocaleDateString('es-ES', { weekday: 'short' })

  if (d.getFullYear() === ahora.getFullYear())
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })

  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'numeric', year: '2-digit' })
}

/** Fecha completa para la cabecera de un mensaje abierto. */
export function fechaLarga(valor: string): string {
  const d = aFecha(valor)
  if (!d) return valor
  return d.toLocaleString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Solo la hora: lo que va debajo de una burbuja de chat. */
export function soloHora(valor: string): string {
  const d = aFecha(valor)
  return d ? d.toLocaleTimeString('es-ES', HORA) : valor
}

/** Clave `2026-09-04` para agrupar mensajes por día. */
export function claveDia(valor: string): string {
  const d = aFecha(valor)
  if (!d) return valor
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** Rótulo del separador de día dentro de un hilo: «Hoy», «Ayer», «3 de septiembre». */
export function etiquetaDia(valor: string): string {
  const d = aFecha(valor)
  if (!d) return valor
  const ahora = new Date()
  if (mismoDia(d, ahora)) return 'Hoy'
  const ayer = new Date(ahora)
  ayer.setDate(ahora.getDate() - 1)
  if (mismoDia(d, ayer)) return 'Ayer'
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: d.getFullYear() === ahora.getFullYear() ? undefined : 'numeric',
  })
}
