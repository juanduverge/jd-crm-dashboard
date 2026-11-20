import { useState } from 'react'
import { addHours, endOfMonth, endOfWeek, format } from 'date-fns'
import toast from 'react-hot-toast'
import { ArrowLeft, CalendarPlus, CheckSquare, Hash, Zap } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { Modal } from '@/components/ui/Modal'
import { useActualizarMeta, useCrearEvento, useCrearMeta } from '@/hooks/useData'
import { METRICA_BY_CLAVE } from '@/lib/metricas'
import { cn } from '@/lib/utils'
import type { Goal, MetricaClave, Priority } from '@/types'
import { iso } from '../shared/goalMeta'

/**
 * Formulario de metas en dos pasos.
 *
 * Paso 1 pregunta QUÉ tipo de meta es, porque las dos se piensan distinto:
 *   - «Llegar a un número»: 10 reuniones, 50 llamadas, 2 clientes. Puede
 *     contarla el CRM solo si es algo que ya mide.
 *   - «Hacer algo concreto»: «arreglar cosas de mi web el jueves». Se escribe
 *     libre, tiene fecha, horas estimadas y se marca como hecha.
 * Paso 2 enseña solo los campos de ese tipo. Todo es texto libre; las
 * opciones de un clic son atajos, nunca una obligación.
 */

type Clase = 'numero' | 'libre'
type Cuando = 'hoy' | 'semana' | 'mes' | 'fechas'

/** Atajos de metas de número. `metrica` = el CRM la cuenta solo. */
const IDEAS_NUMERO: { label: string; metrica?: MetricaClave; unidad: string; ejemplo: number }[] = [
  { label: 'Reuniones', metrica: 'reuniones_agendadas', unidad: 'reuniones', ejemplo: 4 },
  { label: 'Clientes nuevos', metrica: 'leads_ganados', unidad: 'clientes', ejemplo: 2 },
  { label: 'Contactos', metrica: 'contactos_realizados', unidad: 'contactos', ejemplo: 50 },
  { label: 'Buscar proyectos', metrica: 'leads_encontrados', unidad: 'leads', ejemplo: 10 },
  { label: 'Propuestas', metrica: 'propuestas_enviadas', unidad: 'propuestas', ejemplo: 3 },
  { label: 'Respuestas', metrica: 'leads_respondieron', unidad: 'respuestas', ejemplo: 5 },
  { label: 'Llamadas', unidad: 'llamadas', ejemplo: 20 },
]

const HORAS = [1, 2, 3, 4, 6, 8]
const PRIORIDADES: { v: Priority; l: string }[] = [{ v: 'baja', l: 'Baja' }, { v: 'media', l: 'Media' }, { v: 'alta', l: 'Alta' }]

function rangoDe(c: Cuando, desde: string, hasta: string): { desde: string; hasta: string } {
  const hoy = new Date()
  if (c === 'hoy') return { desde: iso(hoy), hasta: iso(hoy) }
  if (c === 'semana') return { desde: iso(hoy), hasta: iso(endOfWeek(hoy, { weekStartsOn: 1 })) }
  if (c === 'mes') return { desde: iso(hoy), hasta: iso(endOfMonth(hoy)) }
  return { desde, hasta: hasta < desde ? desde : hasta }
}

