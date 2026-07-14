import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = 'Eliminar registro',
  message = '¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer.',
  itemLabel,
  confirmLabel = 'Eliminar',
  warning,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<unknown> | unknown
  title?: string
  message?: string
  itemLabel?: string
  confirmLabel?: string
  /** Advertencia adicional, p.ej. sobre registros relacionados que se verán afectados. */
  warning?: string
}) {
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    setLoading(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : onClose}
      title={title}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button
            className="btn bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-60"
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? 'Eliminando…' : confirmLabel}
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
            <p className="rounded-lg border border-border bg-surface-2 px-3 py-2 font-medium text-fg">
              {itemLabel}
            </p>
          )}
          {warning && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-600 dark:text-amber-400">
              {warning}
            </p>
          )}
          <p className="text-xs">El registro se moverá a la Papelera y podrá restaurarse desde allí.</p>
        </div>
      </div>
    </Modal>
  )
}
