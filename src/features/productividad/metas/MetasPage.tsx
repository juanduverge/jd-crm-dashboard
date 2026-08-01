import { Navigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetasDiaView } from './MetasDiaView'
import { MetasPeriodoView } from './MetasPeriodoView'

const PERIODOS = {
  dia: { titulo: 'Metas del día', sub: 'Lo que toca hoy, repartido desde la semana' },
  semana: { titulo: 'Metas de la semana', sub: 'El reparto semanal de los objetivos del mes' },
  mes: { titulo: 'Metas del mes', sub: 'Los objetivos grandes de los que cuelga todo lo demás' },
} as const

type Periodo = keyof typeof PERIODOS

const esPeriodo = (v: string | undefined): v is Periodo => !!v && v in PERIODOS

/**
 * Los tres niveles de la cascada comparten ruta y se distinguen por el
 * parámetro. Un periodo desconocido en la URL redirige al día en vez de
 * romper: la URL la escribe el usuario, no solo el menú.
 */
export default function MetasPage() {
  const { periodo } = useParams<{ periodo: string }>()

  if (!esPeriodo(periodo)) return <Navigate to="/productividad/metas/dia" replace />

  const meta = PERIODOS[periodo]

  return (
    <div>
      <PageHeader title={meta.titulo} subtitle={meta.sub} />
      {periodo === 'dia' ? <MetasDiaView /> : <MetasPeriodoView periodo={periodo} />}
    </div>
  )
}
