/**
 * Estado del servidor de casa. No es una API: es un JSON que el propio
 * servidor reescribe cada minuto (deploy/estado-servidor/estado.py) y que
 * nginx sirve en el mismo origen que el CRM, detrás de Cloudflare Access.
 */

export interface ContenedorEstado {
  nombre: string
  imagen: string
  /** running | exited | restarting | paused | created | dead */
  estado: string
  /** Texto de Docker, p. ej. "Up 3 weeks (healthy)". */
  detalle: string
  salud: 'sano' | 'enfermo' | 'arrancando' | null
  proyecto: string
  servicio: string | null
  creado: string
  cpu: number | null
  ram: number | null
  ram_limite: number | null
}

export interface EstadoServidor {
  version: number
  generado: string
  equipo: {
    nombre: string
    sistema: string | null
    kernel: string
    ip: string | null
    nucleos: number
    encendido_seg: number
    carga: [number, number, number]
    cpu: number
    memoria: { total: number; disponible: number; swap_total: number; swap_libre: number }
    disco: { total: number; libre: number; usado: number }
    temperatura: number | null
    bateria: { enchufado: boolean | null; carga: number | null; estado: string | null }
  }
  contenedores: ContenedorEstado[]
  docker: { tipo: string; total: number; activos: number; tamano: number; recuperable: number }[]
  carpetas: { calculado: number; lista: { nombre: string; tamano: number | null; modificada: string | null }[] }
  copias: {
    ultima: { dia: string; hora: string; archivos: { nombre: string; tamano: number }[] } | null
    dias_guardados: number
    codigo_salida: number | null
    vigilante: string | null
  }
}

export class SinDatosServidor extends Error {}

export async function obtenerEstadoServidor(): Promise<EstadoServidor> {
  const res = await fetch('/estado-servidor/estado.json', { cache: 'no-store' })
  if (res.status === 404) throw new SinDatosServidor('El servidor todavía no ha escrito su estado')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const tipo = res.headers.get('content-type') ?? ''
  // En desarrollo (vite) no existe la ruta y la SPA devuelve index.html.
  if (!tipo.includes('json')) throw new SinDatosServidor('Esta ruta solo existe en el servidor')
  return res.json()
}
