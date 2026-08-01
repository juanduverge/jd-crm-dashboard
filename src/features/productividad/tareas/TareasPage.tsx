import { PageHeader } from '@/components/layout/PageHeader'
import { TareasSueltasView } from './TareasSueltasView'

export default function TareasPage() {
  return (
    <div>
      <PageHeader title="Tareas" subtitle="Todo lo que hay que hacer y no tiene hora fija" />
      <TareasSueltasView />
    </div>
  )
}
