import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { BellRing, Copy, Mail, MessageCircle, Phone } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useActualizarEvento, useEventos, useMoverEvento, useRegistrarContacto } from '@/hooks/useData'
import { leadsService } from '@/services/leadsService'
import { numeroWhatsApp, urlWhatsApp } from '@/lib/agenda'
import { copiarAlPortapapeles } from '@/lib/utils'
import type { Evento, EventoAccion } from '@/types'

/**
 * El aviso «es la hora» (0076). Mira cada 20 s los eventos con hora de las
 * próximas horas y, cuando uno empieza, abre un aviso con el botón para
 * hacerlo: abrir WhatsApp con el mensaje escrito, ir a la ficha a llamar…
 *
 * Telegram avisa unos minutos antes aunque el CRM esté cerrado; esto es el
 * aviso de pantalla para cuando lo tienes abierto. Lo ya visto se guarda en
 * el navegador para que no vuelva a salir al recargar.
 */

const CLAVE_VISTOS = 'avisos-agenda-vistos'
/** Un evento que empezó hace más de esto ya no se avisa: se te pasó, está en Mi día. */
const VENTANA_MS = 30 * 60_000

function leerVistos(): string[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_VISTOS) ?? '[]') as string[] } catch { return [] }
}

/** La clave lleva la hora: si lo pospones, el aviso vuelve a salir a la hora nueva. */
const claveDe = (e: Evento) => `${e.id}@${e.inicio}`

const ICONO: Record<EventoAccion, typeof Phone> = { llamada: Phone, whatsapp: MessageCircle, correo: Mail, otro: BellRing }

export function AvisosAgenda() {
  const [ahora, setAhora] = useState(() => Date.now())
  const [vistos, setVistos] = useState<string[]>(leerVistos)

  useEffect(() => {
    const t = window.setInterval(() => setAhora(Date.now()), 20_000)
    return () => window.clearInterval(t)
  }, [])

  // El rango se redondea a la hora para que la caché no cambie cada 20 s.
  const hora = Math.floor(ahora / 3_600_000) * 3_600_000
  const eventos = useEventos(new Date(hora - 3_600_000).toISOString(), new Date(hora + 3 * 3_600_000).toISOString())

  const toca = useMemo(() => (eventos.data ?? []).find((e) => {
    const ini = new Date(e.inicio).getTime()
    return !e.todoElDia
      && (e.estado === 'pendiente' || e.estado === 'confirmado')
      && (e.accion || e.leadId || e.tipo === 'reunion' || e.tipo === 'recordatorio')
      && ini <= ahora && ahora - ini < VENTANA_MS
      && !vistos.includes(claveDe(e))
  }), [eventos.data, ahora, vistos])

  // Con la pestaña en segundo plano, además el aviso del sistema.
  useEffect(() => {
    if (!toca || document.visibilityState === 'visible') return
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification(`Es la hora · ${format(new Date(toca.inicio), 'HH:mm')}`, { body: toca.titulo, tag: claveDe(toca) }) } catch { /* algunos móviles no dejan crearla así */ }
    }
  }, [toca])

  const marcarVisto = (e: Evento) => {
    const nuevos = [...vistos.filter((k) => k !== claveDe(e)), claveDe(e)].slice(-200)
    localStorage.setItem(CLAVE_VISTOS, JSON.stringify(nuevos))
    setVistos(nuevos)
  }

  if (!toca) return null
  return <AvisoEvento key={claveDe(toca)} evento={toca} onCerrar={() => marcarVisto(toca)} />
}

