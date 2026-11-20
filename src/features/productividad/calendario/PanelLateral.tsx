import { useEffect, useMemo, useState } from 'react'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarPlus, ChevronLeft, ChevronRight, RefreshCw, Video } from 'lucide-react'
import toast from 'react-hot-toast'
import { useSincronizarAhora } from '@/hooks/useData'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import { iso } from '../shared/goalMeta'
import { clasesPunto, ETIQUETA_FUENTE, type FuenteItem, type ItemCalendario } from './itemCalendario'

/**
 * La columna izquierda del calendario, como en Google Calendar: crear, saltar
 * a cualquier día con el mini mes, lo próximo que viene y qué capas se ven.
 * En el teléfono no se pinta: allí la cabecera ya tiene lo necesario.
 */

const PUNTO_FUENTE: Record<FuenteItem, string> = {
  evento: 'bg-primary-500', meta: 'bg-violet-500', bloque: 'bg-sky-500', tarea: 'bg-slate-500', seguimiento: 'bg-amber-500',
}

export function PanelLateral({
  refFecha, desde, hasta, items, ocultas, onOcultas, onDia, onNuevo, onItem, google,
}: {
  refFecha: Date
  desde: string
  hasta: string
  items: ItemCalendario[]
  ocultas: Set<FuenteItem>
  onOcultas: (s: Set<FuenteItem>) => void
  onDia: (d: Date) => void
  onNuevo: () => void
  onItem: (i: ItemCalendario) => void
  google: { conectado: boolean; calendario?: string; sincronizando: boolean }
}) {
  const [mes, setMes] = useState(() => startOfMonth(refFecha))
  // Si la vista principal salta de mes, el mini mes la sigue.
  useEffect(() => { setMes(startOfMonth(refFecha)) }, [refFecha])

  const dias = useMemo(
    () => eachDayOfInterval({ start: startOfWeek(mes, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(mes), { weekStartsOn: 1 }) }),
    [mes],
  )
  const conEventos = useMemo(() => new Set(items.filter((i) => i.fuente === 'evento').map((i) => i.fecha)), [items])

  const ahora = Date.now()
  const proximos = useMemo(
    () => items
      .filter((i) => i.fuente === 'evento' && i.inicio && (i.fin ?? i.inicio).getTime() >= ahora && i.evento?.estado !== 'cancelado')
      .sort((a, b) => a.inicio!.getTime() - b.inicio!.getTime())
      .slice(0, 5),
    [items, ahora],
  )

  const alternar = (f: FuenteItem) => {
    const s = new Set(ocultas)
    if (s.has(f)) s.delete(f)
    else s.add(f)
    onOcultas(s)
  }

  return (
    <aside className="hidden space-y-5 lg:block">
      <Button onClick={onNuevo} className="w-full justify-center shadow-sm"><CalendarPlus className="h-4 w-4" />Crear evento</Button>

      {/* ---------- Mini mes ---------- */}
      <div className="card p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold capitalize text-fg">{format(mes, 'LLLL yyyy', { locale: es })}</p>
          <div className="flex">
            <button type="button" onClick={() => setMes((m) => addMonths(m, -1))} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" onClick={() => setMes((m) => addMonths(m, 1))} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-muted">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="py-1">{d}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center">
          {dias.map((d) => {
            const f = iso(d)
            const enRango = f >= desde && f <= hasta
            return (
              <button
                key={f}
                type="button"
                onClick={() => onDia(d)}
                className={cn(
                  'relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors',
                  isToday(d) ? 'bg-primary-500 font-semibold text-white'
                    : enRango ? 'bg-primary-100 font-medium text-primary-700 dark:bg-primary-500/20 dark:text-primary-200'
                      : isSameMonth(d, mes) ? 'text-fg hover:bg-surface-2' : 'text-muted/50 hover:bg-surface-2',
                )}
              >
                {format(d, 'd')}
                {conEventos.has(f) && !isToday(d) && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary-500" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* ---------- Próximos ---------- */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Próximos</p>
        {!proximos.length ? (
          <p className="px-1 text-xs text-muted">Nada más en estos días.</p>
        ) : (
          <ul className="space-y-1">
            {proximos.map((i) => (
              <li key={i.clave}>
                <button type="button" onClick={() => onItem(i)} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2">
                  <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', clasesPunto(i.color))} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8125rem] font-medium text-fg">{i.titulo}</span>
                    <span className="block text-[0.6875rem] capitalize text-muted">
                      {isToday(i.inicio!) ? 'Hoy' : format(i.inicio!, 'EEE d', { locale: es })} · {format(i.inicio!, 'HH:mm')}
                    </span>
                  </span>
                  {i.evento?.enlace?.includes('meet.google') && <Video className="mt-1 h-3.5 w-3.5 shrink-0 text-muted" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------- Capas ---------- */}
      <div>
        <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">Mostrar</p>
        <ul className="space-y-0.5">
          {(Object.keys(ETIQUETA_FUENTE) as FuenteItem[]).map((f) => (
            <li key={f}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-[0.8125rem] text-fg hover:bg-surface-2">
                <input type="checkbox" className="sr-only" checked={!ocultas.has(f)} onChange={() => alternar(f)} />
                <span className={cn('flex h-4 w-4 items-center justify-center rounded border-2 transition-colors', ocultas.has(f) ? 'border-border bg-transparent' : `border-transparent ${PUNTO_FUENTE[f]}`)}>
                  {!ocultas.has(f) && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-white"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
                {ETIQUETA_FUENTE[f]}
              </label>
            </li>
          ))}
        </ul>
      </div>

      {/* ---------- Google ---------- */}
      <div className="card space-y-2.5 p-3">
        <p className="flex items-start gap-2 text-[0.6875rem] leading-snug text-muted">
          <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', google.conectado ? 'bg-green-500' : 'bg-slate-400')} />
          {google.conectado
            ? <span>Conectado a Google Calendar{google.calendario ? <> · <b className="font-medium text-fg">{google.calendario}</b></> : ''}{google.sincronizando ? ' · actualizando…' : ''}</span>
            : <span>Google Calendar sin conectar. Los eventos se guardan solo en el CRM.</span>}
        </p>
        <BotonSincronizar />
      </div>
    </aside>
  )
}

/** Trae ya lo de Google, sin esperar a los 5 minutos de la sincronización automática. */
export function BotonSincronizar({ compacto = false }: { compacto?: boolean }) {
  const sync = useSincronizarAhora()
  const pulsar = () => sync.mutate(undefined, {
    onSuccess: (n) => toast.success(n ? `Sincronizado: ${n} ${n === 1 ? 'evento actualizado' : 'eventos actualizados'} desde Google` : 'Sincronizado: todo estaba al día'),
    onError: (e) => toast.error(`No se pudo sincronizar: ${e instanceof Error ? e.message : 'error'}`),
  })
  return (
    <button
      type="button"
      onClick={pulsar}
      disabled={sync.isPending}
      title="Traer ahora los cambios de Google Calendar"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full border border-border text-xs font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-60',
        compacto ? 'h-8 w-8' : 'h-8 w-full',
      )}
    >
      <RefreshCw className={cn('h-3.5 w-3.5', sync.isPending && 'animate-spin')} />
      {!compacto && (sync.isPending ? 'Sincronizando…' : 'Sincronizar con Google')}
    </button>
  )
}
