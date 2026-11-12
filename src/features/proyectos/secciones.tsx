import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Copy, ExternalLink, Info, Minus, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { AutoTextarea } from '@/components/ui/AutoTextarea'
import { ResponsableSelect } from '@/components/ui/ResponsableSelect'
import { today } from '@/lib/followUps'
import { cn, copiarAlPortapapeles, formatCurrency } from '@/lib/utils'
import {
  ENLACES_PROYECTO, ESTADO_RECOPILACION, FUNCIONALIDADES, MONEDAS, PLATAFORMAS, TIPOS_PROYECTO,
  resumenCobros,
} from '@/lib/proyectos'
import type { AccesoProyecto, ItemRecopilacion, Proyecto, ProyectoPago } from '@/types'
import { useActualizarPago, useAgregarPago, useEliminarPago } from './useProyectos'

type Set = <K extends keyof Proyecto>(k: K, v: Proyecto[K]) => void

// ---------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------

function Campo({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="t-label mb-1.5">{label}</label>
      {children}
      {hint && <p className="t-hint mt-1">{hint}</p>}
    </div>
  )
}

function Bloque({ titulo, descripcion, accion, children }: { titulo: string; descripcion?: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="t-card">{titulo}</h3>
          {descripcion && <p className="t-hint mt-0.5">{descripcion}</p>}
        </div>
        {accion}
      </div>
      {children}
    </section>
  )
}

const numOrUndef = (v: string) => (v === '' ? undefined : Number(v))
const nuevoId = () => Math.random().toString(36).slice(2, 10)

