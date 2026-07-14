import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { Trash2, RefreshCw, RotateCcw, Users, Target, CheckSquare, Globe, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Skeleton } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useTrash, useRestoreTrashItem, usePurgeTrashItem } from '@/hooks/useData'
import type { TrashItem, TrashModule } from '@/types'

const MODULOS: Record<TrashModule, { label: string; icon: typeof Users }> = {
  lead: { label: 'Leads', icon: Users },
  pipeline: { label: 'Pipeline', icon: Users },
  campaign: { label: 'Campañas', icon: Target },
  tarea: { label: 'Tareas', icon: CheckSquare },
  web_lead: { label: 'Inbox de Leads', icon: Globe },
}

function fecha(iso?: string) {
  if (!iso) return '—'
  try { return format(new Date(iso), 'dd MMM yyyy, HH:mm') } catch { return iso }
}

export function TrashPage() {
  const { data: items, isLoading, isError, refetch, isFetching } = useTrash()
  const restore = useRestoreTrashItem()
  const purge = usePurgeTrashItem()
  const [filtro, setFiltro] = useState<TrashModule | 'todos'>('todos')
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null)
  const [vaciando, setVaciando] = useState(false)

  const all = items ?? []
  const list = useMemo(
    () => (filtro === 'todos' ? all : all.filter((i) => i.module === filtro)),
    [all, filtro],
  )

  const handleRestore = (item: TrashItem) => {
    restore.mutate(item, {
      onSuccess: () => toast.success(`${item.label} restaurado`),
      onError: () => toast.error('No se pudo restaurar'),
    })
  }

  const handleVaciar = async () => {
    setVaciando(true)
    try {
      for (const item of all) {
        await purge.mutateAsync(item)
      }
      toast.success('Papelera vaciada')
    } catch {
      toast.error('Algunos registros no se pudieron purgar')
    } finally {
      setVaciando(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Papelera"
        subtitle="Registros eliminados de todos los módulos. Restaura o purga definitivamente."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
            {all.length > 0 && (
              <Button variant="outline" className="text-red-600 hover:bg-red-500/10" onClick={() => setVaciando(true)}>
                <Trash2 className="h-4 w-4" /> Vaciar papelera
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setFiltro('todos')}
          className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition', filtro === 'todos' ? 'bg-primary-500 text-white' : 'bg-surface text-muted hover:text-fg')}
        >
          Todos ({all.length})
        </button>
        {(Object.keys(MODULOS) as TrashModule[])
          .filter((m) => m !== 'pipeline')
          .map((m) => {
            const count = all.filter((i) => i.module === m).length
            if (count === 0) return null
            return (
              <button
                key={m}
                onClick={() => setFiltro(m)}
                className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition', filtro === m ? 'bg-primary-500 text-white' : 'bg-surface text-muted hover:text-fg')}
              >
                {MODULOS[m].label} ({count})
              </button>
            )
          })}
      </div>

      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>}

      {isError && !isLoading && (
        <EmptyState icon={<Trash2 className="h-8 w-8" />} title="No se pudo cargar la papelera"
          description="Verifica que el CRM API esté activo."
          action={<Button onClick={() => refetch()}>Reintentar</Button>} />
      )}

      {!isLoading && !isError && list.length === 0 && (
        <EmptyState icon={<Trash2 className="h-8 w-8" />} title="Papelera vacía"
          description="Los registros que elimines desde cualquier módulo aparecerán aquí antes de purgarse definitivamente." />
      )}

      {!isLoading && !isError && list.length > 0 && (
        <div className="card divide-y divide-border overflow-hidden p-0">
          {list.map((item) => {
            const Icon = MODULOS[item.module].icon
            return (
              <div key={item.key} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface">
                <Icon className="h-4 w-4 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">{item.label}</p>
                  <p className="truncate text-xs text-muted">
                    {item.detail} · Eliminado {fecha(item.eliminadoEn)}{item.eliminadoPor ? ` por ${item.eliminadoPor}` : ''}
                  </p>
                </div>
                <button
                  onClick={() => handleRestore(item)}
                  disabled={restore.isPending}
                  className="btn-ghost h-8 gap-1.5 px-2.5 text-xs text-primary-600 hover:bg-primary-500/10"
                  title="Restaurar"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </button>
                <button
                  onClick={() => setPurgeTarget(item)}
                  className="btn-ghost h-8 w-8 shrink-0 p-0 text-red-500 hover:bg-red-500/10"
                  title="Eliminar definitivamente"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <PurgeConfirmModal
        open={!!purgeTarget}
        loading={purge.isPending}
        itemLabel={purgeTarget?.label}
        onClose={() => setPurgeTarget(null)}
        onConfirm={async () => {
          if (!purgeTarget) return
          await purge.mutateAsync(purgeTarget)
          toast.success(`${purgeTarget.label} purgado`)
          setPurgeTarget(null)
        }}
      />

      <PurgeConfirmModal
        open={vaciando && !purgeTarget}
        loading={vaciando}
        title="Vaciar papelera"
        itemLabel={all.length ? `${all.length} registro${all.length === 1 ? '' : 's'}` : undefined}
        message="¿Eliminar definitivamente todos los registros de la papelera? Esta acción no se puede deshacer."
        onClose={() => setVaciando(false)}
        onConfirm={handleVaciar}
      />
    </div>
  )
}

function PurgeConfirmModal({
  open, onClose, onConfirm, itemLabel, title = 'Eliminar definitivamente',
  message = '¿Eliminar definitivamente este registro? Esta acción no se puede deshacer.',
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown>
  itemLabel?: string
  title?: string
  message?: string
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={loading}>Cancelar</button>
          <button
            className="btn bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-60"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </>
      }
    >
      <div className="flex gap-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-red-500/10 p-2 text-red-500">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-2 text-sm text-fg-muted">
          <p>{message}</p>
          {itemLabel && (
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-medium text-fg">{itemLabel}</p>
          )}
          <p className="text-xs">
            El registro dejará de ser visible en toda la app, pero su fila en Google Sheets se conserva
            (marcada como purgada) para auditoría y recuperación manual si fuera necesario.
          </p>
        </div>
      </div>
    </Modal>
  )
}
