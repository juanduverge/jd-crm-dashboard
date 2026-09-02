import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { config } from '@/lib/config'
import { useUiStore } from '@/store/uiStore'
import { useFollowUpsAgenda } from '@/hooks/useData'
import { agruparAgenda } from '@/lib/followUps'
import { navItems } from './navItems'
import type { NavGroupItem, NavLinkItem } from './navItems'

const claseEnlace = (isActive: boolean, tactil = false) =>
  cn(
    'group flex items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
    // En el menú móvil se navega con el pulgar: las filas crecen hasta el
    // mínimo cómodo de toque en vez de quedarse en la altura de escritorio.
    tactil ? 'min-h-[44px] py-2.5' : 'py-2',
    isActive
      ? 'bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300'
      : 'text-muted hover:bg-surface-2 hover:text-fg',
  )

/** Seguimientos que piden acción hoy (vencidos + de hoy). */
function usePendientesHoy() {
  const { data: agenda } = useFollowUpsAgenda()
  if (!agenda) return 0
  const g = agruparAgenda(agenda)
  return g.vencidos.length + g.hoy.length
}

/**
 * Los enlaces del menú, iguales en escritorio y en móvil. Solo cambian dos
 * cosas: si hay sitio para los rótulos (`collapsed`) y si al pulsar hay que
 * cerrar el panel que los contiene (`onNavegar`).
 */
function ListaNav({
  collapsed,
  onNavegar,
}: {
  collapsed: boolean
  onNavegar?: () => void
}) {
  const pendientesHoy = usePendientesHoy()

  return (
    <>
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
          return <Grupo key={item.id} grupo={item} collapsed={collapsed} onNavegar={onNavegar} />
        }

        return (
          <Enlace
            key={item.to}
            item={item}
            collapsed={collapsed}
            pendientesHoy={pendientesHoy}
            onNavegar={onNavegar}
          />
        )
      })}
    </>
  )
}

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed)
  const toggle = useUiStore((s) => s.toggleSidebar)

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 248 }}
      transition={{ duration: 0.2 }}
      className="sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface md:flex"
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
        <ListaNav collapsed={collapsed} />
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

/**
 * El mismo menú en móvil, como panel sobre el contenido.
 *
 * Antes el CRM en el teléfono no tenía navegación: el lateral estaba oculto
 * por debajo de `md` y el botón de la barra solo colapsaba un panel invisible,
 * así que solo se podía cambiar de pantalla con ⌘K o escribiendo la URL.
 */
export function MobileNav() {
  const abierto = useUiStore((s) => s.mobileNavOpen)
  const setAbierto = useUiStore((s) => s.setMobileNavOpen)
  const { pathname } = useLocation()

  const cerrar = () => setAbierto(false)

  // Al pasar a escritorio el panel sobra: si se quedó abierto, el bloqueo de
  // scroll del body seguiría puesto sobre una pantalla que ya no lo necesita.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const alCambiar = () => {
      if (mq.matches) setAbierto(false)
    }
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [setAbierto])

  useEffect(() => {
    const alPulsarEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    if (abierto) window.addEventListener('keydown', alPulsarEsc)
    return () => window.removeEventListener('keydown', alPulsarEsc)
  }, [abierto, setAbierto])

  // Si el menú desaparece con el panel abierto (cerrar sesión, por ejemplo),
  // el body se quedaría bloqueado sin nada que lo desbloquee.
  useEffect(() => () => document.body.classList.remove('nav-abierto'), [])

  return (
    <AnimatePresence>
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50"
            onClick={cerrar}
          />
          <motion.nav
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.22 }}
            aria-label="Menú principal"
            className="absolute inset-y-0 left-0 flex w-[82vw] max-w-[300px] flex-col border-r border-border bg-surface pb-safe pt-safe"
          >
            <div className="flex h-16 shrink-0 items-center gap-3 px-4">
              <img src={config.business.logo} alt="JD" className="h-9 w-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="text-sm font-bold text-fg">JD Developer</p>
                <p className="text-[11px] text-muted">CRM</p>
              </div>
              <button onClick={cerrar} aria-label="Cerrar menú" className="btn-ghost h-11 w-11 p-0">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* `key` en la ruta: al navegar, la lista vuelve arriba en lugar de
                reabrirse por donde estaba el scroll de la vez anterior. */}
            <div key={pathname} className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
              <ListaNav collapsed={false} onNavegar={cerrar} />
            </div>
          </motion.nav>
        </div>
      )}
    </AnimatePresence>
  )
}

