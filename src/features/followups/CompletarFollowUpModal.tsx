import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { useCompletarFollowUp, useProgramarFollowUp } from '@/hooks/useData'
import {
  FOLLOW_UP_TIPOS, RESULTADO_META, SIGUIENTE_TOQUE_DIAS, addDays,
} from '@/lib/followUps'
import { cn } from '@/lib/utils'
import type { FollowUp, FollowUpResultado, FollowUpTipo } from '@/types'

/**
 * Completar un seguimiento y, en el mismo paso, programar el siguiente toque
 * de la secuencia.
 *
 * Por qué van juntos: el hueco de "pendiente" solo se libera al completar
 * (índice único en la BD), así que este es el único momento en que se puede
 * encadenar el toque siguiente sin fricción. Si el usuario no quiere encadenar,
 * desmarca la casilla y el lead queda sin seguimiento pendiente — visible como
 * "por programar" en el pipeline.
 *
 * Las dos operaciones son RPCs separadas: si la segunda falla, la primera ya
 * quedó guardada (completar es lo importante) y se avisa por toast.
 */
export function CompletarFollowUpModal({
  followUp,
  leadEmpresa,
  onClose,
}: {
  followUp: Pick<FollowUp, 'id' | 'leadId' | 'tipo' | 'orden'> | null
  leadEmpresa?: string
  onClose: () => void
}) {
  const completar = useCompletarFollowUp()
  const programar = useProgramarFollowUp()

  const [resultado, setResultado] = useState<FollowUpResultado>('positivo')
  const [nota, setNota] = useState('')
  const [encadenar, setEncadenar] = useState(true)
  const [siguienteFecha, setSiguienteFecha] = useState(() => addDays(SIGUIENTE_TOQUE_DIAS.positivo))
  const [siguienteTipo, setSiguienteTipo] = useState<FollowUpTipo>('llamada')
  const [siguienteNota, setSiguienteNota] = useState('')

  // Al abrir, resetear y proponer el mismo canal del toque que se está cerrando.
  useEffect(() => {
    if (!followUp) return
    setResultado('positivo')
    setNota('')
    setEncadenar(true)
    setSiguienteFecha(addDays(SIGUIENTE_TOQUE_DIAS.positivo))
    setSiguienteTipo(followUp.tipo)
    setSiguienteNota('')
  }, [followUp])

  // La fecha sugerida sigue al resultado: un "negativo" no se reintenta en 3 días.
  const cambiarResultado = (r: FollowUpResultado) => {
    setResultado(r)
    setSiguienteFecha(addDays(SIGUIENTE_TOQUE_DIAS[r]))
  }

  const guardar = async () => {
    if (!followUp) return
    try {
      await completar.mutateAsync({ id: followUp.id, resultado, nota: nota.trim() || undefined })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo completar el seguimiento')
      return
    }

    if (encadenar) {
      try {
        await programar.mutateAsync({
          leadId: followUp.leadId,
          fecha: siguienteFecha,
          tipo: siguienteTipo,
          nota: siguienteNota.trim() || undefined,
        })
        toast.success(`Seguimiento completado · toque ${followUp.orden + 1} programado`)
      } catch (e) {
        // El completado SÍ se guardó; solo falló el encadenado.
        toast.error(
          `Seguimiento completado, pero no se pudo programar el siguiente: ${
            e instanceof Error ? e.message : 'error desconocido'
          }`,
        )
      }
    } else {
      toast.success('Seguimiento completado')
    }
    onClose()
  }

  const guardando = completar.isPending || programar.isPending

  return (
    <Modal
      open={!!followUp}
      onClose={onClose}
      title={leadEmpresa ? `Completar seguimiento · ${leadEmpresa}` : 'Completar seguimiento'}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">¿Cómo fue?</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(RESULTADO_META) as FollowUpResultado[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => cambiarResultado(r)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition',
                  resultado === r
                    ? RESULTADO_META[r].cls + ' ring-2 ring-primary-400'
                    : 'bg-surface-2 text-muted hover:opacity-80',
                )}
              >
                {RESULTADO_META[r].label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Qué pasó (opcional)</label>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Resumen de la conversación, objeciones, próximos pasos…"
          />
        </div>

        <div className="rounded-xl border border-border p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={encadenar}
              onChange={(e) => setEncadenar(e.target.checked)}
              className="h-4 w-4 accent-current text-primary-400"
            />
            <span className="text-sm font-medium text-fg">
              Programar el siguiente toque{followUp ? ` (nº ${followUp.orden + 1})` : ''}
            </span>
          </label>

          {encadenar && (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Fecha</label>
                  <Input
                    type="date"
                    value={siguienteFecha}
                    onChange={(e) => setSiguienteFecha(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-muted">Tipo</label>
                  <Select
                    value={siguienteTipo}
                    onChange={(e) => setSiguienteTipo(e.target.value as FollowUpTipo)}
                  >
                    {FOLLOW_UP_TIPOS.map((t) => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </Select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted">
                  Qué le voy a decir (opcional)
                </label>
                <Input
                  value={siguienteNota}
                  onChange={(e) => setSiguienteNota(e.target.value)}
                  placeholder="Ej: mandar propuesta revisada"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
