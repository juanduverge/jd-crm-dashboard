import { Placeholder } from '@/components/layout/Placeholder'

/**
 * El dashboard llega en la fase 8, pero la entrada existe desde ya: el dato que
 * lo alimenta (`time_entries`) empieza a registrarse en la fase 4, y conviene
 * tener el destino visible mientras tanto.
 */
export default function MetricasPage() {
  return (
    <Placeholder
      title="Métricas y Rendimiento"
      subtitle="En qué se va el tiempo, qué se completa y qué se traduce en negocio"
      phase="Fase 8"
    />
  )
}
