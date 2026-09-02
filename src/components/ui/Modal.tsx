import { useEffect, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEsMovil } from '@/hooks/useMediaQuery'

export function Modal({
  open, onClose, title, children, footer, size = 'md',
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}) {
  // En el teléfono un diálogo centrado deja el contenido lejos del pulgar y
  // el teclado lo empuja fuera de la pantalla. Ahí sube desde abajo, pegado
  // al borde inferior, como cualquier hoja del sistema.
  const esMovil = useEsMovil()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40" onClick={onClose}
          />
          <motion.div
            initial={esMovil ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 10 }}
            animate={esMovil ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={esMovil ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: 'tween', duration: 0.22 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={cn(
              'card relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden p-0',
              // Hoja inferior: solo se redondean las esquinas de arriba, que
              // son las únicas que se ven.
              'rounded-b-none sm:rounded-2xl',
              size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg',
            )}
          >
            {/* Asidero: en móvil dice «esto se arrastra y se cierra» antes de
                que haya que buscar la ✕. */}
            <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
              <span className="h-1 w-10 rounded-full bg-border" />
            </div>

            {title && (
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
                <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-fg" title={title}>{title}</h3>
                <button onClick={onClose} aria-label="Cerrar" className="btn-ghost h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9"><X className="h-5 w-5 sm:h-4 sm:w-4" /></button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">{children}</div>
            {footer && (
              // Los botones a lo ancho en móvil: en una fila de 360px se
              // apretujaban hasta quedar impulsables.
              <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+var(--safe-bottom))] sm:flex-row sm:justify-end sm:px-5 sm:pb-3 [&>*]:w-full sm:[&>*]:w-auto">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function Drawer({
  open, onClose, children, width = 'max-w-md',
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: string
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40" onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.25 }}
            role="dialog"
            aria-modal="true"
            className={cn(
              // `h-dvh` y no `h-full`: con `100%` la barra del navegador móvil
              // corta el final del panel y el último botón queda inalcanzable.
              'absolute right-0 top-0 flex h-dvh w-full flex-col overflow-y-auto overscroll-contain border-l border-border bg-surface pb-safe pt-safe',
              width,
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
