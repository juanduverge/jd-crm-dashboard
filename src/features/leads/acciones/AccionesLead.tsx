import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  AtSign, BellRing, CalendarCheck, CalendarPlus, Camera, Check, ChevronLeft, ChevronRight, Linkedin, Mail, MessageCircle, MessageSquare,
  MapPin, MessageSquareReply, Phone, PhoneCall, PhoneOff, StickyNote, Timer, Video,
} from 'lucide-react'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import {
  useActualizarFollowUp, useCreateNote, useEventos, useGuardarEncuesta, useLeadFollowUps, useProgramarFollowUp,
  useRegistrarContacto, useRegistrarRespuesta,
} from '@/hooks/useData'
import { NewMessageModal } from '@/features/messages/NewMessageModal'
import { ItemModal } from '@/features/productividad/calendario/ItemModal'
import { addDiasLaborales, today, TIPO_META } from '@/lib/followUps'
import { digitos, textoNumero, usePerfilTrabajo, type MiNumero } from '@/lib/perfilTrabajo'
import { cn } from '@/lib/utils'
import { useLeadsStore } from '@/store/leadsStore'
import { ANIMO, ATENDIO, ESTRATEGIA, INTERES, OBJECION, TIPO_PROYECTO, type OpcionEncuesta } from '@/lib/encuestaLlamada'
import type { DetalleContacto, EncuestaLlamada, FollowUpResultado, FollowUpTipo, Lead } from '@/types'
import { calcularHuecos } from './huecos'

/**
 * «¿Qué quieres hacer?» — todo lo que se hace con un lead, desde su ficha.
 *
 * Cada acción es un flujo corto que termina SIEMPRE registrado en el
 * historial (follow_ups, vía `registrar_contacto` de la 0073) y en la
 * pregunta de qué sigue: agendar una reunión con tus huecos libres, programar
 * el próximo contacto o nada. Así no queda ningún lead contactado «en el aire».
 *
 * Etapa: solo «Interesado» y «Pidió información» cuentan como respuesta
 * positiva y mueven el lead a «Respondió» (lo hace la BD).
 */

type Paso =
  | { k: 'llamar' }
  | { k: 'mensaje' }
  | { k: 'respondio' }
  | { k: 'que_sigue'; sugerir?: 'reunion' | 'contacto'; tipo?: FollowUpTipo }
  | { k: 'reunion' }
  | { k: 'recordar'; tipo?: FollowUpTipo; titulo?: string }
  | { k: 'nota' }
  | { k: 'correo' }
  | null

export function AccionesLead({ lead }: { lead: Lead }) {
  const [paso, setPaso] = useState<Paso>(null)
  const [cita, setCita] = useState<{ fecha: string; hora?: string; virtual: boolean; ubicacion?: string } | null>(null)
  const yaContactado = lead.touchActual > 0
  const cerrar = () => setPaso(null)

  const acciones: { k: Exclude<Paso, null>['k']; label: string; icon: typeof Phone; tono?: string }[] = [
    { k: 'llamar', label: 'Llamar', icon: Phone },
    { k: 'mensaje', label: 'Mensaje', icon: MessageCircle },
    { k: 'reunion', label: 'Reunión', icon: CalendarPlus },
    { k: 'recordar', label: 'Recordarme', icon: BellRing },
    { k: 'nota', label: 'Nota', icon: StickyNote },
  ]

  return (
    <>
      <div className="grid grid-cols-5 gap-1.5">
        {acciones.map((a) => {
          const Icon = a.icon
          return (
            <button
              key={a.k}
              type="button"
              onClick={() => setPaso({ k: a.k } as Paso)}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-surface px-1 py-2.5 text-[0.6875rem] font-medium text-fg transition-colors hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-500/10"
            >
              <Icon className="h-4 w-4 text-primary-600" />{a.label}
            </button>
          )
        })}
      </div>
      {yaContactado && !lead.respondioEn && (
        <button
          type="button"
          onClick={() => setPaso({ k: 'respondio' })}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-emerald-400 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/10"
        >
          <MessageSquareReply className="h-4 w-4" />Me respondió
        </button>
      )}

      {paso?.k === 'llamar' && <FlujoLlamada lead={lead} onClose={cerrar} onSiguiente={setPaso} />}
      {paso?.k === 'mensaje' && <FlujoMensaje lead={lead} onClose={cerrar} onSiguiente={setPaso} />}
      {paso?.k === 'respondio' && <RespondioModal lead={lead} onClose={cerrar} onSiguiente={setPaso} />}
      {paso?.k === 'que_sigue' && <QueSigue lead={lead} sugerir={paso.sugerir} tipo={paso.tipo} onClose={cerrar} onSiguiente={setPaso} />}
      {paso?.k === 'reunion' && (
        <ElegirHueco lead={lead} onClose={cerrar} onElegir={(fecha, hora, modo) => { setPaso(null); setCita({ fecha, hora, ...modo }) }} />
      )}
      {paso?.k === 'recordar' && <Recordatorio lead={lead} tipoInicial={paso.tipo} titulo={paso.titulo} onClose={cerrar} />}
      {paso?.k === 'nota' && <NotaRapida lead={lead} onClose={cerrar} />}
      {paso?.k === 'correo' && (
        <NewMessageModal
          open
          onClose={cerrar}
          onSent={() => setPaso({ k: 'que_sigue', sugerir: 'contacto', tipo: 'email' })}
          initialTo={lead.email}
          toOptions={lead.emails}
          leadId={lead.id}
          lockTo
        />
      )}
      {cita && <CitaConLead lead={lead} fecha={cita.fecha} hora={cita.hora} virtual={cita.virtual} ubicacion={cita.ubicacion} onClose={() => setCita(null)} />}
    </>
  )
}

