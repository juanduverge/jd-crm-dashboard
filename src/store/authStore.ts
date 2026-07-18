import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'

export type Role = 'admin' | 'vendedor' | 'viewer'

interface User {
  id: string
  name: string
  email: string
  role: Role
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  /** true hasta que Supabase resuelve la sesión inicial */
  initializing: boolean
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  init: () => void
}

/** Construye el User a partir de la sesión + la fila de profiles. */
async function buildUser(session: Session | null): Promise<User | null> {
  if (!session?.user) return null
  const { user } = session
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role')
    .eq('id', user.id)
    .single()

  return {
    id: user.id,
    email: user.email ?? '',
    name: profile?.name ?? user.email?.split('@')[0] ?? 'Usuario',
    role: (profile?.role as Role) ?? 'viewer',
  }
}

/**
 * Auth sobre Supabase: sesión gestionada por supabase-js (persistencia y
 * refresh automáticos). El rol viaja en la tabla profiles (RLS lo respeta).
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  initializing: true,

  login: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, error: error.message }
    const user = await buildUser(data.session)
    set({ user, isAuthenticated: !!user })
    return { ok: true }
  },

  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, isAuthenticated: false })
  },

  init: () => {
    // Sesión inicial (restaurada de localStorage por supabase-js)
    supabase.auth.getSession().then(async ({ data }) => {
      const user = await buildUser(data.session)
      set({ user, isAuthenticated: !!user, initializing: false })
    })

    // Cambios posteriores (login/logout/refresh en otra pestaña)
    supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = await buildUser(session)
      set({ user, isAuthenticated: !!user, initializing: false })
    })
  },
}))
