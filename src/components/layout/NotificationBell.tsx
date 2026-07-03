import { useMemo, useState } from 'react'
import { Bell, Mail, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useInbox, useSearchLog } from '@/hooks/useData'
import { cn } from '@/lib/utils'

const SEEN_STORAGE_KEY = 'jd-crm-notif-seen-at'

function loadSeenAt(): number {
  const raw = localStorage.getItem(SEEN_STORAGE_KEY)
  return raw ? Number(raw) : 0
}

interface NotifEvent {
  id: string
  type: 'message' | 'search'
  title: string
  subtitle: string
  time: number
  onClick: () => void
}

export function NotificationBell() {
  const { data: emails } = useInbox()
  const { data: searches } = useSearchLog()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [seenAt, setSeenAt] = useState(() => loadSeenAt())

  const events = useMemo<NotifEvent[]>(() => {
    const msgEvents: NotifEvent[] = (emails ?? [])
      .filter((e) => !e.leido)
      .slice(0, 8)
      .map((e) => ({
        id: `msg-${e.id}`,
        type: 'message',
        title: e.deNombre || e.deEmail,
        subtitle: e.asunto || '(sin asunto)',
        time: new Date(e.fecha.replace(' ', 'T')).getTime() || 0,
        onClick: () => navigate('/inbox'),
      }))

    const searchEvents: NotifEvent[] = (searches ?? [])
      .slice(-8)
      .reverse()
      .map((s, i) => ({
        id: `search-${s.fecha ?? i}-${i}`,
        type: 'search',
        title: 'Búsqueda de leads iniciada',
        subtitle: `${s.tipo_negocio || s['Tipo Negocio'] || '—'} · ${s.ciudad || s.Ciudad || '—'}`,
        time: new Date((s.fecha || '').toString().replace(' ', 'T')).getTime() || 0,
        onClick: () => navigate('/leads'),
      }))

    return [...msgEvents, ...searchEvents].sort((a, b) => b.time - a.time).slice(0, 10)
  }, [emails, searches, navigate])

  const unseenCount = events.filter((e) => e.time > seenAt).length

  const toggle = () => {
    setOpen((v) => !v)
    if (!open) {
      const now = Date.now()
      setSeenAt(now)
      localStorage.setItem(SEEN_STORAGE_KEY, String(now))
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="btn-ghost relative" title="Notificaciones">
        <Bell className="h-5 w-5" />
        {unseenCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unseenCount > 9 ? '9+' : unseenCount}
          </span>
        )}
      </button>
      {open && (
        <div
          className="card absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto p-2"
          onMouseLeave={() => setOpen(false)}
        >
          <p className="px-2 py-1.5 text-xs font-semibold uppercase text-muted">Notificaciones</p>
          {events.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted">Sin novedades por ahora.</p>
          ) : (
            events.map((e) => (
              <button
                key={e.id}
                onClick={() => { e.onClick(); setOpen(false) }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-surface-2',
                )}
              >
                <span className={cn('mt-0.5 rounded-md p-1', e.type === 'message' ? 'bg-primary-400/10 text-primary-500' : 'bg-amber-400/10 text-amber-500')}>
                  {e.type === 'message' ? <Mail className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{e.title}</span>
                  <span className="block truncate text-xs text-muted">{e.subtitle}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
