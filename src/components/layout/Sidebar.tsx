import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { config } from '@/lib/config'
import { useUiStore } from '@/store/uiStore'
import { useFollowUpsAgenda } from '@/hooks/useData'
import { agruparAgenda } from '@/lib/followUps'
import { navItems } from './navItems'
import type { NavGroupItem, NavLinkItem } from './navItems'

const claseEnlace = (isActive: boolean) =>
  cn(
    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300'
      : 'text-muted hover:bg-surface-2 hover:text-fg',
  )

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)

  // Contador de seguimientos que requieren acción hoy (vencidos + de hoy).
  // Visible incluso con el sidebar colapsado: es el punto de todo el módulo.
  const { data: agenda } = useFollowUpsAgenda()
  const pendientesHoy = (() => {
    if (!agenda) return 0
    const g = agruparAgenda(agenda)
    return g.vencidos.length + g.hoy.length
  })()

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
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {navItems.map((item, i) => {
          if (item.kind === 'section') {
            // Colapsado no hay sitio para el rótulo: una línea separa igual de bien.
            if (collapsed) return <hr key={`s-${i}`} className="my-2 border-border" />
            return (
              <p
                key={`s-${i}`}
                className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-muted/70"
              >
                {item.label}
              </p>
            )
          }

          if (item.kind === 'group') {
            return <Grupo key={item.id} grupo={item} collapsed={collapsed} />
          }

          return (
            <Enlace
              key={item.to}
              item={item}
              collapsed={collapsed}
              pendientesHoy={pendientesHoy}
            />
          )
        })}
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

function Enlace({
  item,
  collapsed,
  pendientesHoy,
}: {
  item: NavLinkItem
  collapsed: boolean
  pendientesHoy: number
}) {
  const conBadge = item.to === '/seguimientos' && pendientesHoy > 0

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => claseEnlace(isActive)}
      title={collapsed ? item.label : undefined}
    >
      <span className="relative shrink-0">
        <item.icon className="h-[18px] w-[18px]" />
        {/* Con el sidebar colapsado no hay sitio para el número: un punto
            basta para saber que hay algo que atender. */}
        {conBadge && collapsed && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-surface" />
        )}
      </span>
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && conBadge && (
        <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
          {pendientesHoy}
        </span>
      )}
    </NavLink>
  )
}

function Grupo({ grupo, collapsed }: { grupo: NavGroupItem; collapsed: boolean }) {
  const { pathname } = useLocation()
  const abierto = useUiStore((s) => s.navGroups[grupo.id] ?? false)
  const toggleGrupo = useUiStore((s) => s.toggleNavGroup)

  const dentro = pathname.startsWith(grupo.base)

  // Colapsado el acordeón no cabe: el grupo se comporta como un enlace directo
  // a su primer hijo, que es lo que el usuario espera al pulsar el icono.
  if (collapsed) {
    return (
      <NavLink
        to={grupo.children[0].to}
        className={() => claseEnlace(dentro)}
        title={grupo.label}
      >
        <grupo.icon className="h-[18px] w-[18px] shrink-0" />
      </NavLink>
    )
  }

  return (
    <div>
      <button
        onClick={() => toggleGrupo(grupo.id)}
        aria-expanded={abierto}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
          dentro ? 'text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        <grupo.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">{grupo.label}</span>
        <ChevronDown
          className={cn(
            'ml-auto h-4 w-4 shrink-0 transition-transform',
            abierto && 'rotate-180',
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {abierto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            {/* La guía vertical hace evidente que estos elementos cuelgan del grupo. */}
            <div className="ml-[26px] mt-1 space-y-0.5 border-l border-border pl-3">
              {grupo.children.map((hijo) => (
                <NavLink
                  key={hijo.to}
                  to={hijo.to}
                  className={({ isActive }) =>
                    cn(
                      'block rounded-lg px-3 py-1.5 text-[13px] transition-colors',
                      isActive
                        ? 'bg-primary-50 font-medium text-primary-600 dark:bg-primary-400/15 dark:text-primary-300'
                        : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )
                  }
                >
                  {hijo.label}
                </NavLink>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
