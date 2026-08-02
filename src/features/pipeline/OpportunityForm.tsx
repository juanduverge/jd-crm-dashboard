import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { CalendarClock, Target } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { ResponsableSelect } from '@/components/ui/ResponsableSelect'
import { PIPELINE_STAGES } from '@/lib/config'
import { cn, formatCurrency } from '@/lib/utils'
import {
  useActualizarFollowUp, useLeadFollowUps, useProgramarFollowUp,
} from '@/hooks/useData'
import { ATAJOS_REPROGRAMAR, FOLLOW_UP_TIPOS, fechaDeAtajo, today } from '@/lib/followUps'
import { RESPONSABLE_POR_DEFECTO } from '@/lib/equipo'
import type { Lead, LeadStatus, Priority, Channel, FollowUpTipo } from '@/types'

/**
 * Editor de oportunidad. Dos bloques bien separados:
 *
 *  - **Oportunidad**: lo que vive denormalizado en `leads` (etapa, monto,
 *    probabilidad…). Se guarda con `onSave`.
 *  - **Seguimiento**: la fila de `follow_ups`. Es una entidad propia, con su
 *    propio medio de contacto, hora, estado, prioridad y comentarios, y se
 *    guarda por RPC.
 *
 * Antes esto era un `input[type=date]` suelto y un badge fijo con el medio de
 * contacto, así que cambiar de "correo" a "videollamada" obligaba a completar
 * el toque e inventar otro, ensuciando el historial con toques que no pasaron.
 * Con la migración 0020 el seguimiento se edita entero sin tocar el historial.
 */
