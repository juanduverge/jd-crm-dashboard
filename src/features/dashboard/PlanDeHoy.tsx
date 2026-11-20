import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, subDays } from 'date-fns'
import toast from 'react-hot-toast'
import { ArrowRight, Flame, Pencil, Phone, PhoneCall, Video } from 'lucide-react'
import { Button, Card, CardHeader, CardTitle, Input, Skeleton } from '@/components/ui'
import { useConfig, useContactosHechos, useUpdateConfig } from '@/hooks/useData'
import { cn } from '@/lib/utils'
import type { Evento, FollowUp, FollowUpAgendaItem, FollowUpTipo } from '@/types'

/**
 * «Plan de hoy» — sustituye a la antigua «Agenda de hoy», que solo enseñaba
 * eventos del calendario y casi siempre salía vacía aunque hubiera decenas de
 * contactos por hacer (Juan, 20-nov: «la agenda no se está actualizando»).
 *
 * Arriba el objetivo del día con su progreso, contado de lo que se registra
 * en la ficha del lead (follow_ups completados hoy). Luego las reuniones con
 * hora y la cola de llamadas que tocan hoy.
 *
 * El objetivo vive en `settings.objetivo_diario` (JSON) y se cambia aquí
 * mismo con el lápiz: es un número que se ajusta a menudo, no merece pantalla.
 */

const LLAMADAS: FollowUpTipo[] = ['llamada', 'llamada_whatsapp', 'videollamada']
const MENSAJES: FollowUpTipo[] = ['whatsapp', 'email', 'sms', 'instagram', 'linkedin']
const PESO_PRIORIDAD = { alta: 0, media: 1, baja: 2 } as const

interface Objetivo { llamadas: number; mensajes: number }
const OBJETIVO_POR_DEFECTO: Objetivo = { llamadas: 20, mensajes: 15 }

function leerObjetivo(valor?: string): Objetivo {
  try {
    const o = JSON.parse(valor || '{}') as Partial<Objetivo>
    return {
      llamadas: Number(o.llamadas) > 0 ? Number(o.llamadas) : OBJETIVO_POR_DEFECTO.llamadas,
      mensajes: Number(o.mensajes) > 0 ? Number(o.mensajes) : OBJETIVO_POR_DEFECTO.mensajes,
    }
  } catch {
    return OBJETIVO_POR_DEFECTO
  }
}

const diaLocal = (iso: string) => format(new Date(iso), 'yyyy-MM-dd')
const esLlamada = (f: FollowUp) => LLAMADAS.includes(f.tipo)
const esMensaje = (f: FollowUp) => MENSAJES.includes(f.tipo)

/**
 * Días laborables seguidos cumpliendo el objetivo de llamadas. Hoy suma si ya
 * se cumplió, pero no rompe la racha mientras el día sigue abierto. Sábados y
 * domingos no cuentan ni rompen.
 */
