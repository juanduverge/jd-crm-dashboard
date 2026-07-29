import { useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarPlus, Check } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { useLeadFollowUps, useProgramarFollowUp } from '@/hooks/useData'
import { FOLLOW_UP_TIPOS, addDays, today } from '@/lib/followUps'
import { FollowUpTimeline } from './FollowUpTimeline'
import { CompletarFollowUpModal } from './CompletarFollowUpModal'
import type { FollowUp, FollowUpTipo } from '@/types'

/**
 * Pestaña "Seguimientos" de la ficha del lead: historial completo de toques
 * arriba, y abajo la acción que toque — completar el pendiente, o programar el
 * siguiente si no hay ninguno.
 *
 * Nunca se ofrecen las dos a la vez: la regla de "un solo pendiente por lead"
 * está en la BD, así que la UI la refleja en vez de dejar que el usuario choque
 * contra un error.
 */
export function LeadFollowUpsTab({ leadId, empresa }: { leadId: string; empresa?: string }) {
  const { data } = useLeadFollowUps(leadId)
  const programar = useProgramarFollowUp()

  const [fecha, setFecha] = useState(() => addDays(3))
  const [tipo, setTipo] = useState<FollowUpTipo>('llamada')
  const [nota, setNota] = useState('')
  const [completando, setCompletando] = useState<FollowUp | null>(null)

  const pendiente = data?.find((f) => f.estado === 'pendiente')

  const onProgramar = async () => {
    if (fecha < today()) {
      toast.error('La fecha no puede estar en el pasado')
      return
    }
    try {
      await programar.mutateAsync({ leadId, fecha, tipo, nota: nota.trim() || undefined })
      toast.success('Seguimiento programado')
      setNota('')
      setFecha(addDays(3))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo programar')
    }
  }

  return (
    <div className="space-y-4">
      <FollowUpTimeline leadId={leadId} />

      {pendiente ? (
        <div className="rounded-xl border border-border p-3">
          <p className="mb-2 text-xs text-muted">
            Hay un seguimiento pendiente para el <strong className="text-fg">{pendiente.fechaProgramada}</strong>.
            Complétalo para poder programar el siguiente toque.
          </p>
          <Button size="sm" onClick={() => setCompletando(pendiente)}>
            <Check className="mr-1 h-3.5 w-3.5" />
            Completar seguimiento
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-fg">
            <CalendarPlus className="h-3.5 w-3.5" />
            Programar siguiente toque
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="date" min={today()} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as FollowUpTipo)}>
              {FOLLOW_UP_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          <Input
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué le voy a decir (opcional)"
          />
          <Button size="sm" onClick={onProgramar} disabled={programar.isPending}>
            {programar.isPending ? 'Programando…' : 'Programar'}
          </Button>
        </div>
      )}

      <CompletarFollowUpModal
        followUp={completando}
        leadEmpresa={empresa}
        onClose={() => setCompletando(null)}
      />
    </div>
  )
}