// =====================================================================
// Piezas comunes
// =====================================================================

function Opcion({ activo, onClick, children, icon: Icon, tono = 'primary' }: {
  activo?: boolean; onClick: () => void; children: ReactNode; icon?: typeof Phone; tono?: 'primary' | 'ok' | 'danger'
}) {
  const on = {
    primary: 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200',
    ok: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
    danger: 'border-red-300 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200',
  }[tono]
  return (
    <button type="button" onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors', activo ? on : 'border-border text-fg hover:bg-surface-2')}>
      {Icon && <Icon className="h-4 w-4" />}{children}
    </button>
  )
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs font-semibold text-muted">{children}</p>
}

/** Atajos de fecha para «¿cuándo volvemos?». Solo días laborables. */
function CuandoVolvemos({ fecha, setFecha }: { fecha: string; setFecha: (f: string) => void }) {
  const hoy = today()
  const opciones: [string, string][] = [
    ['Mañana', addDiasLaborales(1, hoy)],
    ['En 2 días', addDiasLaborales(2, hoy)],
    ['En 3 días', addDiasLaborales(3, hoy)],
    ['La semana que viene', addDiasLaborales(5, hoy)],
  ]
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {opciones.map(([l, f]) => <Opcion key={l} activo={fecha === f} onClick={() => setFecha(f)}>{l}</Opcion>)}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className="w-44" />
        <span className="text-xs text-muted">{fecha ? mayus(fechaLarga(fecha)) : ''}</span>
      </div>
    </div>
  )
}

/** Programa el próximo contacto; si ya hay uno pendiente, lo mueve en vez de fallar. */
function useProgramarSiguiente(leadId: string) {
  const { data: fus } = useLeadFollowUps(leadId)
  const programar = useProgramarFollowUp()
  const actualizar = useActualizarFollowUp()
  return {
    pendiente: programar.isPending || actualizar.isPending,
    async hacer(fecha: string, tipo: FollowUpTipo, nota?: string) {
      const ya = (fus ?? []).find((f) => f.estado === 'pendiente')
      if (ya) await actualizar.mutateAsync({ id: ya.id, fecha, tipo, nota })
      else await programar.mutateAsync({ leadId, fecha, tipo, nota })
    },
  }
}

const isoDia = (d: Date) => format(d, 'yyyy-MM-dd')
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
/**
 * Lo que la BD hará con el lead al registrar un contacto (trigger
 * `avanzar_etapa_por_toque`, 0038), aplicado ya en pantalla para que la ficha
 * y el tablero cambien al instante en vez de esperar a la recarga.
 */
function useReflejarContacto(lead: Lead) {
  const patchLocal = useLeadsStore((st) => st.patchLocal)
  return (tipo: FollowUpTipo, resultado: FollowUpResultado, esRespuesta = false) => {
    const touch = esRespuesta ? lead.touchActual : lead.touchActual + 1
    const temprano = ['nuevo', 'contactado', 'seguimiento', 'respondio'] as const
    const orden = (e: Lead['estado']) => (temprano as readonly string[]).indexOf(e)
    const destino: Lead['estado'] = resultado === 'positivo' ? 'respondio' : touch >= 2 ? 'seguimiento' : 'contactado'
    const avanza = orden(lead.estado) !== -1 && orden(lead.estado) < orden(destino)
    patchLocal(lead.id, {
      touchActual: touch,
      ...(esRespuesta ? {} : { ultimoContactoEn: new Date().toISOString(), ultimoContactoTipo: tipo, ultimoContactoResultado: resultado }),
      ...(resultado !== 'sin_respuesta' ? { respondioEn: lead.respondioEn ?? new Date().toISOString() } : {}),
      ...(avanza ? { estado: destino } : {}),
    })
  }
}

const fechaLarga = (f: string) => format(new Date(`${f}T12:00:00`), "EEEE d 'de' LLLL", { locale: es })

// =====================================================================
// Llamar
// =====================================================================

const DETALLE_NO_CONTESTO: { d: DetalleContacto; l: string }[] = [
  { d: 'no_contesto', l: 'No contestó' },
  { d: 'buzon', l: 'Buzón de voz' },
  { d: 'ocupado', l: 'Ocupado / colgó' },
  { d: 'numero_equivocado', l: 'Número equivocado' },
]

const COMO_FUE: { d: DetalleContacto; l: string; r: FollowUpResultado; tono: 'ok' | 'primary' | 'danger' }[] = [
  { d: 'interesado', l: 'Interesado', r: 'positivo', tono: 'ok' },
  { d: 'pidio_info', l: 'Pidió información', r: 'positivo', tono: 'ok' },
  { d: 'llamar_luego', l: 'Llamar más tarde', r: 'negativo', tono: 'primary' },
  { d: 'no_interesa', l: 'No le interesa', r: 'negativo', tono: 'danger' },
]

function telefonosDelLead(lead: Lead): string[] {
  const todos = [lead.telefono, ...(lead.telefonos ?? []), lead.whatsapp].filter(Boolean) as string[]
  const vistos = new Set<string>()
  return todos.filter((t) => { const d = digitos(t); if (!d || vistos.has(d)) return false; vistos.add(d); return true })
}

