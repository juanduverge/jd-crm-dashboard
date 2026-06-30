import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, CornerDownLeft } from 'lucide-react'
import { useUiStore } from '@/store/uiStore'
import { useLeadsStore } from '@/store/leadsStore'
import { navItems } from './navItems'
import { fuzzyMatch, cn } from '@/lib/utils'

/** Búsqueda global tipo Linear/Raycast (Cmd/Ctrl+K). */
export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen)
  const setOpen = useUiStore((s) => s.setCommandOpen)
  const leads = useLeadsStore((s) => s.leads)
  const navigate = useNavigate()
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!open)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const results = useMemo(() => {
    const pages = navItems
      .filter((n) => fuzzyMatch(n.label, q))
      .map((n) => ({ type: 'Página', label: n.label, action: () => navigate(n.to) }))
    const leadHits = leads
      .filter((l) => fuzzyMatch(`${l.empresa} ${l.email} ${l.ciudad}`, q))
      .slice(0, 6)
      .map((l) => ({
        type: 'Lead',
        label: l.empresa,
        sub: l.ciudad,
        action: () => navigate('/leads'),
      }))
    return [...pages, ...leadHits].slice(0, 12)
  }, [q, leads, navigate])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-24 animate-fade-in"
      onClick={() => setOpen(false)}
    >
      <div
        className="card w-full max-w-xl overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar en leads, campañas, páginas…"
            className="flex-1 bg-transparent py-4 text-sm outline-none placeholder:text-muted"
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">Sin resultados</p>
          )}
          {results.map((r, i) => (
            <button
              key={i}
              onClick={() => {
                r.action()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2',
              )}
            >
              <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
                {r.type}
              </span>
              <span className="flex-1 truncate text-fg">{r.label}</span>
              {'sub' in r && r.sub && <span className="text-xs text-muted">{r.sub}</span>}
              <CornerDownLeft className="h-3.5 w-3.5 text-muted" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
