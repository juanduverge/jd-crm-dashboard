import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { PIPELINE_STAGES } from '@/lib/config'
import { formatCurrency } from '@/lib/utils'
import { crmApi } from '@/services/crmApi'
import type { Lead, LeadStatus, Priority, Channel } from '@/types'

/**
 * Editor de oportunidad (vista pipeline de un lead). Edita los campos que viven
 * en la hoja pipeline + notas, y persiste vía el store (updateLead → n8n).
 */
export function OpportunityForm({
  lead, open, onClose, onSave,
}: {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: Partial<Lead>) => void
}) {
  const [estado, setEstado] = useState<LeadStatus>('nuevo')
  const [valorEstimado, setValor] = useState(0)
  const [prioridad, setPrioridad] = useState<Priority>('media')
  const [canalPrincipal, setCanal] = useState<Channel>('email')
  const [responsable, setResponsable] = useState('')
  const [proximoSeguimiento, setProximo] = useState('')
  const [notas, setNotas] = useState('')
  const [probabilidad, setProb] = useState<number | ''>('')
  const [fechaCierreEstimada, setCierre] = useState('')

  useEffect(() => {
    if (lead && open) {
      setEstado(lead.estado)
      setValor(lead.valorEstimado ?? 0)
      setPrioridad(lead.prioridad ?? 'media')
      setCanal(lead.canalPrincipal ?? 'email')
      setResponsable(lead.responsable ?? '')
      setProximo(lead.proximoSeguimiento ?? '')
      setNotas(lead.notas ?? '')
      setProb(lead.probabilidad ?? '')
      setCierre(lead.fechaCierreEstimada ?? '')
    }
  }, [lead, open])

  if (!lead) return null

  const stageProb = PIPELINE_STAGES.find((s) => s.id === estado)?.probability ?? 0
  const probEfectiva = probabilidad === '' ? stageProb : probabilidad / 100
  const ponderado = Math.round((valorEstimado || 0) * probEfectiva)

  const save = () => {
    onSave(lead.id, {
      estado, valorEstimado, prioridad, canalPrincipal, responsable, proximoSeguimiento, notas,
      probabilidad: probabilidad === '' ? undefined : probabilidad, fechaCierreEstimada,
    })
    // Probabilidad y fecha de cierre viven en columnas aisladas → acción dedicada.
    crmApi.updatePipelineExtra({
      leadId: lead.id,
      probabilidad: probabilidad === '' ? undefined : probabilidad,
      fechaCierreEstimada,
    }).catch(() => {})
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Editar oportunidad · ${lead.empresa}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save}>Guardar cambios</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Etapa</span>
          <Select value={estado} onChange={(e) => setEstado(e.target.value as LeadStatus)}>
            {PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Prioridad</span>
          <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Priority)}>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Monto estimado (USD)</span>
          <Input type="number" value={valorEstimado} onChange={(e) => setValor(+e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Canal principal</span>
          <Select value={canalPrincipal} onChange={(e) => setCanal(e.target.value as Channel)}>
            <option value="email">Email</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="linkedin">LinkedIn</option>
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Responsable</span>
          <Input value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="JD" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Próximo seguimiento</span>
          <Input type="date" value={proximoSeguimiento?.slice(0, 10) ?? ''} onChange={(e) => setProximo(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">
            Probabilidad de cierre (%) <span className="text-muted/70">· vacío = {Math.round(stageProb * 100)}% por etapa</span>
          </span>
          <Input
            type="number" min={0} max={100} value={probabilidad}
            placeholder={String(Math.round(stageProb * 100))}
            onChange={(e) => setProb(e.target.value === '' ? '' : Math.max(0, Math.min(100, +e.target.value)))}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Fecha estimada de cierre</span>
          <Input type="date" value={fechaCierreEstimada?.slice(0, 10) ?? ''} onChange={(e) => setCierre(e.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-muted">Notas</span>
          <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Contexto, siguiente paso…" />
        </div>

        {/* Resumen ponderado */}
        <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-muted">Probabilidad efectiva: <b className="text-fg">{Math.round(probEfectiva * 100)}%</b></span>
          <span className="text-muted">Valor ponderado: <b className="text-fg">{formatCurrency(ponderado)}</b></span>
        </div>
      </div>
    </Modal>
  )
}
