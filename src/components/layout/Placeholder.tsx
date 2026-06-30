import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import { PageHeader } from './PageHeader'
import { Badge } from '@/components/ui'

/** Plantilla para tabs cuya funcionalidad llega en fases posteriores. */
export function Placeholder({
  title,
  subtitle,
  phase,
  children,
}: {
  title: string
  subtitle?: string
  phase?: string
  children?: ReactNode
}) {
  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={phase && <Badge className="bg-primary-50 text-primary-600"><Sparkles className="h-3 w-3" /> {phase}</Badge>}
      />
      {children ?? (
        <div className="card flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
          <div className="rounded-2xl bg-primary-50 p-4 text-primary-500 dark:bg-primary-400/15">
            <Sparkles className="h-8 w-8" />
          </div>
          <p className="text-lg font-semibold text-fg">Estructura lista</p>
          <p className="max-w-md text-sm text-muted">
            Esta sección tiene la estructura visual preparada. La funcionalidad completa
            se conecta en {phase ?? 'una próxima iteración'}.
          </p>
        </div>
      )}
    </div>
  )
}
