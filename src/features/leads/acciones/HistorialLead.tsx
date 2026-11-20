import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  ArrowRight, CalendarCheck, Camera, Circle, Clock, Linkedin, Mail, MessageCircle, MessageSquare, Phone, PhoneCall,
  Users, Video, X,
} from 'lucide-react'
import { useActualizarFollowUp, useLeadFollowUps } from '@/hooks/useData'
import { supabase } from '@/lib/supabaseClient'
import { pipelineService } from '@/services/pipelineService'
import { STAGE_BY_ID } from '@/lib/pipeline'
import { TIPO_META, today } from '@/lib/followUps'
import { cn } from '@/lib/utils'
import { ANIMO, ATENDIO, ESTRATEGIA, INTERES, OBJECION, TIPO_PROYECTO, etiquetaDe } from '@/lib/encuestaLlamada'
import type { DetalleContacto, EncuestaLlamada, FollowUp, FollowUpTipo, LeadStatus } from '@/types'

/**
 * El historial del lead en una sola línea de tiempo: contactos (con su
 * resultado, duración y desde qué número), cambios de etapa y reuniones.
 * Antes eran tres pestañas (Seguimientos, Actividad, Mensajes) que había que
 * cruzar a mano para saber qué había pasado.
 */

const ICONO: Partial<Record<FollowUpTipo, typeof Phone>> = {
  llamada: Phone, llamada_whatsapp: PhoneCall, whatsapp: MessageCircle, email: Mail, sms: MessageSquare,
  instagram: Camera, linkedin: Linkedin, reunion: Users, videollamada: Video,
}

export const DETALLE_LABEL: Record<DetalleContacto, string> = {
  enviado: 'enviado', no_contesto: 'no contestó', buzon: 'buzón de voz', ocupado: 'ocupado / colgó',
  numero_equivocado: 'número equivocado', interesado: 'interesado', pidio_info: 'pidió información',
  llamar_luego: 'pidió que le llamemos luego', no_interesa: 'no le interesa',
}

function textoResultado(f: FollowUp): { t: string; cls: string } {
  if (f.detalle) {
    const bien = f.detalle === 'interesado' || f.detalle === 'pidio_info'
    const mal = f.detalle === 'no_interesa' || f.detalle === 'numero_equivocado'
    // Un mensaje enviado que luego tuvo respuesta: se dice que respondió.
    if (f.detalle === 'enviado' && f.resultado !== 'sin_respuesta') {
      return { t: f.resultado === 'positivo' ? 'respondió' : 'respondió (no interesado)', cls: f.resultado === 'positivo' ? 'text-emerald-600' : 'text-red-600' }
    }
    return { t: DETALLE_LABEL[f.detalle], cls: bien ? 'text-emerald-600' : mal ? 'text-red-600' : 'text-muted' }
  }
  if (f.resultado === 'positivo') return { t: 'respondió', cls: 'text-emerald-600' }
  if (f.resultado === 'negativo') return { t: 'respondió que no', cls: 'text-red-600' }
  return { t: 'sin respuesta', cls: 'text-muted' }
}

const dur = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : null)

type Item =
  | { k: 'contacto'; en: string; f: FollowUp }
  | { k: 'etapa'; en: string; etapa: LeadStatus; nota?: string }
  | { k: 'reunion'; en: string; titulo: string; enlace?: string; estado: string; inicio: string }

export function HistorialLead({ leadId }: { leadId: string }) {
  const { data: fus, isLoading } = useLeadFollowUps(leadId)
  const etapas = useQuery({
    queryKey: ['etapas-lead', leadId],
    queryFn: () => pipelineService.getStageHistory(leadId) as Promise<{ etapa: LeadStatus; changed_at: string; notas: string | null }[]>,
    staleTime: 30_000,
  })
  const reuniones = useQuery({
    queryKey: ['eventos', 'lead', leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from('eventos').select('id, titulo, inicio, enlace, estado')
        .eq('lead_id', leadId).is('deleted_at', null).order('inicio', { ascending: false })
      if (error) throw error
      return (data ?? []) as { id: string; titulo: string; inicio: string; enlace: string | null; estado: string }[]
    },
    staleTime: 30_000,
  })

  const pendiente = (fus ?? []).find((f) => f.estado === 'pendiente')
  const items = useMemo<Item[]>(() => {
    const a: Item[] = []
    for (const f of fus ?? []) if (f.estado === 'completado' && f.completadoEn) a.push({ k: 'contacto', en: f.completadoEn, f })
    for (const e of etapas.data ?? []) a.push({ k: 'etapa', en: e.changed_at, etapa: e.etapa, nota: e.notas ?? undefined })
    for (const r of reuniones.data ?? []) a.push({ k: 'reunion', en: r.inicio, titulo: r.titulo, enlace: r.enlace ?? undefined, estado: r.estado, inicio: r.inicio })
    return a.sort((x, y) => y.en.localeCompare(x.en))
  }, [fus, etapas.data, reuniones.data])

  return (
    <div className="space-y-4">
      {pendiente && <ProximoContacto f={pendiente} />}

      {isLoading ? <p className="py-6 text-center text-sm text-muted">Cargando historial…</p> : !items.length ? (
        <p className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted">
          Todavía no hay nada. Usa los botones de arriba para llamar o escribirle: quedará apuntado aquí.
        </p>
      ) : (
        <ol className="relative space-y-1 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
          {items.map((it, i) => <Fila key={i} it={it} />)}
        </ol>
      )}
    </div>
  )
}

