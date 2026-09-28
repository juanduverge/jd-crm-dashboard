import { useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/store/authStore'

/**
 * Cambio de contraseña de Supabase.
 *
 * La regla es la misma que exige Supabase Auth (Sign In / Providers → Email,
 * puesta el 28-sep-2026): 12 caracteres con minúsculas, mayúsculas y números.
 * Se valida aquí para avisar antes de enviar; si algún día se cambia en
 * Supabase y no aquí, Supabase la rechaza igual y se muestra su mensaje.
 *
 * Se pide la contraseña actual aunque Supabase no la exija con la sesión
 * abierta: el CRM se queda con la sesión iniciada semanas, y un navegador
 * desatendido no debería bastar para cambiarla.
 */
const REGLAS: { ok: (p: string) => boolean; texto: string }[] = [
  { ok: (p) => p.length >= 12, texto: '12 caracteres o más' },
  { ok: (p) => /[a-z]/.test(p), texto: 'una minúscula' },
  { ok: (p) => /[A-Z]/.test(p), texto: 'una mayúscula' },
  { ok: (p) => /\d/.test(p), texto: 'un número' },
]

export function CuentaCard() {
  const email = useAuthStore((s) => s.user?.email ?? '')
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cumple = REGLAS.every((r) => r.ok(nueva))
  const coincide = nueva === repetida
  const listo = !!actual && cumple && coincide && nueva !== actual

  const limpiar = () => { setActual(''); setNueva(''); setRepetida('') }

  const guardar = async () => {
    if (!listo || !email) return
    setGuardando(true)
    try {
      const { error: errActual } = await supabase.auth.signInWithPassword({ email, password: actual })
      if (errActual) { toast.error('La contraseña actual no es correcta'); return }

      const { error } = await supabase.auth.updateUser({ password: nueva })
      if (error) { toast.error(`Supabase no la aceptó: ${error.message}`); return }

      limpiar()
      toast.success('Contraseña cambiada. Guárdala en un sitio seguro.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="t-hint text-xs">
        Es la contraseña de <span className="font-medium text-fg">{email || 'tu cuenta'}</span> en
        Supabase, la segunda puerta después del código de Cloudflare.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="pass-actual" className="t-label mb-1.5">Contraseña actual</label>
          <Input
            id="pass-actual" type="password" autoComplete="current-password"
            value={actual} onChange={(e) => setActual(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pass-nueva" className="t-label mb-1.5">Nueva contraseña</label>
          <Input
            id="pass-nueva" type="password" autoComplete="new-password"
            value={nueva} onChange={(e) => setNueva(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="pass-repetida" className="t-label mb-1.5">Repite la nueva</label>
          <Input
            id="pass-repetida" type="password" autoComplete="new-password"
            value={repetida} onChange={(e) => setRepetida(e.target.value)}
          />
        </div>
      </div>

      {nueva && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {REGLAS.map((r) => (
            <li key={r.texto} className={r.ok(nueva) ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted'}>
              {r.ok(nueva) ? '✓' : '·'} {r.texto}
            </li>
          ))}
          {repetida && !coincide && <li className="text-red-500">No coinciden</li>}
          {nueva === actual && <li className="text-red-500">Es igual a la actual</li>}
        </ul>
      )}

      {(actual || nueva || repetida) && (
        <div className="flex flex-col-reverse items-stretch gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
          <Button variant="ghost" size="sm" onClick={limpiar} disabled={guardando}>Descartar</Button>
          <Button size="sm" onClick={guardar} disabled={!listo || guardando}>
            {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cambiar contraseña
          </Button>
        </div>
      )}
    </div>
  )
}
