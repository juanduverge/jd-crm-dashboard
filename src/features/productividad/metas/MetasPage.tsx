import { NavLink, Navigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { MetasDiaView } from './MetasDiaView'
import { MetasPeriodoView } from './MetasPeriodoView'

const PERIODOS = {
  dia: { corto: 'Día', titulo: 'Metas del día', sub: 'Lo que toca hoy, repartido desde la semana' },
  semana: { corto: 'Semana', titulo: 'Metas de la semana', sub: 'El reparto semanal de los objetivos del mes' },
  mes: { corto: 'Mes', titulo: 'Metas del mes', sub: 'Los objetivos grandes de los que cuelga todo lo demás' },
} as const

type Periodo = keyof typeof PERIODOS

const esPeriodo = (v: string | undefined): v is Periodo => !!v && v in PERIODOS

/**
 * Los tres niveles de la cascada comparten ruta y se distinguen por el
 * parámetro. Un periodo desconocido en la URL redirige al día en vez de
 * romper: la URL la escribe el usuario, no solo el menú.
 *
 * El cambio de periodo vive aquí y no en el menú lateral: son tres alturas del
 * mismo objetivo, no tres módulos. Sigue siendo un enlace real (no un estado)
 * para que la URL siga describiendo lo que se está mirando.
 */
export default function MetasPage() {
  const { periodo } = useParams<{ periodo: string }>()

  if (!esPeriodo(periodo)) return <Navigate to="/productividad/metas/dia" replace />

  const meta = PERIODOS[periodo]

  return (
    <div>
      <PageHeader title={meta.titulo} subtitle={meta.sub} />

      <div className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1">
        {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
          <NavLink
            key={p}
            to={`/productividad/metas/${p}`}
            className={cn(
              'rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              p === periodo
                ? 'bg-primary-500 text-white shadow-sm'
                : 'text-muted hover:text-fg',
            )}
          >
            {PERIODOS[p].corto}
          </NavLink>
        ))}
      </div>

      {periodo === 'dia' ? <MetasDiaView /> : <MetasPeriodoView periodo={periodo} />}
    </div>
  )
}
