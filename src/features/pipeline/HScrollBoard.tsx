import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Contenedor con scroll horizontal + flechas ‹ › que aparecen solo cuando hay
 * contenido oculto a los lados. Sirve también como scroll container para el
 * auto-scroll de dnd-kit durante el arrastre.
 */
export function HScrollBoard({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(true)

  const update = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    setAtStart(scrollLeft <= 2)
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 2)
  }, [])

  useEffect(() => {
    update()
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    // Recalcular cuando cambie el contenido (nuevas columnas/cards).
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      ro.disconnect()
    }
  }, [update])

  const scrollBy = (dir: -1 | 1) => {
    ref.current?.scrollBy({ left: dir * Math.round((ref.current.clientWidth || 320) * 0.8), behavior: 'smooth' })
  }

  return (
    <div className="relative">
      {/* Flecha izquierda */}
      <button
        type="button"
        aria-label="Desplazar a la izquierda"
        onClick={() => scrollBy(-1)}
        className={cn(
          'absolute -left-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface p-2 shadow-card-hover transition-all hover:bg-surface-2 sm:flex',
          atStart && 'pointer-events-none opacity-0',
        )}
      >
        <ChevronLeft className="h-4 w-4 text-fg" />
      </button>

      {/* Degradados de borde para sugerir contenido oculto */}
      <div className={cn('pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-bg to-transparent transition-opacity', atStart && 'opacity-0')} />
      <div className={cn('pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-bg to-transparent transition-opacity', atEnd && 'opacity-0')} />

      <div ref={ref} className={cn('overflow-x-auto scroll-smooth', className)}>
        {children}
      </div>

      {/* Flecha derecha */}
      <button
        type="button"
        aria-label="Desplazar a la derecha"
        onClick={() => scrollBy(1)}
        className={cn(
          'absolute -right-3 top-1/2 z-20 hidden -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface p-2 shadow-card-hover transition-all hover:bg-surface-2 sm:flex',
          atEnd && 'pointer-events-none opacity-0',
        )}
      >
        <ChevronRight className="h-4 w-4 text-fg" />
      </button>
    </div>
  )
}
