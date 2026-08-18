import { TIPO_META } from './followUps'
import type { FollowUpAgendaItem, Lead, SituacionSeguimiento } from '@/types'

/**
 * Toques y situación de seguimiento — el vocabulario compartido de Leads,
 * Pipeline y Seguimiento.
 *
 * Un TOUCH es un contacto COMPLETADO con el lead. No se escribe a mano en
 * ningún sitio: `lead.touchActual` lo mantiene un trigger sobre `follow_ups`
 * (migración 0028). Registrar el toque ES la acción; el número es su
 * consecuencia. Por eso aquí no hay ningún `setTouch`.
 *
 * Este módulo existe para que las tres pantallas cuenten lo mismo. Antes cada
 * una derivaba su propia idea de "atrasado" o "sin contactar" y por eso
 * parecían sistemas separados aunque leyeran la misma fila.
 */

/** Escalón máximo con etiqueta propia. Del 5 en adelante todo es "Touch 5+". */
export const TOUCH_MAX = 5

/** Etiqueta corta del toque de un lead: "Sin contactar", "Touch 3", "Touch 5+". */
export function touchLabel(touch: number): string {
  if (touch <= 0) return 'Sin contactar'
  return touch >= TOUCH_MAX ? `Touch ${TOUCH_MAX}+` : `Touch ${touch}`
}

/**
 * Color del toque: una escala fría → cálida que se lee de un vistazo en el
 * kanban. Insistir mucho no es "malo" (por eso el 4-5 no es rojo, que ya
 * significa "atrasado" en esta interfaz), pero sí es información: un lead en
 * Touch 5 lleva mucha inversión encima.
 */
export function touchColor(touch: number): string {
  if (touch <= 0) return 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400'
  if (touch === 1) return 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400'
  if (touch === 2) return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400'
  if (touch === 3) return 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'
}

export const SITUACION_META: Record<
  SituacionSeguimiento,
  { label: string; corto: string; cls: string }
> = {
  sin_contactar: {
    label: 'Sin contactar', corto: 'Sin contactar',
    cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400',
  },
  sin_proximo: {
    // El agujero silencioso del CRM: contactado una vez y luego nada. No es un
    // error del sistema, es trabajo pendiente, y por eso se pinta en ámbar.
    label: 'Sin próximo toque', corto: 'Sin próximo',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  },
  atrasado: {
    label: 'Seguimiento atrasado', corto: 'Atrasado',
    cls: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400',
  },
  hoy: {
    label: 'Toca hoy', corto: 'Hoy',
    cls: 'bg-primary-100 text-primary-700 dark:bg-primary-500/15 dark:text-primary-400',
  },
  programado: {
    label: 'Programado', corto: 'Programado',
    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  },
  cerrado: {
    label: 'Cerrado', corto: 'Cerrado',
    cls: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400',
  },
}

/**
 * Situación de un lead, con la MISMA definición que la vista SQL
 * `v_leads_seguimiento`. Se replica en el cliente porque el store ya tiene el
 * lead completo en memoria y pedir la vista sólo para esto obligaría a
 * mantener dos cachés sincronizadas; la definición sigue siendo una sola y
 * cualquier cambio se hace en los dos sitios a la vez, que están anotados.
 *
 * `hoy` se pasa como parámetro para poder calcularlo una vez por render en
 * lugar de una vez por lead, y para que sea comprobable en un test.
 */
export function situacionLead(lead: Lead, hoy: string): SituacionSeguimiento {
  if (lead.estado === 'ganado' || lead.estado === 'perdido') return 'cerrado'
  if (!lead.proximoSeguimiento) {
    return lead.touchActual > 0 ? 'sin_proximo' : 'sin_contactar'
  }
  const fecha = lead.proximoSeguimiento.slice(0, 10)
  if (fecha < hoy) return 'atrasado'
  if (fecha === hoy) return 'hoy'
  return 'programado'
}

/**
 * Filtros de toque/situación que comparten Leads, Pipeline y Seguimiento.
 *
 * Van en una sola lista y no en tres porque son la misma pregunta hecha desde
 * tres pantallas: "¿en qué punto de la secuencia está este lead?". Tener el
 * catálogo aquí es lo que garantiza que "Atrasado" signifique lo mismo en las
 * tres, que es exactamente lo que fallaba antes.
 */
export interface FiltroToque {
  key: string
  label: string
  /** Grupo para separar visualmente el "cuántos toques" del "cómo va". */
  grupo: 'toque' | 'situacion' | 'resultado'
  test: (l: Lead, hoy: string) => boolean
}