export function OpportunityForm({
  lead, open, onClose, onSave,
}: {
  lead: Lead | null
  open: boolean
  onClose: () => void
  onSave: (id: string, patch: Partial<Lead>) => void
}) {
  // --- Oportunidad (tabla leads) ---
  const [estado, setEstado] = useState<LeadStatus>('nuevo')
  const [valorEstimado, setValor] = useState(0)
  const [prioridad, setPrioridad] = useState<Priority>('media')
  const [canalPrincipal, setCanal] = useState<Channel>('email')
  const [responsable, setResponsable] = useState(RESPONSABLE_POR_DEFECTO)
  const [notas, setNotas] = useState('')
  const [probabilidad, setProb] = useState<number | ''>('')
  const [fechaCierreEstimada, setCierre] = useState('')

  // --- Seguimiento (tabla follow_ups) ---
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [tipoSeguimiento, setTipoSeguimiento] = useState<FollowUpTipo>('llamada')
  const [estadoSeg, setEstadoSeg] = useState<'pendiente' | 'cancelado'>('pendiente')
  const [prioridadSeg, setPrioridadSeg] = useState<Priority>('media')
  const [responsableSeg, setResponsableSeg] = useState(RESPONSABLE_POR_DEFECTO)
  const [notaSeg, setNotaSeg] = useState('')
  const [resultadoEsperado, setResultadoEsperado] = useState('')
  const [comentariosInternos, setComentarios] = useState('')

  const { data: followUps } = useLeadFollowUps(open && lead ? lead.id : undefined)
  const pendiente = followUps?.find((f) => f.estado === 'pendiente')
  const programar = useProgramarFollowUp()
  const actualizar = useActualizarFollowUp()
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!lead || !open) return
    setEstado(lead.estado)
    setValor(lead.valorEstimado ?? 0)
    setPrioridad(lead.prioridad ?? 'media')
    setCanal(lead.canalPrincipal ?? 'email')
    // Punto clave del rediseño: sin responsable, se asume el de por defecto en
    // vez de dejar el campo vacío esperando que alguien lo teclee.
    setResponsable(lead.responsable || RESPONSABLE_POR_DEFECTO)
    setNotas(lead.notas ?? '')
    setProb(lead.probabilidad ?? '')
    setCierre(lead.fechaCierreEstimada ?? '')
  }, [lead, open])

  // El seguimiento se rellena en su propio efecto porque llega por otra query y
  // puede resolverse después de que el modal ya esté abierto.
  useEffect(() => {
    if (!lead || !open) return
    if (pendiente) {
      setFecha(pendiente.fechaProgramada)
      setHora(pendiente.hora ?? '')
      setTipoSeguimiento(pendiente.tipo)
      setEstadoSeg('pendiente')
      setPrioridadSeg(pendiente.prioridad ?? lead.prioridad ?? 'media')
      setResponsableSeg(pendiente.responsable || lead.responsable || RESPONSABLE_POR_DEFECTO)
      setNotaSeg(pendiente.nota ?? '')
      setResultadoEsperado(pendiente.resultadoEsperado ?? '')
      setComentarios(pendiente.comentariosInternos ?? '')
    } else {
      setFecha(lead.proximoSeguimiento?.slice(0, 10) ?? '')
      setHora('')
      // Por defecto se contacta por donde ya se habla con el cliente.
      setTipoSeguimiento(
        lead.canalPrincipal === 'whatsapp' ? 'whatsapp'
        : lead.canalPrincipal === 'email' ? 'email'
        : lead.canalPrincipal === 'linkedin' ? 'linkedin'
        : lead.canalPrincipal === 'instagram' ? 'instagram'
        : 'llamada',
      )
      setEstadoSeg('pendiente')
      setPrioridadSeg(lead.prioridad ?? 'media')
      setResponsableSeg(lead.responsable || RESPONSABLE_POR_DEFECTO)
      setNotaSeg('')
      setResultadoEsperado('')
      setComentarios('')
    }
  }, [lead, open, pendiente])

  if (!lead) return null

  const stageProb = PIPELINE_STAGES.find((s) => s.id === estado)?.probability ?? 0
  const probEfectiva = probabilidad === '' ? stageProb : probabilidad / 100
  const ponderado = Math.round((valorEstimado || 0) * probEfectiva)

  const save = async () => {
    setGuardando(true)
    // El seguimiento se resuelve ANTES del lead: así el patch viaja con la
    // misma fecha que la BD ya tiene y el trigger no vuelve a tocar nada.
    try {
      if (pendiente) {
        await actualizar.mutateAsync({
          id: pendiente.id,
          fecha: fecha || undefined,
          hora: hora || undefined,
          // Sin esto, borrar la hora sería indistinguible de "no la toques".
          limpiarHora: !hora && !!pendiente.hora,
          tipo: tipoSeguimiento,
          estado: fecha ? estadoSeg : 'cancelado',
          prioridad: prioridadSeg,
          responsable: responsableSeg,
          nota: notaSeg,
          resultadoEsperado,
          comentariosInternos,
        })
      } else if (fecha) {
        await programar.mutateAsync({
          leadId: lead.id,
          fecha,
          tipo: tipoSeguimiento,
          nota: notaSeg || undefined,
          responsable: responsableSeg,
          hora: hora || undefined,
          prioridad: prioridadSeg,
          resultadoEsperado: resultadoEsperado || undefined,
        })
      }
    } catch (e) {
      // No se bloquea el guardado: la fecha viaja igual en el patch y el
      // trigger crea el seguimiento por su cuenta. Peor tipo, nunca perdido.
      toast.error(e instanceof Error ? e.message : 'El seguimiento no se pudo guardar; se conservó la fecha.')
    }

    onSave(lead.id, {
      estado, valorEstimado, prioridad, canalPrincipal, responsable,
      proximoSeguimiento: fecha, notas,
      probabilidad: probabilidad === '' ? undefined : probabilidad, fechaCierreEstimada,
    })
    setGuardando(false)
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
          <Button onClick={save} disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* ---------------- Oportunidad ---------------- */}
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <Target className="h-3.5 w-3.5" /> Oportunidad
          </h3>
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
              <Input type="number" min={0} value={valorEstimado} onChange={(e) => setValor(+e.target.value)} />
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
            <div className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Responsable</span>
              <ResponsableSelect value={responsable} onChange={setResponsable} />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Fecha estimada de cierre</span>
              <Input type="date" value={fechaCierreEstimada?.slice(0, 10) ?? ''} onChange={(e) => setCierre(e.target.value)} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">
                Probabilidad de cierre (%){' '}
                <span className="text-muted/70">· vacío = {Math.round(stageProb * 100)}% por etapa</span>
              </span>
              <Input
                type="number" min={0} max={100} value={probabilidad}
                placeholder={String(Math.round(stageProb * 100))}
                onChange={(e) => setProb(e.target.value === '' ? '' : Math.max(0, Math.min(100, +e.target.value)))}
              />
            </label>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">Notas de la oportunidad</span>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Contexto, siguiente paso…" />
            </div>
          </div>
        </section>

        {/* ---------------- Seguimiento ---------------- */}
        <section className="rounded-xl border border-border bg-surface-2/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <CalendarClock className="h-3.5 w-3.5" />
            {pendiente ? `Seguimiento pendiente · toque nº ${pendiente.orden}` : 'Programar seguimiento'}
          </h3>

          {/* Atajos de reprogramación: el 90% de las veces la respuesta es una
              de estas cinco, y elegirla en el calendario cuesta tres clics. */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {ATAJOS_REPROGRAMAR.map((a) => {
              const destino = fechaDeAtajo(a)
              return (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => setFecha(destino)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    fecha === destino
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'border-border text-muted hover:bg-surface-2 hover:text-fg',
                  )}
                >
                  {a.label}
                </button>
              )
            })}
            {fecha && (
              <button
                type="button"
                onClick={() => { setFecha(''); setHora('') }}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:bg-surface-2 hover:text-fg"
              >
                Sin fecha
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Próxima fecha</span>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">
                Hora <span className="text-muted/70">· opcional</span>
              </span>
              <Input type="time" value={hora} disabled={!fecha} onChange={(e) => setHora(e.target.value)} />
            </label>

            {/* El medio de contacto ya se puede cambiar en cualquier momento:
                era lo que obligaba a completar y reprogramar el toque. */}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Medio de contacto</span>
              <Select value={tipoSeguimiento} onChange={(e) => setTipoSeguimiento(e.target.value as FollowUpTipo)}>
                {FOLLOW_UP_TIPOS.map((t) => (
                  <option key={t.id} value={t.id}>{t.emoji} {t.label}</option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Prioridad del seguimiento</span>
              <Select value={prioridadSeg} onChange={(e) => setPrioridadSeg(e.target.value as Priority)}>
                <option value="alta">Alta</option>
                <option value="media">Media</option>
                <option value="baja">Baja</option>
              </Select>
            </label>

            <div className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Responsable del seguimiento</span>
              <ResponsableSelect value={responsableSeg} onChange={setResponsableSeg} />
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Estado</span>
              <Select
                value={estadoSeg}
                disabled={!pendiente || !fecha}
                onChange={(e) => setEstadoSeg(e.target.value as 'pendiente' | 'cancelado')}
              >
                <option value="pendiente">Pendiente</option>
                <option value="cancelado">Cancelado</option>
              </Select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">Resultado esperado</span>
              <Input
                value={resultadoEsperado}
                onChange={(e) => setResultadoEsperado(e.target.value)}
                placeholder="Ej. Cerrar la fecha de la demo"
              />
            </label>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">Notas del seguimiento</span>
              <Textarea value={notaSeg} onChange={(e) => setNotaSeg(e.target.value)} placeholder="Qué se habló, qué queda pendiente…" />
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">
                Comentarios internos <span className="text-muted/70">· no se comparten con el cliente</span>
              </span>
              <Textarea
                value={comentariosInternos}
                onChange={(e) => setComentarios(e.target.value)}
                placeholder="Contexto para el equipo…"
              />
            </div>
          </div>

          <p className="mt-2 text-[11px] text-muted">
            {!fecha
              ? 'Sin fecha no hay aviso; el seguimiento pendiente se cancela.'
              : fecha < today()
                ? 'La fecha está en el pasado: aparecerá como vencido en la agenda.'
                : pendiente
                  ? 'Se actualiza el seguimiento pendiente sin tocar el historial.'
                  : 'Aparecerá en Seguimientos y avisará cuando toque.'}
          </p>
        </section>

        {/* Resumen ponderado */}
        <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm">
          <span className="text-muted">Probabilidad efectiva: <b className="text-fg">{Math.round(probEfectiva * 100)}%</b></span>
          <span className="text-muted">Valor ponderado: <b className="text-fg">{formatCurrency(ponderado)}</b></span>
        </div>
      </div>
    </Modal>
  )
}
