import type { ReactNode } from 'react'

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span aria-hidden className="h-7 w-1 shrink-0 rounded-full bg-gradient-to-b from-primary-400 to-primary-600 sm:h-8" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight text-fg sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        // En pantallas anchas las acciones se reparten en varias líneas. En el
        // teléfono envolver seis botones ocupa media pantalla antes de ver un
        // solo dato, así que se convierten en un carrusel de una sola fila:
        // el más importante queda a la vista y el resto llega arrastrando.
        <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sin-barra scroll-aislado sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
