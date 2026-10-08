import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, Globe, Mail, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import {
  ESTADOS_REGISTRO, buscarEmpresasNuevas, importarEmpresasNuevas, pareceVehiculo,
  type EmpresaNueva, type EstadoRegistro,
} from '@/lib/registrosNuevos'
import {
  comprobarDominios, dominioCandidato, type EstadoDominio, type ResultadoDominio,
} from '@/lib/dominioEmpresa'

const SIN_CLASIFICAR = '__sin__'

const ETIQUETA_DOMINIO: Record<EstadoDominio, { texto: string; clase: string }> = {
  libre: { texto: 'libre', clase: 'text-emerald-600' },
  sin_pagina: { texto: 'registrado, sin página', clase: 'text-amber-600' },
  ocupado: { texto: 'ocupado', clase: 'text-muted' },
}

const DIAS = [1, 3, 7, 14, 30]

function LineaDominio({ r }: { r?: ResultadoDominio }) {
  if (!r) return null
  const et = ETIQUETA_DOMINIO[r.estado]
  return (
    <p className={`truncate text-xs ${et.clase}`}>
      {r.estado === 'ocupado'
        ? <a href={`https://${r.dominio}`} target="_blank" rel="noreferrer" className="underline">{r.dominio}</a>
        : r.dominio}
      {' · '}{et.texto}
    </p>
  )
}

const casaNicho = (e: EmpresaNueva, nicho: string) =>
  nicho === 'todos' || (nicho === SIN_CLASIFICAR ? !e.actividad : e.actividad?.nicho === nicho)

