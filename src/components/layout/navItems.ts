import {
  Home, Users, Target, KanbanSquare, Inbox, MessageSquare,
  Bot, BarChart3, Settings, Globe,
} from 'lucide-react'

export const navItems = [
  { to: '/', label: 'Resumen', icon: Home, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/web-leads', label: 'Solicitudes Web', icon: Globe },
  { to: '/campaigns', label: 'Campañas', icon: Target },
  { to: '/pipeline', label: 'Pipeline', icon: KanbanSquare },
  { to: '/inbox', label: 'Bandeja', icon: Inbox },
  { to: '/messages', label: 'Mensajes', icon: MessageSquare },
  { to: '/automations', label: 'Automatizaciones', icon: Bot },
  { to: '/analytics', label: 'Analíticas', icon: BarChart3 },
  { to: '/settings', label: 'Configuración', icon: Settings },
] as const
