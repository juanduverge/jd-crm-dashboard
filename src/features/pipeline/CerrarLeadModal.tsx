import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Trophy, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input } from '@/components/ui'
import { useCerrarLead } from '@/hooks/useData'
import { cn } from '@/lib/utils'
import type { Lead } from '@/types'

/** Motivos frecuentes, para no escribir siempre lo mismo a mano. */
const MOTIVOS: Record<'ganado' | 'perdido', string[]> = {
  ganado: ['Propuesta aceptada', 'Renovación', 'Recomendación de cliente'],
  perdido: ['Sin presupuesto', 'Eligió a la competencia', 'No responde', 'Fuera de perfil', 'Mal momento'],
}

/**
 * Cierra un lead: sale del pipeline y de la agenda de seguimientos, y pasa al
 * Archivo con fecha y motivo. Nada se borra y siempre se puede reactivar.
 *
 * El motivo se pide aquí y no después porque es el único momento en que se
 * recuerda — es lo que hace que el Archivo sirva para algo dentro de seis meses.
 */
export function CerrarLeadModal({
  lead,
  estadoInicial,
  onClose,
}: {
  lead: Lead | null
  estadoInicial?: 'ganado' | 'perdido'
  onClose: () => void
}) {
  const cerrar = useCerrarLead()
  const [estado, setEstado] = useState<'ganado' | 'perdido'>(estadoInicial ?? 'ganado')
  const [motivo, setMotivo] = useState('')

  useEffect(() => {
    if (!lead) return
    setEstado(estadoInicial ?? 'ganado')
    setMotivo('')
  }, [lead, estadoInicial])

  const confirmar = async () => {
    if (!lead) return
    try {
      await cerrar.mutateAsync({ leadId: lead.id, estado, motivo: motivo.trim() || undefined })
      toast.success(
        `${lead.empresa} marcado como ${estado} · movido al Archivo`,
      )
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo cerrar el lead')
    }
  }

  return (
    <Modal
      open={!!lead}
      onClose={onClose}
      title={lead ? `Cerrar · ${lead.empresa}` : 'Cerrar lead'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={cerrar.isPending}>Cancelar</Button>
          <Button onClick={confirmar} disabled={cerrar.isPending}>
            {cerrar.isPending ? 'Cerrando…' : 'Cerrar y archivar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setEstado('ganado'); setMotivo('') }}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-sm font-medium transition',
              estado === 'ganado'
                ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                : 'border-border text-muted hover:bg-surface-2',
            )}
          >
            <Trophy className="h-5 w-5" /> Ganado
          </button>
          <button
            type="button"
            onClick={() => { setEstado('perdido'); setMotivo('') }}
            className={cn(
              'flex flex-col items-center gap-1 rounded-xl border px-3 py-4 text-sm font-medium transition',
              estado === 'perdido'
                ? 'border-red-400 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'
                : 'border-border text-muted hover:bg-surface-2',
            )}
          >
            <XCircle className="h-5 w-5" /> Perdido
          </button>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Motivo</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {MOTIVOS[estado].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMotivo(m)}
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs transition',
                  motivo === m ? 'bg-primary-400 text-white' : 'bg-surface-2 text-muted hover:opacity-80',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <Input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="O escríbelo con tus palabras…"
          />
        </div>

        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          El lead sale del pipeline y de los seguimientos pendientes, pero{' '}
          <strong className="text-fg">no se borra</strong>: queda en el Archivo con todo su
          historial y se puede reactivar cuando quieras.
        </p>
      </div>
    </Modal>
  )
}
