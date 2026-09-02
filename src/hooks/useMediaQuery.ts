import { useEffect, useState } from 'react'

/**
 * Responde a una media query y se reevalúa al girar o redimensionar.
 *
 * Es para lo que el CSS no puede resolver solo: cambiar el comportamiento de
 * un componente (de dónde entra un panel, si una lista es tabla o tarjetas),
 * no su aspecto. Para lo que sea puramente visual, la clase `md:` gana.
 */
export function useMediaQuery(query: string): boolean {
  const [coincide, setCoincide] = useState(
    // SSR y el primer render del test no tienen `matchMedia`.
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const alCambiar = (e: MediaQueryListEvent) => setCoincide(e.matches)
    setCoincide(mq.matches)
    mq.addEventListener('change', alCambiar)
    return () => mq.removeEventListener('change', alCambiar)
  }, [query])

  return coincide
}

/** `true` en teléfono (por debajo del breakpoint `md` de Tailwind). */
export function useEsMovil(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