export const FILTROS_TOQUE: FiltroToque[] = [
  { key: 'sin_contactar', label: 'Sin contactar', grupo: 'toque', test: (l) => l.touchActual === 0 },
  { key: 'touch_1', label: 'Touch 1', grupo: 'toque', test: (l) => l.touchActual === 1 },
  { key: 'touch_2', label: 'Touch 2', grupo: 'toque', test: (l) => l.touchActual === 2 },
  { key: 'touch_3', label: 'Touch 3', grupo: 'toque', test: (l) => l.touchActual === 3 },
  { key: 'touch_4', label: 'Touch 4', grupo: 'toque', test: (l) => l.touchActual === 4 },
  { key: 'touch_5', label: 'Touch 5+', grupo: 'toque', test: (l) => l.touchActual >= 5 },

  { key: 'atrasado', label: 'Seguimiento atrasado', grupo: 'situacion', test: (l, h) => situacionLead(l, h) === 'atrasado' },
  { key: 'hoy', label: 'Toca hoy', grupo: 'situacion', test: (l, h) => situacionLead(l, h) === 'hoy' },
  { key: 'pendiente', label: 'Seguimiento pendiente', grupo: 'situacion', test: (l, h) => ['hoy', 'programado'].includes(situacionLead(l, h)) },
  { key: 'sin_proximo', label: 'Sin próximo toque', grupo: 'situacion', test: (l, h) => situacionLead(l, h) === 'sin_proximo' },

  { key: 'respondio', label: 'Respuesta recibida', grupo: 'resultado', test: (l) => !!l.respondioEn },
  { key: 'interesado', label: 'Interesado', grupo: 'resultado', test: (l) => l.estado === 'respondio' },
  { key: 'negociacion', label: 'Negociación', grupo: 'resultado', test: (l) => l.estado === 'negociacion' },
  { key: 'ganado', label: 'Ganado', grupo: 'resultado', test: (l) => l.estado === 'ganado' },
  { key: 'perdido', label: 'Perdido', grupo: 'resultado', test: (l) => l.estado === 'perdido' },
]

export const FILTRO_TOQUE_BY_KEY = Object.fromEntries(
  FILTROS_TOQUE.map((f) => [f.key, f]),
) as Record<string, FiltroToque>

/** Aplica un filtro por su clave. Clave vacía o desconocida = no filtrar. */
export function pasaFiltroToque(lead: Lead, clave: string, hoy: string): boolean {
  if (!clave) return true
  return FILTRO_TOQUE_BY_KEY[clave]?.test(lead, hoy) ?? true
}

/** Etiqueta legible del último contacto: "Email · hace 3 días". */
export function textoUltimoContacto(lead: Lead): string | null {
  if (!lead.ultimoContactoEn) return null
  const tipo = lead.ultimoContactoTipo ? TIPO_META[lead.ultimoContactoTipo]?.label : null
  const dias = Math.floor((Date.now() - Date.parse(lead.ultimoContactoEn)) / 86_400_000)
  const cuando = dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`
  return tipo ? `${tipo} · ${cuando}` : cuando
}

/**
 * Texto del próximo seguimiento tal y como se lee en una tarjeta: "Hoy",
 * "Mañana", "Hace 3 días" o la fecha corta. Devuelve también la clase de color
 * para que la urgencia se vea sin leer, y sale de `situacionLead` para que
 * Pipeline y Seguimiento nunca discrepen sobre qué está atrasado.
 */
export function textoProximo(
  lead: Lead,
  hoy: string,
): { texto: string; cls: string } | null {
  if (!lead.proximoSeguimiento) return null
  const fecha = lead.proximoSeguimiento.slice(0, 10)
  const sit = situacionLead(lead, hoy)
  const dias = Math.round((Date.parse(`${fecha}T00:00:00`) - Date.parse(`${hoy}T00:00:00`)) / 86_400_000)
  const texto =
    dias === 0 ? 'Hoy'
    : dias === 1 ? 'Mañana'
    : dias === -1 ? 'Ayer'
    : dias < 0 ? `Hace ${Math.abs(dias)} días`
    : dias <= 7 ? `En ${dias} días`
    : new Date(`${fecha}T00:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
  const cls =
    sit === 'atrasado' ? 'text-red-600 dark:text-red-400 font-semibold'
    : sit === 'hoy' ? 'text-primary-600 dark:text-primary-400 font-semibold'
    : 'text-muted'
  return { texto, cls }
}

/**
 * Toque que corresponde al siguiente contacto de un lead. Se enseña al
 * programar y al completar, para que el usuario nunca tenga que escribir
 * "Touch 2" a mano: el sistema ya sabe por cuál va.
 */
export function siguienteToque(lead: Lead): number {
  return lead.touchActual + 1
}

/** Lo mismo para una fila de la agenda, que no trae el lead entero. */
export function toqueDeAgenda(item: FollowUpAgendaItem): number {
  return item.orden
}
