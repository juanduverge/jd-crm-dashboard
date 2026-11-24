import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Server, Cpu, MemoryStick, HardDrive, Thermometer, BatteryCharging, Battery, Power,
  RefreshCw, AlertTriangle, ExternalLink, CheckCircle2, Boxes, FolderOpen, DatabaseBackup, Workflow,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Skeleton } from '@/components/ui'
import { cn } from '@/lib/utils'
import {
  obtenerEstadoServidor, SinDatosServidor,
  type ContenedorEstado, type EstadoServidor,
} from '@/services/servidorService'

export const URL_PORTAINER = 'https://servidor.jddeveloper.com'

// ── Nombres en cristiano ────────────────────────────────────────────────
// Docker habla de «jd-prod-postgres-1»; Juan necesita leer «Base de datos».
const PROYECTOS: Record<string, { nombre: string; que: string }> = {
  'jd-prod': { nombre: 'Producción', que: 'El CRM, el n8n principal, la base de datos y el túnel a internet' },
  'jd-wa': { nombre: 'Verificador de WhatsApp', que: 'Android virtual que comprueba qué leads tienen WhatsApp' },
  'jd-lab': { nombre: 'Laboratorio', que: 'Supabase propio y un n8n para pruebas' },
  'jd-formularios': { nombre: 'Formularios', que: 'n8n que recibe los formularios web' },
  'jd-contactos': { nombre: 'Robot de contactos', que: 'Busca teléfonos y correos de los leads' },
  'ai7-recoleccion': { nombre: 'Recolector AI7', que: 'Recolector de datos' },
  'duverge-recoleccion': { nombre: 'Recolector Duvergé', que: 'Recolector de datos' },
  suelto: { nombre: 'Sueltos', que: 'Contenedores fuera de cualquier proyecto' },
}

const SERVICIOS: Record<string, string> = {
  'crm-dashboard': 'CRM (esta web)',
  n8n: 'n8n (automatizaciones)',
  postgres: 'Base de datos',
  db: 'Base de datos',
  cloudflared: 'Túnel a internet',
  'imap-archivador': 'Archivador de correo',
  android: 'Android virtual',
  verificador: 'Verificador',
  vigilante: 'Vigilante',
  cargador: 'Cargador de contactos',
  gateway: 'Puerta de entrada',
  auth: 'Inicio de sesión',
  rest: 'API de datos',
  app: 'Aplicación',
  recolector: 'Recolector',
  robot: 'Robot',
}

function nombreServicio(c: ContenedorEstado) {
  if (c.nombre === 'portainer') return 'Portainer (panel técnico)'
  const clave = c.servicio ?? c.nombre.replace(/^jd-wa-|^jd-contactos-/, '')
  return SERVICIOS[clave] ?? c.servicio ?? c.nombre
}

