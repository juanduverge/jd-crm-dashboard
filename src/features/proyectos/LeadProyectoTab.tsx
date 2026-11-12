import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowRight, Briefcase, Plus } from 'lucide-react'
import { Button, Skeleton } from '@/components/ui'
import { today } from '@/lib/followUps'
import { cn, formatCurrency } from '@/lib/utils'
import { ETAPA_PROYECTO_META, TIPO_PROYECTO_LABEL, progresoRecopilacion, resumenCobros, textoEntrega } from '@/lib/proyectos'
import { useCrearProyectoDesdeLead, useProyectoDeLead } from './useProyectos'

/**
 * Pestaña «Proyecto» de la ficha de un lead ganado: el resumen de cómo va la
 * entrega sin salir del cliente, y el salto a la ficha completa.
 */
export function LeadProyectoTab({ leadId }: { leadId: string }) {
  const navigate = useNavigate()
  const { data: p, isLoading } = useProyectoDeLead(leadId)
  const crear = useCrearProyectoDesdeLead()
  const hoy = today()

  if (isLoading) return <Skeleton className="h-48 w-full" />

  if (!p) {
    // Solo pasa si se borró el proyecto: el trigger lo crea al ganar.
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
        <Briefcase className="h-8 w-8 text-muted/60" />
        <p className="t-card">Este cliente no tiene proyecto</p>
        <Button
          size="sm"
          disabled={crear.isPending}
          onClick={async () => {
            try {
              const id = await crear.mutateAsync(leadId)
              navigate(`/proyectos/${id}`)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'No se pudo crear')
            }
          }}
        >
          <Plus className="h-4 w-4" /> Crear proyecto
        </Button>
      </div>
    )
  }

  const etapa = ETAPA_PROYECTO_META[p.etapa]
  const cobros = resumenCobros(p, hoy)
  const entrega = textoEntrega(p, hoy)
  const rec = progresoRecopilacion(p)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border p-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: etapa.color }} />
          <p className="t-card">{etapa.label}</p>
          {p.enPausa && <span className="badge-warn">En pausa</span>}
        </div>
        <p className="t-hint mt-0.5">{etapa.hint}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="t-eyebrow">Tipo</dt>
            <dd className="mt-0.5 text-fg">
              {p.tipo ? TIPO_PROYECTO_LABEL[p.tipo] ?? p.tipo : '—'}
              {(p.numPaginas || p.paginas.length) ? ` · ${p.numPaginas ?? p.paginas.length} pág.` : ''}
            </dd>
          </div>
          <div>
            <dt className="t-eyebrow">Plataforma</dt>
            <dd className="mt-0.5 text-fg">{p.plataforma ?? '—'}</dd>
          </div>
          <div>
            <dt className="t-eyebrow">Entrega</dt>
            <dd className={cn('mt-0.5', entrega?.cls)}>{entrega?.texto ?? '—'}</dd>
          </div>
          <div>
            <dt className="t-eyebrow">Recopilado</dt>
            <dd className="mt-0.5 text-fg">{rec.hechos}/{rec.total}</dd>
          </div>
        </dl>

        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">
              Cobrado {formatCurrency(cobros.cobrado, p.moneda)} de {formatCurrency(cobros.total, p.moneda)}
            </span>
            <span className="t-num">{cobros.porcentaje}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full', cobros.porcentaje === 100 ? 'bg-emerald-500' : 'bg-primary-400')} style={{ width: `${cobros.porcentaje}%` }} />
          </div>
        </div>
      </div>

      <Link to={`/proyectos/${p.id}`} className="btn btn-primary h-11 w-full gap-2 text-sm sm:h-9">
        Abrir proyecto <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  )
}
