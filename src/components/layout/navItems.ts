import {
  Home, Users, Target, KanbanSquare, Inbox, MessageSquare,
  BarChart3, Settings, Globe, CheckSquare, Trash2, CalendarClock, Archive,
  CalendarDays, Gauge, Flag, Sun, Rocket, Send, FileText, Briefcase, Map as MapIcon,
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
  /**
   * El icono del hijo sólo se usa con el sidebar colapsado, donde el acordeón
   * no cabe y los hijos se despliegan como iconos sueltos. Sin él, el grupo
   * colapsado se comporta como un enlace a su primer hijo.
   */
  children: {
    to: string
    label: string
    icon?: LucideIcon
    /** Prefijo que marca el hijo como activo cuando `to` no basta (Metas tiene
     *  tres periodos bajo la misma entrada de menú). */
    match?: string
  }[]
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

  // Productividad: cuatro pantallas desde el 20-nov (antes seis que se pisaban).
  // Horario, Tareas y Registro de tiempo siguen existiendo, pero se llega desde
  // Mi día y Rendimiento: como pantallas sueltas nadie las usaba.
  {
    kind: 'group',
    id: 'productividad',
    label: 'Productividad',
    icon: Rocket,
    base: '/productividad',
    children: [
      { to: '/productividad/hoy', label: 'Mi día', icon: Sun },
      { to: '/productividad/calendario', label: 'Calendario', icon: CalendarDays },
      { to: '/productividad/metas', label: 'Metas', icon: Flag },
      { to: '/productividad/rendimiento', label: 'Rendimiento', icon: Gauge },
    ],
  },

  { kind: 'section', label: 'Negocio' },
  { kind: 'link', to: '/campaigns', label: 'Campañas', icon: Target },
  { kind: 'link', to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  // Justo después del pipeline: es donde va un lead cuando se gana.
  { kind: 'link', to: '/proyectos', label: 'Proyectos', icon: Briefcase },
  { kind: 'link', to: '/inbox', label: 'Bandeja', icon: Inbox },
  { kind: 'link', to: '/messages', label: 'Mensajes', icon: MessageSquare },
  { kind: 'link', to: '/correos', label: 'Correos programados', icon: Send },
  { kind: 'link', to: '/contenido', label: 'Blog CMS', icon: FileText },
  { kind: 'link', to: '/mapa', label: 'Mapa', icon: MapIcon },
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
}).concat(
  // «Ver el servidor» vive en el menú del perfil, no en el lateral; aquí se
  // añade para que también aparezca al buscar «servidor».
  { to: '/servidor', label: 'Ver el servidor' },
)
