import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, X, Pencil, Mail, AlertTriangle, MessageCircle, Power } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Badge, Input, Textarea, Skeleton, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils'
import { fechaCorta } from '@/lib/fecha'
import {
  secuenciasService, type LeadSecuencia, type CorreoSecuencia, type ConfigEnvio, type ClaveEnvio,
} from '@/services/secuenciasService'

/**
 * Correos programados — el panel de autorización de las secuencias en frío.
 *
 * Nada sale sin pasar por aquí: ChatGPT deja los tres correos de cada lead en
 * «Por aprobar»; al aprobarlos pasan a «Programados» y el workflow de n8n los
 * manda con el ritmo de la caja de arriba. Detener una secuencia cancela lo
 * que no haya salido.
 */

type Pestana = 'por_aprobar' | 'programado' | 'enviado' | 'cancelado'

const PESTANAS: { id: Pestana; texto: string }[] = [
  { id: 'por_aprobar', texto: 'Por aprobar' },
  { id: 'programado', texto: 'Programados' },
  { id: 'enviado', texto: 'Enviados' },
  { id: 'cancelado', texto: 'Cancelados' },
]

const DIA_TOQUE: Record<number, string> = { 1: 'Día 0', 2: 'Día 4', 3: 'Día 9' }

/** En qué pestaña cae un lead: la de su correo más atrasado en el camino. */
function pestanaDe(l: LeadSecuencia): Pestana {
  const s = l.correos.map((c) => c.status)
  if (s.includes('por_aprobar')) return 'por_aprobar'
  if (s.some((x) => x === 'programado' || x === 'enviando' || x === 'error')) return 'programado'
  if (s.includes('enviado')) return 'enviado'
  return 'cancelado'
}

function AvisoWhatsapp({ estado, intentos, ultimoIntento }: { estado: string | null; intentos: number; ultimoIntento: string | null }) {
  if (estado === 'no_aparece') {
    return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Check size={12} />Sin WhatsApp</Badge>
  }
  if (estado === 'confirmado') {
    return <Badge className="bg-red-500/10 text-red-700 dark:text-red-300"><MessageCircle size={12} />Tiene WhatsApp, no se envía</Badge>
  }
  // Sin «confirmado» sale tras 5 h aprobado (0056): ya no se espera al verificador.
  const detalle = intentos > 0 && ultimoIntento
    ? `Sin WhatsApp confirmado · ${intentos} ${intentos === 1 ? 'intento' : 'intentos'} (último ${fechaCorta(ultimoIntento)})`
    : 'Sin WhatsApp confirmado'
  return <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"><Check size={12} />{detalle}</Badge>
}

function EstadoCorreo({ c }: { c: CorreoSecuencia }) {
  const t: Record<string, string> = {
    por_aprobar: 'Por aprobar', programado: 'Programado', enviando: 'Enviando…',
    enviado: c.sentAt ? `Enviado ${fechaCorta(c.sentAt)}` : 'Enviado',
    error: 'No salió', cancelado: c.motivoCancelacion ? `Cancelado: ${c.motivoCancelacion}` : 'Cancelado',
  }
  return <span className={cn('t-hint', c.status === 'error' && 'text-red-600')}>{t[c.status] ?? c.status}</span>
}

function Correo({ c, editable }: { c: CorreoSecuencia; editable: boolean }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [asunto, setAsunto] = useState(c.asunto)
  const [cuerpo, setCuerpo] = useState(c.cuerpo)
  const guardar = useMutation({
    mutationFn: () => secuenciasService.editar(c.id, { asunto, cuerpo }),
    onSuccess: () => { setEditando(false); qc.invalidateQueries({ queryKey: ['secuencias'] }); toast.success('Correo guardado') },
    onError: () => toast.error('No se pudo guardar el correo'),
  })

  return (
    <div className="rounded-xl border border-border p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="t-label">{DIA_TOQUE[c.toque] ?? `Toque ${c.toque}`}</span>
        <div className="flex items-center gap-2">
          <EstadoCorreo c={c} />
          {editable && !editando && (
            <Button variant="ghost" size="sm" onClick={() => setEditando(true)} aria-label="Editar correo"><Pencil size={14} /></Button>
          )}
        </div>
      </div>
      {editando ? (
        <div className="space-y-2">
          <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} aria-label="Asunto" />
          <Textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} className="min-h-[180px]" aria-label="Cuerpo" />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setEditando(false); setAsunto(c.asunto); setCuerpo(c.cuerpo) }}>Descartar</Button>
            <Button size="sm" onClick={() => guardar.mutate()} disabled={guardar.isPending}>Guardar</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium">{c.asunto}</p>
          <p className="mt-1 whitespace-pre-line text-sm text-muted">{c.cuerpo}</p>
        </>
      )}
      {c.error && <p className="mt-2 text-xs text-red-600">{c.error}</p>}
    </div>
  )
}

