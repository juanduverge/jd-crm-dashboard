import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  AlertTriangle, CalendarClock, CalendarDays, Check, CheckCircle2,
  Clock, RefreshCw, Phone, Mail, MessageCircle,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Badge, Input, Select, Skeleton, EmptyState } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import {
  useFollowUpsAgenda, useReprogramarFollowUp,
} from '@/hooks/useData'
import {
  agruparAgenda, textoVencimiento, TIPO_META, addDays, today,
} from '@/lib/followUps'
import { PRIORITY_META } from '@/lib/pipeline'
import { cn } from '@/lib/utils'
import { CompletarFollowUpModal } from './CompletarFollowUpModal'
import type { FollowUpAgendaItem } from '@/types'

/**
 * Pipeline de seguimientos — la vista que hacía falta para que las fechas
 * dejen de morir dentro de la ficha del lead.
 *
 * Deliberadamente SEPARADA de la lista de leads y del kanban: aquí no se
 * navega ni se filtra, se ejecuta. Cada fila trae los accesos directos para
 * completar o reprogramar sin entrar al detalle del lead.
 *
 * Los leads ganados/perdidos no pueden aparecer aquí: la vista SQL
 * `follow_ups_agenda` ya los excluye.
 */
export function FollowUpsPage() {
  const { data, isLoading, isError, refetch, isFetching } = useFollowUpsAgenda()
  const reprogramar = useReprogramarFollowUp()

  const [fResponsable, setFResponsable] = useState('')
  const [completando, setCompletando] = useState<FollowUpAgendaItem | null>(null)
  const [reprogramando, setReprogramando] = useState<FollowUpAgendaItem | null>(null)
  const [nuevaFecha, setNuevaFecha] = useState('')

  const items = useMemo(
    () => (data ?? []).filter((f) => !fResponsable || f.responsable === fResponsable),
    [data, fResponsable],
  )
  const responsables = useMemo(
    () => [...new Set((data ?? []).map((f) => f.responsable).filter(Boolean))] as string[],
    [data],
  )
  const grupos = useMemo(() => agruparAgenda(items), [items])

  const abrirReprogramar = (f: FollowUpAgendaItem) => {
    setReprogramando(f)
    // Sugerencia por defecto: mañana. Para un vencido, es el rescate más rápido.
    setNuevaFecha(addDays(1))
  }

  const confirmarReprogramar = async () => {
    if (!reprogramando) return
    if (nuevaFecha < today()) {
      toast.error('La nueva fecha no puede estar en el pasado')
      return
    }
    try {
      await reprogramar.mutateAsync({ id: reprogramando.id, fecha: nuevaFecha })
      toast.success(`${reprogramando.leadEmpresa} reprogramado`)
      setReprogramando(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo reprogramar')
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Seguimientos" subtitle="Cargando agenda…" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Seguimientos" />
        <EmptyState
          icon={<AlertTriangle className="h-8 w-8" />}
          title="No se pudo cargar la agenda"
          description="Revisa la conexión con Supabase e inténtalo de nuevo."
          action={<Button onClick={() => refetch()}>Reintentar</Button>}
        />
      </div>
    )
  }

  const total = grupos.vencidos.length + grupos.hoy.length + grupos.proximos.length

  return (
    <div>
      <PageHeader
        title="Seguimientos"
        subtitle={
          grupos.vencidos.length > 0
            ? `${grupos.vencidos.length} vencido${grupos.vencidos.length === 1 ? '' : 's'} · ${grupos.hoy.length} para hoy`
            : `${grupos.hoy.length} para hoy · ${grupos.proximos.length} esta semana`
        }
        actions={
          <>
            {responsables.length > 1 && (
              <Select
                value={fResponsable}
                onChange={(e) => setFResponsable(e.target.value)}
                className="h-9 w-auto"
              >
                <option value="">Todos</option>
                {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('mr-1.5 h-4 w-4', isFetching && 'animate-spin')} />
              Actualizar
            </Button>
          </>
        }
      />

      {total === 0 && grupos.masAdelante.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 className="h-8 w-8" />}
          title="Nada pendiente"
          description="No hay seguimientos vencidos ni programados para los próximos días. Programa el siguiente toque desde la ficha de un lead o desde el pipeline."
        />
      ) : (
        <div className="space-y-6">
          <Grupo
            titulo="Vencidos"
            icon={<AlertTriangle className="h-4 w-4" />}
            items={grupos.vencidos}
            tono="rojo"
            vacio="Ninguno vencido. Al día."
            onCompletar={setCompletando}
            onReprogramar={abrirReprogramar}
          />
          <Grupo
            titulo="Para hoy"
            icon={<Clock className="h-4 w-4" />}
            items={grupos.hoy}
            tono="ambar"
            vacio="Nada agendado para hoy."
            onCompletar={setCompletando}
            onReprogramar={abrirReprogramar}
          />
          <Grupo
            titulo="Próximos 7 días"
            icon={<CalendarDays className="h-4 w-4" />}
            items={grupos.proximos}
            tono="neutro"
            vacio="Nada en la próxima semana."
            onCompletar={setCompletando}
            onReprogramar={abrirReprogramar}
          />
          {grupos.masAdelante.length > 0 && (
            <Grupo
              titulo="Más adelante"
              icon={<CalendarClock className="h-4 w-4" />}
              items={grupos.masAdelante}
              tono="neutro"
              vacio=""
              onCompletar={setCompletando}
              onReprogramar={abrirReprogramar}
            />
          )}
        </div>
      )}

      <CompletarFollowUpModal
        followUp={completando}
        leadEmpresa={completando?.leadEmpresa}
        onClose={() => setCompletando(null)}
      />

      <Modal
        open={!!reprogramando}
        onClose={() => setReprogramando(null)}
        title={reprogramando ? `Reprogramar · ${reprogramando.leadEmpresa}` : 'Reprogramar'}
        footer={
          <>
            <Button variant="outline" onClick={() => setReprogramando(null)}>Cancelar</Button>
            <Button onClick={confirmarReprogramar} disabled={reprogramar.isPending}>
              {reprogramar.isPending ? 'Guardando…' : 'Reprogramar'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {[
              { label: 'Mañana', dias: 1 },
              { label: 'En 3 días', dias: 3 },
              { label: 'En 1 semana', dias: 7 },
              { label: 'En 2 semanas', dias: 14 },
            ].map((o) => (
              <button
                key={o.dias}
                type="button"
                onClick={() => setNuevaFecha(addDays(o.dias))}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition',
                  nuevaFecha === addDays(o.dias)
                    ? 'bg-primary-400 text-white'
                    : 'bg-surface-2 text-muted hover:opacity-80',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Nueva fecha</label>
            <Input type="date" min={today()} value={nuevaFecha} onChange={(e) => setNuevaFecha(e.target.value)} />
          </div>
          <p className="text-xs text-muted">
            Se mantiene el mismo toque (nº {reprogramando?.orden}); solo cambia la fecha.
          </p>
        </div>
      </Modal>
    </div>
  )
}

/* -------------------------------------------------------------- */

const TONOS = {
  rojo: {
    header: 'text-red-600 dark:text-red-400',
    fila: 'border-red-200 bg-red-50/60 dark:border-red-500/25 dark:bg-red-500/5',
    badge: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400',
  },
  ambar: {
    header: 'text-amber-600 dark:text-amber-400',
    fila: 'border-amber-200 bg-amber-50/50 dark:border-amber-500/25 dark:bg-amber-500/5',
    badge: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  },
  neutro: {
    header: 'text-muted',
    fila: 'border-border',
    badge: 'bg-surface-2 text-muted',
  },
} as const

function Grupo({
  titulo, icon, items, tono, vacio, onCompletar, onReprogramar,
}: {
  titulo: string
  icon: React.ReactNode
  items: FollowUpAgendaItem[]
  tono: keyof typeof TONOS
  vacio: string
  onCompletar: (f: FollowUpAgendaItem) => void
  onReprogramar: (f: FollowUpAgendaItem) => void
}) {
  const t = TONOS[tono]
  if (items.length === 0 && !vacio) return null

  return (
    <section>
      <h2 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', t.header)}>
        {icon}
        {titulo}
        <span className={cn('rounded-full px-2 py-0.5 text-xs', t.badge)}>{items.length}</span>
      </h2>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted">{vacio}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((f) => (
            <Fila key={f.id} f={f} cls={t.fila} onCompletar={onCompletar} onReprogramar={onReprogramar} />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Iconos de contacto directo: un clic desde la fila, sin abrir el lead. */
function AccionesContacto({ f }: { f: FollowUpAgendaItem }) {
  const wa = f.leadWhatsapp?.replace(/\D/g, '')
  return (
    <div className="flex items-center gap-0.5">
      {f.leadTelefono && (
        <a href={`tel:${f.leadTelefono}`} title={`Llamar a ${f.leadTelefono}`} className="btn-ghost h-8 w-8 rounded-lg">
          <Phone className="h-3.5 w-3.5" />
        </a>
      )}
      {wa && (
        <a
          href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
          title="Abrir WhatsApp" className="btn-ghost h-8 w-8 rounded-lg"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
      {f.leadEmail && (
        <a href={`mailto:${f.leadEmail}`} title={`Escribir a ${f.leadEmail}`} className="btn-ghost h-8 w-8 rounded-lg">
          <Mail className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  )
}

function Fila({
  f, cls, onCompletar, onReprogramar,
}: {
  f: FollowUpAgendaItem
  cls: string
  onCompletar: (f: FollowUpAgendaItem) => void
  onReprogramar: (f: FollowUpAgendaItem) => void
}) {
  const tipo = TIPO_META[f.tipo]
  return (
    <li className={cn('flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5', cls)}>
      <span className="text-base" aria-hidden>{tipo.emoji}</span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg" title={f.leadEmpresa}>
            {f.leadEmpresa}
          </span>
          <Badge>{tipo.label}</Badge>
          <Badge>toque {f.orden}</Badge>
          {f.leadPrioridad && (
            <Badge className={PRIORITY_META[f.leadPrioridad].cls}>
              {PRIORITY_META[f.leadPrioridad].label}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted" title={f.nota}>
          <span className="font-medium">{f.fechaProgramada}</span>
          {' · '}{textoVencimiento(f.diasVencido)}
          {f.nota ? ` · ${f.nota}` : ''}
        </p>
      </div>

      <AccionesContacto f={f} />

      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onReprogramar(f)}>
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          Reprogramar
        </Button>
        <Button size="sm" onClick={() => onCompletar(f)}>
          <Check className="mr-1 h-3.5 w-3.5" />
          Completar
        </Button>
      </div>
    </li>
  )
}
