import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, Mail, RefreshCw, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, Card, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import {
  ESTADOS_REGISTRO, buscarEmpresasNuevas, importarEmpresasNuevas, pareceVehiculo,
  type EstadoRegistro,
} from '@/lib/registrosNuevos'

const DIAS = [1, 3, 7, 14, 30]

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

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['empresas-nuevas', dias],
    queryFn: () => buscarEmpresasNuevas(dias),
    staleTime: 5 * 60_000,
  })

  const lista = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return (data?.empresas ?? []).filter((e) =>
      (estado === 'todos' || e.estado === estado)
      && (!soloCorreo || e.correo)
      && (!ocultarVehiculos || !pareceVehiculo(e))
      && (!dia || e.fecha === dia)
      && (!t || `${e.nombre} ${e.ciudad} ${e.tipo} ${e.categoria ?? ''}`.toLowerCase().includes(t)),
    )
  }, [data, estado, texto, soloCorreo, ocultarVehiculos, dia])

  // Cuántas empresas se registraron cada día, con los demás filtros aplicados:
  // sirve para ver de un vistazo qué día trae más y quedarse solo con ese.
  const porDia = useMemo(() => {
    const t = texto.trim().toLowerCase()
    const cuenta = new Map<string, number>()
    for (const e of data?.empresas ?? []) {
      if (estado !== 'todos' && e.estado !== estado) continue
      if (soloCorreo && !e.correo) continue
      if (ocultarVehiculos && pareceVehiculo(e)) continue
      if (t && !`${e.nombre} ${e.ciudad} ${e.tipo} ${e.categoria ?? ''}`.toLowerCase().includes(t)) continue
      cuenta.set(e.fecha, (cuenta.get(e.fecha) ?? 0) + 1)
    }
    return [...cuenta.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [data, estado, texto, soloCorreo, ocultarVehiculos])

  const todasElegidas = lista.length > 0 && lista.every((e) => elegidas.has(e.id))

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  const alternarTodas = () =>
    setElegidas(todasElegidas ? new Set() : new Set(lista.map((e) => e.id)))

  async function importar() {
    const paraImportar = (data?.empresas ?? []).filter((e) => elegidas.has(e.id))
    if (paraImportar.length === 0) return
    setImportando(true)
    try {
      const r = await importarEmpresasNuevas(paraImportar)
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
        title="Empresas nuevas"
        subtitle="Negocios recién registrados en los registros oficiales de EE. UU. Aún no tienen quien les haga la web."
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
            <Button onClick={importar} disabled={elegidas.size === 0 || importando}>
              <Download className="h-4 w-4" /> {importando ? 'Importando…' : `Importar al CRM (${elegidas.size})`}
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
                    {[e.ciudad, e.categoria, e.tipo].filter(Boolean).join(' · ') || e.direccion}
                  </p>
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