function TarjetaLead({ l, pestana }: { l: LeadSecuencia; pestana: Pestana }) {
  const qc = useQueryClient()
  const [abierta, setAbierta] = useState(pestana === 'por_aprobar')
  const refrescar = () => qc.invalidateQueries({ queryKey: ['secuencias'] })
  const aprobar = useMutation({
    mutationFn: () => secuenciasService.aprobar([l.leadId]),
    onSuccess: () => { refrescar(); toast.success(`${l.empresa}: secuencia aprobada`) },
    onError: () => toast.error('No se pudo aprobar'),
  })
  const cancelar = useMutation({
    mutationFn: () => secuenciasService.cancelar(l.leadId),
    onSuccess: () => { refrescar(); toast.success(`${l.empresa}: secuencia detenida`) },
    onError: () => toast.error('No se pudo detener'),
  })
  const revisar = l.correos.filter((c) => c.revisar)
  const destino = l.correos[0]?.destinatario

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button type="button" className="min-w-0 text-left" onClick={() => setAbierta((v) => !v)}>
          <p className="t-card truncate">{l.empresa}</p>
          <p className="t-hint truncate">{[l.ciudad, destino].filter(Boolean).join(' · ')}</p>
        </button>
        <AvisoWhatsapp estado={l.whatsappEstado} intentos={l.whatsappIntentos} ultimoIntento={l.whatsappUltimoIntento} />
      </div>

      {revisar.length > 0 && pestana === 'por_aprobar' && (
        <p className="flex items-start gap-1.5 rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Revisar antes de aprobar: {revisar.map((c) => c.notaRevision).filter(Boolean).join('; ') || 'el comprobador marcó dudas'}
        </p>
      )}

      {abierta && (
        <div className="space-y-2">
          {l.correos.map((c) => <Correo key={c.id} c={c} editable={c.status === 'por_aprobar' || c.status === 'programado'} />)}
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {!abierta && <Button variant="ghost" size="sm" onClick={() => setAbierta(true)}>Ver los {l.correos.length} correos</Button>}
        {(pestana === 'por_aprobar' || pestana === 'programado') && (
          <Button variant="outline" size="sm" onClick={() => cancelar.mutate()} disabled={cancelar.isPending}>
            <X size={14} />{pestana === 'por_aprobar' ? 'Rechazar' : 'Detener'}
          </Button>
        )}
        {pestana === 'por_aprobar' && (
          <Button size="sm" onClick={() => aprobar.mutate()} disabled={aprobar.isPending}><Check size={14} />Aprobar</Button>
        )}
      </div>
    </div>
  )
}

const CAMPOS: { key: ClaveEnvio; texto: string; tipo?: 'number' }[] = [
  { key: 'envio_max_hora', texto: 'Máximo por hora', tipo: 'number' },
  { key: 'envio_min_dia', texto: 'Mínimo por día', tipo: 'number' },
  { key: 'envio_max_dia', texto: 'Máximo por día', tipo: 'number' },
  { key: 'envio_hora_inicio', texto: 'Desde (hora)', tipo: 'number' },
  { key: 'envio_hora_fin', texto: 'Hasta (hora)', tipo: 'number' },
]

function CajaRitmo({ cfg }: { cfg: ConfigEnvio }) {
  const qc = useQueryClient()
  const activo = cfg.envio_auto_activo === 'true'
  const guardar = useMutation({
    mutationFn: ({ key, value }: { key: ClaveEnvio; value: string }) => secuenciasService.guardarConfig(key, value),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['config-envio'] }),
    onError: () => toast.error('No se pudo guardar (hace falta ser admin)'),
  })

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="t-card">Envío automático {activo ? 'encendido' : 'apagado'}</p>
          <p className="t-hint">
            Desde {cfg.envio_remitente || 'sales@jddeveloper.com'}, de lunes a viernes, hora de {cfg.envio_zona || 'Nueva York'}.
            Solo salen correos aprobados.
          </p>
        </div>
        <Button
          variant={activo ? 'outline' : 'primary'} size="sm"
          onClick={() => guardar.mutate({ key: 'envio_auto_activo', value: activo ? 'false' : 'true' })}
        >
          <Power size={14} />{activo ? 'Apagar' : 'Encender'}
        </Button>
      </div>
      <label className="block space-y-1">
        <span className="t-hint">Dirección postal (la ley de EE. UU. la exige en cada correo; sin ella no sale nada)</span>
        <Input
          defaultValue={cfg.direccion_fisica} placeholder="Calle, ciudad, país"
          onBlur={(e) => { if (e.target.value !== cfg.direccion_fisica) guardar.mutate({ key: 'direccion_fisica', value: e.target.value.trim() }) }}
        />
      </label>
      {activo && !cfg.direccion_fisica?.trim() && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle size={14} />Encendido, pero no saldrá nada hasta que pongas la dirección postal.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {CAMPOS.map((f) => (
          <label key={f.key} className="space-y-1">
            <span className="t-hint">{f.texto}</span>
            <Input
              type="number" min={0} defaultValue={cfg[f.key]}
              onBlur={(e) => { if (e.target.value !== cfg[f.key]) guardar.mutate({ key: f.key, value: e.target.value }) }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

export function CorreosProgramadosPage() {
  const qc = useQueryClient()
  const [pestana, setPestana] = useState<Pestana>('por_aprobar')
  const { data, isLoading, isError } = useQuery({ queryKey: ['secuencias'], queryFn: secuenciasService.listar })
  const { data: cfg } = useQuery({ queryKey: ['config-envio'], queryFn: secuenciasService.leerConfig })

  const grupos = useMemo(() => {
    const g: Record<Pestana, LeadSecuencia[]> = { por_aprobar: [], programado: [], enviado: [], cancelado: [] }
    for (const l of data ?? []) g[pestanaDe(l)].push(l)
    return g
  }, [data])

  // «Aprobar los limpios»: los que no tienen avisos del comprobador. Los que
  // sí, uno a uno, después de leerlos.
  const limpios = grupos.por_aprobar.filter((l) => !l.correos.some((c) => c.revisar))
  const aprobarLimpios = useMutation({
    mutationFn: () => secuenciasService.aprobar(limpios.map((l) => l.leadId)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['secuencias'] }); toast.success(`${limpios.length} secuencias aprobadas`) },
    onError: () => toast.error('No se pudieron aprobar'),
  })

  const lista = grupos[pestana]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Correos programados"
        subtitle="Secuencias de 3 correos (día 0, 4 y 9). Nada sale sin tu aprobación."
        actions={pestana === 'por_aprobar' && limpios.length > 0 ? (
          <Button size="sm" onClick={() => aprobarLimpios.mutate()} disabled={aprobarLimpios.isPending}>
            <Check size={14} />Aprobar {limpios.length} sin avisos
          </Button>
        ) : undefined}
      />

      {cfg && <CajaRitmo cfg={cfg} />}

      <div className="flex gap-1 overflow-x-auto" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.id} type="button" role="tab" aria-selected={pestana === p.id}
            onClick={() => setPestana(p.id)}
            className={cn('shrink-0 rounded-full px-3 py-1.5 text-sm',
              pestana === p.id ? 'bg-surface-2 font-medium' : 'text-muted hover:bg-surface-2')}
          >
            {p.texto} <span className="text-muted">{grupos[p.id].length}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div>
      ) : isError ? (
        <EmptyState icon={<AlertTriangle size={28} />} title="No se pudieron cargar los correos" description="Puede que falte aplicar la migración 0053 en Supabase." />
      ) : lista.length === 0 ? (
        <EmptyState icon={<Mail size={28} />} title="Nada aquí" description={pestana === 'por_aprobar' ? 'No hay secuencias esperando tu aprobación.' : undefined} />
      ) : (
        <div className="space-y-3">{lista.map((l) => <TarjetaLead key={l.leadId} l={l} pestana={pestana} />)}</div>
      )}
    </div>
  )
}

export default CorreosProgramadosPage