export function EmpresasNuevasPage() {
  const qc = useQueryClient()
  const [dias, setDias] = useState(3)
  const [estado, setEstado] = useState<'todos' | EstadoRegistro>('todos')
  const [texto, setTexto] = useState('')
  const [soloCorreo, setSoloCorreo] = useState(false)
  const [ocultarVehiculos, setOcultarVehiculos] = useState(true)
  const [dia, setDia] = useState<string | null>(null)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [importando, setImportando] = useState(false)
  const [nicho, setNicho] = useState('todos')
  const [filtroDominio, setFiltroDominio] = useState<'todos' | EstadoDominio>('todos')
  const [dominios, setDominios] = useState<Map<string, ResultadoDominio>>(new Map())
  const [comprobando, setComprobando] = useState(false)
  const cancelar = useRef<AbortController | null>(null)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['empresas-nuevas', dias],
    queryFn: () => buscarEmpresasNuevas(dias),
    staleTime: 5 * 60_000,
  })

  // Todos los filtros menos el del día y el de la actividad, que tienen su
  // propio recuento y por eso se aplican aparte.
  const base = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return (data?.empresas ?? []).filter((e) =>
      (estado === 'todos' || e.estado === estado)
      && (!soloCorreo || e.correo)
      && (!ocultarVehiculos || !pareceVehiculo(e))
      && (filtroDominio === 'todos' || dominios.get(e.id)?.estado === filtroDominio)
      && (!t || `${e.nombre} ${e.ciudad} ${e.tipo} ${e.categoria ?? ''} ${e.actividad?.nombre ?? ''}`.toLowerCase().includes(t)),
    )
  }, [data, estado, texto, soloCorreo, ocultarVehiculos, filtroDominio, dominios])

  const lista = useMemo(
    () => base.filter((e) => casaNicho(e, nicho) && (!dia || e.fecha === dia)),
    [base, nicho, dia],
  )

  // Cuántas empresas se registraron cada día: sirve para ver de un vistazo qué
  // día trae más y quedarse solo con ese.
  const porDia = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const e of base) if (casaNicho(e, nicho)) cuenta.set(e.fecha, (cuenta.get(e.fecha) ?? 0) + 1)
    return [...cuenta.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [base, nicho])

  // Qué actividades hay en la lista y cuántas de cada una, de más a menos.
  const porNicho = useMemo(() => {
    const cuenta = new Map<string, { nombre: string; n: number }>()
    let sin = 0
    for (const e of base) {
      if (!e.actividad) { sin++; continue }
      const c = cuenta.get(e.actividad.nicho) ?? { nombre: e.actividad.nombre, n: 0 }
      c.n++
      cuenta.set(e.actividad.nicho, c)
    }
    return { nichos: [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n), sin }
  }, [base])

  const todasElegidas = lista.length > 0 && lista.every((e) => elegidas.has(e.id))

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const alternarTodas = () =>
    setElegidas(todasElegidas ? new Set() : new Set(lista.map((e) => e.id)))

  async function comprobar() {
    if (comprobando) { cancelar.current?.abort(); return }
    // Un mismo dominio puede tocarle a dos empresas con el mismo nombre.
    const pendientes = new Map<string, string[]>()
    for (const e of lista.slice(0, 300)) {
      if (dominios.has(e.id)) continue
      const d = dominioCandidato(e.nombre)
      if (d) pendientes.set(d, [...(pendientes.get(d) ?? []), e.id])
    }
    if (pendientes.size === 0) { toast('No queda ningún dominio por comprobar en esta lista.'); return }
    const ctrl = new AbortController()
    cancelar.current = ctrl
    setComprobando(true)
    try {
      const { fallidos } = await comprobarDominios([...pendientes.keys()], (r) => {
        setDominios((prev) => {
          const n = new Map(prev)
          for (const id of pendientes.get(r.dominio) ?? []) n.set(id, r)
          return n
        })
      }, ctrl.signal)
      if (fallidos && !ctrl.signal.aborted) toast.error(`${fallidos} dominios no se pudieron comprobar.`)
    } finally {
      setComprobando(false)
    }
  }

  async function importar() {
    const paraImportar = (data?.empresas ?? []).filter((e) => elegidas.has(e.id))
    if (paraImportar.length === 0) return
    setImportando(true)
    try {
      const r = await importarEmpresasNuevas(paraImportar, dominios)
      toast.success(
        `${r.insertados} nuevas en Leads` +
        (r.actualizados ? ` · ${r.actualizados} ya existían` : '') +
        (r.descartados ? ` · ${r.descartados} descartadas` : ''),
      )
      setElegidas(new Set())
      qc.invalidateQueries({ queryKey: ['leads'] })
    } catch (e) {
      toast.error(`No se pudo importar: ${(e as Error).message}`)
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Radar de negocios"
        subtitle="Negocios que se acaban de registrar en EE. UU. Llega antes de que busquen quien les haga la web."
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
            <Button variant="outline" onClick={comprobar}>
              <Globe className="h-4 w-4" /> {comprobando ? 'Parar' : 'Comprobar dominios'}
            </Button>
            <Button onClick={importar} disabled={elegidas.size === 0 || importando}>
              <Download className="h-4 w-4" /> {importando ? 'Guardando…' : `Guardar en Leads (${elegidas.size})`}
            </Button>
          </>
        }
      />

      <Card className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1">
          <span className="t-hint">Registradas en los últimos</span>
          <Select value={dias} onChange={(e) => { setDias(Number(e.target.value)); setDia(null); setElegidas(new Set()) }}>
            {DIAS.map((d) => <option key={d} value={d}>{d === 1 ? '1 día' : `${d} días`}</option>)}
          </Select>
        </label>
        <label className="space-y-1">
          <span className="t-hint">Estado</span>
          <Select value={estado} onChange={(e) => setEstado(e.target.value as 'todos' | EstadoRegistro)}>
            <option value="todos">Todos</option>
            {ESTADOS_REGISTRO.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </Select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="t-hint">Buscar por nombre, ciudad o actividad</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input className="pl-9" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="plumbing, Denver, cleaning…" />
          </div>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="t-hint">Actividad (deducida del nombre)</span>
          <Select value={nicho} onChange={(e) => setNicho(e.target.value)}>
            <option value="todos">Todas</option>
            {porNicho.nichos.map(([id, c]) => <option key={id} value={id}>{c.nombre} ({c.n})</option>)}
            <option value={SIN_CLASIFICAR}>Sin clasificar ({porNicho.sin})</option>
          </Select>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="t-hint">Dominio .com (pulsa «Comprobar dominios» primero)</span>
          <Select value={filtroDominio} onChange={(e) => setFiltroDominio(e.target.value as 'todos' | EstadoDominio)}>
            <option value="todos">Todos</option>
            <option value="libre">Libre: no tienen dominio</option>
            <option value="sin_pagina">Registrado, sin página</option>
            <option value="ocupado">Ocupado</option>
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ocultarVehiculos} onChange={(e) => setOcultarVehiculos(e.target.checked)} />
          Ocultar holdings, inversión y propiedades
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={soloCorreo} onChange={(e) => setSoloCorreo(e.target.checked)} />
          Solo las que publican correo
        </label>
      </Card>

      {porDia.length > 1 && (
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sin-barra sm:mx-0 sm:flex-wrap sm:px-0">
          {porDia.map(([fecha, n]) => (
            <button
              key={fecha}
              type="button"
              onClick={() => setDia(dia === fecha ? null : fecha)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-sm ${dia === fecha ? 'border-primary-400 bg-primary-400/10' : 'border-border hover:bg-surface-2'}`}
            >
              <span className="t-hint block">{fecha.slice(8)}/{fecha.slice(5, 7)}</span>
              <span className="font-semibold tabular-nums">{n}</span>
            </button>
          ))}
        </div>
      )}

      {data && data.fallidos.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No respondieron: {data.fallidos.map((f) => ESTADOS_REGISTRO.find((s) => s.id === f)?.nombre).join(', ')}.
          Los demás estados sí cargaron; prueba Actualizar en un rato.
        </p>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : isError ? (
        <EmptyState title="No se pudo consultar los registros" description="Revisa la conexión y pulsa Actualizar." />
      ) : lista.length === 0 ? (
        <EmptyState title="Sin resultados" description="Prueba con más días o quita algún filtro." />
      ) : (
        <>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={todasElegidas} onChange={alternarTodas} />
              Elegir las {lista.length} de la lista
            </label>
            <span className="t-hint">{lista.length} de {data?.empresas.length ?? 0} empresas</span>
          </div>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {lista.slice(0, 300).map((e) => (
              <li key={e.id} className="flex items-start gap-3 px-3 py-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={elegidas.has(e.id)}
                  onChange={() => alternar(e.id)}
                  aria-label={`Elegir ${e.nombre}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.nombre}</p>
                  <p className="t-hint truncate">
                    {[e.actividad?.nombre, e.ciudad, e.categoria, e.tipo].filter(Boolean).join(' · ') || e.direccion}
                  </p>
                  <LineaDominio r={dominios.get(e.id)} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge>{e.estado} · {e.fecha.slice(5)}</Badge>
                  {e.correo && <span className="inline-flex items-center gap-1 text-xs text-muted"><Mail className="h-3 w-3" /> correo</span>}
                </div>
              </li>
            ))}
          </ul>
          {lista.length > 300 && (
            <p className="t-hint">Se muestran las 300 más recientes. Afina con los filtros para ver el resto.</p>
          )}
        </>
      )}
    </div>
  )
}
