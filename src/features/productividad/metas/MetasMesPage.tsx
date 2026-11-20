import { useMemo, useState } from 'react'
import { addMonths, differenceInCalendarDays, format, isSameMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import toast from 'react-hot-toast'
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Clock, Hash, ListChecks, Minus, Pencil, Plus, Sparkles, Target, Trash2, Zap,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Skeleton } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { useCrearMeta, useEliminarMeta, useGoals, useMetricasCrm, useRegistrarAvance } from '@/hooks/useData'
import { METRICA_BY_CLAVE, fmtMetrica } from '@/lib/metricas'
import { cn } from '@/lib/utils'
import type { Goal, MetricaClave, MetricasPeriodo } from '@/types'
import { iso, pctTranscurrido, progreso, rangoMes } from '../shared/goalMeta'
import { metasVivas, ritmoHoy } from '../shared/ritmoMeta'
import { MetaWizard } from './MetaWizard'

/**
 * Metas. Dos tipos, cada uno con su tarjeta:
 *   - De número («4 reuniones este mes»): barra, ritmo y «hoy te tocan».
 *     Si es algo que el CRM mide, se cuenta sola.
 *   - Libres («arreglar mi web el jueves»): título, descripción, fecha,
 *     horas estimadas y una casilla de hecha.
 *
 * Se ven las metas que tocan el mes elegido, sea cual sea su duración.
 */

const SUGERENCIAS: { metrica: MetricaClave; nombre: string; target: number; unidad: string }[] = [
  { metrica: 'contactos_realizados', nombre: 'Contactos', target: 100, unidad: 'contactos' },
  { metrica: 'reuniones_agendadas', nombre: 'Reuniones', target: 4, unidad: 'reuniones' },
  { metrica: 'leads_ganados', nombre: 'Clientes nuevos', target: 2, unidad: 'clientes' },
]