export function MetaWizard({ meta, onClose }: { meta?: Goal; onClose: () => void }) {
  const editando = !!meta
  const [clase, setClase] = useState<Clase | null>(meta ? (meta.tipo === 'toggle' ? 'libre' : 'numero') : null)

  // Comunes
  const [titulo, setTitulo] = useState(meta?.nombre ?? '')
  const [descripcion, setDescripcion] = useState(meta?.descripcion ?? '')
  const [prioridad, setPrioridad] = useState<Priority>(meta?.prioridad ?? 'media')
  const [horas, setHoras] = useState(meta?.horasEstimadas ? String(meta.horasEstimadas) : '')

  // Número
  const [cantidad, setCantidad] = useState(meta && meta.tipo !== 'toggle' ? String(meta.target) : '')
  const [unidad, setUnidad] = useState(meta?.unidad ?? '')
  const [metrica, setMetrica] = useState<MetricaClave | ''>(meta?.metrica ?? '')
  const [cuando, setCuando] = useState<Cuando>(meta ? 'fechas' : 'mes')
  const [desde, setDesde] = useState(meta?.fechaInicio ?? iso(new Date()))
  const [hasta, setHasta] = useState(meta?.fechaFin ?? iso(new Date()))

  // Libre
  const [fecha, setFecha] = useState(meta?.fechaFin ?? iso(new Date()))
  const [reservar, setReservar] = useState(false)
  const [horaReserva, setHoraReserva] = useState('09:00')

  const crear = useCrearMeta()
  const actualizar = useActualizarMeta()
  const crearEvento = useCrearEvento()
  const guardando = crear.isPending || actualizar.isPending || crearEvento.isPending

  const elegirIdea = (i: (typeof IDEAS_NUMERO)[number]) => {
    setTitulo(i.label)
    setUnidad(i.unidad)
    setMetrica(i.metrica ?? '')
    if (!cantidad) setCantidad(String(i.ejemplo))
  }

  const nHoras = Number(horas.replace(',', '.'))
  const horasValidas = horas.trim() === '' ? undefined : nHoras > 0 ? nHoras : NaN

  async function guardar() {
    const t = titulo.trim()
    if (!t) { toast.error('Escribe un título para la meta'); return }
    if (Number.isNaN(horasValidas)) { toast.error('Las horas tienen que ser un número mayor que cero'); return }

    try {
      if (clase === 'numero') {
        const n = Number(cantidad)
        if (!Number.isFinite(n) || n <= 0) { toast.error('¿Cuántos? Pon un número mayor que cero'); return }
        const r = rangoDe(cuando, desde, hasta)
        if (editando && meta) {
          await actualizar.mutateAsync({
            id: meta.id, nombre: t, descripcion: descripcion.trim(), target: n, unidad: unidad.trim(),
            fechaInicio: r.desde, fechaFin: r.hasta, prioridad, metrica: metrica || null, horasEstimadas: horasValidas ?? null,
          })
        } else {
          const res = await crear.mutateAsync({
            nombre: t, descripcion: descripcion.trim(), tipo: 'contador', target: n, unidad: unidad.trim(),
            fechaInicio: r.desde, fechaFin: r.hasta, prioridad, metrica: metrica || undefined, horasEstimadas: horasValidas,
          })
          if (res.sinHoras) toast('Meta creada. Las horas no se guardaron: falta aplicar la migración 0072.', { icon: 'ℹ️' })
        }
      } else {
        if (editando && meta) {
          await actualizar.mutateAsync({
            id: meta.id, nombre: t, descripcion: descripcion.trim(), fechaInicio: fecha < meta.fechaInicio ? fecha : meta.fechaInicio,
            fechaFin: fecha, prioridad, horasEstimadas: horasValidas ?? null,
          })
        } else {
          const res = await crear.mutateAsync({
            nombre: t, descripcion: descripcion.trim(), tipo: 'toggle', target: 1,
            fechaInicio: fecha < iso(new Date()) ? fecha : iso(new Date()), fechaFin: fecha, prioridad, horasEstimadas: horasValidas,
          })
          // Reservar el hueco: una meta de «4 horas el jueves» sin hueco en
          // el calendario acaba no haciéndose.
          if (reservar) {
            const ini = new Date(`${fecha}T${horaReserva}:00`)
            const fin = addHours(ini, horasValidas || 1)
            await crearEvento.mutateAsync({
              titulo: t, descripcion: descripcion.trim(), tipo: 'evento', estado: 'pendiente',
              inicio: ini.toISOString(), fin: fin.toISOString(), todoElDia: false, color: 'violeta', categoria: 'Meta',
            })
          }
          if (res.sinHoras) toast('Meta creada. Las horas no se guardaron: falta aplicar la migración 0072.', { icon: 'ℹ️' })
        }
      }
      toast.success(editando ? 'Meta actualizada' : reservar ? 'Meta creada y reservada en tu calendario' : 'Meta creada')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const titulo_modal = !clase ? 'Nueva meta' : clase === 'numero' ? (editando ? 'Editar meta' : 'Meta de número') : (editando ? 'Editar meta' : 'Meta libre')

  return (
    <Modal
      open
      size="lg"
      onClose={() => { if (!guardando) onClose() }}
      title={titulo_modal}
      footer={clase ? <>
        {!editando && <Button variant="ghost" size="sm" onClick={() => setClase(null)} disabled={guardando} className="mr-auto"><ArrowLeft className="h-4 w-4" />Cambiar tipo</Button>}
        <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={guardando}>{editando ? 'Guardar' : 'Crear meta'}</Button>
      </> : undefined}
    >
      {!clase ? (
        // ---------------- Paso 1: qué tipo ----------------
        <div>
          <p className="mb-4 text-sm text-muted">¿Qué tipo de meta quieres poner?</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <OpcionTipo
              icono={<Hash className="h-5 w-5" />}
              titulo="Llegar a un número"
              texto="Cuántas veces hacer algo en un plazo."
              ejemplos={['4 reuniones este mes', '20 llamadas esta semana', 'Buscar 10 proyectos hoy']}
              onClick={() => setClase('numero')}
            />
            <OpcionTipo
              icono={<CheckSquare className="h-5 w-5" />}
              titulo="Hacer algo concreto"
              texto="Una cosa que se escribe libre y se marca como hecha."
              ejemplos={['Arreglar cosas de mi web el jueves', 'Preparar la propuesta de X', 'Grabar 2 vídeos']}
              onClick={() => setClase('libre')}
            />
          </div>
        </div>
      ) : clase === 'numero' ? (
        // ---------------- Paso 2a: meta de número ----------------
        <div className="space-y-4">
          {!editando && (
            <div>
              <Etiqueta>Ideas rápidas (o escribe la tuya abajo)</Etiqueta>
              <div className="flex flex-wrap gap-1.5">
                {IDEAS_NUMERO.map((i) => (
                  <button
                    key={i.label}
                    type="button"
                    onClick={() => elegirIdea(i)}
                    className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      titulo === i.label ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'border-border text-muted hover:text-fg')}
                  >
                    {i.metrica && <Zap className="mr-1 inline h-3 w-3" />}{i.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[1fr_7rem_9rem]">
            <div>
              <Etiqueta>¿Qué quieres conseguir?</Etiqueta>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Reuniones con arquitectos" autoFocus={!editando} />
            </div>
            <div>
              <Etiqueta>¿Cuántos?</Etiqueta>
              <Input type="number" min={1} inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="10" />
            </div>
            <div>
              <Etiqueta>Unidad</Etiqueta>
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="reuniones" />
            </div>
          </div>

          <div>
            <Etiqueta>¿Para cuándo?</Etiqueta>
            <Segmentos
              valor={cuando}
              onChange={(v) => setCuando(v as Cuando)}
              opciones={[['hoy', 'Hoy'], ['semana', 'Esta semana'], ['mes', 'Este mes'], ['fechas', 'Elegir fechas']]}
            />
            {cuando === 'fechas' && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div><Etiqueta>Desde</Etiqueta><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
                <div><Etiqueta>Hasta</Etiqueta><Input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></div>
              </div>
            )}
          </div>

          <div>
            <Etiqueta>¿Cómo se cuenta?</Etiqueta>
            <Select value={metrica} onChange={(e) => setMetrica(e.target.value as MetricaClave | '')}>
              <option value="">La cuento yo (botón +1)</option>
              <optgroup label="El CRM la cuenta solo">
                {(['reuniones_agendadas', 'leads_ganados', 'contactos_realizados', 'leads_contactados', 'leads_encontrados', 'propuestas_enviadas', 'leads_respondieron', 'contactos_whatsapp', 'contactos_email', 'tareas_completadas', 'tiempo_prospeccion_min', 'valor_ganado'] as MetricaClave[]).map((k) => (
                  <option key={k} value={k}>{METRICA_BY_CLAVE[k].label}</option>
                ))}
              </optgroup>
            </Select>
            <p className="mt-1.5 text-xs text-muted">
              {metrica ? <><Zap className="mr-0.5 inline h-3 w-3" />Automática: {METRICA_BY_CLAVE[metrica].ayuda}</> : 'Para lo que el CRM no ve (llamadas desde tu móvil, vídeos…). La subes tú con +1.'}
            </p>
          </div>

          <ComunesExtra descripcion={descripcion} setDescripcion={setDescripcion} prioridad={prioridad} setPrioridad={setPrioridad} horas={horas} setHoras={setHoras} />
        </div>
      ) : (
        // ---------------- Paso 2b: meta libre ----------------
        <div className="space-y-4">
          <div>
            <Etiqueta>Título</Etiqueta>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Arreglar la sección de servicios de mi web" autoFocus={!editando} />
          </div>
          <div>
            <Etiqueta>Descripción · qué hay que hacer exactamente</Etiqueta>
            <AutoTextarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder={'Cambiar fotos del inicio\nCorregir el formulario de contacto\nSubir los 3 proyectos nuevos'} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Etiqueta>Día para cumplirla</Etiqueta>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              <div className="mt-1.5 flex gap-1.5">
                {[['Hoy', 0], ['Mañana', 1], ['En una semana', 7]].map(([l, d]) => {
                  const f = iso(new Date(Date.now() + (d as number) * 86_400_000))
                  return (
                    <button key={l} type="button" onClick={() => setFecha(f)} className={cn('rounded-md px-2 py-0.5 text-[0.6875rem]', fecha === f ? 'bg-primary-50 font-semibold text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'text-muted hover:text-fg')}>{l}</button>
                  )
                })}
              </div>
            </div>
            <div>
              <Etiqueta>Prioridad</Etiqueta>
              <Segmentos valor={prioridad} onChange={(v) => setPrioridad(v as Priority)} opciones={PRIORIDADES.map((p) => [p.v, p.l])} />
            </div>
          </div>
          <Horas horas={horas} setHoras={setHoras} />

          {!editando && (
            <div className="rounded-xl border border-border bg-surface-2/60 p-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
                <input type="checkbox" className="h-4 w-4 accent-primary-500" checked={reservar} onChange={(e) => setReservar(e.target.checked)} />
                <CalendarPlus className="h-4 w-4 text-muted" />Reservar el tiempo en mi calendario
              </label>
              {reservar && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                  El {format(new Date(`${fecha}T12:00:00`), 'dd/MM')} a las
                  <Input type="time" value={horaReserva} onChange={(e) => setHoraReserva(e.target.value)} className="w-32" />
                  durante {horasValidas && !Number.isNaN(horasValidas) ? `${horasValidas} h` : '1 h'}.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function OpcionTipo({ icono, titulo, texto, ejemplos, onClick }: { icono: React.ReactNode; titulo: string; texto: string; ejemplos: string[]; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group rounded-2xl border border-border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary-400 hover:shadow-card-hover">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-500/15">{icono}</span>
      <p className="mt-3 font-semibold text-fg">{titulo}</p>
      <p className="mt-0.5 text-xs text-muted">{texto}</p>
      <ul className="mt-3 space-y-1">
        {ejemplos.map((e) => <li key={e} className="text-xs text-muted before:mr-1.5 before:content-['·']">{e}</li>)}
      </ul>
    </button>
  )
}

function Etiqueta({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted">{children}</label>
}

function Segmentos({ valor, onChange, opciones }: { valor: string; onChange: (v: string) => void; opciones: [string, string][] }) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-border bg-surface p-1">
      {opciones.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={cn('rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', v === valor ? 'bg-primary-500 text-white shadow-sm' : 'text-muted hover:text-fg')}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Horas({ horas, setHoras }: { horas: string; setHoras: (v: string) => void }) {
  return (
    <div>
      <Etiqueta>¿Cuántas horas te llevará? (opcional)</Etiqueta>
      <div className="flex flex-wrap items-center gap-1.5">
        {HORAS.map((h) => (
          <button key={h} type="button" onClick={() => setHoras(String(h))}
            className={cn('rounded-lg border px-2.5 py-1 text-xs font-medium', horas === String(h) ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300' : 'border-border text-muted hover:text-fg')}>
            {h} h
          </button>
        ))}
        <Input value={horas} onChange={(e) => setHoras(e.target.value)} inputMode="decimal" placeholder="otra" className="h-8 w-20" />
      </div>
    </div>
  )
}

function ComunesExtra({ descripcion, setDescripcion, prioridad, setPrioridad, horas, setHoras }: {
  descripcion: string; setDescripcion: (v: string) => void; prioridad: Priority; setPrioridad: (v: Priority) => void; horas: string; setHoras: (v: string) => void
}) {
  return (
    <>
      <div>
        <Etiqueta>Descripción (opcional)</Etiqueta>
        <AutoTextarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Por qué esta meta, cómo piensas llegar…" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Etiqueta>Prioridad</Etiqueta>
          <Segmentos valor={prioridad} onChange={(v) => setPrioridad(v as Priority)} opciones={PRIORIDADES.map((p) => [p.v, p.l])} />
        </div>
        <Horas horas={horas} setHoras={setHoras} />
      </div>
    </>
  )
}
