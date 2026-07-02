import { useState } from 'react'
import { Search, Bell, Sun, Moon, LogOut, Menu } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useUiStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { initials, stringToColor } from '@/lib/utils'

export function Topbar() {
  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const setCommandOpen = useUiStore((s) => s.setCommandOpen)
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
      <button onClick={toggleSidebar} className="btn-ghost md:hidden">
        <Menu className="h-5 w-5" />
      </button>

      {/* Buscador global Cmd+K */}
      <button
        onClick={() => setCommandOpen(true)}
        className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm text-muted transition-colors hover:bg-surface md:max-w-md"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left">Buscar leads, campañas…</span>
        <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 text-[10px] sm:inline">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1 md:hidden" />

      {/* Acciones */}
      <button className="btn-ghost relative" title="Notificaciones">
        <Bell className="h-5 w-5" />
        <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary-400" />
      </button>

      <button onClick={toggleTheme} className="btn-ghost" title="Modo claro/oscuro">
        {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
      </button>

      {/* Avatar */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: stringToColor(user?.name || 'JD') }}
        >
          {initials(user?.name || 'JD')}
        </button>
        {menuOpen && (
          <div
            className="card absolute right-0 z-40 mt-2 w-48 p-2"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="min-w-0 px-2 py-1.5">
              <p className="truncate text-sm font-semibold text-fg" title={user?.name}>{user?.name}</p>
              <p className="truncate text-xs text-muted" title={user?.email}>{user?.email}</p>
              <p className="mt-1 truncate text-[10px] uppercase text-primary-500">{user?.role}</p>
            </div>
            <hr className="my-1 border-border" />
            <button
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-red-500 hover:bg-surface-2"
            >
              <LogOut className="h-4 w-4" /> Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
