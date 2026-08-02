import { PageHeader } from '@/components/layout/PageHeader'
import { RegistroTiempoView } from './RegistroTiempoView'

export default function TiempoPage() {
  return (
    <div>
      <PageHeader
        title="Tiempo"
        subtitle="En qué se va el día: un cronómetro y el registro de la jornada"
      />
      <RegistroTiempoView />
    </div>
  )
}
