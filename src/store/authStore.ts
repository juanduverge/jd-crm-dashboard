import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { config } from '@/lib/config'

export type Role = 'admin' | 'vendedor' | 'viewer'

interface User {
  name: string
  email: string
  role: Role
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (password: string) => boolean
  logout: () => void
}

/**
 * Auth v1: contraseña única (JDDeveloper2026), sesión persistida en localStorage.
 * Estructura lista para multi-usuario con roles y, a futuro, 2FA TOTP.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: (password) => {
        if (password === config.appPassword) {
          set({
            isAuthenticated: true,
            user: { name: 'JD Developer', email: config.business.emailMain, role: 'admin' },
          })
          return true
        }
        return false
      },
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    { name: 'jd-crm-auth' },
  ),
)