function Fila({ it }: { it: Item }) {
  const cuando = format(new Date(it.en), "d MMM · HH:mm", { locale: es })
  if (it.k === 'etapa') {
    const st = STAGE_BY_ID[it.etapa]
    return (
      <li className="relative flex items-center gap-3 py-1.5 pl-0">
        <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-border"><ArrowRight className="h-3.5 w-3.5 text-muted" /></span>
        <p className="min-w-0 flex-1 text-xs text-muted">
          Pasó a <span className="inline-flex items-center gap-1 font-medium text-fg"><span className="h-1.5 w-1.5 rounded-full" style={{ background: st?.color }} />{st?.label ?? it.etapa}</span>
          {it.nota?.startsWith('Automático') ? ' (automático)' : ''}
        </p>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">{cuando}</span>
      </li>
    )
  }
  if (it.k === 'reunion') {
    return (
      <li className="relative flex items-start gap-3 py-2">
        <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-500/20"><CalendarCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-fg">{it.titulo}</p>
          <p className="text-xs text-muted">Reunión {it.estado === 'hecho' ? 'hecha' : Date.parse(it.inicio) > Date.now() ? 'agendada' : 'pasada'}</p>
          {it.enlace && Date.parse(it.inicio) > Date.now() - 3_600_000 && (
            <a href={it.enlace} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"><Video className="h-3.5 w-3.5" />Enlace de la reunión</a>
          )}
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-muted">{cuando}</span>
      </li>
    )
  }
  const f = it.f
  const Icon = ICONO[f.tipo] ?? Circle
  const r = textoResultado(f)
  const d = dur(f.duracionSeg)
  return (
    <li className="relative flex items-start gap-3 py-2">
      <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-500/15"><Icon className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-fg">
          <span className="font-medium">{TIPO_META[f.tipo]?.label ?? f.tipo}</span>
          <span className={cn('ml-1.5 text-xs font-medium', r.cls)}>· {r.t}</span>
          {d && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-muted"><Clock className="h-3 w-3" />{d}</span>}
        </p>
        {(f.numeroUsado || f.orden) && <p className="text-[11px] text-muted">Contacto nº {f.orden}{f.numeroUsado ? ` · desde ${f.numeroUsado}` : ''}</p>}
        {f.encuesta && <ChipsEncuesta e={f.encuesta} />}
        {f.nota && <p className="mt-1 whitespace-pre-line rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-fg">{f.nota}</p>}
      </div>
      <span className="shrink-0 text-[11px] tabular-nums text-muted">{cuando}</span>
    </li>
  )
}

/** Lo que Juan apuntó al colgar (0074), en chips cortos bajo la llamada. */
function ChipsEncuesta({ e }: { e: EncuestaLlamada }) {
  const animo = ANIMO.find((a) => a.v === e.animo)
  const chips = [
    animo && `${animo.emoji} ${animo.l}`,
    e.interes && INTERES.find((i) => i.v === e.interes)?.l,
    etiquetaDe(TIPO_PROYECTO, e.tipoProyecto),
    e.estrategia && `Estrategia: ${etiquetaDe(ESTRATEGIA, e.estrategia)}`,
    e.atendio && `Atendió: ${etiquetaDe(ATENDIO, e.atendio)}`,
    e.objecion && e.objecion !== 'ninguna' && `Objeción: ${etiquetaDe(OBJECION, e.objecion)}`,
  ].filter(Boolean) as string[]
  return (
    <div className="mt-1">
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => <span key={c} className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] text-fg">{c}</span>)}
      </div>
      {e.aprendizaje && <p className="mt-1 text-xs italic text-muted">«{e.aprendizaje}»</p>}
    </div>
  )
}

/** El próximo contacto programado, arriba del todo, con cambiar fecha y quitar. */
function ProximoContacto({ f }: { f: FollowUp }) {
  const actualizar = useActualizarFollowUp()
  const [cambiando, setCambiando] = useState(false)
  const [fecha, setFecha] = useState(f.fechaProgramada)
  const hoy = today()
  const atrasado = f.fechaProgramada < hoy
  const Icon = ICONO[f.tipo] ?? Circle
  const guardar = (p: Parameters<typeof actualizar.mutate>[0], msg: string) =>
    actualizar.mutate(p, { onSuccess: () => { toast.success(msg); setCambiando(false) }, onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar') })

  return (
    <div className={cn('rounded-xl border p-3', atrasado ? 'border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10' : 'border-primary-200 bg-primary-50/50 dark:border-primary-500/30 dark:bg-primary-500/10')}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', atrasado ? 'text-red-600' : 'text-primary-600')} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">
            Próximo: {TIPO_META[f.tipo]?.label.toLowerCase() ?? f.tipo} el {format(new Date(`${f.fechaProgramada}T12:00:00`), "EEEE d 'de' LLLL", { locale: es })}
          </p>
          <p className={cn('text-xs', atrasado ? 'font-medium text-red-600' : 'text-muted')}>
            {atrasado ? 'Atrasado: hazlo hoy o cámbialo de día.' : `Contacto nº ${f.orden}`}{f.nota ? ` · ${f.nota}` : ''}
          </p>
          {cambiando && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input type="date" value={fecha} min={hoy} onChange={(e) => setFecha(e.target.value)} className="input h-8 w-40 text-xs" />
              <button type="button" onClick={() => guardar({ id: f.id, fecha }, 'Fecha cambiada')} className="btn btn-primary h-8 px-3 text-xs">Guardar</button>
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" onClick={() => setCambiando((v) => !v)} className="rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-surface">Cambiar día</button>
          <button type="button" onClick={() => guardar({ id: f.id, estado: 'cancelado' }, 'Contacto quitado')} className="rounded-md p-1 text-muted hover:bg-surface hover:text-fg" aria-label="Quitar este contacto programado"><X className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  )
}
