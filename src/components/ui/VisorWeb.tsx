import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ExternalLink, AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'

/** Le pone https:// a lo que venga suelto ('empresa.com'). */
export function normalizarUrl(url?: string): string | undefined {
  const u = (url ?? '').trim()
  if (!u) return undefined
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

/** Solo el dominio, para el título del visor. */
export function dominio(url?: string): string {
  const u = normalizarUrl(url)
  if (!u) return ''
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u }
}

/**
 * Visor de páginas web dentro del CRM.
 *
 * Aviso honesto: muchos sitios prohíben verse dentro de otra página
 * (cabecera `X-Frame-Options` o `frame-ancestors`). Cuando eso pasa el
 * navegador no nos deja saberlo —el marco simplemente sale en blanco—, así
 * que a los pocos segundos sin señal de carga se avisa y se ofrece la pestaña
 * nueva. No es un fallo del CRM: es el sitio de la otra empresa el que manda.
 */
export function VisorWebModal({ open, onClose, url, titulo }: { open: boolean; onClose: () => void; url?: string; titulo?: string }) {
  const destino = normalizarUrl(url)
  const [cargo, setCargo] = useState(false)
  const [tarda, setTarda] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (!open) { setCargo(false); setTarda(false); return }
    timer.current = window.setTimeout(() => setTarda(true), 5000)
    return () => window.clearTimeout(timer.current)
  }, [open, destino])

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={titulo || dominio(destino)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {destino && (
            <a href={destino} target="_blank" rel="noopener noreferrer">
              <Button className="w-full"><ExternalLink className="mr-2 h-4 w-4" />Abrir en pestaña nueva</Button>
            </a>
          )}
        </>
      }
    >
      {destino ? (
        <div className="space-y-2">
          <iframe
            src={destino}
            title={titulo || dominio(destino)}
            onLoad={() => { setCargo(true); setTarda(false) }}
            referrerPolicy="no-referrer-when-downgrade"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            className={cn('h-[60vh] w-full rounded-xl border border-border bg-white', !cargo && 'animate-pulse')}
          />
          {tarda && !cargo && (
            <p className="flex items-start gap-2 rounded-lg bg-surface-2 p-2 text-xs text-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Si sigue en blanco es que este sitio no permite verse dentro de otra página. Ábrelo en una pestaña nueva.
            </p>
          )}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-muted">Este lead no tiene página web.</p>
      )}
    </Modal>
  )
}

/** Enlace que abre la web en el visor del CRM en vez de en otra ventana. */
export function EnlaceWeb({ url, children, className, title }: { url?: string; children: ReactNode; className?: string; title?: string }) {
  const [abierto, setAbierto] = useState(false)
  const destino = normalizarUrl(url)
  if (!destino) return <>{children}</>
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={title || `Ver ${dominio(destino)} sin salir del CRM`}
        className={cn('min-w-0 truncate text-left text-primary-600 hover:underline', className)}
      >
        {children}
      </button>
      <VisorWebModal open={abierto} onClose={() => setAbierto(false)} url={destino} />
    </>
  )
}