function FlujoLlamada({ lead, onClose, onSiguiente }: { lead: Lead; onClose: () => void; onSiguiente: (p: Paso) => void }) {
  const perfil = usePerfilTrabajo()
  const registrar = useRegistrarContacto()
  const guardarEncuesta = useGuardarEncuesta()
  const siguiente = useProgramarSiguiente(lead.id)
  const reflejar = useReflejarContacto(lead)

  const telefonos = useMemo(() => telefonosDelLead(lead), [lead])
  const [etapa, setEtapa] = useState<'preparar' | 'en_curso' | 'resultado'>('preparar')
  const [via, setVia] = useState<'normal' | 'whatsapp'>(lead.whatsapp ? 'whatsapp' : 'normal')
  const [aQuien, setAQuien] = useState(via === 'whatsapp' && lead.whatsapp ? lead.whatsapp : telefonos[0] ?? '')
  const [desde, setDesde] = useState<MiNumero | null>(null)
  const [inicio, setInicio] = useState<number | null>(null)
  const [seg, setSeg] = useState(0)
  const [contesto, setContesto] = useState<boolean | null>(null)
  const [detalle, setDetalle] = useState<DetalleContacto | null>(null)
  const [minutos, setMinutos] = useState('')
  const [nota, setNota] = useState('')
  const [fechaVuelta, setFechaVuelta] = useState(addDiasLaborales(1, today()))
  const [encuesta, setEncuesta] = useState<EncuestaLlamada>({})

  const misNumeros = perfil.numeros.filter((n) => via === 'normal' || n.whatsapp)
  useEffect(() => { if (!desde && misNumeros.length) setDesde(misNumeros[0]) }, [misNumeros, desde])
  useEffect(() => {
    if (etapa !== 'en_curso' || !inicio) return
    const t = setInterval(() => setSeg(Math.round((Date.now() - inicio) / 1000)), 500)
    return () => clearInterval(t)
  }, [etapa, inicio])

  const tipo: FollowUpTipo = via === 'whatsapp' ? 'llamada_whatsapp' : 'llamada'

  /**
   * Juan llama SIEMPRE desde su teléfono: «Iniciar llamada» solo arranca el
   * contador. Abrir el marcador o WhatsApp en la computadora es la opción
   * secundaria, por si algún día llama desde aquí.
   */
  const llamar = (desdeComputadora = false) => {
    const d = digitos(aQuien)
    if (desdeComputadora) {
      if (!d) { toast.error('Este lead no tiene número de teléfono'); return }
      window.open(via === 'whatsapp' ? `https://wa.me/${d}` : `tel:+${d}`, '_blank')
    }
    setInicio(Date.now())
    setSeg(0)
    setEtapa('en_curso')
  }

  const colgar = () => {
    setMinutos(String(Math.max(0, Math.round(seg / 60))))
    setEtapa('resultado')
  }

  async function guardar() {
    if (contesto === null || !detalle) { toast.error('Elige qué pasó en la llamada'); return }
    const como = COMO_FUE.find((c) => c.d === detalle)
    const resultado: FollowUpResultado = contesto ? (como?.r ?? 'negativo') : 'sin_respuesta'
    const duracionSeg = contesto ? (minutos.trim() ? Math.round(Number(minutos) * 60) : seg) : seg
    try {
      const id = await registrar.mutateAsync({
        leadId: lead.id, tipo, resultado, detalle, nota: nota.trim() || undefined,
        duracionSeg: Number.isFinite(duracionSeg) ? duracionSeg : undefined,
        numero: desde ? textoNumero(desde) : undefined,
      })
      reflejar(tipo, resultado)
      // La llamada ya está guardada: si la encuesta falla no se pierde nada
      // más que la encuesta, y se avisa en vez de bloquear el flujo.
      if (contesto && Object.values(encuesta).some((v) => v !== undefined && v !== '')) {
        try {
          await guardarEncuesta.mutateAsync({ id, encuesta })
        } catch {
          toast.error('La llamada se guardó, pero la encuesta no. Puedes repetirla más tarde.')
        }
      }
      // Sin respuesta (o «llámame luego»): se agenda el próximo intento aquí mismo.
      if ((!contesto && detalle !== 'numero_equivocado') || detalle === 'llamar_luego') {
        await siguiente.hacer(fechaVuelta, tipo, detalle === 'llamar_luego' ? 'Pidió que le llamemos' : undefined)
        toast.success(`Llamada registrada · volvemos a llamar el ${fechaLarga(fechaVuelta)}`)
        onClose()
        return
      }
      if (detalle === 'interesado' || detalle === 'pidio_info') {
        toast.success('Llamada registrada · pasa a «Respondió»')
        onSiguiente({ k: 'que_sigue', sugerir: 'reunion', tipo })
        return
      }
      toast.success('Llamada registrada')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar la llamada')
    }
  }

  const mmss = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
  const guardando = registrar.isPending || guardarEncuesta.isPending || siguiente.pendiente

  return (
    <Modal
      open
      onClose={() => { if (etapa !== 'en_curso' && !guardando) onClose() }}
      title={etapa === 'preparar' ? `Llamar a ${lead.empresa}` : etapa === 'en_curso' ? 'Llamada en curso' : '¿Cómo fue la llamada?'}
      footer={
        etapa === 'preparar' ? <>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button variant="outline" size="sm" onClick={() => llamar(true)} disabled={!aQuien} title="Abre el marcador o WhatsApp de esta computadora">Llamar desde la computadora</Button>
          <Button size="sm" onClick={() => llamar()}><Timer className="h-4 w-4" />Iniciar llamada</Button>
        </> : etapa === 'en_curso' ? <>
          <Button variant="ghost" size="sm" onClick={onClose}>No pude llamar</Button>
          <Button size="sm" variant="danger" onClick={colgar}><PhoneOff className="h-4 w-4" />Finalizar llamada</Button>
        </> : <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={guardando}>Cancelar</Button>
          <Button size="sm" onClick={guardar} disabled={guardando || !detalle}>{guardando ? 'Guardando…' : 'Guardar llamada'}</Button>
        </>
      }
    >
      {etapa === 'preparar' && (
        <div className="space-y-4">
          <div>
            <Etiqueta>¿Por dónde?</Etiqueta>
            <div className="flex flex-wrap gap-2">
              <Opcion icon={Phone} activo={via === 'normal'} onClick={() => { setVia('normal'); setDesde(null) }}>Llamada normal</Opcion>
              <Opcion icon={PhoneCall} activo={via === 'whatsapp'} onClick={() => { setVia('whatsapp'); setDesde(null); if (lead.whatsapp) setAQuien(lead.whatsapp) }}>Por WhatsApp</Opcion>
            </div>
          </div>
          <div>
            <Etiqueta>¿A qué número?</Etiqueta>
            {telefonos.length ? (
              <Select value={aQuien} onChange={(e) => setAQuien(e.target.value)}>
                {telefonos.map((t) => <option key={t} value={t}>{t}{digitos(t) === digitos(lead.whatsapp) ? ' · WhatsApp' : ''}</option>)}
              </Select>
            ) : (
              <Input value={aQuien} onChange={(e) => setAQuien(e.target.value)} placeholder="Este lead no tiene teléfono: escríbelo" inputMode="tel" />
            )}
          </div>
          <div>
            <Etiqueta>¿Desde cuál de tus números?</Etiqueta>
            {misNumeros.length ? (
              <div className="flex flex-wrap gap-2">
                {misNumeros.map((n) => <Opcion key={n.id} activo={desde?.id === n.id} onClick={() => setDesde(n)}>{n.etiqueta} <span className="text-xs opacity-70">{n.numero}</span></Opcion>)}
              </div>
            ) : (
              <p className="text-xs text-muted">
                Aún no has guardado tus números{via === 'whatsapp' ? ' con WhatsApp' : ''}.{' '}
                <Link to="/settings#perfil" className="font-medium text-primary-600 hover:underline" onClick={onClose}>Añádelos en Ajustes → Mi perfil</Link>.
              </p>
            )}
          </div>
          {aQuien && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3">
              <div>
                <p className="text-[11px] text-muted">Márcalo en tu teléfono{via === 'whatsapp' ? ' (WhatsApp)' : ''}</p>
                <p className="t-num text-xl tabular-nums">{aQuien}</p>
              </div>
              <button type="button" onClick={() => { navigator.clipboard?.writeText(aQuien).then(() => toast.success('Número copiado')).catch(() => {}) }}
                className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface">Copiar</button>
            </div>
          )}
          <p className="text-xs text-muted">
            Llama desde tu teléfono y pulsa <b>«Iniciar llamada»</b>: aquí empieza el contador. Al colgar pulsas «Finalizar llamada» y apuntas cómo fue.
          </p>
        </div>
      )}

      {etapa === 'en_curso' && (
        <div className="py-6 text-center">
          <Timer className="mx-auto h-6 w-6 text-primary-500" />
          <p className="t-num mt-2 text-5xl tabular-nums">{mmss}</p>
          <p className="mt-3 text-sm font-medium text-fg">{lead.empresa}</p>
          <p className="t-num text-lg tabular-nums text-fg">{aQuien}</p>
          <p className="mt-1 text-xs text-muted">{via === 'whatsapp' ? 'Por WhatsApp' : 'Llamada normal'}{desde ? ` · desde ${desde.etiqueta}` : ''}</p>
          <p className="mt-4 text-xs text-muted">Cuando termines, pulsa «Finalizar llamada». Si no contestan, también.</p>
        </div>
      )}

      {etapa === 'resultado' && (
        <div className="space-y-4">
          <div>
            <Etiqueta>¿Contestó?</Etiqueta>
            <div className="flex flex-wrap gap-2">
              <Opcion tono="ok" activo={contesto === true} onClick={() => { setContesto(true); setDetalle(null) }} icon={Check}>Sí, contestó</Opcion>
              {DETALLE_NO_CONTESTO.map((o) => (
                <Opcion key={o.d} tono="danger" activo={contesto === false && detalle === o.d} onClick={() => { setContesto(false); setDetalle(o.d) }}>{o.l}</Opcion>
              ))}
            </div>
          </div>

          {contesto === true && (
            <>
              <div>
                <Etiqueta>¿Cómo fue?</Etiqueta>
                <div className="flex flex-wrap gap-2">
                  {COMO_FUE.map((o) => <Opcion key={o.d} tono={o.tono} activo={detalle === o.d} onClick={() => setDetalle(o.d)}>{o.l}</Opcion>)}
                </div>
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <Etiqueta>Duración</Etiqueta>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={0} value={minutos} onChange={(e) => setMinutos(e.target.value)} className="w-24" inputMode="numeric" />
                    <span className="text-sm text-muted">minutos</span>
                  </div>
                </div>
                <p className="pb-2 text-xs text-muted">El cronómetro marcó {mmss}.</p>
              </div>
              <EncuestaCampos valor={encuesta} onChange={setEncuesta} />
            </>
          )}

          {((contesto === false && detalle && detalle !== 'numero_equivocado') || detalle === 'llamar_luego') && (
            <div>
              <Etiqueta>¿Cuándo volvemos a llamar?</Etiqueta>
              <CuandoVolvemos fecha={fechaVuelta} setFecha={setFechaVuelta} />
            </div>
          )}

          {detalle === 'numero_equivocado' && (
            <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
              Corrige el teléfono en la pestaña «Datos» → Editar, o prueba por otro canal.
            </p>
          )}

          {contesto !== null && (
            <div>
              <Etiqueta>Notas de la llamada</Etiqueta>
              <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3}
                placeholder={contesto ? '¿Qué te dijo? ¿Qué necesita? ¿Quién decide?' : 'Opcional'} />
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

/**
 * La encuesta al colgar (0074). Un toque por respuesta y todo opcional: si
 * hay prisa se guarda solo lo de arriba. Tocar la opción ya elegida la quita.
 */
function EncuestaCampos({ valor, onChange }: { valor: EncuestaLlamada; onChange: (e: EncuestaLlamada) => void }) {
  const poner = <K extends keyof EncuestaLlamada>(k: K, v: EncuestaLlamada[K]) =>
    onChange({ ...valor, [k]: valor[k] === v ? undefined : v })
  const grupo = (titulo: string, k: 'tipoProyecto' | 'estrategia' | 'atendio' | 'objecion', lista: OpcionEncuesta[]) => (
    <div>
      <Etiqueta>{titulo}</Etiqueta>
      <div className="flex flex-wrap gap-1.5">
        {lista.map((o) => <Opcion key={o.v} activo={valor[k] === o.v} onClick={() => poner(k, o.v)}>{o.l}</Opcion>)}
      </div>
    </div>
  )
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-2/50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Encuesta rápida · opcional</p>
      <div>
        <Etiqueta>¿Cómo te sentiste en la llamada?</Etiqueta>
        <div className="flex gap-1.5">
          {ANIMO.map((a) => (
            <button key={a.v} type="button" title={a.l} onClick={() => poner('animo', a.v)}
              className={cn('flex h-11 w-11 items-center justify-center rounded-xl border text-xl transition-colors',
                valor.animo === a.v ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/15' : 'border-border hover:bg-surface-2')}>
              {a.emoji}
            </button>
          ))}
        </div>
      </div>
      <div>
        <Etiqueta>¿Qué tan interesado está el cliente?</Etiqueta>
        <div className="flex flex-wrap gap-1.5">
          {INTERES.map((o) => <Opcion key={o.v} tono={o.tono} activo={valor.interes === o.v} onClick={() => poner('interes', o.v)}>{o.l}</Opcion>)}
        </div>
      </div>
      {grupo('Tipo de proyecto', 'tipoProyecto', TIPO_PROYECTO)}
      {grupo('¿Qué estrategia usaste?', 'estrategia', ESTRATEGIA)}
      {grupo('¿Quién atendió?', 'atendio', ATENDIO)}
      {grupo('Objeción principal', 'objecion', OBJECION)}
      <div>
        <Etiqueta>¿Qué funcionó y qué no?</Etiqueta>
        <Input value={valor.aprendizaje ?? ''} onChange={(e) => onChange({ ...valor, aprendizaje: e.target.value })}
          placeholder="Ej.: mencionar su competencia le hizo escuchar" maxLength={300} />
      </div>
    </div>
  )
}

// =====================================================================
// Mensaje
// =====================================================================

type CanalMsg = 'whatsapp' | 'email' | 'instagram' | 'linkedin' | 'sms'

function FlujoMensaje({ lead, onClose, onSiguiente }: { lead: Lead; onClose: () => void; onSiguiente: (p: Paso) => void }) {
  const perfil = usePerfilTrabajo()
  const registrar = useRegistrarContacto()
  const reflejar = useReflejarContacto(lead)
  const canales: { c: CanalMsg; l: string; icon: typeof Phone; ok: boolean }[] = [
    { c: 'whatsapp', l: 'WhatsApp', icon: MessageCircle, ok: !!(lead.whatsapp || lead.telefono) },
    { c: 'email', l: 'Correo', icon: Mail, ok: !!lead.email },
    { c: 'instagram', l: 'Instagram', icon: Camera, ok: !!lead.instagram },
    { c: 'linkedin', l: 'LinkedIn', icon: Linkedin, ok: !!lead.linkedin },
    { c: 'sms', l: 'SMS', icon: MessageSquare, ok: !!lead.telefono },
  ]
  const [canal, setCanal] = useState<CanalMsg>(canales.find((c) => c.ok)?.c ?? 'whatsapp')
  const [texto, setTexto] = useState('')
  const [desde, setDesde] = useState<MiNumero | null>(null)
  const [abierto, setAbierto] = useState(false)
  const misNumeros = perfil.numeros.filter((n) => canal !== 'whatsapp' || n.whatsapp)
  useEffect(() => { setDesde(misNumeros[0] ?? null) }, [canal]) // eslint-disable-line react-hooks/exhaustive-deps

  if (canal === 'email' && abierto) {
    return (
      <NewMessageModal
        open
        onClose={onClose}
        onSent={() => onSiguiente({ k: 'que_sigue', sugerir: 'contacto', tipo: 'email' })}
        initialTo={lead.email}
        toOptions={lead.emails}
        leadId={lead.id}
        lockTo
      />
    )
  }

  const abrir = () => {
    const d = digitos(lead.whatsapp || lead.telefono)
    const t = encodeURIComponent(texto)
    const url = canal === 'whatsapp' ? `https://wa.me/${d}${texto ? `?text=${t}` : ''}`
      : canal === 'sms' ? `sms:+${d}${texto ? `?body=${t}` : ''}`
        : canal === 'instagram' ? lead.instagram
          : canal === 'linkedin' ? lead.linkedin : undefined
    if (canal !== 'email') {
      if (!url) { toast.error('Falta el dato de contacto para este canal'); return }
      if (texto) navigator.clipboard?.writeText(texto).catch(() => {})
      window.open(url, '_blank')
    }
    setAbierto(true)
  }

  async function enviado() {
    try {
      await registrar.mutateAsync({
        leadId: lead.id, tipo: canal as FollowUpTipo, resultado: 'sin_respuesta', detalle: 'enviado',
        nota: texto.trim() || undefined,
        numero: (canal === 'whatsapp' || canal === 'sms') && desde ? textoNumero(desde) : undefined,
      })
      reflejar(canal as FollowUpTipo, 'sin_respuesta')
      toast.success('Mensaje registrado')
      onSiguiente({ k: 'que_sigue', sugerir: 'contacto', tipo: canal as FollowUpTipo })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo registrar')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={abierto ? '¿Lo enviaste?' : `Escribir a ${lead.empresa}`}
      footer={!abierto ? <>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={abrir}>{canal === 'email' ? 'Redactar correo' : `Abrir ${canales.find((c) => c.c === canal)?.l}`}</Button>
      </> : <>
        <Button variant="ghost" size="sm" onClick={onClose}>No lo envié</Button>
        <Button size="sm" onClick={enviado} disabled={registrar.isPending}><Check className="h-4 w-4" />Sí, enviado</Button>
      </>}
    >
      {!abierto ? (
        <div className="space-y-4">
          <div>
            <Etiqueta>¿Por dónde?</Etiqueta>
            <div className="flex flex-wrap gap-2">
              {canales.map((c) => (
                <Opcion key={c.c} icon={c.icon} activo={canal === c.c} onClick={() => setCanal(c.c)}>
                  {c.l}{!c.ok && <span className="text-[10px] opacity-60"> (sin dato)</span>}
                </Opcion>
              ))}
            </div>
          </div>
          {(canal === 'whatsapp' || canal === 'sms') && misNumeros.length > 0 && (
            <div>
              <Etiqueta>¿Desde cuál de tus números?</Etiqueta>
              <div className="flex flex-wrap gap-2">
                {misNumeros.map((n) => <Opcion key={n.id} activo={desde?.id === n.id} onClick={() => setDesde(n)}>{n.etiqueta}</Opcion>)}
              </div>
            </div>
          )}
          {canal !== 'email' && (
            <div>
              <Etiqueta>Mensaje (opcional)</Etiqueta>
              <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4}
                placeholder={canal === 'whatsapp' || canal === 'sms' ? 'Se abre ya escrito' : 'Se copia al portapapeles para que lo pegues'} />
            </div>
          )}
        </div>
      ) : (
        <p className="py-4 text-sm text-fg">
          Si lo enviaste, queda apuntado en su historial y te pregunto cuándo volver a escribirle.
          Cuando conteste, pulsa <b>«Me respondió»</b> en su ficha.
        </p>
      )}
    </Modal>
  )
}

// =====================================================================
// Me respondió
// =====================================================================

function RespondioModal({ lead, onClose, onSiguiente }: { lead: Lead; onClose: () => void; onSiguiente: (p: Paso) => void }) {
  const responder = useRegistrarRespuesta()
  const siguiente = useProgramarSiguiente(lead.id)
  const reflejar = useReflejarContacto(lead)
  const [detalle, setDetalle] = useState<DetalleContacto | null>(null)
  const [nota, setNota] = useState('')
  const [fecha, setFecha] = useState(addDiasLaborales(2, today()))
  const tipo = lead.ultimoContactoTipo ?? 'whatsapp'

  async function guardar() {
    const como = COMO_FUE.find((c) => c.d === detalle)
    if (!como) return
    try {
      await responder.mutateAsync({ leadId: lead.id, resultado: como.r as 'positivo' | 'negativo', detalle: como.d, nota: nota.trim() || undefined, tipo })
      reflejar(tipo, como.r, true)
      if (como.d === 'llamar_luego') {
        await siguiente.hacer(fecha, tipo, 'Pidió que le contactemos más tarde')
        toast.success(`Apuntado · volvemos a contactar el ${fechaLarga(fecha)}`)
        onClose()
      } else if (como.r === 'positivo') {
        toast.success('¡Respondió! Pasa a «Respondió»')
        onSiguiente({ k: 'que_sigue', sugerir: 'reunion', tipo })
      } else {
        toast.success('Respuesta apuntada')
        onClose()
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  return (
    <Modal open onClose={onClose} title={`¿Qué dijo ${lead.empresa}?`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={!detalle || responder.isPending || siguiente.pendiente}>Guardar</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {COMO_FUE.map((o) => <Opcion key={o.d} tono={o.tono} activo={detalle === o.d} onClick={() => setDetalle(o.d)}>{o.l}</Opcion>)}
        </div>
        {detalle === 'llamar_luego' && (
          <div><Etiqueta>¿Cuándo le contactamos?</Etiqueta><CuandoVolvemos fecha={fecha} setFecha={setFecha} /></div>
        )}
        <div>
          <Etiqueta>¿Qué te dijo?</Etiqueta>
          <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="Opcional" />
        </div>
      </div>
    </Modal>
  )
}

// =====================================================================
// ¿Qué sigue?
// =====================================================================

function QueSigue({ lead, sugerir, tipo, onClose, onSiguiente }: {
  lead: Lead; sugerir?: 'reunion' | 'contacto'; tipo?: FollowUpTipo; onClose: () => void; onSiguiente: (p: Paso) => void
}) {
  return (
    <Modal open onClose={onClose} title={`¿Qué sigue con ${lead.empresa}?`}>
      <div className="grid gap-2.5">
        <GranOpcion icon={CalendarCheck} destacado={sugerir === 'reunion'} titulo="Agendar una reunión"
          texto="Te enseño tus huecos libres de esta semana y la próxima. Con Meet e invitación." onClick={() => onSiguiente({ k: 'reunion' })} />
        <GranOpcion icon={BellRing} destacado={sugerir === 'contacto'} titulo="Programar el próximo contacto"
          texto="Elige el día y por dónde. Te saldrá en Mi día y en Seguimientos." onClick={() => onSiguiente({ k: 'recordar', tipo })} />
        <button type="button" onClick={onClose} className="py-2 text-sm text-muted hover:text-fg">Nada por ahora</button>
      </div>
    </Modal>
  )
}

function GranOpcion({ icon: Icon, titulo, texto, onClick, destacado }: { icon: typeof Phone; titulo: string; texto: string; onClick: () => void; destacado?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex items-start gap-3 rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-card-hover',
        destacado ? 'border-primary-400 bg-primary-50 dark:bg-primary-500/10' : 'border-border')}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white"><Icon className="h-4 w-4" /></span>
      <span>
        <span className="block font-semibold text-fg">{titulo}{destacado && <span className="ml-2 text-[10px] font-semibold uppercase text-primary-600">recomendado</span>}</span>
        <span className="mt-0.5 block text-xs text-muted">{texto}</span>
      </span>
    </button>
  )
}

// =====================================================================
// Reunión: elegir hueco y crearla
// =====================================================================

/**
 * Elegir cuándo es la reunión. Se puede ir a cualquier mes (el cliente puede
 * pedir una fecha dentro de tres meses): a la izquierda el mes, con los días
 * que tienen huecos libres marcados; a la derecha, las horas libres del día
 * elegido y la opción de poner cualquier otra hora.
 */
function ElegirHueco({ lead, onClose, onElegir }: {
  lead: Lead; onClose: () => void; onElegir: (fecha: string, hora: string | undefined, modo: { virtual: boolean; ubicacion?: string }) => void
}) {
  const { horario } = usePerfilTrabajo()
  const [virtual, setVirtual] = useState(true)
  const [ubicacion, setUbicacion] = useState([lead.direccion, lead.ciudad].filter(Boolean).join(', '))
  const modo = { virtual, ubicacion: virtual ? undefined : ubicacion.trim() || undefined }

  const ahora = useMemo(() => new Date(), [])
  const hoyIso = today()
  const [mes, setMes] = useState(() => startOfMonth(ahora))
  const [dia, setDia] = useState<string | null>(null)
  const [otraHora, setOtraHora] = useState('10:00')

  const ini = useMemo(() => startOfWeek(mes, { weekStartsOn: 1 }), [mes])
  const fin = useMemo(() => endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }), [mes])
  const eventos = useEventos(ini.toISOString(), addDays(fin, 1).toISOString())
  const celdas = useMemo(() => eachDayOfInterval({ start: ini, end: fin }), [ini, fin])
  const huecos = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const d of calcularHuecos(eventos.data ?? [], horario, celdas.length, ahora, ini)) m.set(d.fecha, d.horas)
    return m
  }, [eventos.data, horario, celdas.length, ahora, ini])

  // Al cambiar de mes, se elige solo el primer día con huecos.
  useEffect(() => {
    if (eventos.isLoading) return
    if (dia && isSameMonth(new Date(`${dia}T12:00:00`), mes)) return
    const primero = celdas.find((d) => isSameMonth(d, mes) && (huecos.get(isoDia(d))?.length ?? 0) > 0)
    setDia(primero ? isoDia(primero) : null)
  }, [huecos, mes, celdas, eventos.isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Los atajos caen en el siguiente día de trabajo: «en 3 meses» un sábado no sirve.
  const saltar = (d0: Date) => {
    let d = d0
    for (let i = 0; i < 7 && !horario.dias.includes(d.getDay() || 7); i++) d = addDays(d, 1)
    setMes(startOfMonth(d))
    setDia(isoDia(d))
  }
  const atajos: [string, Date][] = [
    ['Hoy', ahora],
    ['Semana que viene', addDays(ahora, 7)],
    ['En 1 mes', addMonths(ahora, 1)],
    ['En 3 meses', addMonths(ahora, 3)],
  ]
  const horasDia = dia ? huecos.get(dia) ?? [] : []
  const esPasado = (f: string) => f < hoyIso

  return (
    <Modal open size="xl" onClose={onClose} title={`Reunión con ${lead.empresa}`}
      footer={<Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Opcion icon={Video} activo={virtual} onClick={() => setVirtual(true)}>Virtual (Google Meet)</Opcion>
        <Opcion icon={MapPin} activo={!virtual} onClick={() => setVirtual(false)}>Presencial</Opcion>
        {!virtual && <Input value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="¿Dónde? Dirección u oficina" className="min-w-[14rem] flex-1" />}
      </div>

      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ---------- El mes ---------- */}
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {atajos.map(([l, d]) => (
              <button key={l} type="button" onClick={() => saltar(d)}
                className="rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted hover:bg-surface-2 hover:text-fg">{l}</button>
            ))}
          </div>
          <div className="rounded-2xl border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setMes((m) => addMonths(m, -1))} disabled={isSameMonth(mes, ahora)}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
              <p className="text-sm font-semibold text-fg">{mayus(format(mes, 'LLLL yyyy', { locale: es }))}</p>
              <button type="button" onClick={() => setMes((m) => addMonths(m, 1))}
                className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-muted">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="py-1">{d}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d) => {
                const f = isoDia(d)
                const delMes = isSameMonth(d, mes)
                const pasado = esPasado(f)
                const libres = huecos.get(f)?.length ?? 0
                const sel = f === dia
                return (
                  <button key={f} type="button" disabled={pasado || !delMes} onClick={() => setDia(f)}
                    title={pasado ? undefined : libres ? `${libres} huecos libres` : 'Sin huecos en tu horario'}
                    className={cn(
                      'relative flex h-10 flex-col items-center justify-center rounded-lg text-sm tabular-nums transition-colors',
                      !delMes ? 'invisible' : pasado ? 'text-muted/30' :
                        sel ? 'bg-primary-500 font-semibold text-white shadow-sm' :
                          libres ? 'font-semibold text-fg hover:bg-primary-50 dark:hover:bg-primary-500/10' : 'text-muted hover:bg-surface-2',
                      isToday(d) && !sel && 'ring-1 ring-primary-400',
                    )}>
                    {format(d, 'd')}
                    {libres > 0 && !pasado && <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', sel ? 'bg-white' : 'bg-primary-500')} />}
                  </button>
                )
              })}
            </div>
            <p className="mt-2 text-[11px] text-muted">
              Punto naranja = tienes huecos libres ({horario.desde}–{horario.hasta}, {horario.duracionReunion} min).{' '}
              <Link to="/settings#perfil" className="text-primary-600 hover:underline" onClick={onClose}>Cambiar horario</Link>
            </p>
          </div>
        </div>

        {/* ---------- Las horas del día ---------- */}
        <div>
          {!dia ? (
            <p className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted">
              {eventos.isLoading ? 'Mirando tu calendario…' : 'Elige un día en el calendario.'}
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-base font-semibold text-fg">{mayus(fechaLarga(dia))}</p>
              <div>
                <Etiqueta>Horas libres</Etiqueta>
                {horasDia.length ? (
                  <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto pr-1">
                    {horasDia.map((h) => (
                      <button key={h} type="button" onClick={() => onElegir(dia, h, modo)}
                        className="rounded-lg border border-border py-2 text-sm font-medium tabular-nums text-fg transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-500/15">
                        {h}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Este día no tienes huecos dentro de tu horario. Pon la hora que quieras aquí abajo.</p>
                )}
              </div>
              <div className="rounded-xl bg-surface-2 p-3">
                <Etiqueta>¿Otra hora? (la que diga el cliente)</Etiqueta>
                <div className="flex items-center gap-2">
                  <Input type="time" value={otraHora} onChange={(e) => setOtraHora(e.target.value)} className="w-36" />
                  <Button size="sm" onClick={() => onElegir(dia, otraHora, modo)}>Usar esta hora</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

/** El formulario del calendario, ya rellenado con el lead: Meet, invitación y etapa. */
function CitaConLead({ lead, fecha, hora, virtual, ubicacion, onClose }: { lead: Lead; fecha: string; hora?: string; virtual: boolean; ubicacion?: string; onClose: () => void }) {
  const { horario } = usePerfilTrabajo()
  const prefill = useMemo(() => ({
    tipo: 'reunion' as const,
    titulo: `Reunión con ${lead.empresa}`,
    leadId: lead.id,
    invitados: lead.email ? [lead.email] : [],
    duracionMin: horario.duracionReunion,
    virtual,
    ubicacion,
  }), [lead.empresa, lead.id, lead.email, horario.duracionReunion, virtual, ubicacion])
  return <ItemModal open onClose={onClose} fecha={fecha} hora={hora} prefill={prefill} />
}

// =====================================================================
// Recordarme y nota
// =====================================================================

const CANALES_RECORDAR: FollowUpTipo[] = ['llamada', 'whatsapp', 'email', 'llamada_whatsapp', 'reunion', 'instagram', 'linkedin', 'otro']

function Recordatorio({ lead, tipoInicial, titulo, onClose }: { lead: Lead; tipoInicial?: FollowUpTipo; titulo?: string; onClose: () => void }) {
  const siguiente = useProgramarSiguiente(lead.id)
  const [fecha, setFecha] = useState(addDiasLaborales(2, today()))
  const [tipo, setTipo] = useState<FollowUpTipo>(tipoInicial ?? lead.ultimoContactoTipo ?? 'llamada')
  const [nota, setNota] = useState('')

  async function guardar() {
    try {
      await siguiente.hacer(fecha, tipo, nota.trim() || undefined)
      toast.success(`Te lo recuerdo el ${fechaLarga(fecha)}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo programar')
    }
  }

  return (
    <Modal open onClose={onClose} title={titulo ?? `¿Cuándo contactamos a ${lead.empresa}?`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={siguiente.pendiente}>Programar</Button>
      </>}>
      <div className="space-y-4">
        <div><Etiqueta>¿Qué día?</Etiqueta><CuandoVolvemos fecha={fecha} setFecha={setFecha} /></div>
        <div>
          <Etiqueta>¿Por dónde?</Etiqueta>
          <div className="flex flex-wrap gap-1.5">
            {CANALES_RECORDAR.map((t) => <Opcion key={t} activo={tipo === t} onClick={() => setTipo(t)}>{TIPO_META[t]?.label ?? t}</Opcion>)}
          </div>
        </div>
        <div><Etiqueta>¿Para qué? (opcional)</Etiqueta><Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ej. enviarle la propuesta, preguntar si la vio" /></div>
        <p className="text-xs text-muted"><AtSign className="mr-1 inline h-3 w-3" />Saldrá en Mi día, en Seguimientos y en el Resumen ese día.</p>
      </div>
    </Modal>
  )
}

function NotaRapida({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const crear = useCreateNote()
  const [texto, setTexto] = useState('')
  async function guardar() {
    if (!texto.trim()) return
    try {
      await crear.mutateAsync({ leadId: lead.id, texto: texto.trim() })
      toast.success('Nota guardada')
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la nota')
    }
  }
  return (
    <Modal open onClose={onClose} title={`Nota sobre ${lead.empresa}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" onClick={guardar} disabled={!texto.trim() || crear.isPending}>Guardar nota</Button>
      </>}>
      <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} placeholder="Lo que quieras recordar de este lead" autoFocus />
    </Modal>
  )
}