function AvisoEvento({ evento, onCerrar }: { evento: Evento; onCerrar: () => void }) {
  const navigate = useNavigate()
  const actualizar = useActualizarEvento()
  const mover = useMoverEvento()
  const registrar = useRegistrarContacto()
  const [whatsAbierto, setWhatsAbierto] = useState(false)

  const lead = useQuery({
    queryKey: ['lead', evento.leadId],
    queryFn: () => leadsService.getLead(evento.leadId!),
    enabled: !!evento.leadId,
    staleTime: 60_000,
  }).data

  const accion: EventoAccion = evento.accion ?? 'otro'
  const Icono = ICONO[accion]
  const numero = lead ? numeroWhatsApp(lead) : ''

  const hecho = async () => {
    try { await actualizar.mutateAsync({ id: evento.id, estado: 'hecho' }) } catch { /* el aviso se cierra igual */ }
    onCerrar()
  }

  const posponer = async (min: number) => {
    try {
      await mover.mutateAsync({ id: evento.id, inicio: new Date(Date.now() + min * 60_000).toISOString() })
      toast.success(`Te lo vuelvo a recordar en ${min} min`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo posponer')
    }
    onCerrar()
  }

  const abrirFicha = async () => {
    if (evento.leadId) navigate(`/leads?lead=${evento.leadId}`)
    else navigate('/productividad/calendario')
    await hecho()
  }

  const abrirWhatsApp = () => {
    if (!numero) { toast.error('Este lead no tiene teléfono ni WhatsApp guardado'); return }
    if (evento.mensaje) copiarAlPortapapeles(evento.mensaje)
    window.open(urlWhatsApp(numero, evento.mensaje), '_blank')
    setWhatsAbierto(true)
  }

  // Lo enviado cuenta como contacto, igual que desde el botón «Mensaje» de la ficha.
  const whatsEnviado = async () => {
    if (evento.leadId) {
      try {
        await registrar.mutateAsync({
          leadId: evento.leadId, tipo: 'whatsapp', resultado: 'sin_respuesta', detalle: 'enviado',
          nota: evento.mensaje?.trim() || undefined,
        })
        toast.success('WhatsApp registrado en el historial')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'No se pudo registrar')
      }
    }
    await hecho()
  }

  return (
    <Modal open onClose={onCerrar} title={`Es la hora · ${format(new Date(evento.inicio), 'HH:mm')}`}
      footer={<>
        <Button variant="ghost" size="sm" onClick={() => posponer(10)} disabled={mover.isPending}>Posponer 10 min</Button>
        <Button variant="ghost" size="sm" onClick={hecho}>Ya está hecho</Button>
      </>}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white"><Icono className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-fg">{evento.titulo}</p>
            {lead?.codigo && <p className="font-mono text-xs font-semibold text-muted">{lead.codigo}</p>}
            {evento.descripcion && <p className="mt-0.5 text-sm text-muted">{evento.descripcion}</p>}
          </div>
        </div>

        {evento.mensaje && (
          <div className="rounded-xl bg-surface-2 p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold text-muted">Mensaje preparado</p>
              <button type="button" className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                onClick={() => copiarAlPortapapeles(evento.mensaje!).then((ok) => ok && toast.success('Mensaje copiado'))}>
                <Copy className="h-3 w-3" />Copiar
              </button>
            </div>
            <p className="whitespace-pre-wrap text-sm text-fg">{evento.mensaje}</p>
          </div>
        )}

        {accion === 'whatsapp' && !whatsAbierto && (
          <Button className="w-full" onClick={abrirWhatsApp}><MessageCircle className="h-4 w-4" />Abrir WhatsApp con el mensaje escrito</Button>
        )}
        {accion === 'whatsapp' && whatsAbierto && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={whatsEnviado} disabled={registrar.isPending}>Sí, lo envié</Button>
            <Button variant="outline" onClick={abrirWhatsApp}>Abrir WhatsApp otra vez</Button>
          </div>
        )}
        {accion !== 'whatsapp' && (
          <Button className="w-full" onClick={abrirFicha}>
            <Icono className="h-4 w-4" />
            {accion === 'llamada' ? 'Ir a la ficha para llamar' : accion === 'correo' ? 'Ir a la ficha para escribir' : evento.leadId ? 'Abrir la ficha' : 'Abrir el calendario'}
          </Button>
        )}
      </div>
    </Modal>
  )
}
