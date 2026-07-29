import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Clock, X } from 'lucide-react'
import { useFollowUpsAgenda } from '@/hooks/useData'
import { agruparAgenda, today } from '@/lib/followUps'
import { cn } from '@/lib/utils'

// Se descarta por día: al abrir el CRM al día siguiente vuelve a avisar, que es
// justo el punto. Guardamos la fecha, no un booleano.
const DISMISS_KEY = 'jd-crm-followups-banner-dismissed'

/**
 * Aviso de seguimientos vencidos y de hoy, visible al entrar al CRM.
 *
 * Es el eslabón que faltaba: el sistema puede tener la agenda perfecta, pero
 * si nadie la abre, sigue sin revisarse. Esto la pone delante sin pedir permiso.
 *
 * No se muestra en /seguimientos (ahí ya estás viendo la lista) ni cuando no
 * hay nada vencido ni para hoy.
 */
export function FollowUpsBanner() {
  const { data } = useFollowUpsAgenda()
  const navigate = useNavigate()
  const location = useLocation()
  const [dismissedAt, setDismissedAt] = useState(() => localStorage.getItem(DISMISS_KEY))

  if (location.pathname === '/seguimientos') return null
  if (dismissedAt === today()) return null
  if (!data || data.length === 0) return null

  const { vencidos, hoy } = agruparAgenda(data)
  if (vencidos.length === 0 && hoy.length === 0) return null

  const hayVencidos = vencidos.length > 0

  const descartar = () => {
    const d = today()
    localStorage.setItem(DISMISS_KEY, d)
    setDismissedAt(d)
  }

  return (
    <div
      className={cn(
        'mx-auto mb-4 flex max-w-[1500px] flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
        hayVencidos
          ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
          : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
      )}
      role="status"
    >
      <span className={hayVencidos ? 'text-red-500' : 'text-amber-500'}>
        {hayVencidos ? <AlertTriangle className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
      </span>

      <p className="min-w-0 flex-1 text-sm text-fg">
        {hayVencidos && (
          <>
            Tienes{' '}
            <strong className="text-red-600 dark:text-red-400">
              {vencidos.length} seguimiento{vencidos.length === 1 ? '' : 's'} vencido
              {vencidos.length === 1 ? '' : 's'}
            </strong>
          </>
        )}
        {hayVencidos && hoy.length > 0 && ' y '}
        {hoy.length > 0 && (
          <>
            {!hayVencidos && 'Tienes '}
            <strong>{hoy.length} para hoy</strong>
          </>
        )}
        .
      </p>

      <button
        onClick={() => navigate('/seguimientos')}
        className={cn(
          'btn h-8 gap-1 px-3 text-xs text-white',
          hayVencidos ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600',
        )}
      >
        Ver seguimientos <ArrowRight className="h-3.5 w-3.5" />
      </button>
      <button onClick={descartar} className="btn-ghost h-8 w-8 shrink-0" title="Ocultar por hoy">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
