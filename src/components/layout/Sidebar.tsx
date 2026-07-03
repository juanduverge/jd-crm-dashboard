import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { config } from '@/lib/config'
import { useUiStore } from '@/store/uiStore'
import { navItems } from './navItems'

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ duration: 0.2 }}
      className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface md:flex"
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4">
        <img src={config.business.logo} alt="JD" className="h-9 w-9 shrink-0 rounded-xl" />
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm font-bold text-fg">JD Developer</p>
            <p className="text-[11px] text-muted">CRM</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={'end' in item ? item.end : undefined}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300'
                  : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse */}
      <button
        onClick={toggle}
        className="m-3 flex items-center justify-center gap-2 rounded-xl border border-border py-2 text-xs text-muted hover:bg-surface-2"
      >
        <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        {!collapsed && 'Colapsar'}
      </button>
    </motion.aside>
  )
}
