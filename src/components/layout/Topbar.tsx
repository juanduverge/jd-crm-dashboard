import { useState } from 'react'
import { Search, Sun, Moon, LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { initials, stringToColor } from '@/lib/utils'
import { NotificationBell } from './NotificationBell'

export function Topbar() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen)
  const setCommandOpen = useUiStore((s) => s.setCommandOpen)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-[calc(var(--topbar-h)+var(--safe-top))] items-center gap-1.5 border-b border-border bg-surface/85 px-2 pt-safe backdrop-blur sm:gap-3 sm:px-4">
      {/* En móvil este botón es la única puerta al menú: abre el panel lateral. */}
      <button
        onClick={() => setMobileNavOpen(true)}
        aria-label="Abrir menú"
        className="btn-ghost h-11 w-11 shrink-0 p-0 md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Buscador global Cmd+K */}
      <button
        onClick={() => setCommandOpen(true)}
        className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 text-sm text-muted transition-colors hover:bg-surface md:max-w-md"
      >
        <Search className="h-4 w-4 shrink-0" />
        {/* El texto largo no cabe en un teléfono estrecho: allí basta el verbo. */}
        <span className="flex-1 truncate text-left">
          <span className="sm:hidden">Buscar</span>
          <span className="hidden sm:inline">Buscar leads, campañas…</span>
        </span>
        <kbd className="hidden shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      {/* Acciones */}
      <NotificationBell />

      <button
        onClick={toggleTheme}
        className="btn-ghost h-11 w-11 shrink-0 p-0"
        title="Modo claro/oscuro"
      >
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      {/* Avatar */}
      <div className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: stringToColor(user?.name || 'JD') }}
        >
          {initials(user?.name || 'JD')}
        </button>
        {menuOpen && (
          <>
            {/* Sin ratón no hay `mouseleave`: en el teléfono el menú se cerraba
                solo pulsando otra vez el avatar. Esta capa lo cierra al tocar
                fuera, que es lo que espera cualquiera. */}
            <div
              className="fixed inset-0 z-30"
              aria-hidden
              onClick={() => setMenuOpen(false)}
            />
            <div className="card absolute right-0 z-40 mt-2 w-56 p-2">
              <div className="min-w-0 px-2 py-1.5">
                <p className="truncate text-sm font-semibold text-fg" title={user?.name}>
                  {user?.name}
                </p>
                <p className="truncate text-xs text-muted" title={user?.email}>
                  {user?.email}
                </p>
                <p className="mt-1 truncate text-[10px] uppercase text-primary-500">{user?.role}</p>
              </div>
              <hr className="my-1 border-border" />
              <button
                onClick={() => {
                  logout()
                  navigate('/login')
                }}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-2 text-sm text-red-500 hover:bg-surface-2"
              >
                <LogOut className="h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
