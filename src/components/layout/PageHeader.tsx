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
    // El coral estaba en la barrita de TODAS las cabeceras, además de en los
    // botones, los KPIs y los iconos. Un acento que aparece en todo no señala
    // nada, así que aquí se retira: el coral queda para lo que se pulsa y para
    // dónde estás. La jerarquía la hace el tamaño del título, no el color.
    <div className="mb-5 flex flex-col gap-3 border-b border-border pb-4 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="t-page truncate">{title}</h1>
        {subtitle && <p className="t-hint mt-1 truncate">{subtitle}</p>}
      </div>
      {actions && (
        // En pantallas anchas las acciones se reparten en varias líneas. En el
        // teléfono envolver seis botones ocupa media pantalla antes de ver un
        // solo dato, así que se convierten en un carrusel de una sola fila:
        // el más importante queda a la vista y el resto llega arrastrando.
        <div className="-mx-3 flex items-center gap-2 overflow-x-auto px-3 pb-1 sin-barra scroll-aislado sm:mx-0 sm:flex-wrap sm:justify-end sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
