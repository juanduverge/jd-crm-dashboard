import { PageHeader } from '@/components/layout/PageHeader'
import { MetricasView } from './MetricasView'

/**
 * El panel del mes. Vive de `v_tiempo_diario` (migración 0016) y de las metas,
 * así que sólo enseña algo cuando ya se ha registrado tiempo.
 */
export default function MetricasPage() {
  return (
    <div>
      <PageHeader
        title="Métricas y Rendimiento"
        subtitle="En qué se va el tiempo, qué se completa y qué se traduce en negocio"
      />
      <MetricasView />
    </div>
  )
}
