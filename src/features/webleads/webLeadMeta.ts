import type { WebLeadStatus, WebLeadPriority } from '@/types'
import { initials as _initials, stringToColor } from '@/lib/utils'

/** Metadatos visuales compartidos entre la lista y el drawer del Inbox de Leads. */

export const ESTADOS: Record<WebLeadStatus, { label: string; badge: string }> = {
  nuevo: { label: 'Nuevo', badge: 'bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300' },
  en_proceso: { label: 'En proceso', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  respondido: { label: 'Respondido', badge: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400' },
  cerrado: { label: 'Cerrado', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400' },
}

export const ESTADO_ORDER: WebLeadStatus[] = ['nuevo', 'en_proceso', 'respondido', 'cerrado']

export const PRIORIDADES: Record<WebLeadPriority, { label: string; badge: string; dot: string }> = {
  baja: { label: 'Baja', badge: 'bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400', dot: 'bg-slate-400' },
  media: { label: 'Media', badge: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400', dot: 'bg-blue-500' },
  alta: { label: 'Alta', badge: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400', dot: 'bg-orange-500' },
  urgente: { label: 'Urgente', badge: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400', dot: 'bg-red-500' },
}

export const PRIORIDAD_ORDER: WebLeadPriority[] = ['baja', 'media', 'alta', 'urgente']

export const initials = _initials
export const colorFromString = stringToColor