export default function MetasMesPage() {
  const [ref, setRef] = useState(() => new Date())
  const [creando, setCreando] = useState(false)
  const [editando, setEditando] = useState<Goal | null>(null)
  const [borrando, setBorrando] = useState<Goal | null>(null)

  const rango = rangoMes(ref)
  const esEsteMes = isSameMonth(ref, new Date())
  const hoy = iso(new Date())

  const { data: goals, isLoading } = useGoals(rango.desde, rango.hasta)
  const hoyMetricas = useMetricasCrm(hoy, hoy)
  const crear = useCrearMeta()
  const eliminar = useEliminarMeta()

  const todas = useMemo(() => metasVivas(goals, rango.desde, rango.hasta), [goals, rango.desde, rango.hasta])
  const numericas = todas.filter((g) => g.tipo !== 'toggle')
  const libres = todas
    .filter((g) => g.tipo === 'toggle')
    // Pendientes primero y por fecha; las hechas al final.
    .sort((a, b) => Number(progreso(a) >= 100) - Number(progreso(b) >= 100) || a.fechaFin.localeCompare(b.fechaFin))

  async function crearSugerida(s: (typeof SUGERENCIAS)[number]) {
    try {
      await crear.mutateAsync({ nombre: s.nombre, tipo: 'contador', target: s.target, unidad: s.unidad, fechaInicio: hoy, fechaFin: rango.hasta, metrica: s.metrica })
      toast.success(`Meta creada: ${s.target} ${s.unidad}. Cámbiale la cifra si quieres.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la meta')
    }
  }

  return (
    <div>
      <PageHeader
        title="Metas"
        subtitle="Números que quieres alcanzar y cosas concretas que quieres hacer. El CRM te dice cómo vas."
        actions={<Button size="sm" onClick={() => setCreando(true)}><Plus className="h-4 w-4" />Nueva meta</Button>}
      />

      <div className="mb-5 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setRef((d) => addMonths(d, -1))} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Button>
        <p className="min-w-[9rem] text-center text-sm font-semibold capitalize text-fg">{format(ref, 'LLLL yyyy', { locale: es })}</p>
        <Button variant="ghost" size="sm" onClick={() => setRef((d) => addMonths(d, 1))} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Button>
        {!esEsteMes && <Button variant="ghost" size="sm" onClick={() => setRef(new Date())}>Este mes</Button>}
        {todas.length > 0 && (
          <p className="ml-auto text-xs text-muted">
            {todas.filter((g) => progreso(g) >= 100).length} de {todas.length} cumplidas
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">{[0, 1].map((i) => <Skeleton key={i} className="h-48" />)}</div>
      ) : !todas.length ? (
        <Card className="p-8 text-center">
          <Target className="mx-auto h-8 w-8 text-muted/60" />
          <p className="mt-2 font-semibold text-fg">Aún no hay metas en {format(ref, 'LLLL', { locale: es })}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Crea la tuya: un número que alcanzar o algo concreto que hacer. O empieza con una de estas, que se cuentan solas.
          </p>
          <div className="mt-5">
            <Button onClick={() => setCreando(true)}><Plus className="h-4 w-4" />Crear una meta</Button>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {SUGERENCIAS.map((s) => (
              <Button key={s.metrica} variant="outline" size="sm" onClick={() => crearSugerida(s)} disabled={crear.isPending}>
                <Sparkles className="h-3.5 w-3.5" />{s.target} {s.unidad} este mes
              </Button>
            ))}
          </div>
        </Card>
      ) : (
        <div className="space-y-7">
          {numericas.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg"><Hash className="h-4 w-4 text-muted" />Números que alcanzar</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {numericas.map((g) => (
                  <TarjetaNumero key={g.id} g={g} hoyMetricas={esEsteMes ? hoyMetricas.data?.periodo : undefined} hoy={hoy}
                    onEditar={() => setEditando(g)} onBorrar={() => setBorrando(g)} />
                ))}
              </div>
            </section>
          )}
          {libres.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg"><ListChecks className="h-4 w-4 text-muted" />Cosas que hacer</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {libres.map((g) => (
                  <TarjetaLibre key={g.id} g={g} hoy={hoy} onEditar={() => setEditando(g)} onBorrar={() => setBorrando(g)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {creando && <MetaWizard onClose={() => setCreando(false)} />}
      {editando && <MetaWizard meta={editando} onClose={() => setEditando(null)} />}
      <ConfirmDeleteModal
        open={!!borrando}
        onClose={() => setBorrando(null)}
        onConfirm={async () => { if (borrando) { await eliminar.mutateAsync(borrando.id); toast.success('Meta eliminada') } }}
        title="Eliminar meta"
        itemLabel={borrando?.nombre}
        message="Se borra la meta (va a la papelera). Lo que hiciste en el CRM no se toca."
      />
    </div>
  )
}

// ---------------------------------------------------------------
// Tarjeta de meta de número
// ---------------------------------------------------------------

function TarjetaNumero({ g, hoyMetricas, hoy, onEditar, onBorrar }: {
  g: Goal; hoyMetricas?: MetricasPeriodo; hoy: string; onEditar: () => void; onBorrar: () => void
}) {
  const avance = useRegistrarAvance()
  const pct = progreso(g)
  const enCurso = g.fechaInicio <= hoy && g.fechaFin >= hoy
  const deberia = Math.round(pctTranscurrido(g))
  const r = ritmoHoy(g, hoyMetricas)
  const cumplida = pct >= 100
  const porDetras = enCurso && !cumplida && pct < deberia - 10
  const fmt = (v: number) => fmtMetrica(g.metrica, v)
  const unidad = g.unidad || (g.metrica ? METRICA_BY_CLAVE[g.metrica]?.unidad : '') || ''

  const frase = cumplida
    ? '¡Cumplida! Lo que sumes ahora es extra.'
    : !enCurso
      ? (g.fechaFin < hoy ? `Terminó en ${pct}%.` : `Empieza el ${fechaCorta(g.fechaInicio)}.`)
      : porDetras
        ? `Vas por detrás: hoy deberías ir por el ${deberia}% y vas por el ${pct}%.`
        : pct >= deberia ? 'Vas al día o por delante. Sigue así.' : 'Vas casi al día.'

  return (
    <Card className="flex flex-col gap-3 p-4">
      <Cabecera g={g} onEditar={onEditar} onBorrar={onBorrar}
        sub={<>{g.metrica ? <><Zap className="mr-0.5 inline h-3 w-3" />Se cuenta sola</> : 'La cuentas tú'} · {plazo(g)}</>} />

      <div className="flex items-baseline gap-2">
        <p className="t-num text-3xl leading-none">{fmt(r.hecho)}</p>
        <p className="text-sm text-muted">de {fmt(g.target)} {METRICA_BY_CLAVE[g.metrica ?? 'touch_1']?.formato && g.metrica ? '' : unidad}</p>
        <p className={cn('ml-auto text-sm font-semibold tabular-nums', cumplida ? 'text-[rgb(var(--ok))]' : porDetras ? 'text-[rgb(var(--danger))]' : 'text-fg')}>{pct}%</p>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cumplida ? '#16a34a' : porDetras ? '#ff4848' : '#ff7448' }} />
        {enCurso && <div className="absolute inset-y-0 w-0.5 bg-fg/40" style={{ left: `${Math.min(99.5, deberia)}%` }} title={`Hoy deberías ir por el ${deberia}%`} />}
      </div>

      <p className={cn('text-sm', porDetras ? 'text-[rgb(var(--danger))]' : 'text-fg')}>{frase}</p>

      {enCurso && !cumplida && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-surface-2 p-2.5">
            <p className="text-muted">Hoy te tocan</p>
            <p className="mt-0.5 text-base font-semibold text-fg tabular-nums">
              {r.laborableHoy ? fmt(r.tocaHoy) : '—'}
              {r.hechoHoy != null && r.laborableHoy && <span className="ml-1 text-xs font-normal text-muted">· llevas {fmt(r.hechoHoy)}</span>}
            </p>
            {!r.laborableHoy && <p className="text-[0.6875rem] text-muted">hoy no es laborable</p>}
          </div>
          <div className="rounded-lg bg-surface-2 p-2.5">
            <p className="text-muted">Te faltan</p>
            <p className="mt-0.5 text-base font-semibold text-fg tabular-nums">{fmt(r.falta)}</p>
            <p className="text-[0.6875rem] text-muted">en {r.diasRestantes} {r.diasRestantes === 1 ? 'día laborable' : 'días laborables'}</p>
          </div>
        </div>
      )}

      {!g.metrica && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => avance.mutate({ id: g.id, delta: -1 })} disabled={avance.isPending || r.hecho <= 0} aria-label="Restar uno"><Minus className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => avance.mutate({ id: g.id, delta: 1 })} disabled={avance.isPending}><Plus className="h-4 w-4" />Sumar 1</Button>
        </div>
      )}
      {g.descripcion && <p className="whitespace-pre-line border-t border-border pt-2 text-xs text-muted">{g.descripcion}</p>}
    </Card>
  )
}

// ---------------------------------------------------------------
// Tarjeta de meta libre («hacer algo concreto»)
// ---------------------------------------------------------------

function TarjetaLibre({ g, hoy, onEditar, onBorrar }: { g: Goal; hoy: string; onEditar: () => void; onBorrar: () => void }) {
  const avance = useRegistrarAvance()
  const hecha = progreso(g) >= 100
  const dias = differenceInCalendarDays(new Date(`${g.fechaFin}T12:00:00`), new Date(`${hoy}T12:00:00`))
  const vence = hecha ? 'Hecha' : dias < 0 ? `Atrasada ${-dias} ${-dias === 1 ? 'día' : 'días'}` : dias === 0 ? 'Para hoy' : dias === 1 ? 'Para mañana' : `Para el ${fechaCorta(g.fechaFin)} · en ${dias} días`

  const marcar = () => avance.mutate({ id: g.id, delta: hecha ? -1 : 1 }, {
    onSuccess: () => { if (!hecha) toast.success('¡Hecha!') },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo guardar'),
  })

  return (
    <Card className={cn('flex gap-3 p-4', hecha && 'opacity-70')}>
      <button type="button" onClick={marcar} disabled={avance.isPending} aria-label={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'} className="mt-0.5 shrink-0 text-muted hover:text-[rgb(var(--ok))]">
        {hecha ? <CheckCircle2 className="h-6 w-6 text-[rgb(var(--ok))]" /> : <Circle className="h-6 w-6" />}
      </button>
      <div className="min-w-0 flex-1">
        <Cabecera g={g} onEditar={onEditar} onBorrar={onBorrar} tachar={hecha} />
        {g.descripcion && <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-muted">{g.descripcion}</p>}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={cn('inline-flex items-center gap-1', !hecha && dias < 0 ? 'font-semibold text-[rgb(var(--danger))]' : !hecha && dias === 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-muted')}>
            <CalendarDays className="h-3.5 w-3.5" />{vence}
          </span>
          {g.horasEstimadas && <span className="inline-flex items-center gap-1 text-muted"><Clock className="h-3.5 w-3.5" />{g.horasEstimadas} h</span>}
          {g.prioridad && g.prioridad !== 'media' && (
            <span className={cn('rounded-full px-2 py-0.5 text-[0.6875rem] font-medium', g.prioridad === 'alta' ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400')}>
              Prioridad {g.prioridad}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

function Cabecera({ g, sub, onEditar, onBorrar, tachar }: { g: Goal; sub?: React.ReactNode; onEditar: () => void; onBorrar: () => void; tachar?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={cn('font-semibold text-fg', tachar && 'line-through')} title={g.nombre}>{g.nombre}</p>
        {sub && <p className="mt-0.5 text-[0.6875rem] text-muted">{sub}</p>}
      </div>
      <div className="flex shrink-0 gap-0.5">
        <button type="button" onClick={onEditar} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Editar meta"><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={onBorrar} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-[rgb(var(--danger))]" aria-label="Eliminar meta"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  )
}

const fechaCorta = (f: string) => format(new Date(`${f}T12:00:00`), "d 'de' LLL", { locale: es })

function plazo(g: Goal): string {
  if (g.fechaInicio === g.fechaFin) return `el ${fechaCorta(g.fechaFin)}`
  return `del ${fechaCorta(g.fechaInicio)} al ${fechaCorta(g.fechaFin)}`
}
