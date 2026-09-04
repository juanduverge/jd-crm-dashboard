import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useEsMovil } from '@/hooks/useMediaQuery'
import { cn, initials, stringToColor } from '@/lib/utils'

/**
 * Lista + detalle, la forma de toda pantalla de mensajería.
 *
 * En escritorio son dos columnas. En el teléfono eran dos tarjetas apiladas:
 * había que pasar por encima de los veinte remitentes para llegar al correo
 * abierto, y el correo abierto no se veía nunca entero. Aquí el móvil enseña
 * una cosa cada vez, con su flecha de volver, como cualquier app de correo.
 */
export function MaestroDetalle({
  lista,
  detalle,
  abierto,
  onVolver,
  tituloVuelta,
}: {
  lista: ReactNode
  detalle: ReactNode
  /** Hay algo seleccionado: en móvil determina cuál de los dos paneles se ve. */
  abierto: boolean
  onVolver: () => void
  tituloVuelta?: string
}) {
  const esMovil = useEsMovil()

  // `13rem` es lo que ocupan la barra superior y la cabecera de la página.
  const alto = 'lg:h-[calc(100dvh-13rem)]'

  if (esMovil) {
    return abierto ? (
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          onClick={onVolver}
          className="mb-2 -ml-1 flex items-center gap-1 self-start rounded-lg px-1 py-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <ChevronLeft className="h-4 w-4" />
          {tituloVuelta ?? 'Volver'}
        </button>
        <div className="card flex min-h-0 flex-1 flex-col p-0">{detalle}</div>
      </div>
    ) : (
      <div className="card flex min-h-0 flex-1 flex-col p-0">{lista}</div>
    )
  }

  return (
    <div className={cn('grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]')}>
      <div className={cn('card flex flex-col p-0', alto)}>{lista}</div>
      <div className={cn('card flex flex-col p-0', alto)}>{detalle}</div>
    </div>
  )
}

/** Inicial del remitente con color estable. Estaba copiado en cuatro pantallas. */
export function Avatar({
  nombre,
  semilla,
  className,
}: {
  nombre: string
  /** Con qué se calcula el color; por defecto el propio nombre. */
  semilla?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: stringToColor(semilla || nombre) }}
      aria-hidden
    >
      {initials(nombre)}
    </div>
  )
}
