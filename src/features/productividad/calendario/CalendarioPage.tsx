import { PageHeader } from '@/components/layout/PageHeader'
import { CalendarioView } from './CalendarioView'

export default function CalendarioPage() {
  return (
    <div>
      <PageHeader title="Calendario" subtitle="Metas, bloques y eventos en el tiempo" />
      <CalendarioView />
    </div>
  )
}
