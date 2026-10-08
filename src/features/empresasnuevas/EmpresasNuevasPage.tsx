import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Building2, Download, Globe, Mail, Radar, RefreshCw, Search, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  ESTADOS_REGISTRO, buscarEmpresasNuevas, importarEmpresasNuevas, pareceVehiculo,
  type EmpresaNueva, type EstadoRegistro,
} from '@/lib/registrosNuevos'
import { comprobarVariasEmpresas, type DominiosEmpresa } from '@/lib/dominioEmpresa'
import { calcularPotencial, type Potencial } from '@/lib/potencialEmpresa'
import { EmpresaFicha, claseNota, haceCuanto } from './EmpresaFicha'

const DIAS = [1, 3, 7, 14, 30]
const POR_PAGINA = 60
/** Cuántas empresas se comprueban solas por carga; el resto, al pedirlo. */
const TOPE_AUTOMATICO = 120

type Vista = 'recomendadas' | 'sin_web' | 'sin_identificar' | 'todas'

const VISTAS: { id: Vista; texto: string }[] = [
  { id: 'recomendadas', texto: 'Recomendadas' },
  { id: 'sin_web', texto: 'Sin web' },
  { id: 'sin_identificar', texto: 'Sin identificar' },
  { id: 'todas', texto: 'Todas' },
]

