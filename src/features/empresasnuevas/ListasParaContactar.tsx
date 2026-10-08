import { useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Download, Hourglass, Mail, Phone, Radar, RefreshCw, Search, Sparkles, UserCheck } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Input, Select, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { ESTADOS_REGISTRO, type EstadoRegistro } from '@/lib/registrosNuevos'
import { radarService, type RadarEmpresa, type Veredicto } from '@/services/radarService'
import { EmpresaFicha, claseNota, haceCuanto } from './EmpresaFicha'
import { Chip, Cifra } from './EmpresasNuevasPage'

const POR_PAGINA = 40

/** Cómo se cuenta cada veredicto en una palabra, y con qué color. */
const VEREDICTO: Record<Veredicto, { texto: string; clase: string }> = {
  sin_dominio: { texto: 'sin dominio', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  dominio_ajeno: { texto: 'sin web propia', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  web_en_construccion: { texto: 'web vacía', clase: 'bg-amber-400/20 text-amber-800 dark:text-amber-300' },
  web_floja: { texto: 'web floja', clase: 'bg-amber-400/20 text-amber-800 dark:text-amber-300' },
  sin_decidir: { texto: 'por revisar', clase: 'bg-surface-2 text-muted' },
  tiene_web: { texto: 'ya tiene web', clase: 'bg-surface-2 text-muted' },
}

type Filtro = 'todas' | 'con_contacto' | 'con_dueno' | Veredicto

export function ListasParaContactar({ selector }: { selector: ReactNode }) {
  const qc = useQueryClient()
  const [estado, setEstado] = useState<'todos' | EstadoRegistro>('todos')
  const [nicho, setNicho] = useState('todos')
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [visibles, setVisibles] = useState(POR_PAGINA)
  const [elegidas, setElegidas] = useState<Set<string>>(new Set())
  const [abierta, setAbierta] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['radar-listas'],
    queryFn: () => radarService.listas(),
    // La cola va rellenando la tabla sola: se refresca sin pulsar nada.
    refetchInterval: 60_000,
  })
  const { data: situacion } = useQuery({
    queryKey: ['radar-estado'],
    queryFn: () => radarService.estado(),
    refetchInterval: 60_000,
  })

  const todas = useMemo(() => data ?? [], [data])

  const tieneContacto = (e: RadarEmpresa) =>
    !!e.correo || (e.investigacion?.correos.length ?? 0) > 0 || (e.investigacion?.telefonos.length ?? 0) > 0

  const base = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return todas.filter((e) =>
      (estado === 'todos' || e.estado === estado)
      && (nicho === 'todos' || e.actividad_nicho === nicho)
      && (!t || `${e.nombre} ${e.ciudad ?? ''} ${e.contacto_nombre ?? ''} ${e.actividad_nombre ?? ''}`.toLowerCase().includes(t)),
    )
  }, [todas, estado, nicho, texto])

  const pasa = (e: RadarEmpresa, f: Filtro) =>
    f === 'todas' ? true
      : f === 'con_contacto' ? tieneContacto(e)
      : f === 'con_dueno' ? e.contacto_rol === 'Dueño'
      : e.veredicto === f

  const lista = useMemo(() => base.filter((e) => pasa(e, filtro)), [base, filtro]) // eslint-disable-line react-hooks/exhaustive-deps

  const nichos = useMemo(() => {
    const c = new Map<string, { nombre: string; n: number }>()
    for (const e of todas) {
      if (!e.actividad_nicho) continue
      const x = c.get(e.actividad_nicho) ?? { nombre: e.actividad_nombre ?? e.actividad_nicho, n: 0 }
      x.n++
      c.set(e.actividad_nicho, x)
    }
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [todas])

  const FILTROS: { id: Filtro; texto: string }[] = [
    { id: 'todas', texto: 'Todas' },
    { id: 'con_contacto', texto: 'Con correo o teléfono' },
    { id: 'con_dueno', texto: 'Con dueño' },
    { id: 'web_floja', texto: 'Web floja' },
    { id: 'web_en_construccion', texto: 'Web vacía' },
    { id: 'sin_dominio', texto: 'Sin dominio' },
  ]

  const mostradas = lista.slice(0, visibles)
  const todasElegidas = mostradas.length > 0 && mostradas.every((e) => elegidas.has(e.id))
  const abiertaEmpresa = abierta ? todas.find((e) => e.id === abierta) ?? null : null

  async function guardar(filas: RadarEmpresa[]) {
    if (filas.length === 0) return
    setGuardando(true)
    try {
      const r = await radarService.guardarEnLeads(filas)
      toast.success(
        `${r.insertados} ${r.insertados === 1 ? 'nueva' : 'nuevas'} en Leads` +
        (r.actualizados ? ` · ${r.actualizados} ya estaban` : '') +
        (r.contactos ? ` · ${r.contactos} con persona de contacto` : '') +
        (r.descartados ? ` · ${r.descartados} descartadas` : ''),
      )
      setElegidas(new Set())
      setAbierta(null)
      qc.invalidateQueries({ queryKey: ['radar-listas'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    } catch (e) {
      toast.error(`No se pudo guardar: ${(e as Error).message}`)
    } finally {
      setGuardando(false)
    }
  }

  async function descartar(e: RadarEmpresa) {
    try {
      await radarService.descartar(e.id)
      setAbierta(null)
      qc.invalidateQueries({ queryKey: ['radar-listas'] })
    } catch (err) {
      toast.error(`No se pudo descartar: ${(err as Error).message}`)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Radar de negocios"
        subtitle="Empresas recién registradas que el Radar ya investigó por ti. Solo queda leer y contactar."
        actions={
          <>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Actualizar
            </Button>
            <Button onClick={() => guardar(todas.filter((e) => elegidas.has(e.id)))} disabled={elegidas.size === 0 || guardando}>
              <Download className="h-4 w-4" /> {guardando ? 'Guardando…' : `Guardar en Leads (${elegidas.size})`}
            </Button>
          </>
        }
      />

      {selector}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Cifra icono={Sparkles} etiqueta="Listas para contactar" valor={todas.length} tono="primario" />
        <Cifra icono={Mail} etiqueta="Con correo o teléfono" valor={todas.filter(tieneContacto).length} tono="verde" />
        <Cifra icono={UserCheck} etiqueta="Con nombre del dueño" valor={todas.filter((e) => e.contacto_rol === 'Dueño').length} tono="neutro" />
        <Cifra icono={Hourglass} etiqueta="Esperando a que se lea su web" valor={situacion?.enCola ?? 0} tono="neutro" />
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-3">
        <Select aria-label="Estado" value={estado} onChange={(e) => { setEstado(e.target.value as 'todos' | EstadoRegistro); setVisibles(POR_PAGINA) }}>
          <option value="todos">Todos los estados</option>
          {ESTADOS_REGISTRO.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </Select>
        <Select aria-label="Actividad" value={nicho} onChange={(e) => { setNicho(e.target.value); setVisibles(POR_PAGINA) }}>
          <option value="todos">Todas las actividades</option>
          {nichos.map(([id, c]) => <option key={id} value={id}>{c.nombre} ({c.n})</option>)}
        </Select>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" value={texto} onChange={(e) => { setTexto(e.target.value); setVisibles(POR_PAGINA) }} placeholder="Nombre, ciudad o dueño…" />
        </div>
      </div>

      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 sin-barra sm:mx-0 sm:flex-wrap sm:px-0">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            onClick={() => { setFiltro(f.id); setVisibles(POR_PAGINA) }}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition',
              filtro === f.id ? 'bg-primary-500 text-white shadow-sm' : 'bg-surface text-muted hover:text-fg',
            )}
          >
            {f.texto}
            <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', filtro === f.id ? 'bg-white/25' : 'bg-border/60')}>
              {base.filter((e) => pasa(e, f.id)).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : isError ? (
        <EmptyState icon={<Radar className="h-8 w-8" />} title="No se pudo leer el Radar" description="Revisa la conexión y vuelve a intentarlo." action={<Button onClick={() => refetch()}>Reintentar</Button>} />
      ) : todas.length === 0 ? (
        <EmptyState
          icon={<Radar className="h-8 w-8" />}
          title="Todavía no hay nada listo"
          description="El Radar recoge empresas cada mañana a las 7 y va leyendo sus páginas durante el día. Vuelve en un rato."
        />
      ) : lista.length === 0 ? (
        <EmptyState icon={<Radar className="h-8 w-8" />} title="Nada con estos filtros" description="Prueba otra actividad, otro estado u otra pestaña." />
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
              {lista.length} empresas, de mejor a peor nota
              {situacion ? ` · ${situacion.usadas} de ${situacion.tope} lecturas hoy` : ''}
            </span>
          </div>

          <div className="card divide-y divide-border overflow-hidden p-0">
            {mostradas.map((e) => {
              const nota = e.nota_final ?? e.nota_reglas ?? 0
              const v = e.veredicto ? VEREDICTO[e.veredicto] : null
              const telefono = e.investigacion?.telefonos[0]?.valor
              return (
                <div key={e.id} className={cn('flex items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2 sm:px-4', elegidas.has(e.id) && 'bg-primary-400/5')}>
                  <input
                    type="checkbox"
                    className="shrink-0"
                    checked={elegidas.has(e.id)}
                    aria-label={`Elegir ${e.nombre}`}
                    onChange={() => setElegidas((prev) => {
                      const n = new Set(prev)
                      if (n.has(e.id)) n.delete(e.id); else n.add(e.id)
                      return n
                    })}
                  />
                  <button onClick={() => setAbierta(e.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold tabular-nums', claseNota(nota))}>{nota}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-fg">{e.nombre}</span>
                      <span className="block truncate text-xs text-muted">
                        {[e.actividad_nombre, [e.ciudad, e.estado].filter(Boolean).join(', '), haceCuanto(e.fecha_registro), e.contacto_nombre].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      {tieneContacto(e) && (
                        <Chip clase="bg-surface-2 text-muted">
                          {telefono && !e.correo ? <Phone className="h-3 w-3" /> : <Mail className="h-3 w-3" />} contacto
                        </Chip>
                      )}
                      {v && <Chip clase={v.clase}>{v.texto}</Chip>}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          {lista.length > visibles && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisibles((n) => n + POR_PAGINA)}>Ver {Math.min(POR_PAGINA, lista.length - visibles)} más</Button>
            </div>
          )}
        </>
      )}

      <EmpresaFicha
        empresa={abiertaEmpresa ? {
          id: abiertaEmpresa.id,
          estado: abiertaEmpresa.estado,
          nombre: abiertaEmpresa.nombre,
          tipo: abiertaEmpresa.tipo ?? '',
          fecha: abiertaEmpresa.fecha_registro,
          direccion: abiertaEmpresa.direccion ?? '',
          ciudad: abiertaEmpresa.ciudad ?? '',
          correo: abiertaEmpresa.correo ?? undefined,
          categoria: abiertaEmpresa.categoria ?? undefined,
          actividad: abiertaEmpresa.actividad_nicho
            ? { termino: abiertaEmpresa.actividad_termino ?? '', nicho: abiertaEmpresa.actividad_nicho, nombre: abiertaEmpresa.actividad_nombre ?? '' }
            : null,
          urlRegistro: abiertaEmpresa.url_registro,
        } : null}
        potencial={abiertaEmpresa ? {
          nota: abiertaEmpresa.nota_final ?? abiertaEmpresa.nota_reglas ?? 0,
          motivos: abiertaEmpresa.motivos_reglas ?? [],
        } : null}
        contacto={abiertaEmpresa?.contacto_nombre && abiertaEmpresa.contacto_rol
          ? { nombre: abiertaEmpresa.contacto_nombre, rol: abiertaEmpresa.contacto_rol }
          : undefined}
        dominios={abiertaEmpresa?.dominios ? {
          dominios: abiertaEmpresa.dominios,
          resumen: abiertaEmpresa.dominios.some((d) => d.estado === 'ocupado') ? 'ocupado'
            : abiertaEmpresa.dominios.some((d) => d.estado === 'sin_pagina') ? 'sin_pagina' : 'libre',
        } : null}
        investigacion={abiertaEmpresa?.investigacion}
        comprobandoDominios={false}
        guardando={guardando}
        onGuardar={() => abiertaEmpresa && guardar([abiertaEmpresa])}
        onDescartar={() => abiertaEmpresa && descartar(abiertaEmpresa)}
        onClose={() => setAbierta(null)}
      />
    </div>
  )
}
