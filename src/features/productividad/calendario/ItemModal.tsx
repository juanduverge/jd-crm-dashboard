import { useEffect, useMemo, useState } from 'react'
import { addMinutes, differenceInMinutes, format } from 'date-fns'
import toast from 'react-hot-toast'
import {
  Bell, CalendarDays, CheckSquare, Clock, Copy, Flag, Trash2, Users,
} from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import {
  useActualizarEvento, useCrearBloque, useCrearEvento, useCrearMetaSuelta, useCreateTarea,
  useDuplicarEvento, useEliminarEvento,
} from '@/hooks/useData'
import type { Evento, EventoEstado, EventoPrioridad, EventoTipo } from '@/types'
import { DIAS_SEMANA, iso, isoDow } from '../shared/goalMeta'
import { COLORES, fechaConHora, type ColorItem } from './itemCalendario'

/**
 * El panel de crear y editar del calendario.
 *
 * PUNTO IMPORTANTE DE ARQUITECTURA: desde aquí se crean SEIS cosas, pero sólo
 * tres de ellas viven en `eventos`. Una tarea creada desde el calendario va a
 * `tasks`, una meta a `goals` y un bloque de trabajo a `horario_bloques` —
 * exactamente donde ya vivían. El calendario es una forma de mirar el trabajo,
 * no una copia paralela de él; si duplicásemos aquí las tareas, en dos semanas
 * una de las dos copias estaría mintiendo.
 *
 * Por eso el formulario cambia de campos según el tipo: pedirle "hora de fin" a
 * una meta o "unidad" a un recordatorio sería pedir datos que su tabla no tiene
 * dónde guardar.
 */

type TipoCreable = EventoTipo | 'tarea' | 'meta' | 'bloque'

const TIPOS: { valor: TipoCreable; label: string; icono: typeof CalendarDays; destino: string }[] = [
  { valor: 'evento', label: 'Evento', icono: CalendarDays, destino: 'Calendario' },
  { valor: 'reunion', label: 'Reunión', icono: Users, destino: 'Calendario' },
  { valor: 'recordatorio', label: 'Recordatorio', icono: Bell, destino: 'Calendario' },
  { valor: 'tarea', label: 'Tarea', icono: CheckSquare, destino: 'Tareas' },
  { valor: 'meta', label: 'Meta', icono: Flag, destino: 'Metas' },
  { valor: 'bloque', label: 'Bloque de trabajo', icono: Clock, destino: 'Horario del día' },
]

const esEvento = (t: TipoCreable): t is EventoTipo =>
  t === 'evento' || t === 'reunion' || t === 'recordatorio'

const PRIORIDADES: { valor: EventoPrioridad; label: string }[] = [
  { valor: 'baja', label: 'Baja' },
  { valor: 'media', label: 'Media' },
  { valor: 'alta', label: 'Alta' },
  { valor: 'urgente', label: 'Urgente' },
]

const ESTADOS: { valor: EventoEstado; label: string }[] = [
  { valor: 'pendiente', label: 'Pendiente' },
  { valor: 'confirmado', label: 'Confirmado' },
  { valor: 'hecho', label: 'Hecho' },
  { valor: 'cancelado', label: 'Cancelado' },
]

/** Duraciones de un clic. Escribir "10:45" a mano sigue estando disponible. */
const DURACIONES = [15, 30, 45, 60, 90, 120]

export interface ItemModalProps {
  open: boolean
  onClose: () => void
  /** Día sobre el que se hizo clic, yyyy-MM-dd. */
  fecha: string
  /** Hora del hueco pulsado en la rejilla, HH:MM. Sin ella, se propone 09:00. */
  hora?: string
  /** Presente = se está editando. Ausente = se está creando. */
  evento?: Evento
}