function calcularRacha(porDia: Map<string, number>, meta: number, hoy: string): number {
  let racha = 0
  for (let i = 0; i < 30; i++) {
    const d = subDays(new Date(`${hoy}T12:00:00`), i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    const n = porDia.get(format(d, 'yyyy-MM-dd')) ?? 0
    if (n >= meta) racha++
    else if (i === 0) continue
    else break
  }
  return racha
}

export function PlanDeHoy({ hoy, eventos, cargandoEventos, agenda, cargandoAgenda }: {
  hoy: string
  eventos: Evento[]
  cargandoEventos: boolean
  agenda: FollowUpAgendaItem[]
  cargandoAgenda: boolean
}) {
  const { desde, hasta } = useMemo(() => ({
    desde: new Date(`${format(subDays(new Date(`${hoy}T12:00:00`), 29), 'yyyy-MM-dd')}T00:00:00`).toISOString(),
    hasta: new Date(`${hoy}T23:59:59`).toISOString(),
  }), [hoy])
  const hechos = useContactosHechos(desde, hasta)
  const config = useConfig()
  const objetivo = leerObjetivo(config.data?.objetivo_diario)

  const dia = useMemo(() => {
    const todos = hechos.data ?? []
    const deHoy = todos.filter((f) => f.completadoEn && diaLocal(f.completadoEn) === hoy)
    const llamadas = deHoy.filter(esLlamada)
    const contestadas = llamadas.filter((f) => f.resultado && f.resultado !== 'sin_respuesta')
    const porDia = new Map<string, number>()
    for (const f of todos) if (esLlamada(f) && f.completadoEn) porDia.set(diaLocal(f.completadoEn), (porDia.get(diaLocal(f.completadoEn)) ?? 0) + 1)
    return {
      llamadas: llamadas.length,
      mensajes: deHoy.filter(esMensaje).length,
      contestadas: contestadas.length,
      minutos: Math.round(llamadas.reduce((s, f) => s + (f.duracionSeg ?? 0), 0) / 60),
      interesados: deHoy.filter((f) => f.detalle === 'interesado' || f.detalle === 'pidio_info').length,
      racha: calcularRacha(porDia, objetivo.llamadas, hoy),
    }
  }, [hechos.data, hoy, objetivo.llamadas])

  const reuniones = eventos.filter((e) => e.estado !== 'cancelado')
  const cola = useMemo(
    () => agenda
      .filter((f) => f.diasVencido >= 0 && LLAMADAS.includes(f.tipo))
      .sort((a, b) =>
        PESO_PRIORIDAD[a.leadPrioridad ?? 'media'] - PESO_PRIORIDAD[b.leadPrioridad ?? 'media']
        || b.diasVencido - a.diasVencido),
    [agenda],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan de hoy</CardTitle>
        <Link to="/productividad/hoy" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline">
          Mi día <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>

      <Objetivos objetivo={objetivo} dia={dia} cargando={hechos.isLoading} />

      {cargandoEventos ? null : reuniones.length > 0 && (
        <div className="mt-4">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Reuniones</p>
          <ul className="-mx-1.5 space-y-0.5">
            {reuniones.slice(0, 3).map((e) => {
              const pasado = Date.parse(e.fin) < Date.now() || e.estado === 'hecho'
              return (
                <li key={e.id}>
                  <Link to={e.leadId ? `/pipeline?lead=${e.leadId}` : '/productividad/calendario'}
                    className={cn('flex items-center gap-3 rounded-lg px-1.5 py-1.5 row-hover', pasado && 'opacity-50')}>
                    <Video className="h-4 w-4 shrink-0 text-violet-500" />
                    <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{e.todoElDia ? 'Día' : format(new Date(e.inicio), 'HH:mm')}</span>
                    <span className={cn('min-w-0 flex-1 truncate text-sm text-fg', pasado && 'line-through')}>{e.titulo}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Llamadas que tocan{cola.length ? ` · ${cola.length}` : ''}</p>
          {cola.length > 4 && <Link to="/seguimientos" className="text-[11px] font-medium text-primary-600 hover:underline">Ver todas</Link>}
        </div>
        {cargandoAgenda ? <Skeleton className="h-20" /> : !cola.length ? (
          <p className="py-3 text-sm text-muted">No hay llamadas programadas para hoy. Elige leads en <Link to="/leads" className="font-medium text-primary-600 hover:underline">Leads</Link>.</p>
        ) : (
          <ul className="-mx-1.5 space-y-0.5">
            {cola.slice(0, 4).map((f) => {
              const Icon = f.tipo === 'llamada_whatsapp' ? PhoneCall : Phone
              return (
                <li key={f.id}>
                  <Link to={`/pipeline?lead=${f.leadId}`} className="flex items-center gap-3 rounded-lg px-1.5 py-1.5 row-hover">
                    <Icon className="h-4 w-4 shrink-0 text-primary-500" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg" title={f.leadEmpresa}>{f.leadEmpresa}</span>
                    {f.leadPrioridad === 'alta' && <span className="shrink-0 rounded-full bg-red-50 px-1.5 text-[10px] font-semibold text-red-600 dark:bg-red-500/15">alta</span>}
                    <span className={cn('shrink-0 text-xs tabular-nums', f.diasVencido > 0 ? 'text-[rgb(var(--danger))]' : 'text-muted')}>
                      {f.diasVencido > 0 ? `hace ${f.diasVencido} d` : f.hora ?? 'hoy'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Card>
  )
}

function Objetivos({ objetivo, dia, cargando }: {
  objetivo: Objetivo
  dia: { llamadas: number; mensajes: number; contestadas: number; minutos: number; interesados: number; racha: number }
  cargando: boolean
}) {
  const actualizar = useUpdateConfig()
  const [editando, setEditando] = useState(false)
  const [borrador, setBorrador] = useState({ llamadas: '', mensajes: '' })

  const abrir = () => { setBorrador({ llamadas: String(objetivo.llamadas), mensajes: String(objetivo.mensajes) }); setEditando(true) }
  const guardar = () => {
    const ll = Math.round(Number(borrador.llamadas)); const me = Math.round(Number(borrador.mensajes))
    if (!(ll > 0) || !(me > 0)) { toast.error('Pon un número mayor que cero'); return }
    actualizar.mutate(
      { clave: 'objetivo_diario', valor: JSON.stringify({ llamadas: ll, mensajes: me }) },
      { onSuccess: () => { toast.success('Objetivo guardado'); setEditando(false) }, onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar') },
    )
  }

  if (cargando) return <Skeleton className="h-24" />

  return (
    <div className="rounded-xl bg-surface-2/60 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Objetivo del día</p>
        {!editando && (
          <button type="button" onClick={abrir} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-primary-600 hover:bg-surface" aria-label="Cambiar el objetivo del día">
            <Pencil className="h-3 w-3" />Cambiar
          </button>
        )}
      </div>
      {editando ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-fg">
            <Input type="number" min={1} inputMode="numeric" value={borrador.llamadas} onChange={(e) => setBorrador({ ...borrador, llamadas: e.target.value })} className="w-20" />
            llamadas al día
          </label>
          <label className="flex items-center gap-2 text-sm text-fg">
            <Input type="number" min={1} inputMode="numeric" value={borrador.mensajes} onChange={(e) => setBorrador({ ...borrador, mensajes: e.target.value })} className="w-20" />
            mensajes al día
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={guardar} disabled={actualizar.isPending}>{actualizar.isPending ? 'Guardando…' : 'Guardar'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <>
          <Barra etiqueta="Llamadas" hecho={dia.llamadas} meta={objetivo.llamadas} />
          <Barra etiqueta="Mensajes" hecho={dia.mensajes} meta={objetivo.mensajes} />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span><b className="text-fg">{dia.contestadas}</b> contestaron</span>
            <span><b className="text-fg">{dia.minutos}</b> min hablando</span>
            <span><b className="text-fg">{dia.interesados}</b> interesados</span>
            {dia.racha > 0 && (
              <span className="inline-flex items-center gap-0.5 font-medium text-orange-600 dark:text-orange-400" title="Días laborables seguidos cumpliendo el objetivo de llamadas">
                <Flame className="h-3.5 w-3.5" />{dia.racha} {dia.racha === 1 ? 'día' : 'días'} de racha
              </span>
            )}
          </p>
        </>
      )}
    </div>
  )
}

function Barra({ etiqueta, hecho, meta }: { etiqueta: string; hecho: number; meta: number }) {
  const pct = Math.min(100, Math.round((hecho / meta) * 100))
  const cumplido = hecho >= meta
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex items-baseline justify-between text-sm">
        <span className="text-fg">{etiqueta}</span>
        <span className={cn('tabular-nums', cumplido ? 'font-semibold text-[rgb(var(--ok))]' : 'text-muted')}>
          <b className="text-fg">{hecho}</b> / {meta}{cumplido ? ' ✓' : ''}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-border/60">
        <div className={cn('h-full rounded-full transition-all', cumplido ? 'bg-[rgb(var(--ok))]' : 'bg-primary-500')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