/** Añadir un elemento escribiendo y pulsando Enter, que en el móvil es el botón «Ir». */
function Agregador({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const add = () => {
    if (!v.trim()) return
    onAdd(v.trim())
    setV('')
  }
  return (
    <div className="flex gap-2">
      <Input value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder={placeholder} />
      <Button type="button" variant="outline" size="icon" onClick={add} disabled={!v.trim()} aria-label="Añadir" className="h-11 w-11 sm:h-9 sm:w-9">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------
// Resumen
// ---------------------------------------------------------------

export function SeccionResumen({ p, set }: { p: Proyecto; set: Set }) {
  return (
    <div className="space-y-6">
      <Bloque titulo="Datos generales">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo label="Tipo de proyecto">
            <Select value={p.tipo ?? ''} onChange={(e) => set('tipo', e.target.value || undefined)}>
              <option value="">Sin definir</option>
              {TIPOS_PROYECTO.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </Campo>
          <Campo label="Plataforma" hint="Dónde se construye.">
            <Input
              list="plataformas"
              value={p.plataforma ?? ''}
              onChange={(e) => set('plataforma', e.target.value || undefined)}
              placeholder="Webflow, Next.js, WordPress…"
            />
            <datalist id="plataformas">{PLATAFORMAS.map((x) => <option key={x} value={x} />)}</datalist>
          </Campo>
          <Campo label="Responsable">
            <ResponsableSelect value={p.responsable ?? ''} onChange={(v) => set('responsable', v || undefined)} />
          </Campo>
        </div>
      </Bloque>

      <Bloque titulo="Precio">
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:max-w-sm">
          <Input
            type="number" inputMode="decimal" min={0}
            value={p.precio ?? ''}
            onChange={(e) => set('precio', numOrUndef(e.target.value))}
            placeholder="0"
          />
          <Select value={p.moneda} onChange={(e) => set('moneda', e.target.value)} className="w-24">
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
      </Bloque>

      <Bloque titulo="Fechas" descripcion="Si la entrega prevista se pasa, el proyecto se marca en rojo en el tablero.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo label="Inicio">
            <Input type="date" value={p.fechaInicio ?? ''} onChange={(e) => set('fechaInicio', e.target.value || undefined)} />
          </Campo>
          <Campo label="Entrega prevista">
            <Input type="date" value={p.fechaEntregaPrevista ?? ''} onChange={(e) => set('fechaEntregaPrevista', e.target.value || undefined)} />
          </Campo>
          <Campo label="Entregado el" hint="Se rellena solo al pasar a «Entregado».">
            <Input type="date" value={p.fechaEntregado ?? ''} onChange={(e) => set('fechaEntregado', e.target.value || undefined)} />
          </Campo>
        </div>
      </Bloque>
    </div>
  )
}

// ---------------------------------------------------------------
// Alcance
// ---------------------------------------------------------------

export function SeccionAlcance({ p, set }: { p: Proyecto; set: Set }) {
  const tipo = TIPOS_PROYECTO.find((t) => t.id === p.tipo)
  const tipicas = tipo?.paginas.filter((x) => !p.paginas.includes(x)) ?? []
  const extras = p.funcionalidades.filter((f) => !FUNCIONALIDADES.includes(f))

  const toggleFunc = (f: string) =>
    set('funcionalidades', p.funcionalidades.includes(f) ? p.funcionalidades.filter((x) => x !== f) : [...p.funcionalidades, f])

  return (
    <div className="space-y-7">
      <Bloque
        titulo="Páginas"
        descripcion="Cuáles lleva el proyecto. El número se calcula de la lista si no lo pones a mano."
        accion={tipicas.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => set('paginas', [...p.paginas, ...tipicas])}>
            <Sparkles className="h-3.5 w-3.5" /> Típicas de {tipo!.label.toLowerCase()}
          </Button>
        )}
      >
        <div className="flex items-center gap-3">
          <Campo label="Número de páginas" className="w-40">
            <Input
              type="number" inputMode="numeric" min={0}
              value={p.numPaginas ?? ''}
              onChange={(e) => set('numPaginas', numOrUndef(e.target.value))}
              placeholder={String(p.paginas.length || 0)}
            />
          </Campo>
          {p.numPaginas !== undefined && p.paginas.length > 0 && p.numPaginas !== p.paginas.length && (
            <p className="t-hint mt-6">La lista tiene {p.paginas.length}.</p>
          )}
        </div>
        {p.paginas.length > 0 && (
          <ol className="flex flex-wrap gap-2">
            {p.paginas.map((pag, i) => (
              <li key={`${pag}-${i}`} className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2/50 py-1 pl-2.5 pr-1 text-sm">
                <span className="text-[11px] text-muted">{i + 1}.</span> {pag}
                <button
                  onClick={() => set('paginas', p.paginas.filter((_, j) => j !== i))}
                  className="btn-ghost h-7 w-7 p-0 text-muted hover:text-red-500" aria-label={`Quitar ${pag}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}
        <div className="sm:max-w-md">
          <Agregador placeholder="Añadir página (ej. Servicios)" onAdd={(v) => set('paginas', [...p.paginas, v])} />
        </div>
      </Bloque>

      <Bloque titulo="Funcionalidades" descripcion="Toca para marcar lo que incluye.">
        <div className="flex flex-wrap gap-2">
          {[...FUNCIONALIDADES, ...extras].map((f) => {
            const on = p.funcionalidades.includes(f)
            return (
              <button
                key={f}
                onClick={() => toggleFunc(f)}
                className={cn(
                  'h-9 rounded-full border px-3 text-xs font-medium transition sm:h-8',
                  on ? 'border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-400/15 dark:text-primary-300' : 'border-border text-muted hover:text-fg',
                )}
              >
                {on && '✓ '}{f}
              </button>
            )
          })}
        </div>
        <div className="sm:max-w-md">
          <Agregador placeholder="Otra funcionalidad…" onAdd={(v) => !p.funcionalidades.includes(v) && set('funcionalidades', [...p.funcionalidades, v])} />
        </div>
      </Bloque>

      <Bloque titulo="Qué se va a hacer" descripcion="El alcance acordado, con las palabras con que se lo explicarías al cliente.">
        <AutoTextarea
          className="input min-h-[110px]"
          value={p.alcance ?? ''}
          onChange={(e) => set('alcance', e.target.value)}
          placeholder="Ej. Web de 5 páginas en Webflow, adaptada a móvil, con formulario conectado al correo, botón de WhatsApp y SEO básico. Incluye redacción de textos de la página de inicio."
          maxHeight={480}
        />
      </Bloque>

      <Bloque titulo="Fuera del alcance" descripcion="Lo que NO entra. Es lo que evita discusiones cuando piden «una cosita más».">
        <AutoTextarea
          className="input min-h-[90px]"
          value={p.fueraAlcance ?? ''}
          onChange={(e) => set('fueraAlcance', e.target.value)}
          placeholder="Ej. Fotografía, redacción del blog, campañas de anuncios, mantenimiento después del primer mes."
          maxHeight={400}
        />
      </Bloque>

      <Bloque titulo="Rondas de revisión" descripcion="Cuántas incluye el precio. Al pasarse, se cobra aparte.">
        <div className="flex flex-wrap items-end gap-6">
          <Campo label="Incluidas" className="w-28">
            <Input type="number" min={0} inputMode="numeric" value={p.rondasIncluidas} onChange={(e) => set('rondasIncluidas', Math.max(0, Number(e.target.value) || 0))} />
          </Campo>
          <div>
            <p className="t-label mb-1.5">Usadas</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => set('rondasUsadas', Math.max(0, p.rondasUsadas - 1))} aria-label="Una menos" className="h-11 w-11 sm:h-9 sm:w-9">
                <Minus className="h-4 w-4" />
              </Button>
              <span className={cn('t-num w-14 text-center text-lg', p.rondasUsadas > p.rondasIncluidas && 'text-red-600 dark:text-red-400')}>
                {p.rondasUsadas}/{p.rondasIncluidas}
              </span>
              <Button variant="outline" size="icon" onClick={() => set('rondasUsadas', p.rondasUsadas + 1)} aria-label="Una más" className="h-11 w-11 sm:h-9 sm:w-9">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Bloque>
    </div>
  )
}

// ---------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------

const METODOS = ['Transferencia', 'Efectivo', 'PayPal', 'Tarjeta / Stripe', 'Zelle', 'Otro']

/** Planes de pago frecuentes, en porcentajes del precio. */
const PLANES: { label: string; partes: { concepto: string; pct: number }[] }[] = [
  { label: '50 / 50', partes: [{ concepto: 'Anticipo (50 %)', pct: 50 }, { concepto: 'Entrega (50 %)', pct: 50 }] },
  { label: '40 / 30 / 30', partes: [{ concepto: 'Anticipo (40 %)', pct: 40 }, { concepto: 'Aprobación del diseño (30 %)', pct: 30 }, { concepto: 'Entrega (30 %)', pct: 30 }] },
  { label: '100 %', partes: [{ concepto: 'Pago único', pct: 100 }] },
]

export function SeccionCobros({ proyecto, precio, moneda, set }: { proyecto: Proyecto; precio?: number; moneda: string; set: Set }) {
  const agregar = useAgregarPago()
  const eliminar = useEliminarPago()
  const hoy = today()
  const pagos = proyecto.pagos
  const r = resumenCobros({ precio, pagos }, hoy)
  const plan = pagos.reduce((s, g) => s + g.monto, 0)
  const hayCobrados = pagos.some((g) => g.cobradoEn)

  const aplicarPlan = async (partes: (typeof PLANES)[number]['partes']) => {
    if (!precio) {
      toast.error('Pon primero el precio del proyecto')
      return
    }
    try {
      await Promise.all(pagos.map((g) => eliminar.mutateAsync(g.id)))
      let acumulado = 0
      for (const [i, parte] of partes.entries()) {
        // El último se lleva el redondeo, para que la suma dé el precio exacto.
        const monto = i === partes.length - 1 ? precio - acumulado : Math.round(precio * parte.pct) / 100
        acumulado += monto
        await agregar.mutateAsync({
          proyectoId: proyecto.id, concepto: parte.concepto, monto, orden: i + 1,
          fechaPrevista: i === 0 ? hoy : undefined,
        })
      }
      toast.success('Plan de pagos aplicado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aplicar el plan')
    }
  }

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="rounded-2xl border border-border p-4">
        <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
          <div>
            <p className="t-eyebrow">Total</p>
            <p className="t-num mt-1 text-lg sm:text-xl">{formatCurrency(r.total, moneda)}</p>
          </div>
          <div>
            <p className="t-eyebrow">Cobrado</p>
            <p className="t-num mt-1 text-lg text-emerald-600 dark:text-emerald-400 sm:text-xl">{formatCurrency(r.cobrado, moneda)}</p>
          </div>
          <div>
            <p className="t-eyebrow">Pendiente</p>
            <p className="t-num mt-1 text-lg sm:text-xl">{formatCurrency(r.pendiente, moneda)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div className={cn('h-full rounded-full transition-all', r.porcentaje === 100 ? 'bg-emerald-500' : 'bg-primary-400')} style={{ width: `${r.porcentaje}%` }} />
          </div>
          <span className="t-num text-sm">{r.porcentaje}%</span>
        </div>
        {precio !== undefined && pagos.length > 0 && Math.abs(plan - precio) > 0.5 && (
          <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Los pagos suman {formatCurrency(plan, moneda)} y el precio es {formatCurrency(precio, moneda)}.
          </p>
        )}
      </div>

      <Bloque titulo="Precio del proyecto">
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:max-w-sm">
          <Input type="number" inputMode="decimal" min={0} value={precio ?? ''} onChange={(e) => set('precio', numOrUndef(e.target.value))} placeholder="0" />
          <Select value={moneda} onChange={(e) => set('moneda', e.target.value)} className="w-24">
            {MONEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>
        <p className="t-hint">El precio se guarda con la barra de abajo; los pagos se guardan solos.</p>
      </Bloque>

      <Bloque
        titulo="Plan de pagos"
        descripcion="Marca cada pago cuando lo cobres."
        accion={!hayCobrados && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {PLANES.map((pl) => (
              <button key={pl.label} onClick={() => aplicarPlan(pl.partes)} className="h-8 rounded-full bg-surface-2 px-2.5 text-[11px] font-medium text-muted hover:text-fg">
                {pl.label}
              </button>
            ))}
          </div>
        )}
      >
        <div className="space-y-2">
          {pagos.map((g) => <FilaPago key={g.id} pago={g} moneda={moneda} total={r.total} />)}
          {!pagos.length && <p className="rounded-xl border border-dashed border-border py-6 text-center text-sm text-muted">Sin pagos. Elige un plan arriba o añade uno.</p>}
        </div>
        <Button
          size="sm" variant="outline"
          onClick={() => agregar.mutate({
            proyectoId: proyecto.id, concepto: `Pago ${pagos.length + 1}`, monto: Math.max(0, r.total - plan),
            orden: (pagos.at(-1)?.orden ?? 0) + 1,
          })}
          disabled={agregar.isPending}
        >
          <Plus className="h-4 w-4" /> Añadir pago
        </Button>
      </Bloque>
    </div>
  )
}

/** Porcentaje legible: 30, 33.3, nunca 33.333333. */
const pctDe = (monto: number, total: number) => (total > 0 ? String(Math.round((monto / total) * 1000) / 10) : '')

/**
 * Cada pago se guarda al salir del campo: no hay barra que recordar.
 * Monto y porcentaje van atados al total del proyecto: se escribe el que se
 * sepa (30 dólares, o el 60 %) y el otro sale solo.
 */
function FilaPago({ pago, moneda, total }: { pago: ProyectoPago; moneda: string; total: number }) {
  const actualizar = useActualizarPago()
  const eliminar = useEliminarPago()
  const [concepto, setConcepto] = useState(pago.concepto)
  const [monto, setMonto] = useState(String(pago.monto))
  const [pct, setPct] = useState(pctDe(pago.monto, total))

  useEffect(() => { setConcepto(pago.concepto); setMonto(String(pago.monto)); setPct(pctDe(pago.monto, total)) }, [pago.concepto, pago.monto, total])

  const cambiarMonto = (v: string) => {
    setMonto(v)
    setPct(v === '' ? '' : pctDe(Number(v) || 0, total))
  }
  const cambiarPct = (v: string) => {
    setPct(v)
    if (total > 0 && v !== '') setMonto(String(Math.round(total * (Number(v) || 0)) / 100))
  }
  const guardarMonto = () => {
    const n = Math.max(0, Number(monto) || 0)
    if (n !== pago.monto) guardar({ monto: n })
  }

  const guardar = (patch: Partial<ProyectoPago>) =>
    actualizar.mutate({ id: pago.id, patch }, { onError: () => toast.error('No se pudo guardar el pago') })

  const cobrado = !!pago.cobradoEn
  const vencido = !cobrado && pago.fechaPrevista && pago.fechaPrevista < today()

  return (
    <div className={cn(
      'rounded-xl border p-3 transition',
      cobrado ? 'border-emerald-300/60 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/5' : vencido ? 'border-red-300/60 dark:border-red-500/30' : 'border-border',
    )}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => guardar({ cobradoEn: cobrado ? undefined : today() })}
          className={cn(
            'mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition sm:mt-1',
            cobrado ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border hover:border-emerald-500',
          )}
          aria-label={cobrado ? 'Marcar como no cobrado' : 'Marcar como cobrado'}
          title={cobrado ? 'Cobrado' : 'Marcar como cobrado'}
        >
          {cobrado && <span className="text-xs">✓</span>}
        </button>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_8rem_6rem]">
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              onBlur={() => concepto.trim() && concepto !== pago.concepto && guardar({ concepto: concepto.trim() })}
              aria-label="Concepto"
              className="col-span-2 sm:col-span-1"
            />
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">{moneda}</span>
              <Input
                type="number" inputMode="decimal" min={0} value={monto}
                onChange={(e) => cambiarMonto(e.target.value)}
                onBlur={guardarMonto}
                aria-label={`Monto en ${moneda}`}
                className="pl-12 text-right tabular-nums"
              />
            </div>
            <div className="relative">
              <Input
                type="number" inputMode="decimal" min={0} max={100} step="any" value={pct}
                onChange={(e) => cambiarPct(e.target.value)}
                onBlur={guardarMonto}
                disabled={total <= 0}
                placeholder="—"
                aria-label="Porcentaje del total"
                title={total > 0 ? 'Porcentaje del precio del proyecto' : 'Pon el precio del proyecto para usar porcentajes'}
                className="pr-7 text-right tabular-nums"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">%</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto]">
            {cobrado ? (
              <label className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Cobrado el
                <Input type="date" value={pago.cobradoEn ?? ''} onChange={(e) => e.target.value && guardar({ cobradoEn: e.target.value })} className="mt-0.5" />
              </label>
            ) : (
              <label className={cn('text-[11px]', vencido ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted')}>
                {vencido ? 'Vencido · previsto el' : 'Previsto para'}
                <Input type="date" value={pago.fechaPrevista ?? ''} onChange={(e) => guardar({ fechaPrevista: e.target.value || undefined })} className="mt-0.5" />
              </label>
            )}
            <label className="text-[11px] text-muted">
              Método
              <Select value={pago.metodo ?? ''} onChange={(e) => guardar({ metodo: e.target.value || undefined })} className="mt-0.5">
                <option value="">—</option>
                {METODOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </Select>
            </label>
            <div className="col-span-2 flex items-end justify-end sm:col-span-1">
              <Button
                variant="ghost" size="icon" className="text-muted hover:text-red-500"
                onClick={() => eliminar.mutate(pago.id)} aria-label="Eliminar pago" title="Eliminar pago"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Recopilación
// ---------------------------------------------------------------

function PildoraEstado({ estado, onClick }: { estado: ItemRecopilacion['estado']; onClick: () => void }) {
  const meta = ESTADO_RECOPILACION[estado]
  return (
    <button onClick={onClick} className={cn(meta.cls, 'h-7 shrink-0 cursor-pointer px-2.5')} title="Toca para cambiar">
      {meta.label}
    </button>
  )
}

/** Mensaje listo para mandar por WhatsApp o correo con lo que falta. */
function mensajeFaltantes(p: Proyecto): string {
  const faltan = [...p.checklist, ...p.accesos].filter((i) => i.estado !== 'recibido').map((i) => `• ${i.label}`)
  if (!faltan.length) return ''
  return `Hola, para avanzar con tu proyecto necesitamos lo siguiente:\n\n${faltan.join('\n')}\n\nPuedes enviármelo por aquí cuando lo tengas. ¡Gracias!`
}

export function SeccionRecopilacion({ p, set }: { p: Proyecto; set: Set }) {
  const ciclo = <T extends ItemRecopilacion>(lista: T[], id: string): T[] =>
    lista.map((i) => (i.id === id ? { ...i, estado: ESTADO_RECOPILACION[i.estado].siguiente } : i))

  const copiar = async () => {
    const texto = mensajeFaltantes(p)
    if (!texto) return toast.success('No falta nada por recibir')
    if (await copiarAlPortapapeles(texto)) toast.success('Mensaje copiado: pégalo en WhatsApp o en un correo')
    else toast.error('No se pudo copiar')
  }

  return (
    <div className="space-y-7">
      <Bloque
        titulo="Material del cliente"
        descripcion="Toca el estado para pasar de Pendiente → Pedido → Recibido."
        accion={<Button size="sm" variant="outline" onClick={copiar}><Copy className="h-3.5 w-3.5" /> Copiar lo que falta</Button>}
      >
        <ul className="divide-y divide-border rounded-xl border border-border">
          {p.checklist.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-3 py-2">
              <span className={cn('min-w-0 flex-1 text-sm', i.estado === 'recibido' && 'text-muted line-through')}>{i.label}</span>
              <PildoraEstado estado={i.estado} onClick={() => set('checklist', ciclo(p.checklist, i.id))} />
              <button onClick={() => set('checklist', p.checklist.filter((x) => x.id !== i.id))} className="btn-ghost h-8 w-8 p-0 text-muted hover:text-red-500" aria-label={`Quitar ${i.label}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {!p.checklist.length && <li className="px-3 py-4 text-center text-sm text-muted">Sin elementos</li>}
        </ul>
        <div className="sm:max-w-md">
          <Agregador placeholder="Añadir (ej. Vídeo del local)" onAdd={(v) => set('checklist', [...p.checklist, { id: nuevoId(), label: v, estado: 'pendiente' }])} />
        </div>
      </Bloque>

      <Bloque titulo="Accesos" descripcion="Qué acceso hace falta y dónde está. Las contraseñas no se guardan aquí: usa un gestor de contraseñas.">
        <ul className="space-y-2">
          {p.accesos.map((a) => (
            <li key={a.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center gap-3">
                <span className={cn('min-w-0 flex-1 text-sm font-medium', a.estado === 'recibido' && 'text-muted')}>{a.label}</span>
                <PildoraEstado estado={a.estado} onClick={() => set('accesos', ciclo(p.accesos, a.id))} />
                <button onClick={() => set('accesos', p.accesos.filter((x) => x.id !== a.id))} className="btn-ghost h-8 w-8 p-0 text-muted hover:text-red-500" aria-label={`Quitar ${a.label}`}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input
                value={a.donde}
                onChange={(e) => set('accesos', p.accesos.map((x) => (x.id === a.id ? { ...x, donde: e.target.value } : x)))}
                placeholder="Dónde está (ej. GoDaddy, cuenta del cliente; nos invitó como colaborador)"
                className="mt-2"
              />
            </li>
          ))}
        </ul>
        <div className="sm:max-w-md">
          <Agregador
            placeholder="Añadir acceso (ej. Google Business)"
            onAdd={(v) => set('accesos', [...p.accesos, { id: nuevoId(), label: v, estado: 'pendiente', donde: '' } as AccesoProyecto])}
          />
        </div>
      </Bloque>
    </div>
  )
}

// ---------------------------------------------------------------
// Enlaces
// ---------------------------------------------------------------

function AbrirEnlace({ url }: { url?: string }) {
  if (!url?.trim()) return null
  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn btn-outline h-11 w-11 shrink-0 p-0 sm:h-9 sm:w-9" title="Abrir" aria-label="Abrir enlace">
      <ExternalLink className="h-4 w-4" />
    </a>
  )
}

export function SeccionEnlaces({ p, set }: { p: Proyecto; set: Set }) {
  const [url, setUrl] = useState('')
  const [nota, setNota] = useState('')

  const addRef = () => {
    if (!url.trim()) return
    set('referencias', [...p.referencias, { url: url.trim(), nota: nota.trim() }])
    setUrl('')
    setNota('')
  }

  return (
    <div className="space-y-7">
      <Bloque titulo="Enlaces del proyecto">
        <div className="space-y-3">
          {ENLACES_PROYECTO.map((e) => (
            <Campo key={e.key} label={e.label}>
              <div className="flex gap-2">
                <Input
                  type="url" inputMode="url"
                  value={p.enlaces[e.key] ?? ''}
                  onChange={(ev) => set('enlaces', { ...p.enlaces, [e.key]: ev.target.value || undefined })}
                  placeholder={e.placeholder}
                />
                <AbrirEnlace url={p.enlaces[e.key]} />
              </div>
            </Campo>
          ))}
        </div>
      </Bloque>

      <Bloque titulo="Referencias" descripcion="Webs o diseños que le gustan al cliente, y qué le gusta de cada una.">
        {p.referencias.length > 0 && (
          <ul className="space-y-2">
            {p.referencias.map((r, i) => (
              <li key={`${r.url}-${i}`} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <div className="min-w-0 flex-1">
                  <a
                    href={/^https?:\/\//i.test(r.url) ? r.url : `https://${r.url}`}
                    target="_blank" rel="noreferrer"
                    className="block truncate text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    {r.url.replace(/^https?:\/\/(www\.)?/i, '')}
                  </a>
                  {r.nota && <p className="t-hint mt-0.5">{r.nota}</p>}
                </div>
                <button onClick={() => set('referencias', p.referencias.filter((_, j) => j !== i))} className="btn-ghost h-8 w-8 shrink-0 p-0 text-muted hover:text-red-500" aria-label="Quitar referencia">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://web-de-referencia.com" />
          <Input value={nota} onChange={(e) => setNota(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRef()} placeholder="Qué le gusta (opcional)" />
          <Button variant="outline" onClick={addRef} disabled={!url.trim()}><Plus className="h-4 w-4" /> Añadir</Button>
        </div>
      </Bloque>
    </div>
  )
}

// ---------------------------------------------------------------
// Notas
// ---------------------------------------------------------------

export function SeccionNotas({ p, set }: { p: Proyecto; set: Set }) {
  return (
    <Bloque titulo="Notas" descripcion="Lo que se va hablando con el cliente, acuerdos, cambios pedidos…">
      <AutoTextarea
        className="input min-h-[220px]"
        value={p.notas ?? ''}
        onChange={(e) => set('notas', e.target.value)}
        placeholder="12-nov · Reunión de arranque. Quiere tonos tierra, le gusta la web de…"
        maxHeight={720}
      />
    </Bloque>
  )
}