export function ItemModal({ open, onClose, fecha, hora, evento }: ItemModalProps) {
  const editando = !!evento

  const [tipo, setTipo] = useState<TipoCreable>('evento')

  // Campos comunes
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [notas, setNotas] = useState('')
  const [dia, setDia] = useState(fecha)
  const [horaInicio, setHoraInicio] = useState(hora ?? '09:00')
  const [horaFin, setHoraFin] = useState('10:00')
  const [todoElDia, setTodoElDia] = useState(false)
  const [color, setColor] = useState<ColorItem>('coral')
  const [prioridad, setPrioridad] = useState<EventoPrioridad>('media')
  const [estado, setEstado] = useState<EventoEstado>('pendiente')
  const [categoria, setCategoria] = useState('')
  const [etiquetas, setEtiquetas] = useState('')
  const [enlace, setEnlace] = useState('')
  const [ubicacion, setUbicacion] = useState('')

  // Sólo meta
  const [periodoMeta, setPeriodoMeta] = useState<'dia' | 'semana'>('dia')
  const [target, setTarget] = useState('1')
  const [unidad, setUnidad] = useState('')
  // Sólo bloque
  const [diasSemana, setDiasSemana] = useState<number[]>([])

  const crearEvento = useCrearEvento()
  const actualizarEvento = useActualizarEvento()
  const duplicarEvento = useDuplicarEvento()
  const eliminarEvento = useEliminarEvento()
  const crearTarea = useCreateTarea()
  const crearMeta = useCrearMetaSuelta()
  const crearBloque = useCrearBloque()

  const guardando =
    crearEvento.isPending || actualizarEvento.isPending || crearTarea.isPending ||
    crearMeta.isPending || crearBloque.isPending

  /**
   * Al abrir se rellena el formulario. Se hace en un efecto y no en el estado
   * inicial porque el modal no se desmonta entre aperturas: sin esto, abrir un
   * evento y luego un hueco vacío mostraría los datos del anterior.
   */
  useEffect(() => {
    if (!open) return
    if (evento) {
      const i = new Date(evento.inicio)
      const f = new Date(evento.fin)
      setTipo(evento.tipo)
      setTitulo(evento.titulo)
      setDescripcion(evento.descripcion ?? '')
      setNotas(evento.notas ?? '')
      setDia(iso(i))
      setHoraInicio(format(i, 'HH:mm'))
      setHoraFin(format(f, 'HH:mm'))
      setTodoElDia(evento.todoElDia)
      setColor((evento.color as ColorItem) ?? 'coral')
      setPrioridad(evento.prioridad ?? 'media')
      setEstado(evento.estado)
      setCategoria(evento.categoria ?? '')
      setEtiquetas(evento.etiquetas.join(', '))
      setEnlace(evento.enlace ?? '')
      setUbicacion(evento.ubicacion ?? '')
      return
    }
    const inicio = hora ?? '09:00'
    setTipo('evento')
    setTitulo('')
    setDescripcion('')
    setNotas('')
    setDia(fecha)
    setHoraInicio(inicio)
    setHoraFin(format(addMinutes(fechaConHora(fecha, inicio), 60), 'HH:mm'))
    setTodoElDia(false)
    setColor('coral')
    setPrioridad('media')
    setEstado('pendiente')
    setCategoria('')
    setEtiquetas('')
    setEnlace('')
    setUbicacion('')
    setPeriodoMeta('dia')
    setTarget('1')
    setUnidad('')
    setDiasSemana([isoDow(new Date(`${fecha}T00:00:00`))])
  }, [open, evento, fecha, hora])

  /** Duración en minutos, derivada de las dos horas. Nunca se guarda aparte. */
  const duracion = useMemo(() => {
    const a = fechaConHora(dia, horaInicio)
    const b = fechaConHora(dia, horaFin)
    return Math.max(0, differenceInMinutes(b, a))
  }, [dia, horaInicio, horaFin])

  /** Elegir una duración mueve el fin; la hora de inicio manda. */
  const aplicarDuracion = (min: number) => {
    setHoraFin(format(addMinutes(fechaConHora(dia, horaInicio), min), 'HH:mm'))
  }

  const cambiarInicio = (v: string) => {
    // Al mover el inicio se conserva la duración, como en Google Calendar.
    const previa = duracion
    setHoraInicio(v)
    if (previa > 0) setHoraFin(format(addMinutes(fechaConHora(dia, v), previa), 'HH:mm'))
  }

  const cerrar = () => { if (!guardando) onClose() }

  async function guardar() {
    const t = titulo.trim()
    if (!t) { toast.error('Ponle un título'); return }

    try {
      if (esEvento(tipo)) {
        if (!todoElDia && duracion < 0) { toast.error('La hora de fin va antes que la de inicio'); return }
        const inicio = todoElDia ? fechaConHora(dia, '00:00') : fechaConHora(dia, horaInicio)
        const fin = todoElDia ? fechaConHora(dia, '23:59') : fechaConHora(dia, horaFin)
        const payload = {
          titulo: t,
          descripcion: descripcion.trim(),
          notas: notas.trim(),
          tipo,
          estado,
          inicio: inicio.toISOString(),
          fin: fin.toISOString(),
          todoElDia,
          color,
          prioridad,
          categoria: categoria.trim(),
          etiquetas: etiquetas.split(',').map((e) => e.trim()).filter(Boolean),
          enlace: enlace.trim(),
          ubicacion: ubicacion.trim(),
        }
        if (evento) {
          await actualizarEvento.mutateAsync({ id: evento.id, ...payload })
          toast.success('Guardado')
        } else {
          await crearEvento.mutateAsync(payload)
          toast.success('Creado en el calendario')
        }
      } else if (tipo === 'tarea') {
        await crearTarea.mutateAsync({
          titulo: t,
          descripcion: descripcion.trim() || undefined,
          notas: notas.trim() || undefined,
          fechaVencimiento: dia,
          prioridad,
        })
        toast.success('Tarea creada en Tareas')
      } else if (tipo === 'meta') {
        const n = Number(target)
        if (!Number.isFinite(n) || n <= 0) { toast.error('El objetivo tiene que ser un número mayor que cero'); return }
        // Una meta de día empieza y acaba el mismo día; una de semana ocupa
        // los siete días desde el elegido. La cascada mes→semana→día se hace
        // desde Metas: esto es una meta suelta.
        const inicio = new Date(`${dia}T00:00:00`)
        const fin = periodoMeta === 'dia' ? inicio : addMinutes(inicio, 6 * 24 * 60)
        await crearMeta.mutateAsync({
          nombre: t,
          descripcion: descripcion.trim() || undefined,
          periodo: periodoMeta,
          tipo: 'contador',
          target: n,
          unidad: unidad.trim() || undefined,
          fechaInicio: iso(inicio),
          fechaFin: iso(fin),
        })
        toast.success('Meta creada en Metas')
      } else {
        if (!diasSemana.length) { toast.error('Elige al menos un día de la semana'); return }
        if (duracion <= 0) { toast.error('El bloque no dura nada'); return }
        await crearBloque.mutateAsync({
          titulo: t,
          descripcion: descripcion.trim() || undefined,
          horaInicio,
          horaFin,
          diasSemana: [...diasSemana].sort((a, b) => a - b),
        })
        toast.success('Bloque añadido al horario')
      }
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  async function duplicar() {
    if (!evento) return
    try {
      await duplicarEvento.mutateAsync({ id: evento.id })
      toast.success('Duplicado')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo duplicar')
    }
  }

  async function eliminar() {
    if (!evento) return
    try {
      await eliminarEvento.mutateAsync(evento.id)
      toast.success('Eliminado')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar')
    }
  }

  const conHora = esEvento(tipo) ? !todoElDia : tipo === 'bloque'
  const elegido = TIPOS.find((x) => x.valor === tipo)

  return (
    <Modal
      open={open}
      onClose={cerrar}
      size="lg"
      title={editando ? 'Editar evento' : 'Nuevo en el calendario'}
      footer={
        <>
          {editando && (
            <>
              <Button variant="ghost" size="sm" onClick={duplicar} disabled={guardando}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicar
              </Button>
              <Button variant="ghost" size="sm" onClick={eliminar} disabled={guardando}
                      className="text-red-500 hover:bg-red-500/10">
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Eliminar
              </Button>
              <div className="flex-1" />
            </>
          )}
          <Button variant="outline" size="sm" onClick={cerrar} disabled={guardando}>Cancelar</Button>
          <Button size="sm" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : editando ? 'Guardar' : 'Crear'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* El tipo no se cambia al editar: un evento no se convierte en tarea
            sin mover la fila de tabla, y eso es un traslado, no una edición. */}
        {!editando && (
          <div>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map((x) => {
                const Icono = x.icono
                return (
                  <button
                    key={x.valor}
                    type="button"
                    onClick={() => setTipo(x.valor)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
                      tipo === x.valor
                        ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300'
                        : 'border-border text-muted hover:text-fg',
                    )}
                  >
                    <Icono className="h-3.5 w-3.5" />
                    {x.label}
                  </button>
                )
              })}
            </div>
            {elegido && !esEvento(tipo) && (
              <p className="mt-2 text-[11px] text-muted">
                Se guarda en <span className="font-medium text-fg">{elegido.destino}</span> y el
                calendario lo pinta desde ahí. No se duplica nada.
              </p>
            )}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Título</label>
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)}
                 placeholder={tipo === 'meta' ? 'Ej. Enviar 40 propuestas' : 'Ej. Llamada con el cliente'} autoFocus />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Descripción</label>
          <AutoTextarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                        placeholder="De qué va, en una o dos líneas" />
        </div>

        {/* ---------- Fecha y hora ---------- */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">
              {tipo === 'tarea' ? 'Vence el' : tipo === 'bloque' ? 'Desde el día' : 'Fecha'}
            </label>
            <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
          </div>

          {esEvento(tipo) && (
            <label className="flex items-end gap-2 pb-2 text-sm text-fg">
              <input type="checkbox" className="h-4 w-4 accent-current"
                     checked={todoElDia} onChange={(e) => setTodoElDia(e.target.checked)} />
              Todo el día
            </label>
          )}
        </div>

        {conHora && (
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Inicio</label>
                <Input type="time" value={horaInicio} onChange={(e) => cambiarInicio(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Fin</label>
                <Input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Duración</label>
                <p className="flex h-9 items-center text-sm tabular-nums text-fg">
                  {duracion >= 60 ? `${Math.floor(duracion / 60)} h ${duracion % 60 || ''}${duracion % 60 ? ' min' : ''}` : `${duracion} min`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {DURACIONES.map((m) => (
                <button key={m} type="button" onClick={() => aplicarDuracion(m)}
                        className={cn(
                          'rounded-lg border px-2 py-1 text-[11px] transition-colors',
                          duracion === m ? 'border-primary-500 text-primary-600 dark:text-primary-300' : 'border-border text-muted hover:text-fg',
                        )}>
                  {m >= 60 ? `${m / 60} h` : `${m} min`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ---------- Sólo bloque: los días de la plantilla ---------- */}
        {tipo === 'bloque' && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Días de la semana</label>
            <div className="flex gap-1.5">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => setDiasSemana((prev) =>
                    prev.includes(d.iso) ? prev.filter((x) => x !== d.iso) : [...prev, d.iso])}
                  title={d.label}
                  className={cn(
                    'h-8 w-8 rounded-lg border text-xs font-medium transition-colors',
                    diasSemana.includes(d.iso)
                      ? 'border-primary-500 bg-primary-500/10 text-primary-600 dark:text-primary-300'
                      : 'border-border text-muted hover:text-fg',
                  )}
                >
                  {d.corto}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted">
              El bloque es una plantilla semanal: se repite todas las semanas en los días marcados.
            </p>
          </div>
        )}

        {/* ---------- Sólo meta ---------- */}
        {tipo === 'meta' && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Periodo</label>
              <Select value={periodoMeta} onChange={(e) => setPeriodoMeta(e.target.value as 'dia' | 'semana')}>
                <option value="dia">Día</option>
                <option value="semana">Semana</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Objetivo</label>
              <Input type="number" min="1" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Unidad</label>
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="llamadas" />
            </div>
          </div>
        )}

        {/* ---------- Prioridad / estado ---------- */}
        <div className="grid gap-3 sm:grid-cols-2">
          {(esEvento(tipo) || tipo === 'tarea') && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Prioridad</label>
              <Select value={prioridad} onChange={(e) => setPrioridad(e.target.value as EventoPrioridad)}>
                {PRIORIDADES
                  // `tasks` no conoce 'urgente'; su enum viene de la 0001.
                  .filter((p) => esEvento(tipo) || p.valor !== 'urgente')
                  .map((p) => <option key={p.valor} value={p.valor}>{p.label}</option>)}
              </Select>
            </div>
          )}
          {esEvento(tipo) && (
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Estado</label>
              <Select value={estado} onChange={(e) => setEstado(e.target.value as EventoEstado)}>
                {ESTADOS.map((s) => <option key={s.valor} value={s.valor}>{s.label}</option>)}
              </Select>
            </div>
          )}
        </div>

        {/* ---------- Sólo eventos: lo que sólo `eventos` sabe guardar ---------- */}
        {esEvento(tipo) && (
          <>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Color</label>
              <div className="flex flex-wrap gap-1.5">
                {COLORES.map((c) => (
                  <button
                    key={c.valor}
                    type="button"
                    onClick={() => setColor(c.valor)}
                    title={c.label}
                    className={cn(
                      'h-7 w-7 rounded-full ring-offset-2 ring-offset-surface transition',
                      c.muestra,
                      color === c.valor ? 'ring-2 ring-fg' : 'opacity-70 hover:opacity-100',
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Categoría</label>
                <Input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Comercial, personal…" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Etiquetas</label>
                <Input value={etiquetas} onChange={(e) => setEtiquetas(e.target.value)} placeholder="separadas, por, comas" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Enlace</label>
                <Input value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://meet.google.com/…" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Ubicación</label>
                <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Oficina, videollamada…" />
              </div>
            </div>
          </>
        )}

        {(esEvento(tipo) || tipo === 'tarea') && (
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Notas</label>
            <AutoTextarea value={notas} onChange={(e) => setNotas(e.target.value)}
                          placeholder="Lo que haga falta recordar" />
          </div>
        )}
      </div>
    </Modal>
  )
}

export default ItemModal
