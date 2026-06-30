import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { Lock, ArrowRight } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { config } from '@/lib/config'
import { Button, Input } from '@/components/ui'

export function LoginPage() {
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setTimeout(() => {
      if (login(password)) {
        toast.success('Bienvenido de nuevo 👋')
        navigate('/')
      } else {
        toast.error('Contraseña incorrecta')
        setLoading(false)
      }
    }, 400)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-crema px-4 dark:bg-bg">
      {/* Lado decorativo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-400/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-brand-violeta/10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card relative z-10 w-full max-w-sm p-8"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={config.business.logo}
            alt="JDDeveloper"
            className="mb-3 h-16 w-16 rounded-2xl shadow-card"
          />
          <h1 className="text-xl font-bold text-fg">JDDeveloper CRM</h1>
          <p className="mt-1 text-sm text-muted">Centro de control de tu agencia</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              type="password"
              autoFocus
              placeholder="Contraseña"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted">
          Preparado para multi-usuario y 2FA · {new Date().getFullYear()} JDDeveloper
        </p>
      </motion.div>
    </div>
  )
}
