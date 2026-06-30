import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'
type Density = 'compact' | 'comfortable' | 'spacious'

interface UiState {
  theme: Theme
  sidebarCollapsed: boolean
  density: Density
  lang: 'es' | 'en'
  commandOpen: boolean
  toggleTheme: () => void
  setTheme: (t: Theme) => void
  toggleSidebar: () => void
  setDensity: (d: Density) => void
  setLang: (l: 'es' | 'en') => void
  setCommandOpen: (v: boolean) => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      theme: 'light', // default light, igual a la web
      sidebarCollapsed: false,
      density: 'comfortable',
      lang: 'es',
      commandOpen: false,
      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light'
        set({ theme: next })
        applyTheme(next)
      },
      setTheme: (t) => {
        set({ theme: t })
        applyTheme(t)
      },
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setDensity: (d) => set({ density: d }),
      setLang: (l) => set({ lang: l }),
      setCommandOpen: (v) => set({ commandOpen: v }),
    }),
    { name: 'jd-crm-ui' },
  ),
)

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}
