import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ArrowRight, Phone, PhoneCall, Video } from 'lucide-react'
import { Card, CardHeader, CardTitle, Skeleton } from '@/components/ui'
import { PlanDelDia } from '@/features/productividad/shared/PlanDelDia'
import { cn } from '@/lib/utils'
import type { Evento, FollowUpAgendaItem, FollowUpTipo } from '@/types'

/**
 * «Plan de hoy» del Resumen.
 *
 * Arriba, el plan que Juan escribe cada mañana (metas de un día, ver
 * `PlanDelDia`): «20 llamadas», «5 leads», «terminar la web de X», repartido
 * en mañana / tarde / noche y con lo que toca hoy de las metas del mes.
 * Debajo, las reuniones con hora y la cola de llamadas que tocan hoy.
 *
 * La primera versión (20-nov) traía un objetivo fijo de 20 llamadas; Juan
 * pidió que saliera de sus metas y de lo que él decida cada día.
 */

const LLAMADAS: FollowUpTipo[] = ['llamada', 'llamada_whatsapp', 'videollamada']
const PESO_PRIORIDAD = { alta: 0, media: 1, baja: 2 } as const

export function PlanDeHoy({ hoy, eventos, cargandoEventos, agenda, cargandoAgenda }: {
  hoy: string
  eventos: Evento[]
  cargandoEventos: boolean
  agenda: FollowUpAgendaItem[]
  cargandoAgenda: boolean
}) {
  const reuniones = eventos.filter((e) => e.estado !== 'cancelado')
  const cola = useMemo(
    () => agenda
      .filter((f) => f.diasVencido >= 0 && LLAMADAS.includes(f.tipo))
      .sort((a, b) =>
        PESO_PRIORIDAD[a.leadPrioridad ?? 'media'] - PESO_PRIORIDAD[b.leadPrioridad ?? 'media']
        || b.diasVencido - a.diasVencido),
    [agenda],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de hoy</CardTitle>
        <Link to="/productividad/hoy" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Mi día <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>

      <PlanDelDia hoy={hoy} compacto />

      {cargandoEventos ? null : reuniones.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Reuniones</p>
          <ul className="-mx-1.5 space-y-0.5">
            {reuniones.slice(0, 3).map((e) => {
              const pasado = Date.parse(e.fin) < Date.now() || e.estado === 'hecho'
              return (
                <li key={e.id}>
                  <Link to={e.leadId ? `/pipeline?lead=${e.leadId}` : '/productividad/calendario'}
                    className={cn('flex items-center gap-3 rounded-lg px-1.5 py-1.5 row-hover', pasado && 'opacity-50')}>
                    <Video className="h-4 w-4 shrink-0 text-violet-500" />
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{e.todoElDia ? 'Día' : format(new Date(e.inicio), 'HH:mm')}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-sm text-fg', pasado && 'line-through')}>{e.titulo}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Llamadas que tocan{cola.length ? ` · ${cola.length}` : ''}</p>
          {cola.length > 4 && <Link to="/seguimientos" className="text-[11px] font-medium text-primary-600 hover:underline">Ver todas</Link>}
        </div>
        {cargandoAgenda ? <Skeleton className="h-20" /> : !cola.length ? (
          <p className="py-3 text-sm text-muted">No hay llamadas programadas para hoy. Elige leads en <Link to="/leads" className="font-medium text-primary-600 hover:underline">Leads</Link>.</p>
        ) : (
          <ul className="-mx-1.5 space-y-0.5">
            {cola.slice(0, 4).map((f) => {
              const Icon = f.tipo === 'llamada_whatsapp' ? PhoneCall : Phone
              return (
                <li key={f.id}>
                  <Link to={`/pipeline?lead=${f.leadId}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 row-hover">
                    <Icon className="h-4 w-4 shrink-0 text-primary-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={f.leadEmpresa}>{f.leadEmpresa}</span>
                    {f.leadPrioridad === 'alta' && <span className="shrink-0 rounded-full bg-red-50 px-1.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/15">alta</span>}
                    <span className={cn('shrink-0 text-xs tabular-nums', f.diasVencido > 0 ? 'text-[rgb(var(--danger))]' : 'text-muted')}>
                      {f.diasVencido > 0 ? `hace ${f.diasVencido} d` : f.hora ?? 'hoy'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}
