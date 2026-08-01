import { PageHeader } from '@/components/layout/PageHeader'
import { HorarioDiarioView } from './HorarioDiarioView'

export default function HorarioPage() {
  return (
    <div>
      <PageHeader
        title="Horario del día"
        subtitle="Bloques de tiempo: a qué hora se hace cada cosa"
      />
      <HorarioDiarioView />
    </div>
  )
}