function Enlace({
  item,
  collapsed,
  pendientesHoy,
  onNavegar,
}: {
  item: NavLinkItem
  collapsed: boolean
  pendientesHoy: number
  onNavegar?: () => void
}) {
  const conBadge = item.to === '/seguimientos' && pendientesHoy > 0

  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavegar}
      className={({ isActive }) => claseEnlace(isActive, !!onNavegar)}
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

function Grupo({
  grupo,
  collapsed,
  onNavegar,
}: {
  grupo: NavGroupItem
  collapsed: boolean
  onNavegar?: () => void
}) {
  const { pathname } = useLocation()
  const guardado = useUiStore((s) => s.navGroups[grupo.id])
  const toggleGrupo = useUiStore((s) => s.toggleNavGroup)

  const dentro = pathname.startsWith(grupo.base)
  // Estando dentro del grupo se abre solo: llegar por un enlace o por la URL y
  // encontrarse el menú cerrado sobre la pantalla en la que estás no ayuda.
  const abierto = guardado ?? dentro

  if (collapsed) {
    // Sin rótulos el acordeón no aporta nada, así que los hijos con icono se
    // despliegan sueltos: seis iconos siguen siendo navegables de un clic.
    // Si el grupo no los tiene, se comporta como enlace a su primer hijo.
    const conIcono = grupo.children.filter((c) => c.icon)
    if (conIcono.length === 0) {
      return (
        <NavLink to={grupo.children[0].to} className={() => claseEnlace(dentro)} title={grupo.label}>
          <grupo.icon className="h-[18px] w-[18px] shrink-0" />
        </NavLink>
      )
    }
    return (
      <div className="space-y-1 border-y border-border py-1">
        {conIcono.map((hijo) => {
          const Icono = hijo.icon!
          return (
            <NavLink
              key={hijo.to}
              to={hijo.to}
              className={({ isActive }) => claseEnlace(isActive)}
              title={`${grupo.label} · ${hijo.label}`}
            >
              <Icono className="h-[18px] w-[18px] shrink-0" />
            </NavLink>
          )
        })}
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => toggleGrupo(grupo.id)}
        aria-expanded={abierto}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
          onNavegar ? 'min-h-[44px] py-2.5' : 'py-2',
          dentro ? 'text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
        )}
      >
        <grupo.icon className="h-[18px] w-[18px] shrink-0" />
        <span className="truncate">{grupo.label}</span>
        <ChevronDown
          className={cn('ml-auto h-4 w-4 shrink-0 transition-transform', abierto && 'rotate-180')}
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
            <div className="ml-[26px] mt-1 space-y-0.5 border-l border-border pl-2">
              {grupo.children.map((hijo) => {
                const Icono = hijo.icon
                const activo = hijo.match
                  ? pathname.startsWith(hijo.match)
                  : pathname === hijo.to || pathname.startsWith(`${hijo.to}/`)
                return (
                  <NavLink
                    key={hijo.to}
                    to={hijo.to}
                    onClick={onNavegar}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors',
                      onNavegar ? 'min-h-[40px] py-2' : 'py-1.5',
                      activo
                        ? 'bg-primary-50 font-medium text-primary-600 dark:bg-primary-400/15 dark:text-primary-300'
                        : 'text-muted hover:bg-surface-2 hover:text-fg',
                    )}
                  >
                    {Icono && <Icono className="h-4 w-4 shrink-0" />}
                    <span className="truncate">{hijo.label}</span>
                  </NavLink>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
