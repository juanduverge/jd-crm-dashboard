import { useMemo, useState } from 'react'
import {
  addMonths, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { Button, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useFollowUpsAgenda, useGoals, useHorarioDia, useTareas } from '@/hooks/useData'
import { DIAS_SEMANA, diasDelRango, fmtDia, fmtMes, fmtNum, iso, isoDow, progreso, tonoProgreso } from './goalMeta'
import type { Goal } from '@/types'

/**
 * Vista de calendario del mes: superpone lo que ya vive en el CRM sobre la
 * rejilla — metas diarias con su progreso, cierres de metas semanales y
 * mensuales, tareas con vencimiento y seguimientos programados.
 *
 * Google Calendar todavía NO está conectado a este CRM: cuando lo esté, sus
 * eventos se leerán en vivo y se pintarán aquí junto a lo demás, sin duplicar
 * nada en la base de datos.
 */
export function CalendarioView() {
  const [ref, setRef] = useState(() => new Date())
  const [sel, setSel] = useState<string | null>(() => iso(new Date()))

  const gridDesde = iso(startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }))
  const gridHasta = iso(endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }))

  const { data: goals, isLoading } = useGoals(gridDesde, gridHasta)
  const { data: tareas } = useTareas()
  const { data: agenda } = useFollowUpsAgenda()
  const { data: bloques } = useHorarioDia(sel ?? iso(new Date()))

  const dias = useMemo(() => diasDelRango(gridDesde, gridHasta), [gridDesde, gridHasta])

  /** Índice por fecha: metas del día, cierres de periodo, tareas y seguimientos. */
  const porFecha = useMemo(() => {
    const map = new Map<string, {
      metasDia: Goal[]
      cierres: Goal[]
      tareas: number
      seguimientos: number
    }>()

    const get = (f: string) => {
      let e = map.get(f)
      if (!e) { e = { metasDia: [], cierres: [], tareas: 0, seguimientos: 0 }; map.set(f, e) }
      return e
    }

    for (const g of goals ?? []) {
      if (g.periodo === 'dia') get(g.fechaInicio).metasDia.push(g)
      else get(g.fechaFin).cierres.push(g)
    }
    for (const t of tareas ?? []) {
      if (t.estado !== 'hecha' && t.fechaVencimiento) get(t.fechaVencimiento).tareas += 1
    }
    for (const f of agenda ?? []) get(f.fechaProgramada).seguimientos += 1

    return map
  }, [goals, tareas, agenda])

  const detalleSel = sel ? porFecha.get(sel) : undefined
  const bloquesSel = useMemo(() => {
    if (!sel) return []
    const dow = isoDow(new Date(`${sel}T00:00:00`))
    return (bloques ?? []).filter((b) => b.activo && b.diasSemana.includes(dow))
  }, [bloques, sel])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button onClick={() => setRef((d) => addMonths(d, -1))} className="btn-ghost h-8 w-8 rounded-lg border border-border p-0">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setRef((d) => addMonths(d, 1))} className="btn-ghost h-8 w-8 rounded-lg border border-border p-0">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm font-semibold capitalize text-fg">{fmtMes(ref)}</p>
        {!isSameMonth(ref, new Date()) && (
          <Button size="sm" variant="ghost" onClick={() => { setRef(new Date()); setSel(iso(new Date())) }}>Hoy</Button>
        )}
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-border">
            {DIAS_SEMANA.map((d) => (
              <div key={d.iso} className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                {d.label.slice(0, 3)}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {dias.map((d) => {
              const f = iso(d)
              const e = porFecha.get(f)
              const delMes = isSameMonth(d, ref)
              const pct = e?.metasDia.length
                ? Math.round(e.metasDia.reduce((a, g) => a + progreso(g), 0) / e.metasDia.length)
                : null

              return (
                <button
                  key={f}
                  onClick={() => setSel(f)}
                  className={cn(
                    'min-h-[84px] border-b border-r border-border p-1.5 text-left align-top transition hover:bg-surface',
                    !delMes && 'opacity-40',
                    sel === f && 'bg-primary-500/5 ring-1 ring-inset ring-primary-500/40',
                  )}
                >
                  <span className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                    isToday(d) ? 'bg-primary-500 font-semibold text-white' : 'text-fg',
                  )}>
                    {format(d, 'd')}
                  </span>

                  {pct !== null && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className={cn('h-full rounded-full', tonoProgreso(pct))} style={{ width: `${pct}%` }} />
                    </div>
                  )}

                  <div className="mt-1 space-y-0.5">
                    {e?.cierres.slice(0, 2).map((g) => (
                      <p key={g.id} className="truncate text-[10px] text-amber-600 dark:text-amber-400" title={`Cierra: ${g.nombre}`}>
                        ● {g.nombre}
                      </p>
                    ))}
                    {!!e?.seguimientos && (
                      <p className="truncate text-[10px] text-primary-600 dark:text-primary-300">
                        {e.seguimientos} seguimiento{e.seguimientos > 1 ? 's' : ''}
                      </p>
                    )}
                    {!!e?.tareas && (
                      <p className="truncate text-[10px] text-muted">
                        {e.tareas} tarea{e.tareas > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {sel && (
        <div className="card space-y-3 p-4">
          <p className="text-sm font-semibold capitalize text-fg">{fmtDia(new Date(`${sel}T00:00:00`))}</p>

          {detalleSel?.metasDia.length ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Metas del día</p>
              <ul className="space-y-1">
                {detalleSel.metasDia.map((g) => (
                  <li key={g.id} className="flex items-center gap-2 text-sm text-fg">
                    <span className="truncate">{g.nombre}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted">
                      {fmtNum(g.valorActual)} / {fmtNum(g.target)}{g.unidad ? ` ${g.unidad}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {detalleSel?.cierres.length ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Cierres de periodo</p>
              <ul className="space-y-1">
                {detalleSel.cierres.map((g) => (
                  <li key={g.id} className="text-sm text-fg">
                    {g.nombre} <span className="text-xs text-muted">— fin de la meta {g.periodo === 'mes' ? 'mensual' : 'semanal'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {bloquesSel.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Horario de ese día</p>
              <ul className="space-y-1">
                {bloquesSel.map((b) => (
                  <li key={b.id} className="flex gap-2 text-sm text-fg">
                    <span className="w-24 shrink-0 tabular-nums text-xs text-muted">{b.horaInicio}–{b.horaFin}</span>
                    <span className="truncate">{b.titulo}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!detalleSel?.metasDia.length && !detalleSel?.cierres.length && !bloquesSel.length && (
            <p className="text-sm text-muted">Sin metas ni bloques para este día.</p>
          )}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Google Calendar aún no está conectado al CRM: aquí se ven las metas, el horario, las tareas y
          los seguimientos que ya viven en Supabase. La sincronización con Calendar es el último paso del
          módulo y necesita conectar la cuenta desde Configuración.
        </span>
      </p>
    </div>
  )
}
