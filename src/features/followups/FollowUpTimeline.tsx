import { Skeleton } from '@/components/ui'
import { useLeadFollowUps } from '@/hooks/useData'
import { RESULTADO_META, TIPO_META } from '@/lib/followUps'
import { cn } from '@/lib/utils'

/**
 * Historial completo de seguimientos de un lead: la secuencia de toques del
 * más reciente al más antiguo, con el resultado de cada uno.
 *
 * Se usa en la ficha del lead y en el Archivo. Muestra TODOS los estados
 * (incluidos los `cancelado` que deja el cierre de un lead), porque el punto
 * de esta vista es justamente que no se pierda nada del recorrido.
 */
export function FollowUpTimeline({ leadId }: { leadId: string }) {
  const { data, isLoading, isError } = useLeadFollowUps(leadId)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
      </div>
    )
  }
  if (isError) return <p className="text-xs text-muted">No se pudo cargar el historial.</p>
  if (!data || data.length === 0) {
    return <p className="text-xs text-muted">Sin seguimientos registrados todavía.</p>
  }

  return (
    <ol className="space-y-2">
      {data.map((f) => {
        const tipo = TIPO_META[f.tipo]
        const pendiente = f.estado === 'pendiente'
        const cancelado = f.estado === 'cancelado'
        return (
          <li
            key={f.id}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border px-2.5 py-2',
              pendiente ? 'border-primary-400/40 bg-primary-400/5' : 'border-border',
              cancelado && 'opacity-60',
            )}
          >
            <span className="mt-0.5 text-sm" aria-hidden>{tipo.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-semibold text-fg">Toque {f.orden}</span>
                <span className="text-muted">· {tipo.label}</span>
                <span className="text-muted">· {f.fechaProgramada}</span>
                {pendiente && (
                  <span className="rounded-full bg-primary-400/15 px-1.5 py-0.5 font-medium text-primary-400">
                    pendiente
                  </span>
                )}
                {cancelado && (
                  <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-medium text-muted">
                    cancelado
                  </span>
                )}
                {f.resultado && (
                  <span className={cn('rounded-full px-1.5 py-0.5 font-medium', RESULTADO_META[f.resultado].cls)}>
                    {RESULTADO_META[f.resultado].label}
                  </span>
                )}
              </div>
              {f.nota && <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{f.nota}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
