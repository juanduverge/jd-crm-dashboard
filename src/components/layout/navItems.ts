import {
  Home, Users, Target, KanbanSquare, Inbox, MessageSquare,
  BarChart3, Settings, Globe, CheckSquare, Trash2,
} from 'lucide-react'

export const navItems = [
  { to: '/', label: 'Resumen', icon: Home, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/web-leads', label: 'Inbox de Leads', icon: Globe },
  { to: '/tareas', label: 'Tareas', icon: CheckSquare },
  { to: '/campaigns', label: 'Campañas', icon: Target },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/inbox', label: 'Bandeja', icon: Inbox },
  { to: '/messages', label: 'Mensajes', icon: MessageSquare },
  { to: '/analytics', label: 'Analíticas', icon: BarChart3 },
  { to: '/papelera', label: 'Papelera', icon: Trash2 },
  { to: '/settings', label: 'Configuración', icon: Settings },
] as const
