import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Link2, Plus, X } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Modal } from '@/components/ui/Modal'
import { ResponsableSelect } from '@/components/ui/ResponsableSelect'
import { useGoals, useUpdateTarea } from '@/hooks/useData'
import { RESPONSABLE_POR_DEFECTO } from '@/lib/equipo'
import { PRIORIDADES, PRIORIDAD_ORDER } from '@/features/webleads/webLeadMeta'
import { filtrarPorPeriodo, rangoConsulta } from '../shared/goalMeta'
import type { Tarea, TareaEstado, TareaSeccion, TareaTipo } from '@/types'

/**
 * Editar una tarea existente sin borrarla y volver a crearla.
 *
 * Volver a crearla no era sólo incómodo: perdía el `created_at` y, sobre todo,
 * el tiempo ya imputado en `time_entries`, que cuelga del id de la tarea. Por
 * eso todo aquí es un UPDATE sobre la misma fila.
 *
 * La duración que se edita es la ESTIMADA. El tiempo realmente dedicado se mide
 * aparte (cronómetro / time_entries) y no se toca desde este formulario: el
 * tiempo mide, no puntúa.
 *
 * Archivos adjuntos: pendiente. Exige un bucket de Supabase Storage con sus
 * políticas, que es infraestructura nueva y depende del despliegue. Mientras
 * tanto, `enlaces` cubre el caso real (pegar el enlace de Drive/Notion).
 */

const ESTADOS: { id: TareaEstado; label: string }[] = [
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'en_progreso', label: 'En progreso' },
  { id: 'hecha', label: 'Hecha' },
]

const DURACIONES = [15, 30, 45, 60, 90, 120, 180, 240]

export function EditarTareaModal({
  tarea, onClose, secciones, tipos,
}: {
  tarea: Tarea | null
  onClose: () => void
  secciones: { id: TareaSeccion; label: string }[]
  tipos: Record<TareaTipo, { label: string }>
}) {
  const update = useUpdateTarea()

  const [titulo, setTitulo] = useState('')
  const [tipo, setTipo] = useState<TareaTipo>('otro')
  const [estado, setEstado] = useState<TareaEstado>('pendiente')
  const [fecha, setFecha] = useState('')
  const [prioridad, setPrioridad] = useState('media')
  const [seccion, setSeccion] = useState<TareaSeccion>('prioritaria')
  const [responsable, setResponsable] = useState(RESPONSABLE_POR_DEFECTO)
  const [goalId, setGoalId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')
  const [enlaces, setEnlaces] = useState<string[]>([])
  const [duracion, setDuracion] = useState('')

  const consulta = rangoConsulta(new Date())
  const { data: goals } = useGoals(consulta.desde, consulta.hasta)
  const metasMes = useMemo(
    () => filtrarPorPeriodo(goals, 'mes', consulta.desde, consulta.hasta),
    [goals, consulta.desde, consulta.hasta],
  )

  // Se recarga cada vez que cambia la tarea abierta: el modal se reutiliza para
  // todas las filas, así que sin esto la segunda edición mostraría la primera.
  useEffect(() => {
    if (!tarea) return
    setTitulo(tarea.titulo ?? '')
    setTipo(tarea.tipo ?? 'otro')
    setEstado(tarea.estado)
    setFecha(tarea.fechaVencimiento ?? '')
    setPrioridad(tarea.prioridad ?? 'media')
    setSeccion(tarea.seccion)
    setResponsable(tarea.responsable || RESPONSABLE_POR_DEFECTO)
    setGoalId(tarea.goalId ?? '')
    setDescripcion(tarea.descripcion ?? '')
    setNotas(tarea.notas ?? '')
    setEnlaces(tarea.enlaces?.length ? tarea.enlaces : [])
    setDuracion(tarea.duracionMin ? String(tarea.duracionMin) : '')
  }, [tarea])

  const guardar = async () => {
    if (!tarea) return
    if (!titulo.trim()) { toast.error('Escribe un título'); return }
    const min = duracion ? Number(duracion) : null
    if (min !== null && (!Number.isFinite(min) || min <= 0 || min > 1440)) {
      toast.error('La duración debe estar entre 1 y 1440 minutos')
      return
    }
    try {
      await update.mutateAsync({
        id: tarea.id,
        titulo: titulo.trim(),
        tipo,
        estado,
        fechaVencimiento: fecha,
        prioridad,
        seccion,
        responsable,
        goalId: goalId || null,
        descripcion: descripcion.trim(),
        notas: notas.trim(),
        // Se limpian los huecos vacíos aquí y no al teclear, para no borrar la
        // fila mientras el usuario todavía está escribiendo el enlace.
        enlaces: enlaces.map((e) => e.trim()).filter(Boolean),
        duracionMin: min,
      })
      toast.success('Tarea actualizada')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la tarea')
    }
  }

  return (
    <Modal
      open={!!tarea}
      onClose={onClose}
      title="Editar tarea"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={update.isPending}>
            {update.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Título</span>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Tipo</span>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as TareaTipo)}>
              {Object.entries(tipos).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Estado</span>
            <Select value={estado} onChange={(e) => setEstado(e.target.value as TareaEstado)}>
              {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Prioridad</span>
            <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
              {PRIORIDAD_ORDER.map((p) => <option key={p} value={p}>{PRIORIDADES[p].label}</option>)}
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Fecha de vencimiento</span>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Bloque</span>
            <Select value={seccion} onChange={(e) => setSeccion(e.target.value as TareaSeccion)}>
              {secciones.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Responsable</span>
            <ResponsableSelect value={responsable} onChange={setResponsable} />
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Duración estimada</span>
            <Select value={duracion} onChange={(e) => setDuracion(e.target.value)}>
              <option value="">Sin estimar</option>
              {/* Un valor antiguo fuera de la lista se pinta igualmente para no
                  borrarlo en silencio al guardar. */}
              {duracion && !DURACIONES.includes(Number(duracion)) && (
                <option value={duracion}>{duracion} min</option>
              )}
              {DURACIONES.map((d) => (
                <option key={d} value={d}>{d >= 60 ? `${d / 60} h` : `${d} min`}</option>
              ))}
            </Select>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Meta a la que alimenta</span>
          <Select value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Ninguna</option>
            {metasMes.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </Select>
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Descripción</span>
          <AutoTextarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="El detalle que no cabe en el título: qué hay que hacer y cuándo se da por hecha"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Notas</span>
          <AutoTextarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Apuntes sueltos mientras la trabajas"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-muted">Enlaces</span>
          <div className="space-y-2">
            {enlaces.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <Link2 className="h-4 w-4 shrink-0 text-muted" />
                <Input
                  value={url}
                  onChange={(e) => setEnlaces(enlaces.map((v, j) => (j === i ? e.target.value : v)))}
                  placeholder="https://…"
                />
                <button
                  type="button"
                  onClick={() => setEnlaces(enlaces.filter((_, j) => j !== i))}
                  className="btn-ghost h-8 w-8 shrink-0 p-0 text-muted hover:text-red-500"
                  title="Quitar enlace"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <Button variant="outline" onClick={() => setEnlaces([...enlaces, ''])}>
              <Plus className="h-4 w-4" /> Añadir enlace
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            Documento, diseño o ticket relacionado. Los archivos adjuntos llegarán
            cuando esté el almacenamiento; de momento pega aquí el enlace.
          </p>
        </div>
      </div>
    </Modal>
  )
}

export default EditarTareaModal
