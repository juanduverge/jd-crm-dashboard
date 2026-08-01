import { useState } from 'react'
import toast from 'react-hot-toast'
import { Check, Minus, Pencil, Plus, Trash2, Layers } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { cn } from '@/lib/utils'
import { useActualizarMeta, useEliminarMeta, useRegistrarAvance } from '@/hooks/useData'
import { fmtNum, progreso, tonoProgreso } from './goalMeta'
import type { Goal } from '@/types'

/**
 * Tarjeta de meta con barra de progreso.
 *
 * Los botones +/− sólo aparecen en metas HOJA. Una meta con hijas muestra su
 * valor como suma (la BD lo garantiza con un trigger): para moverlo hay que
 * bajar al nivel de abajo. Es la regla de la cascada, no una limitación de la
 * pantalla.
 */
export function GoalCard({
  goal,
  subtitulo,
  compacto = false,
  eliminable,
}: {
  goal: Goal
  subtitulo?: string
  compacto?: boolean
  eliminable?: boolean
}) {
  const avance = useRegistrarAvance()
  const eliminar = useEliminarMeta()
  const [editando, setEditando] = useState(false)
  const [borrando, setBorrando] = useState(false)

  const pct = progreso(goal)
  const esToggle = goal.tipo === 'toggle'
  const hecho = esToggle ? goal.valorActual >= 1 : pct >= 100

  const sumar = (delta: number) => {
    avance.mutate({ id: goal.id, delta }, {
      onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo registrar el avance'),
    })
  }

  return (
    <div className={cn('card flex flex-col gap-3', compacto ? 'p-3' : 'p-4')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-semibold text-fg', compacto ? 'text-sm' : 'text-sm')} title={goal.nombre}>
            {goal.nombre}
          </p>
          {(subtitulo || goal.tieneHijas) && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              {goal.tieneHijas && <Layers className="h-3 w-3 shrink-0" />}
              {subtitulo}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <button
            onClick={() => setEditando(true)}
            className="btn-ghost h-7 w-7 p-0 text-muted hover:text-fg"
            title="Editar meta"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {eliminable && (
            <button
              onClick={() => setBorrando(true)}
              className="btn-ghost h-7 w-7 p-0 text-red-500 hover:bg-red-500/10"
              title="Eliminar meta y su cascada"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {esToggle ? (
        <button
          onClick={() => sumar(hecho ? -1 : 1)}
          disabled={goal.tieneHijas || avance.isPending}
          className={cn(
            'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition',
            hecho
              ? 'border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400'
              : 'border-border text-muted hover:text-fg',
          )}
        >
          <span className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border',
            hecho ? 'border-green-500 bg-green-500 text-white' : 'border-border',
          )}>
            {hecho && <Check className="h-3 w-3" />}
          </span>
          {hecho ? 'Hecho' : 'Marcar como hecho'}
        </button>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold text-fg">{fmtNum(goal.valorActual)}</span>
            <span className="text-sm text-muted">/ {fmtNum(goal.target)}</span>
            {goal.unidad && <span className="text-xs text-muted">{goal.unidad}</span>}
            <span className={cn('ml-auto text-xs font-semibold', hecho ? 'text-green-600 dark:text-green-400' : 'text-muted')}>
              {pct}%
            </span>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full transition-all', tonoProgreso(pct))} style={{ width: `${pct}%` }} />
          </div>

          {goal.tieneHijas ? (
            <p className="text-[11px] text-muted">
              Suma automática de sus metas {goal.periodo === 'mes' ? 'semanales' : 'diarias'}
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => sumar(-1)}
                disabled={avance.isPending || goal.valorActual <= 0}
                className="btn-ghost h-8 w-8 rounded-lg border border-border p-0 disabled:opacity-40"
                title="Restar 1"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => sumar(1)}
                disabled={avance.isPending}
                className="btn-ghost h-8 w-8 rounded-lg border border-border p-0"
                title="Sumar 1"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <AvanceLibre onSumar={sumar} disabled={avance.isPending} />
            </div>
          )}
        </>
      )}

      <EditarMetaModal goal={goal} open={editando} onClose={() => setEditando(false)} />
      <ConfirmDeleteModal
        open={borrando}
        onClose={() => setBorrando(false)}
        title="Eliminar meta"
        itemLabel={goal.nombre}
        onConfirm={async () => {
          await eliminar.mutateAsync(goal.id)
          toast.success('Meta eliminada')
          setBorrando(false)
        }}
      />
    </div>
  )
}

/** Campo para sumar de golpe (ej. "+12 leads" tras una tanda de prospección). */
function AvanceLibre({ onSumar, disabled }: { onSumar: (n: number) => void; disabled?: boolean }) {
  const [valor, setValor] = useState('')

  const aplicar = () => {
    const n = Number(valor)
    if (!n || Number.isNaN(n)) return
    onSumar(n)
    setValor('')
  }

  return (
    <div className="ml-auto flex items-center gap-1">
      <Input
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }}
        placeholder="+N"
        inputMode="decimal"
        className="h-8 w-16 px-2 text-center text-xs"
      />
      <Button size="sm" variant="outline" onClick={aplicar} disabled={disabled || !valor}>
        Sumar
      </Button>
    </div>
  )
}

function EditarMetaModal({ goal, open, onClose }: { goal: Goal; open: boolean; onClose: () => void }) {
  const actualizar = useActualizarMeta()
  const [nombre, setNombre] = useState(goal.nombre)
  const [target, setTarget] = useState(String(goal.target))
  const [unidad, setUnidad] = useState(goal.unidad ?? '')

  const targetCambia = Number(target) !== goal.target

  const guardar = () => {
    const t = Number(target)
    if (!nombre.trim()) { toast.error('Escribe un nombre'); return }
    if (goal.tipo === 'contador' && (!t || t <= 0)) { toast.error('El objetivo debe ser mayor que 0'); return }

    actualizar.mutate(
      {
        id: goal.id,
        nombre: nombre.trim(),
        target: goal.tipo === 'toggle' ? 1 : t,
        unidad,
        // Al cambiar el objetivo de una meta con hijas, se reparte de nuevo
        // entre ellas sin perder el progreso ya registrado.
        redistribuir: goal.tieneHijas && targetCambia,
      },
      {
        onSuccess: () => {
          toast.success(goal.tieneHijas && targetCambia ? 'Meta actualizada y repartida' : 'Meta actualizada')
          onClose()
        },
        onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'No se pudo actualizar'),
      },
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar meta">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">Nombre</label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
        </div>
        {goal.tipo === 'contador' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Objetivo</label>
              <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Unidad</label>
              <Input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="leads, horas…" />
            </div>
          </div>
        )}
        {goal.tieneHijas && targetCambia && (
          <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
            El nuevo objetivo se repartirá entre sus metas
            {goal.periodo === 'mes' ? ' semanales y diarias' : ' diarias'}. El progreso ya registrado no se pierde.
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={actualizar.isPending}>
            {actualizar.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
