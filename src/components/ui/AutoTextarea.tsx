import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Textarea que crece con el texto: empieza con una línea y se va estirando
 * hasta un tope, sin barra de scroll interna ni esquina de arrastre.
 *
 * La medida se hace sobre el propio elemento (poner `height = 'auto'` y leer
 * `scrollHeight`) en vez de contar caracteres: el alto real depende de la
 * fuente, del ancho disponible y de dónde caiga cada salto de línea, y contar
 * a ojo falla en cuanto cambia cualquiera de los tres.
 *
 * Se remide también en cada render, no sólo al teclear: si el valor lo cambia
 * el padre (abrir un modal con una descripción ya guardada), no hay evento de
 * teclado que dispare el ajuste.
 */
export interface AutoTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Alto máximo en píxeles antes de dejar que haga scroll. */
  maxHeight?: number
}

export const AutoTextarea = React.forwardRef<HTMLTextAreaElement, AutoTextareaProps>(
  ({ className, maxHeight = 320, onChange, rows = 1, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

    const ajustar = React.useCallback(() => {
      const el = innerRef.current
      if (!el) return
      el.style.height = 'auto'
      const alto = Math.min(el.scrollHeight, maxHeight)
      el.style.height = `${alto}px`
      // El scroll sólo aparece cuando ya no se puede crecer más.
      el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden'
    }, [maxHeight])

    // Sin dependencias: cualquier render puede traer un valor nuevo de fuera.
    React.useLayoutEffect(ajustar)

    return (
      <textarea
        {...props}
        rows={rows}
        ref={(el) => {
          innerRef.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        onChange={(e) => {
          ajustar()
          onChange?.(e)
        }}
        className={cn('input resize-none leading-relaxed', className)}
      />
    )
  },
)
AutoTextarea.displayName = 'AutoTextarea'

export default AutoTextarea