export function EmpresasNuevasPage() {
  const qc = useQueryClient()
  const [dias, setDias] = useState(3)
  const [estado, setEstado] = useState<'todos' | EstadoRegistro>('todos')
  const [nicho, setNicho] = useState('todos')
  const [texto, setTexto] = useState('')
  const [dia, setDia] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('recomendadas')
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  // `null` = se intentó y no hay dominio que deducir; sin entrada = sin comprobar.
  const [dominios, setDominios] = useState<Map<string, DominiosEmpresa | null>>(new Map())
  const [enVuelo, setEnVuelo] = useState(0)
  const pedidas = useRef(new Set<string>())
  const automaticas = useRef(0)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['empresas-nuevas', dias],
    queryFn: () => buscarEmpresasNuevas(dias),
    staleTime: 5 * 60_000,
  })

  useEffect(() => { automaticas.current = 0 }, [data])

  const potencial = useMemo(() => {
    const m = new Map<string, Potencial>()
    for (const e of data?.empresas ?? []) m.set(e.id, calcularPotencial(e, dominios.get(e.id)))
    return m
  }, [data, dominios])

  const nota = useCallback((e: EmpresaNueva) => potencial.get(e.id)?.nota ?? 0, [potencial])

  // Filtros de la barra, sin la vista ni el día (que llevan su propio recuento).
  const base = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return (data?.empresas ?? []).filter((e) =>
      (estado === 'todos' || e.estado === estado)
      && (nicho === 'todos' || e.actividad?.nicho === nicho)
      && (!t || `${e.nombre} ${e.ciudad} ${e.categoria ?? ''} ${e.actividad?.nombre ?? ''}`.toLowerCase().includes(t)),
    )
  }, [data, estado, nicho, texto])

  const enVista = useCallback((e: EmpresaNueva, v: Vista) => {
    if (v === 'todas') return true
    if (pareceVehiculo(e)) return false
    if (v === 'sin_identificar') return !e.actividad
    if (v === 'sin_web') {
      const d = dominios.get(e.id)
      return !!d && d.resumen !== 'ocupado'
    }
    return !!e.actividad && nota(e) >= 6
  }, [dominios, nota])

  const cuentas = useMemo(() => {
    const c: Record<Vista, number> = { recomendadas: 0, sin_web: 0, sin_identificar: 0, todas: base.length }
    for (const e of base) {
      if (enVista(e, 'recomendadas')) c.recomendadas++
      if (enVista(e, 'sin_web')) c.sin_web++
      if (enVista(e, 'sin_identificar')) c.sin_identificar++
    }
    return c
  }, [base, enVista])

  const deVista = useMemo(() => base.filter((e) => enVista(e, vista)), [base, enVista, vista])

  const lista = useMemo(
    () => deVista
      .filter((e) => !dia || e.fecha === dia)
      .sort((a, b) => nota(b) - nota(a) || b.fecha.localeCompare(a.fecha)),
    [deVista, dia, nota],
  )

  const porDia = useMemo(() => {
    const c = new Map<string, number>()
    for (const e of deVista) c.set(e.fecha, (c.get(e.fecha) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [deVista])

  const nichos = useMemo(() => {
    const c = new Map<string, { nombre: string; n: number }>()
    for (const e of data?.empresas ?? []) {
      if (!e.actividad || (estado !== 'todos' && e.estado !== estado)) continue
      const x = c.get(e.actividad.nicho) ?? { nombre: e.actividad.nombre, n: 0 }
      x.n++
      c.set(e.actividad.nicho, x)
    }
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [data, estado])

  const comprobar = useCallback(async (empresas: EmpresaNueva[]) => {
    const nuevas = empresas.filter((e) => !pedidas.current.has(e.id))
    if (nuevas.length === 0) return
    for (const e of nuevas) pedidas.current.add(e.id)
    setEnVuelo((n) => n + nuevas.length)
    await comprobarVariasEmpresas(nuevas, (id, r) => {
      setDominios((prev) => new Map(prev).set(id, r))
      setEnVuelo((n) => n - 1)
    })
  }, [])

  // Las primeras de la lista se comprueban solas: al entrar ya ves cuáles no
  // tienen web sin pulsar nada. Con tope, porque al reordenarse por nota van
  // subiendo otras sin comprobar y la lista entera son miles.
  useEffect(() => {
    const cupo = TOPE_AUTOMATICO - automaticas.current
    if (cupo <= 0) return
    const tanda = lista.slice(0, 40).filter((e) => !pedidas.current.has(e.id)).slice(0, cupo)
    if (tanda.length === 0) return
    automaticas.current += tanda.length
    void comprobar(tanda)
  }, [lista, comprobar])

  const abiertaEmpresa = useMemo(
    () => (abierta ? (data?.empresas ?? []).find((e) => e.id === abierta) ?? null : null),
    [abierta, data],
  )
  useEffect(() => { if (abiertaEmpresa) void comprobar([abiertaEmpresa]) }, [abiertaEmpresa, comprobar])

  const mostradas = lista.slice(0, visibles)
  const todasElegidas = mostradas.length > 0 && mostradas.every((e) => elegidas.has(e.id))
  const conCorreo = useMemo(() => base.filter((e) => e.correo && enVista(e, 'recomendadas')).length, [base, enVista])

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  async function guardar(empresas: EmpresaNueva[]) {
    if (empresas.length === 0) return
    setGuardando(true)
    try {
      const r = await importarEmpresasNuevas(empresas, (e) => {
        const d = dominios.get(e.id)
        const web = !d ? ''
          : d.resumen === 'libre' ? ' Sin dominio propio.'
          : d.resumen === 'sin_pagina' ? ` Compró ${d.dominios.find((x) => x.estado === 'sin_pagina')?.dominio} y no tiene página.`
          : ` Existe ${d.dominios.find((x) => x.estado === 'ocupado')?.dominio}: comprobar si es suyo.`
        return `Potencial ${nota(e)}/10.${web}`
      })
      toast.success(
        `${r.insertados} ${r.insertados === 1 ? 'nueva' : 'nuevas'} en Leads` +
        (r.actualizados ? ` · ${r.actualizados} ya estaban` : '') +
        (r.descartados ? ` · ${r.descartados} descartadas` : ''),
      )
      setElegidas((prev) => {
        const n = new Set(prev)
        for (const e of empresas) n.delete(e.id)
        return n
      })
      qc.invalidateQueries({ queryKey: ['leads'] })
    } catch (e) {
      toast.error(`No se pudo guardar: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }

  const reiniciarLista = () => { setVisibles(POR_PAGINA); setDia(null) }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Radar de negocios"
        subtitle="Negocios que se acaban de registrar en EE. UU., ya filtrados y puntuados."
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
            <Button onClick={() => guardar((data?.empresas ?? []).filter((e) => elegidas.has(e.id)))} disabled={elegidas.size === 0 || guardando}>
              <Download className="h-4 w-4" /> {guardando ? 'Guardando…' : `Guardar en Leads (${elegidas.size})`}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra icono={Building2} etiqueta="Registradas" valor={data?.empresas.length ?? 0} tono="neutro" />
        <Cifra icono={Sparkles} etiqueta="Recomendadas" valor={cuentas.recomendadas} tono="primario" />
        <Cifra icono={Globe} etiqueta="Sin web (comprobadas)" valor={cuentas.sin_web} tono="verde" />
        <Cifra icono={Mail} etiqueta="Recomendadas con correo" valor={conCorreo} tono="neutro" />
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[10rem_11rem_1fr_1fr]">
        <Select aria-label="Periodo" value={dias} onChange={(e) => { setDias(Number(e.target.value)); reiniciarLista(); setElegidas(new Set()) }}>
          {DIAS.map((d) => <option key={d} value={d}>{d === 1 ? 'Último día' : `Últimos ${d} días`}</option>)}
        </Select>
        <Select aria-label="Estado" value={estado} onChange={(e) => { setEstado(e.target.value as 'todos' | EstadoRegistro); reiniciarLista() }}>
          <option value="todos">Todos los estados</option>
          {ESTADOS_REGISTRO.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Select>
        <Select aria-label="Actividad" value={nicho} onChange={(e) => { setNicho(e.target.value); reiniciarLista() }}>
          <option value="todos">Todas las actividades</option>
          {nichos.map(([id, c]) => <option key={id} value={id}>{c.nombre} ({c.n})</option>)}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" value={texto} onChange={(e) => { setTexto(e.target.value); setVisibles(POR_PAGINA) }} placeholder="Nombre o ciudad…" />
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sin-barra sm:mx-0 sm:flex-wrap sm:px-0">
          {VISTAS.map((v) => (
            <button
              key={v.id}
              onClick={() => { setVista(v.id); reiniciarLista() }}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
                vista === v.id ? 'bg-primary-500 text-white shadow-sm' : 'bg-surface text-muted hover:text-fg',
              )}
            >
              {v.texto}
              <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', vista === v.id ? 'bg-white/25' : 'bg-border/60')}>{cuentas[v.id]}</span>
            </button>
          ))}
        </div>
        {porDia.length > 1 && (
          <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sin-barra sm:mx-0 sm:px-0">
            {porDia.map(([fecha, n]) => (
              <button
                key={fecha}
                onClick={() => { setDia(dia === fecha ? null : fecha); setVisibles(POR_PAGINA) }}
                title={`Registradas el ${fecha}`}
                className={cn(
                  'shrink-0 rounded-lg border px-2.5 py-1 text-xs tabular-nums transition',
                  dia === fecha ? 'border-primary-400 bg-primary-400/10 text-fg' : 'border-border text-muted hover:text-fg',
                )}
              >
                {fecha.slice(8)}/{fecha.slice(5, 7)} <span className="font-semibold text-fg">{n}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {data && data.fallidos.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No respondieron: {data.fallidos.map((f) => ESTADOS_REGISTRO.find((s) => s.id === f)?.nombre).join(', ')}.
          Los demás estados sí cargaron; prueba Actualizar en un rato.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : isError ? (
        <EmptyState icon={<Radar className="h-8 w-8" />} title="No se pudo consultar los registros" description="Revisa la conexión y vuelve a intentarlo." action={<Button onClick={() => refetch()}>Reintentar</Button>} />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-8 w-8" />}
          title="Nada en esta vista"
          description={vista === 'sin_web' ? 'Aquí salen las que ya se comprobaron y no tienen página. Dale un momento o pide más comprobaciones.' : 'Prueba con más días, otra actividad u otra vista.'}
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={todasElegidas}
                onChange={() => setElegidas(todasElegidas ? new Set() : new Set(mostradas.map((e) => e.id)))}
              />
              Elegir las {mostradas.length} que se ven
            </label>
            <span className="t-hint">
              {enVuelo > 0 ? `Comprobando dominios de ${enVuelo}…` : `${lista.length} empresas, de mejor a peor nota`}
            </span>
          </div>

          <div className="card divide-y divide-border overflow-hidden p-0">
            {mostradas.map((e) => (
              <Fila
                key={e.id}
                empresa={e}
                nota={nota(e)}
                dominios={dominios.get(e.id)}
                elegida={elegidas.has(e.id)}
                onElegir={() => alternar(e.id)}
                onAbrir={() => setAbierta(e.id)}
              />
            ))}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {lista.length > visibles && (
              <Button variant="outline" onClick={() => setVisibles((v) => v + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, lista.length - visibles)} más</Button>
            )}
            {mostradas.some((e) => !dominios.has(e.id)) && (
              <Button variant="outline" onClick={() => comprobar(mostradas)} disabled={enVuelo > 0}>
                <Globe className="h-4 w-4" /> Comprobar dominios de las que se ven
              </Button>
            )}
          </div>
        </>
      )}

      <EmpresaFicha
        empresa={abiertaEmpresa}
        potencial={abiertaEmpresa ? potencial.get(abiertaEmpresa.id) ?? null : null}
        dominios={abiertaEmpresa ? dominios.get(abiertaEmpresa.id) : undefined}
        comprobandoDominios={enVuelo > 0}
        guardando={guardando}
        onGuardar={() => abiertaEmpresa && guardar([abiertaEmpresa])}
        onClose={() => setAbierta(null)}
      />
    </div>
  )
}

function Fila({
  empresa: e, nota, dominios, elegida, onElegir, onAbrir,
}: {
  empresa: EmpresaNueva
  nota: number
  dominios?: DominiosEmpresa | null
  elegida: boolean
  onElegir: () => void
  onAbrir: () => void
}) {
  return (
    <div className={cn('flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2 sm:px-4', elegida && 'bg-primary-400/5')}>
      <input type="checkbox" checked={elegida} onChange={onElegir} aria-label={`Elegir ${e.nombre}`} className="shrink-0" />
      <button onClick={onAbrir} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums', claseNota(nota))}>{nota}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-fg">{e.nombre}</span>
          <span className="block truncate text-xs text-muted">
            {[e.actividad?.nombre, [e.ciudad, e.estado].filter(Boolean).join(', '), haceCuanto(e.fecha)].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
          {e.correo && <Chip clase="bg-surface-2 text-muted"><Mail className="h-3 w-3" /> correo</Chip>}
          {dominios?.resumen === 'libre' && <Chip clase="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">sin web</Chip>}
          {dominios?.resumen === 'sin_pagina' && <Chip clase="bg-amber-400/20 text-amber-800 dark:text-amber-300">compró dominio</Chip>}
          {dominios?.resumen === 'ocupado' && <Chip clase="bg-surface-2 text-muted">hay una página</Chip>}
        </span>
      </button>
    </div>
  )
}

function Chip({ clase, children }: { clase: string; children: React.ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', clase)}>{children}</span>
}

function Cifra({ icono: Icono, etiqueta, valor, tono }: { icono: typeof Globe; etiqueta: string; valor: number; tono: 'neutro' | 'primario' | 'verde' }) {
  const tonos = {
    neutro: 'text-fg bg-surface-2',
    primario: 'text-primary-600 bg-primary-50 dark:text-primary-300 dark:bg-primary-400/15',
    verde: 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-500/15',
  }
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', tonos[tono])}><Icono className="h-5 w-5" /></span>
      <div className="min-w-0">
        <p className="text-2xl font-bold leading-none tabular-nums text-fg">{valor}</p>
        <p className="mt-1 truncate text-xs text-muted">{etiqueta}</p>
      </div>
    </div>
  )
}
