import { digitos } from '@/lib/perfilTrabajo'
import type { EventoAccion, FollowUpTipo, Lead } from '@/types'

/**
 * Agendar desde la ficha (0076): qué se puede agendar, qué texto proponer y
 * cómo abrir WhatsApp con el mensaje ya escrito cuando llega la hora.
 *
 * WhatsApp no se automatiza (no hay forma gratis y expone el número): el CRM
 * deja el mensaje preparado y a la hora te lo pone a un toque.
 */

export const ACCIONES: { a: EventoAccion; label: string; verbo: string; duracionMin: number }[] = [
  { a: 'llamada', label: 'Llamada', verbo: 'Llamar a', duracionMin: 15 },
  { a: 'whatsapp', label: 'WhatsApp', verbo: 'WhatsApp a', duracionMin: 5 },
  { a: 'correo', label: 'Correo', verbo: 'Correo a', duracionMin: 10 },
  { a: 'otro', label: 'Otra cosa', verbo: 'Seguimiento de', duracionMin: 15 },
]

export const metaAccion = (a?: EventoAccion) => ACCIONES.find((x) => x.a === a) ?? ACCIONES[3]

/** El seguimiento que se programa a la vez, para que salga en Mi día y cuente en las métricas. */
export const TIPO_SEGUIMIENTO: Record<EventoAccion, FollowUpTipo> = {
  llamada: 'llamada',
  whatsapp: 'whatsapp',
  correo: 'email',
  otro: 'otro',
}

export type Motivo = 'primera' | 'seguimiento' | 'cierre'

export const MOTIVOS: { m: Motivo; label: string; ayuda: string }[] = [
  { m: 'primera', label: 'Primer contacto', ayuda: 'Presentarte y ver si le interesa' },
  { m: 'seguimiento', label: 'Seguimiento', ayuda: 'No respondió o quedó en pensarlo' },
  { m: 'cierre', label: 'Propuesta / cierre', ayuda: 'Ya habló contigo: cerrar el siguiente paso' },
]

/** Lo más probable según cómo va el lead; se puede cambiar en el modal. */
export function motivoSugerido(lead: Lead): Motivo {
  if (['respondio', 'reunion', 'propuesta', 'negociacion'].includes(lead.estado) || lead.respondioEn) return 'cierre'
  if (lead.touchActual > 0) return 'seguimiento'
  return 'primera'
}

/**
 * Texto propuesto. Corto a propósito: un WhatsApp largo de alguien que no
 * conoces no se lee. En inglés si el lead está marcado así.
 */
export function plantillaMensaje(lead: Lead, motivo: Motivo, accion: EventoAccion): string {
  const en = lead.idioma === 'en'
  const nombre = lead.empresa
  if (accion === 'correo') {
    if (en) {
      return {
        primera: `Hi ${nombre} team,\n\nI took a look at your online presence and saw a few quick wins that could bring you more customers from Google. Would you be open to a 15-minute call this week?\n\nBest,`,
        seguimiento: `Hi again,\n\nJust following up on my last message. Happy to send you a short free review of your website if that helps.\n\nBest,`,
        cierre: `Hi,\n\nAs we discussed, here are the next steps. Let me know which day works best to move forward.\n\nBest,`,
      }[motivo]
    }
    return {
      primera: `Hola, equipo de ${nombre}:\n\nEstuve revisando su presencia en internet y vi varias mejoras rápidas que les podrían traer más clientes desde Google. ¿Les viene bien una llamada de 15 minutos esta semana?\n\nUn saludo,`,
      seguimiento: `Hola de nuevo:\n\nTe escribo por si no viste mi mensaje anterior. Si te sirve, te mando una revisión gratis y corta de tu web.\n\nUn saludo,`,
      cierre: `Hola:\n\nComo hablamos, te dejo los siguientes pasos. Dime qué día te viene mejor para avanzar.\n\nUn saludo,`,
    }[motivo]
  }
  if (en) {
    return {
      primera: `Hi! I'm Juan from JD Developer. I came across ${nombre} and noticed a couple of things on your website that could bring you more customers. Can I send you a quick idea?`,
      seguimiento: `Hi! Just following up on my last message about ${nombre}'s website. Would you like me to send you a free quick review?`,
      cierre: `Hi! Following up on our conversation. Shall we set a time to go over the next steps?`,
    }[motivo]
  }
  return {
    primera: `¡Hola! Soy Juan, de JD Developer. Vi ${nombre} y noté un par de cosas en su web que les podrían traer más clientes. ¿Te puedo mandar una idea rápida?`,
    seguimiento: `¡Hola! Te escribo por mi mensaje anterior sobre la web de ${nombre}. ¿Quieres que te mande una revisión rápida y gratis?`,
    cierre: `¡Hola! Retomo lo que hablamos. ¿Buscamos un momento para ver los siguientes pasos?`,
  }[motivo]
}

/** El número al que se escribe por WhatsApp: el de WhatsApp si lo hay, si no el teléfono. */
export const numeroWhatsApp = (lead: Pick<Lead, 'whatsapp' | 'telefono'>) => digitos(lead.whatsapp || lead.telefono)

export function urlWhatsApp(numero: string, texto?: string): string {
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}
