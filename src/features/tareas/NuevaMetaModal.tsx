import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Select } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { useCrearMetaMensual, useCrearMetaSuelta } from '@/hooks/useData'
import { DIAS_SEMANA, fmtMes, fmtNum } from './goalMeta'
import type { GoalTipo } from '@/types'

/**
 * Alta de meta mensual (el caso normal: crea la cascada completa) o de meta
 * suelta de semana/día, para lo puntual que no cuelga de un objetivo del mes.
 */
export function NuevaMetaModal({
  open,
  onClose,
  mes,
  periodo = 'mes',
  rango,
}: {
  open: boolean
  onClose: () => void
  /** Mes al que pertenece la meta (cualquier día de ese mes). */
  mes: Date
  /** 'mes' crea con cascada; 'semana'/'dia' crean una meta suelta en `rango`. */
  periodo?: 'mes' | 'semana' | 'dia'
  rango?: { desde: string; hasta: string }
}) {
  const crearMensual = useCrearMetaMensual()
  const crearSuelta = useCrearMetaSuelta()

  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<GoalTipo>('contador')
  const [target, setTarget] = useState('')
  const [unidad, setUnidad] = useState('')
  const [conCascada, setConCascada] = useState(true)
  const [dias, setDias] = useState<number[]>([1, 2, 3, 4, 5])

  const pendiente = crearMensual.isPending || crearSuelta.isPending
  const targetNum = Number(target)
  const esMensual = periodo === 'mes'

  // Vista previa del reparto: lo que la BD va a crear, calculado igual que
  // ella (proporcional a días laborables) pero sólo para enseñarlo.
  const semanasAprox = 4.33
  const previaSemana = tipo === 'contador' && targetNum > 0 ? targetNum / semanasAprox : 0
  const previaDia = previaSemana && dias.length ? previaSemana / dias.length : 0

  const reset = () => {
    setNombre(''); setTarget(''); setUnidad(''); setTipo('contador')
    setConCascada(true); setDias([1, 2, 3, 4, 5])
  }

  const guardar = () => {
    if (!nombre.trim()) { toast.error('Escribe un nombre para la meta'); return }
    if (tipo === 'contador' && (!targetNum || targetNum <= 0)) {
      toast.error('El objetivo debe ser un número mayor que 0'); return
    }
    if (esMensual && conCascada && tipo === 'contador' && dias.length === 0) {
      toast.error('Elige al menos un día laborable'); return
    }

    const ok = () => { toast.success('Meta creada'); reset(); onClose() }
    const fail = (e: unknown) =>
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la meta')

    if (esMensual) {
      crearMensual.mutate(
        {
          nombre: nombre.trim(),
          tipo,
          target: targetNum,
          unidad: unidad.trim() || undefined,
          mes: `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-01`,
          generarCascada: conCascada,
          diasLaborables: dias,
        },
        { onSuccess: ok, onError: fail },
      )
    } else {
      if (!rango) { toast.error('Falta el rango de fechas'); return }
      crearSuelta.mutate(
        {
          nombre: nombre.trim(),
          periodo,
          tipo,
          target: targetNum,
          unidad: unidad.trim() || undefined,
          fechaInicio: rango.desde,
          fechaFin: rango.hasta,
        },
        { onSuccess: ok, onError: fail },
      )
    }
  }

  const titulo = esMensual
    ? `Nueva meta de ${fmtMes(mes)}`
    : periodo === 'semana' ? 'Nueva meta suelta de la semana' : 'Nueva meta suelta del día'

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted">¿Qué quieres conseguir?</label>
          <Input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Conseguir leads nuevos"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted">Tipo</label>
            <Select value={tipo} onChange={(e) => setTipo(e.target.value as GoalTipo)}>
              <option value="contador">Contador (número con objetivo)</option>
              <option value="toggle">Sí / no (se hace o no se hace)</option>
            </Select>
          </div>
          {tipo === 'contador' && (
            <div>
              <label className="mb-1 block text-xs text-muted">Objetivo</label>
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="400"
                inputMode="decimal"
              />
            </div>
          )}
        </div>

        {tipo === 'contador' && (
          <div>
            <label className="mb-1 block text-xs text-muted">Unidad</label>
            <Input
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              placeholder="leads, reuniones, horas…"
            />
          </div>
        )}

        {esMensual && tipo === 'contador' && (
          <>
            <div className="space-y-2 rounded-xl border border-border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={conCascada}
                  onChange={(e) => setConCascada(e.target.checked)}
                  className="h-4 w-4 accent-primary-500"
                />
                Repartir en metas semanales y diarias
              </label>
              <p className="text-xs text-muted">
                Sin esto sólo se crea la meta del mes y el avance se registra directo en ella.
              </p>

              {conCascada && (
                <>
                  <p className="pt-1 text-xs text-muted">Días laborables</p>
                  <div className="flex gap-1">
                    {DIAS_SEMANA.map((d) => {
                      const on = dias.includes(d.iso)
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          title={d.label}
                          onClick={() =>
                            setDias((prev) =>
                              on ? prev.filter((x) => x !== d.iso) : [...prev, d.iso].sort())
                          }
                          className={cn(
                            'h-8 w-8 rounded-lg border text-xs font-medium transition',
                            on
                              ? 'border-primary-500 bg-primary-500 text-white'
                              : 'border-border text-muted hover:text-fg',
                          )}
                        >
                          {d.corto}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {conCascada && targetNum > 0 && (
              <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
                Aproximadamente <strong className="text-fg">{fmtNum(Math.round(previaSemana))}</strong> por semana
                y <strong className="text-fg">{fmtNum(Math.round(previaDia))}</strong> por día laborable.
                El reparto exacto lo calcula el CRM según los días de cada semana del mes.
              </p>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={pendiente}>
            {pendiente ? 'Creando…' : 'Crear meta'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