// ── Formatos ────────────────────────────────────────────────────────────
function bytes(n: number | null | undefined) {
  if (n == null) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = n
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`
}

function duracion(seg: number) {
  const d = Math.floor(seg / 86400)
  const h = Math.floor((seg % 86400) / 3600)
  const m = Math.floor((seg % 3600) / 60)
  if (d > 0) return `${d} ${d === 1 ? 'día' : 'días'} y ${h} h`
  if (h > 0) return `${h} h y ${m} min`
  return `${m} min`
}

/** "Up 3 weeks (healthy)" → "3 semanas". */
function tiempoArriba(detalle: string) {
  const m = detalle.match(/^Up (.+?)(?: \(|$)/)
  if (!m) return detalle.replace(/^Exited/, 'Parado').replace(/ago$/, '')
  return m[1]
    .replace(/About an? /, '1 ')
    .replace(/Less than a second/, 'segundos')
    .replace(/seconds?/, 's').replace(/minutes?/, 'min').replace(/hours?/, 'h')
    .replace(/days?/, 'días').replace(/weeks?/, 'semanas').replace(/months?/, 'meses').replace(/years?/, 'años')
}

const hace = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es })

// ── Diagnóstico ─────────────────────────────────────────────────────────
type Nivel = 'mal' | 'ojo'
interface Aviso { nivel: Nivel; texto: string }

const MIN_SIN_DATOS = 3

function diagnosticar(e: EstadoServidor): Aviso[] {
  const a: Aviso[] = []
  const minutos = (Date.now() - new Date(e.generado).getTime()) / 60000
  if (minutos > MIN_SIN_DATOS) {
    a.push({ nivel: 'mal', texto: `El servidor no envía datos desde ${hace(e.generado)}. Puede estar apagado o sin internet: lo de abajo es lo último que se supo.` })
  }
  const { disco, memoria, temperatura, bateria } = e.equipo
  const usoDisco = disco.usado / disco.total
  if (usoDisco > 0.95) a.push({ nivel: 'mal', texto: `El disco está casi lleno (${Math.round(usoDisco * 100)} %).` })
  else if (usoDisco > 0.85) a.push({ nivel: 'ojo', texto: `El disco pasa del 85 % (${Math.round(usoDisco * 100)} %).` })
  if (memoria.disponible / memoria.total < 0.1) a.push({ nivel: 'ojo', texto: 'Queda menos del 10 % de memoria libre.' })
  if (temperatura != null && temperatura > 85) a.push({ nivel: 'mal', texto: `El procesador está muy caliente (${temperatura} °C).` })
  else if (temperatura != null && temperatura > 75) a.push({ nivel: 'ojo', texto: `El procesador está caliente (${temperatura} °C).` })
  if (bateria.enchufado === false) {
    a.push({ nivel: 'mal', texto: `Está funcionando con batería (${bateria.carga ?? '?'} %). ¿Se fue la luz o se desenchufó?` })
  }
  for (const c of e.contenedores) {
    if (c.estado !== 'running') a.push({ nivel: 'mal', texto: `${nombreServicio(c)} (${c.nombre}) está parado.` })
    else if (c.salud === 'enfermo') a.push({ nivel: 'mal', texto: `${nombreServicio(c)} (${c.nombre}) está encendido pero no responde bien.` })
  }
  const copia = e.copias.ultima
  if (!copia) a.push({ nivel: 'mal', texto: 'No hay ninguna copia de seguridad.' })
  else if ((Date.now() - new Date(copia.hora).getTime()) / 3600000 > 30) {
    a.push({ nivel: 'mal', texto: `La última copia de seguridad es de ${hace(copia.hora)}: tocaba una cada noche.` })
  }
  if (e.copias.codigo_salida != null && e.copias.codigo_salida !== 0) {
    a.push({ nivel: 'mal', texto: 'La última copia de seguridad terminó con error.' })
  }
  return a
}

// ── Piezas ──────────────────────────────────────────────────────────────
function Barra({ pct, className }: { pct: number; className?: string }) {
  const color = pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-amber-500' : 'bg-emerald-500'
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}>
      <div className={cn('h-full rounded-full', color)} style={{ width: `${Math.min(100, Math.max(1, pct))}%` }} />
    </div>
  )
}

function Dato({
  icon: Icon, titulo, valor, pie, pct,
}: { icon: typeof Cpu; titulo: string; valor: string; pie?: string; pct?: number }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Icon className="h-4 w-4" /> {titulo}
      </div>
      <p className="mt-1.5 text-xl font-semibold text-fg">{valor}</p>
      {pct != null && <Barra pct={pct} className="mt-2" />}
      {pie && <p className="mt-1.5 text-xs text-muted">{pie}</p>}
    </div>
  )
}

function Seccion({ icon: Icon, titulo, children, extra }: {
  icon: typeof Cpu; titulo: string; children: React.ReactNode; extra?: React.ReactNode
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
          <Icon className="h-5 w-5 text-muted" /> {titulo}
        </h2>
        {extra}
      </div>
      {children}
    </section>
  )
}

function Punto({ c }: { c: ContenedorEstado }) {
  // Reiniciándose en bucle es tan grave como parado: el aviso de arriba ya lo cuenta.
  const color = c.estado !== 'running' || c.salud === 'enfermo'
    ? 'bg-red-500'
    : c.salud === 'arrancando'
      ? 'bg-amber-500'
      : 'bg-emerald-500'
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', color)} />
}

// ── Página ──────────────────────────────────────────────────────────────
export function ServidorPage() {
  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['estado-servidor'],
    queryFn: obtenerEstadoServidor,
    // El servidor escribe cada minuto; mirar cada 30 s basta para no ir con retraso.
    refetchInterval: 30_000,
    retry: (n, err) => !(err instanceof SinDatosServidor) && n < 2,
  })

  const avisos = useMemo(() => (data ? diagnosticar(data) : []), [data])

  const proyectos = useMemo(() => {
    if (!data) return []
    const grupos = new Map<string, ContenedorEstado[]>()
    for (const c of data.contenedores) {
      const g = grupos.get(c.proyecto) ?? []
      g.push(c)
      grupos.set(c.proyecto, g)
    }
    // Producción primero: es lo que importa si algo falla.
    return [...grupos.entries()].sort(([a], [b]) =>
      a === 'jd-prod' ? -1 : b === 'jd-prod' ? 1 : a === 'suelto' ? 1 : b === 'suelto' ? -1 : a.localeCompare(b))
  }, [data])

  const actualizar = (
    <>
      {/* Portainer: el programa para manejar Docker (parar, reiniciar, ver
          registros). Sale por el túnel de Cloudflare con Access delante. */}
      <a href={URL_PORTAINER} target="_blank" rel="noopener noreferrer"
        className="inline-flex h-9 items-center gap-2 rounded-xl bg-primary-400 px-4 text-sm font-medium text-white hover:bg-primary-600">
        <ExternalLink className="h-4 w-4" /> Manejar Docker (Portainer)
      </a>
      <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
        <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Actualizar
      </Button>
    </>
  )

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Servidor" subtitle="Cargando…" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div>
        <PageHeader title="Servidor" actions={actualizar} />
        <div className="card flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-semibold text-fg">No se pudo leer el estado del servidor</p>
            <p className="mt-1 text-sm text-muted">
              {error instanceof SinDatosServidor
                ? 'El servidor todavía no ha escrito su informe, o estás en la versión de desarrollo. En el servidor lo escribe una tarea cada minuto.'
                : 'Puede que el servidor esté apagado o sin internet. Si el resto del CRM funciona, avisa a Claude.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const { equipo, copias } = data
  const memUsada = equipo.memoria.total - equipo.memoria.disponible
  const pctMem = (memUsada / equipo.memoria.total) * 100
  const pctDisco = (equipo.disco.usado / equipo.disco.total) * 100
  const n8n = data.contenedores.filter((c) => c.imagen.includes('n8n'))
  const encendidos = data.contenedores.filter((c) => c.estado === 'running').length
  const cache = data.docker.find((d) => d.tipo === 'Build Cache')
  const carpetas = [...data.carpetas.lista].sort((a, b) => (b.tamano ?? 0) - (a.tamano ?? 0))
  const mayorCarpeta = carpetas[0]?.tamano || 1
  const malos = avisos.filter((a) => a.nivel === 'mal').length

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Servidor"
        subtitle={`${equipo.nombre} · actualizado ${hace(data.generado)}`}
        actions={actualizar}
      />

      {/* Veredicto arriba del todo: lo primero que hay que saber es si hay que hacer algo. */}
      {avisos.length === 0 ? (
        <div className="card flex items-center gap-3 border-emerald-500/40 bg-emerald-500/5 p-4">
          <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
          <div>
            <p className="font-semibold text-fg">Todo funciona bien</p>
            <p className="text-sm text-muted">
              {encendidos} de {data.contenedores.length} programas encendidos, copia de seguridad al día.
            </p>
          </div>
        </div>
      ) : (
        <div className={cn('card space-y-2 p-4', malos ? 'border-red-500/40 bg-red-500/5' : 'border-amber-500/40 bg-amber-500/5')}>
          <p className="flex items-center gap-2 font-semibold text-fg">
            <AlertTriangle className={cn('h-5 w-5', malos ? 'text-red-500' : 'text-amber-500')} />
            {avisos.length === 1 ? 'Hay una cosa que mirar' : `Hay ${avisos.length} cosas que mirar`}
          </p>
          <ul className="space-y-1 pl-7 text-sm text-fg">
            {avisos.map((a, i) => (
              <li key={i} className="list-disc">{a.texto}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Dato icon={Power} titulo="Encendido" valor={duracion(equipo.encendido_seg)}
          pie={`desde el ${format(new Date(Date.now() - equipo.encendido_seg * 1000), "d 'de' MMMM", { locale: es })}`} />
        <Dato icon={Cpu} titulo="Procesador" valor={`${equipo.cpu} %`} pct={equipo.cpu}
          pie={`${equipo.nucleos} núcleos · carga ${equipo.carga[0].toFixed(2)}`} />
        <Dato icon={MemoryStick} titulo="Memoria" valor={`${Math.round(pctMem)} %`} pct={pctMem}
          pie={`${bytes(memUsada)} de ${bytes(equipo.memoria.total)}`} />
        <Dato icon={HardDrive} titulo="Disco" valor={`${Math.round(pctDisco)} %`} pct={pctDisco}
          pie={`quedan ${bytes(equipo.disco.libre)} de ${bytes(equipo.disco.total)}`} />
        <Dato icon={Thermometer} titulo="Temperatura"
          valor={equipo.temperatura != null ? `${equipo.temperatura} °C` : '—'}
          pie={equipo.temperatura == null ? undefined : equipo.temperatura < 70 ? 'Normal' : 'Alta'} />
        <Dato icon={equipo.bateria.enchufado ? BatteryCharging : Battery} titulo="Corriente"
          valor={equipo.bateria.enchufado === false ? 'Con batería' : 'Enchufado'}
          pie={equipo.bateria.carga != null ? `Batería al ${equipo.bateria.carga} %` : undefined} />
        <Dato icon={Boxes} titulo="Programas (Docker)" valor={`${encendidos} / ${data.contenedores.length}`}
          pie="encendidos" />
        <Dato icon={Workflow} titulo="n8n" valor={String(n8n.length)}
          pie={n8n.map((c) => PROYECTOS[c.proyecto]?.nombre ?? c.proyecto).join(', ')} />
      </div>

      <Seccion icon={Boxes} titulo="Qué está corriendo">
        <div className="space-y-4">
          {proyectos.map(([proyecto, lista]) => {
            const info = PROYECTOS[proyecto] ?? { nombre: proyecto, que: '' }
            return (
              <div key={proyecto}>
                <div className="mb-1.5">
                  <p className="text-sm font-semibold text-fg">{info.nombre}</p>
                  {info.que && <p className="text-xs text-muted">{info.que}</p>}
                </div>
                <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
                  {lista.map((c) => (
                    <li key={c.nombre} className="flex items-center gap-3 px-3 py-2.5">
                      <Punto c={c} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-fg">{nombreServicio(c)}</p>
                        <p className="truncate text-xs text-muted">
                          {c.estado === 'running' ? `encendido hace ${tiempoArriba(c.detalle)}` : tiempoArriba(c.detalle)}
                          <span className="hidden sm:inline"> · {c.nombre}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted">
                        <p>{c.ram != null ? bytes(c.ram) : '—'}</p>
                        <p>{c.cpu != null ? `${c.cpu.toFixed(1)} % CPU` : ''}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </Seccion>

      <div className="grid gap-4 lg:grid-cols-2">
        <Seccion icon={DatabaseBackup} titulo="Copias de seguridad">
          {copias.ultima ? (
            <div className="space-y-3">
              <p className="text-sm text-fg">
                Última: <strong>{format(new Date(copias.ultima.hora), "d 'de' MMMM, HH:mm", { locale: es })}</strong>{' '}
                <span className="text-muted">({hace(copias.ultima.hora)})</span>
              </p>
              <ul className="space-y-1 text-sm">
                {copias.ultima.archivos.map((f) => (
                  <li key={f.nombre} className="flex justify-between gap-3">
                    <span className="truncate text-muted">{f.nombre}</span>
                    <span className="shrink-0 text-fg">{bytes(f.tamano)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Se hace cada noche a las 3:15 y se guardan {copias.dias_guardados} días.
                Vigilante: {copias.vigilante === 'ok' ? 'sin avisos' : copias.vigilante ?? '—'}.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">No hay copias.</p>
          )}
        </Seccion>

        <Seccion icon={HardDrive} titulo="Espacio de Docker">
          <ul className="space-y-1.5 text-sm">
            {data.docker.map((d) => (
              <li key={d.tipo} className="flex justify-between gap-3">
                <span className="text-muted">
                  {{ Images: 'Imágenes', Containers: 'Contenedores', 'Local Volumes': 'Volúmenes (datos)', 'Build Cache': 'Caché de construcción' }[d.tipo] ?? d.tipo}
                  {' '}({d.total})
                </span>
                <span className="shrink-0 text-fg">{bytes(d.tamano)}</span>
              </li>
            ))}
          </ul>
          {cache && cache.recuperable > 5 * 1024 ** 3 && (
            <p className="mt-3 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">
              Hay {bytes(cache.recuperable)} de caché que se pueden borrar sin perder nada
              (son restos de construir el CRM). Pídeselo a Claude si el disco se llena.
            </p>
          )}
        </Seccion>
      </div>

      <Seccion icon={FolderOpen} titulo="Carpetas del servidor"
        extra={<span className="text-xs text-muted">medidas {hace(new Date(data.carpetas.calculado * 1000).toISOString())}</span>}>
        <ul className="space-y-2">
          {carpetas.map((c) => (
            <li key={c.nombre}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate text-fg">{c.nombre}</span>
                <span className="shrink-0 text-muted">{bytes(c.tamano)}</span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-surface-2">
                <div className="h-full rounded-full bg-primary-400" style={{ width: `${Math.max(1, ((c.tamano ?? 0) / mayorCarpeta) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Solo la carpeta personal. Las bases de datos de Docker viven aparte (ver «Espacio de Docker»).
        </p>
      </Seccion>

      <p className="flex items-center gap-2 pb-2 text-xs text-muted">
        <Server className="h-3.5 w-3.5" />
        {equipo.sistema} · {equipo.ip} · se actualiza solo cada minuto
      </p>
    </div>
  )
}
