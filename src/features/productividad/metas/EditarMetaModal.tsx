import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Select } from '@/components/ui'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Modal } from '@/components/ui/Modal'
import { ResponsableSelect } from '@/components/ui/ResponsableSelect'
import { useActualizarMeta } from '@/hooks/useData'
import { metricasPorGrupo, METRICA_BY_CLAVE } from '@/lib/metricas'
import type { Goal, GoalEstado, MetricaClave, Priority } from '@/types'

/**
 * Edición completa de una meta. Vive en su propio archivo (antes era privado
 * de `GoalCard`) porque lo usan dos pantallas: las tarjetas de mes/semana y
 * las filas del día. Duplicarlo era garantizar que se separasen.
 *
 * Dos cosas que arregla respecto a la versión anterior:
 *
 * 1. El formulario se RESINCRONIZA al abrir. Antes el estado se inicializaba
 *    una sola vez y el modal quedaba montado dentro de la tarjeta, así que
 *    tras un cambio externo (o al reabrirlo) mostraba valores viejos y podía
 *    guardarlos encima de los buenos.
 * 2. Se pueden editar fechas, prioridad, estado y responsable, no sólo el
 *    texto y el objetivo (columnas nuevas en la migración 0022).
 */

const ESTADOS: { id: GoalEstado; label: string }[] = [
  { id: 'activa', label: 'Activa' },
  { id: 'pausada', label: 'Pausada' },
  { id: 'completada', label: 'Completada' },
  { id: 'cancelada', label: 'Cancelada' },
]

export function EditarMetaModal({
  goal,
  open,
  onClose,
}: {
  goal: Goal
  open: boolean
  onClose: () => void
}) {
  const actualizar = useActualizarMeta()

  const [nombre, setNombre] = useState(goal.nombre)
  const [descripcion, setDescripcion] = useState(goal.descripcion ?? '')
  const [target, setTarget] = useState(String(goal.target))
  const [unidad, setUnidad] = useState(goal.unidad ?? '')
  const [fechaInicio, setFechaInicio] = useState(goal.fechaInicio)
  const [fechaFin, setFechaFin] = useState(goal.fechaFin)
  const [prioridad, setPrioridad] = useState<Priority | ''>(goal.prioridad ?? '')
  const [estado, setEstado] = useState<GoalEstado>(goal.estado)
  const [responsable, setResponsable] = useState(goal.responsable ?? '')
  const [metrica, setMetrica] = useState<MetricaClave | ''>(goal.metrica ?? '')

  // Resincroniza con la meta cada vez que se abre. Sin esto el formulario
  // conserva lo que se tecleó (o lo que había) la vez anterior.
  useEffect(() => {
    if (!open) return
    setNombre(goal.nombre)
    setDescripcion(goal.descripcion ?? '')
    setTarget(String(goal.target))
    setUnidad(goal.unidad ?? '')
    setFechaInicio(goal.fechaInicio)
    setFechaFin(goal.fechaFin)
    setPrioridad(goal.prioridad ?? '')
    setEstado(goal.estado)
    setResponsable(goal.responsable ?? '')
    setMetrica(goal.metrica ?? '')
  }, [open, goal])

  const targetCambia = Number(target) !== goal.target
  const fechasCambian = fechaInicio !== goal.fechaInicio || fechaFin !== goal.fechaFin
  const metricaCambia = (metrica || null) !== (goal.metrica ?? null)

  const guardar = () => {
    const t = Number(target)
    if (!nombre.trim()) { toast.error('Escribe un nombre'); return }
    if (goal.tipo === 'contador' && (!t || t <= 0)) {
      toast.error('El objetivo debe ser mayor que 0'); return
    }
    if (!fechaInicio || !fechaFin) { toast.error('La meta necesita fecha de inicio y de fin'); return }
    if (fechaFin < fechaInicio) { toast.error('La fecha de fin no puede ser anterior al inicio'); return }

    actualizar.mutate(
      {
        id: goal.id,
        nombre: nombre.trim(),
        descripcion,
        target: goal.tipo === 'toggle' ? 1 : t,
        unidad,
        responsable,
        // Sólo se mandan las fechas si cambiaron: cualquier update de
        // fecha_inicio/fecha_fin dispara la validación de jerarquía, y no
        // tiene sentido arriesgar un rechazo por un campo que no se tocó.
        ...(fechasCambian ? { fechaInicio, fechaFin } : {}),
        // `null` desengancha la métrica y devuelve la meta al modo manual; se
        // manda sólo si cambió, para no reescribir la cascada en cada guardado.
        ...(metricaCambia ? { metrica: (metrica || null) as MetricaClave | null } : {}),
        prioridad: prioridad || null,
        estado,
        // Al cambiar el objetivo de una meta con hijas, se reparte de nuevo
        // entre ellas sin perder el progreso ya registrado.
        redistribuir: goal.tieneHijas && targetCambia,
      },
      {
        onSuccess: () => {
          toast.success(goal.tieneHijas && targetCambia ? 'Meta actualizada y repartida' : 'Meta actualizada')
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo actualizar'),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar meta">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Nombre</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Descripción</label>
          <AutoTextarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Qué cuenta como avance, cómo se consigue, con quién…"
          />
          {goal.tieneHijas && (
            <p className="mt-1 text-[11px] text-muted">
              Se copia también a sus metas
              {goal.periodo === 'mes' ? ' semanales y diarias' : ' diarias'}.
            </p>
          )}
        </div>

        {goal.tipo === 'contador' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Objetivo</label>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Unidad</label>
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="leads, horas…" />
            </div>
          </div>
        )}

        {goal.tipo === 'contador' && (
          <div>
            <label className="mb-1 block text-xs text-muted">¿Se mide sola?</label>
            <Select value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaClave | '')}>
              <option value="">No — la actualizo yo a mano</option>
              {metricasPorGrupo().map((g) => (
                <optgroup key={g.grupo} label={g.grupo}>
                  {g.metricas.map((m) => (
                    <option key={m.clave} value={m.clave}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </Select>
            <p className="mt-1 text-[11px] text-muted">
              {metrica
                ? `${METRICA_BY_CLAVE[metrica].ayuda}${goal.tieneHijas ? ' Se aplica también a sus metas hijas.' : ''}`
                : 'Sin métrica, el avance se registra a mano con los botones + / − de la tarjeta.'}
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Desde</label>
            <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Hasta</label>
            <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
          </div>
        </div>

        {fechasCambian && goal.parentId && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            Las fechas tienen que seguir cabiendo dentro del periodo de la meta
            superior; si no, la base de datos rechaza el cambio.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Prioridad</label>
            <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as Priority | '')}>
              <option value="">Sin prioridad</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted">Estado</label>
            <Select value={estado} onChange={(e) => setEstado(e.target.value as GoalEstado)}>
              {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted">Responsable</label>
          <ResponsableSelect value={responsable} onChange={setResponsable} />
        </div>

        {goal.tieneHijas && targetCambia && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            El nuevo objetivo se repartirá entre sus metas
            {goal.periodo === 'mes' ? ' semanales y diarias' : ' diarias'}. El progreso ya registrado no se pierde.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={actualizar.isPending}>
            {actualizar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default EditarMetaModal
