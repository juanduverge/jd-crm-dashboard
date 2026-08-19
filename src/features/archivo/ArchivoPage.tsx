import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Archive, RotateCcw, Search, Trophy, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Badge, Input, Select, Skeleton, EmptyState } from '@/components/ui'
import { useLeads, useReactivarLead } from '@/hooks/useData'
import { useLeadsStore } from '@/store/leadsStore'
import { crearFiltroLeads } from '@/lib/leadSearch'
import { formatCurrency, cn } from '@/lib/utils'
import { STAGE_BY_ID } from '@/lib/pipeline'
import { FollowUpTimeline } from '../followups/FollowUpTimeline'
import type { Lead } from '@/types'

/**
 * Archivo / Histórico — donde viven los leads cerrados.
 *
 * Un lead ganado o perdido sale del pipeline y de la agenda de seguimientos,
 * pero NO se borra: aquí se consulta cuándo se cerró, por qué, y su historial
 * completo de toques. Y desde aquí se reactiva si el cliente reaparece meses
 * después — vuelve a su etapa previa con todo intacto.
 *
 * Esto es distinto de la Papelera (/papelera), que es soft-delete de registros
 * que se quieren eliminar. El archivo es memoria comercial, no basura.
 */
export function ArchivoPage() {
  const { isLoading } = useLeads()
  const leads = useLeadsStore((s) => s.leads)
  const reactivar = useReactivarLead()

  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'ganado' | 'perdido'>('todos')
  const [abierto, setAbierto] = useState<string | null>(null)

  const archivados = useMemo(() => {
    // Mismo motor que la lista de Leads: busca en toda la ficha y admite
    // sintaxis por campo (`ciudad:madrid`, `motivo:precio`, `cerrado:3m`).
    const coincide = crearFiltroLeads(q)
    return leads
      .filter((l) => l.estado === 'ganado' || l.estado === 'perdido')
      .filter((l) => filtro === 'todos' || l.estado === filtro)
      .filter(coincide)
      // Lo más recientemente cerrado primero.
      .sort((a, b) => (b.cerradoEn ?? '').localeCompare(a.cerradoEn ?? ''))
  }, [leads, q, filtro])

  const ganados = useMemo(() => leads.filter((l) => l.estado === 'ganado'), [leads])
  const perdidos = useMemo(() => leads.filter((l) => l.estado === 'perdido'), [leads])
  const valorGanado = useMemo(
    () => ganados.reduce((s, l) => s + (l.valorEstimado || 0), 0),
    [ganados],
  )

  const onReactivar = async (lead: Lead) => {
    try {
      await reactivar.mutateAsync(lead.id)
      const destino = lead.etapaPrevia ? STAGE_BY_ID[lead.etapaPrevia]?.label : 'Seguimiento'
      toast.success(`${lead.empresa} reactivado en "${destino}"`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reactivar')
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Archivo" subtitle="Cargando…" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Archivo"
        subtitle={`${ganados.length} ganados (${formatCurrency(valorGanado)}) · ${perdidos.length} perdidos`}
        actions={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar en toda la ficha…"
                className="h-9 w-48 pl-9"
              />
            </div>
            <Select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as typeof filtro)}
              className="h-9 w-auto"
            >
              <option value="todos">Todos</option>
              <option value="ganado">Ganados</option>
              <option value="perdido">Perdidos</option>
            </Select>
          </>
        }
      />

      {archivados.length === 0 ? (
        <EmptyState
          icon={<Archive className="h-8 w-8" />}
          title={q || filtro !== 'todos' ? 'Sin resultados' : 'El archivo está vacío'}
          description={
            q || filtro !== 'todos'
              ? 'Prueba con otro término o quita el filtro.'
              : 'Cuando marques un lead como ganado o perdido en el pipeline, aparecerá aquí con todo su historial.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {archivados.map((l) => {
            const ganado = l.estado === 'ganado'
            const expandido = abierto === l.id
            return (
              <li
                key={l.id}
                className={cn(
                  'rounded-xl border px-3 py-2.5',
                  ganado
                    ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-500/25 dark:bg-emerald-500/5'
                    : 'border-border',
                )}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span aria-hidden className={ganado ? 'text-emerald-500' : 'text-muted'}>
                    {ganado ? <Trophy className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  </span>

                  <button
                    type="button"
                    onClick={() => setAbierto(expandido ? null : l.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-fg">{l.empresa}</span>
                      <Badge
                        className={
                          ganado
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
                            : 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                        }
                      >
                        {ganado ? 'Ganado' : 'Perdido'}
                      </Badge>
                      {l.valorEstimado ? <Badge>{formatCurrency(l.valorEstimado)}</Badge> : null}
                      {l.etapaPrevia && (
                        <Badge>cerrado desde «{STAGE_BY_ID[l.etapaPrevia]?.label ?? l.etapaPrevia}»</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {l.cerradoEn ? `Cerrado el ${l.cerradoEn.slice(0, 10)}` : 'Fecha de cierre desconocida'}
                      {l.motivoCierre ? ` · ${l.motivoCierre}` : ''}
                    </p>
                  </button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onReactivar(l)}
                    disabled={reactivar.isPending}
                    title="Devolver al pipeline en su etapa previa, sin perder historial"
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    Reactivar
                  </Button>
                </div>

                {expandido && (
                  <div className="mt-3 border-t border-border pt-3">
                    <FollowUpTimeline leadId={l.id} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
