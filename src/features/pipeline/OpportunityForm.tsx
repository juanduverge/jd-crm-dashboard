import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { PIPELINE_STAGES } from '@/lib/config'
import { formatCurrency } from '@/lib/utils'
import { useLeadFollowUps, useProgramarFollowUp, useReprogramarFollowUp } from '@/hooks/useData'
import { FOLLOW_UP_TIPOS, TIPO_META, today } from '@/lib/followUps'
import type { Lead, LeadStatus, Priority, Channel, FollowUpTipo } from '@/types'

/**
 * Editor de oportunidad (vista pipeline de un lead). Edita los campos de
 * pipeline + notas, y persiste vía el store (updateLead → Supabase).
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
  const [tipoSeguimiento, setTipoSeguimiento] = useState<FollowUpTipo>('llamada')

  // Esta fecha ya no es un dato suelto: crea o reprograma un seguimiento real,
  // que es lo que después aparece en /seguimientos, en el banner y en el badge.
  const { data: followUps } = useLeadFollowUps(open && lead ? lead.id : undefined)
  const pendiente = followUps?.find((f) => f.estado === 'pendiente')
  const programar = useProgramarFollowUp()
  const reprogramar = useReprogramarFollowUp()

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
      // Por defecto, el toque se hace por el canal habitual del cliente.
      setTipoSeguimiento(
        lead.canalPrincipal === 'whatsapp' ? 'whatsapp'
        : lead.canalPrincipal === 'email' ? 'email'
        : 'llamada',
      )
    }
  }, [lead, open])

  if (!lead) return null

  const stageProb = PIPELINE_STAGES.find((s) => s.id === estado)?.probability ?? 0
  const probEfectiva = probabilidad === '' ? stageProb : probabilidad / 100
  const ponderado = Math.round((valorEstimado || 0) * probEfectiva)

  const fecha = proximoSeguimiento?.slice(0, 10) ?? ''

  const save = async () => {
    // El seguimiento se resuelve ANTES de guardar el lead, para que se cree con
    // el tipo que eligió el usuario. Después el patch lleva la misma fecha, así
    // que el trigger de la BD la ve ya sincronizada y no hace nada.
    //
    // Si algo falla aquí no se bloquea el guardado: la fecha viaja igual en el
    // patch y el trigger crea el seguimiento por su cuenta (con el tipo
    // deducido del canal). Peor tipo, pero nunca un seguimiento perdido.
    try {
      if (fecha && !pendiente) {
        await programar.mutateAsync({ leadId: lead.id, fecha, tipo: tipoSeguimiento })
      } else if (fecha && pendiente && fecha !== pendiente.fechaProgramada) {
        await reprogramar.mutateAsync({ id: pendiente.id, fecha })
      }
    } catch {
      /* lo recoge el trigger */
    }

    onSave(lead.id, {
      estado, valorEstimado, prioridad, canalPrincipal, responsable,
      proximoSeguimiento: fecha, notas,
      probabilidad: probabilidad === '' ? undefined : probabilidad, fechaCierreEstimada,
    })
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
        <div className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Próximo seguimiento</span>
          <div className="flex gap-2">
            <Input
              type="date"
              className="flex-1"
              min={today()}
              value={fecha}
              onChange={(e) => setProximo(e.target.value)}
            />
            {/* Con un seguimiento ya pendiente sólo se puede mover la fecha: el
                tipo se fijó al programarlo y cambiarlo aquí reescribiría el
                historial. Para cambiarlo, se completa y se programa el siguiente. */}
            {pendiente ? (
              <span className="flex items-center rounded-xl border border-border px-3 text-xs text-muted">
                {TIPO_META[pendiente.tipo].emoji} {TIPO_META[pendiente.tipo].label}
              </span>
            ) : (
              <Select
                className="w-36"
                value={tipoSeguimiento}
                onChange={(e) => setTipoSeguimiento(e.target.value as FollowUpTipo)}
              >
                {FOLLOW_UP_TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </Select>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {fecha
              ? pendiente
                ? 'Reprograma el seguimiento pendiente.'
                : 'Aparecerá en Seguimientos y avisará cuando toque.'
              : 'Sin fecha no hay aviso; el seguimiento pendiente se cancela.'}
          </p>
        </div>
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
