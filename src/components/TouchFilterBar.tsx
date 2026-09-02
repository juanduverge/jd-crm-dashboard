import { cn } from '@/lib/utils'
import { FILTROS_TOQUE, pasaFiltroToque } from '@/lib/touches'
import { today } from '@/lib/followUps'
import type { Lead } from '@/types'

/**
 * Barra de filtros por toque y situación, compartida por Leads, Pipeline y
 * Seguimiento.
 *
 * Vive en un solo componente a propósito: la pregunta "¿en qué punto de la
 * secuencia está este lead?" es la misma en las tres pantallas, y tenerla
 * escrita tres veces es justo lo que hacía que "Atrasado" significara cosas
 * distintas según dónde se mirara.
 *
 * Cada píldora enseña su recuento sobre `leads`, que es el conjunto ya filtrado
 * por el resto de criterios de la pantalla: así el número que se ve es el que
 * se va a obtener al pulsar, no una promesa de otro universo.
 */
export function TouchFilterBar({
  leads,
  value,
  onChange,
  className,
  gruposVisibles,
}: {
  leads: Lead[]
  value: string
  onChange: (clave: string) => void
  className?: string
  /** Grupos a mostrar. El Pipeline oculta 'resultado' porque sus columnas ya
   *  son la etapa y los cerrados no viven en el tablero. */
  gruposVisibles?: ('toque' | 'situacion' | 'resultado')[]
}) {
  const hoy = today()
  const TODOS: { grupo: 'toque' | 'situacion' | 'resultado'; titulo: string }[] = [
    { grupo: 'toque', titulo: 'Contacto' },
    { grupo: 'situacion', titulo: 'Seguimiento' },
    { grupo: 'resultado', titulo: 'Resultado' },
  ]
  const grupos = gruposVisibles ? TODOS.filter((g) => gruposVisibles.includes(g.grupo)) : TODOS

  return (
    // En el teléfono estas píldoras se partían en cuatro filas y empujaban
    // todos los datos fuera de la pantalla: antes de ver un solo lead ya
    // habías gastado media pantalla en filtros. Ahí van en una sola fila que
    // se arrastra; a partir de `sm` vuelven a envolverse.
    <div className={cn('-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 sin-barra scroll-aislado sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&>*]:shrink-0', className)}>
      <button
        onClick={() => onChange('')}
        className={cn(
          'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
          value === ''
            ? 'border-primary-400 bg-primary-400 text-white'
            : 'border-border text-muted hover:bg-surface-2',
        )}
      >
        Todos <span className="opacity-70">{leads.length}</span>
      </button>

      {grupos.map(({ grupo, titulo }) => (
        <div key={grupo} className="flex items-center gap-1.5 sm:flex-wrap">
          <span className="ml-1 select-none text-[10px] uppercase tracking-wide text-muted/70">
            {titulo}
          </span>
          {FILTROS_TOQUE.filter((f) => f.grupo === grupo).map((f) => {
            const n = leads.filter((l) => pasaFiltroToque(l, f.key, hoy)).length
            const activo = value === f.key
            return (
              <button
                key={f.key}
                onClick={() => onChange(activo ? '' : f.key)}
                // Un filtro sin resultados se atenúa pero no se esconde: saber
                // que hoy no hay nada atrasado es información, y ocultarlo
                // haría que la barra bailara en cada render. Lo que sí se
                // impide es pulsarlo: llevaba a un tablero vacío con todo a
                // cero, que parece la pantalla rota y no un filtro vacío.
                disabled={n === 0 && !activo}
                title={n === 0 ? `Ningún lead en «${f.label}»` : undefined}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  n === 0 && !activo && 'cursor-not-allowed',
                  activo
                    ? 'border-primary-400 bg-primary-400 text-white'
                    : n === 0
                      ? 'border-border/60 text-muted/50'
                      : 'border-border text-fg hover:bg-surface-2',
                )}
              >
                {f.label} <span className="opacity-70">{n}</span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
