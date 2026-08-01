import {
  Home, Users, Target, KanbanSquare, Inbox, MessageSquare,
  BarChart3, Settings, Globe, CheckSquare, Trash2, CalendarClock, Archive,
  Clock, CalendarDays, Gauge, Flag,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Estructura del menú lateral.
 *
 * Hay tres formas de entrada, y la diferencia importa:
 *
 * - `link`    — un destino.
 * - `group`   — un destino con sub-destinos, plegable. Se usa cuando los hijos
 *               son módulos distintos con datos distintos, no formas de mirar
 *               lo mismo. El modo de ver un destino (día/semana/mes de un
 *               calendario) vive dentro de la página, no aquí.
 * - `section` — un rótulo que agrupa visualmente. No navega.
 */
export interface NavLinkItem {
  kind: 'link'
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export interface NavGroupItem {
  kind: 'group'
  id: string
  label: string
  icon: LucideIcon
  /** Ruta base: se usa para saber si el grupo está activo y para abrirlo solo. */
  base: string
  children: { to: string; label: string }[]
}

export interface NavSectionItem {
  kind: 'section'
  label: string
}

export type NavItem = NavLinkItem | NavGroupItem | NavSectionItem

export const navItems: NavItem[] = [
  { kind: 'link', to: '/', label: 'Resumen', icon: Home, end: true },
  { kind: 'link', to: '/leads', label: 'Leads', icon: Users },
  { kind: 'link', to: '/web-leads', label: 'Inbox de Leads', icon: Globe },
  { kind: 'link', to: '/seguimientos', label: 'Seguimientos', icon: CalendarClock },

  { kind: 'section', label: 'Productividad' },
  {
    kind: 'group',
    id: 'metas',
    label: 'Metas',
    icon: Flag,
    base: '/productividad/metas',
    children: [
      { to: '/productividad/metas/dia', label: 'Del día' },
      { to: '/productividad/metas/semana', label: 'De la semana' },
      { to: '/productividad/metas/mes', label: 'Del mes' },
    ],
  },
  { kind: 'link', to: '/productividad/horario', label: 'Horario', icon: Clock },
  { kind: 'link', to: '/productividad/calendario', label: 'Calendario', icon: CalendarDays },
  { kind: 'link', to: '/productividad/tareas', label: 'Tareas', icon: CheckSquare },
  { kind: 'link', to: '/productividad/metricas', label: 'Métricas', icon: Gauge },

  { kind: 'section', label: 'Negocio' },
  { kind: 'link', to: '/campaigns', label: 'Campañas', icon: Target },
  { kind: 'link', to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { kind: 'link', to: '/inbox', label: 'Bandeja', icon: Inbox },
  { kind: 'link', to: '/messages', label: 'Mensajes', icon: MessageSquare },
  { kind: 'link', to: '/analytics', label: 'Analíticas', icon: BarChart3 },

  { kind: 'link', to: '/archivo', label: 'Archivo', icon: Archive },
  { kind: 'link', to: '/papelera', label: 'Papelera', icon: Trash2 },
  { kind: 'link', to: '/settings', label: 'Configuración', icon: Settings },
]

/**
 * Lista plana de todos los destinos navegables, para el buscador de comandos.
 * Los hijos de un grupo se prefijan con el grupo ("Metas · Del día") porque
 * "Del día" solo no dice a dónde lleva.
 */
export const navDestinos: { to: string; label: string }[] = navItems.flatMap((item) => {
  if (item.kind === 'link') return [{ to: item.to, label: item.label }]
  if (item.kind === 'group') {
    return item.children.map((c) => ({ to: c.to, label: `${item.label} · ${c.label}` }))
  }
  return []
})
