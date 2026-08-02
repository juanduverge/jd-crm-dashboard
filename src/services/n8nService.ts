import axios from 'axios'
import { config } from '@/lib/config'
import type { WorkflowInfo } from '@/types'

/** Cliente axios para la API pública de n8n. */
/**
 * La API key de n8n NUNCA viaja en este cliente: nginx la inyecta server-side
 * en el proxy /n8n-api/ (ver deploy/nginx.conf.template). El bundle público
 * no debe conocer el secreto.
 */
const n8n = axios.create({
  baseURL: config.n8n.base,
  headers: { 'Content-Type': 'application/json' },
  timeout: 12000,
})

/**
 * Reintento con espera creciente para fallos *transitorios*.
 *
 * Por qué sólo transitorios: un 401 no mejora repitiéndolo, y reintentarlo
 * sólo multiplica los intentos fallidos contra Cloudflare Access. Se reintenta
 * el timeout, la caída de red y el 5xx (n8n reiniciándose, que es justo el
 * caso en el que hoy hay que "reconectar a mano"), y sólo en GET, que es
 * idempotente: repetir un POST /run lanzaría el workflow dos veces.
 */
const REINTENTOS = 2
n8n.interceptors.response.use(undefined, async (error) => {
  const cfg = error?.config as (typeof error.config & { _intentos?: number }) | undefined
  if (!cfg || (cfg.method ?? 'get').toLowerCase() !== 'get') throw error

  const status = error?.response?.status as number | undefined
  const transitorio = !error.response || error.code === 'ECONNABORTED' || (status !== undefined && status >= 500)
  if (!transitorio) throw error

  cfg._intentos = (cfg._intentos ?? 0) + 1
  if (cfg._intentos > REINTENTOS) throw error

  await new Promise((r) => setTimeout(r, 600 * cfg._intentos!))
  return n8n.request(cfg)
})

/**
 * Motivo por el que la conexión con n8n no responde. Un booleano no bastaba:
 * "sin conexión" mezclaba la sesión de Cloudflare caducada (hay que volver a
 * entrar), la API key rotada (hay que reiniciar el contenedor) y n8n caído
 * (hay que esperar), y cada una se arregla de una forma distinta.
 */
export type EstadoN8n = 'ok' | 'acceso' | 'credencial' | 'timeout' | 'red' | 'ruta' | 'servidor' | 'desconocido'

export interface DiagnosticoN8n {
  ok: boolean
  estado: EstadoN8n
  /** Texto listo para enseñar al usuario, con la acción concreta a tomar. */
  detalle: string
  status?: number
}

const DETALLE: Record<EstadoN8n, string> = {
  ok: 'Conectado.',
  acceso: 'La sesión de Cloudflare Access caducó. Abre n8n en otra pestaña, vuelve a autenticarte y recarga.',
  credencial: 'n8n rechaza la API key (caducada o rotada). Hay que renovarla y reiniciar el contenedor del dashboard.',
  timeout: 'n8n no respondió a tiempo. Puede estar arrancando o saturado.',
  red: 'No se alcanzó el proxy /n8n-api. Revisa que nginx y el contenedor de n8n estén levantados.',
  ruta: 'El proxy responde pero la ruta de la API no existe. Revisa N8N_INTERNAL_URL en el despliegue.',
  servidor: 'n8n devolvió un error interno.',
  desconocido: 'Fallo no identificado al contactar con n8n.',
}

/** Cloudflare Access no devuelve JSON: devuelve el HTML de su pantalla de login. */
function pareceLoginDeCloudflare(res: any): boolean {
  const tipo = String(res?.headers?.['content-type'] ?? '')
  if (tipo.includes('text/html')) return true
  return typeof res?.data === 'string' && res.data.includes('cloudflareaccess')
}

function clasificar(error: any): DiagnosticoN8n {
  const res = error?.response
  let estado: EstadoN8n = 'desconocido'

  if (error?.code === 'ECONNABORTED') estado = 'timeout'
  else if (!res) estado = 'red'
  else if ((res.status === 401 || res.status === 403) && pareceLoginDeCloudflare(res)) estado = 'acceso'
  else if (res.status === 401 || res.status === 403) estado = 'credencial'
  else if (res.status === 404) estado = 'ruta'
  else if (res.status >= 500) estado = 'servidor'

  return { ok: false, estado, detalle: DETALLE[estado], status: res?.status }
}

export interface N8nExecution {
  id: string
  finished: boolean
  status?: 'success' | 'error' | 'running' | 'waiting'
  mode: string
  startedAt: string
  stoppedAt?: string
  workflowId: string
}

export const n8nService = {
  /** Lista todos los workflows. */
  async listWorkflows(): Promise<WorkflowInfo[]> {
    const { data } = await n8n.get('/workflows', { params: { limit: 100 } })
    const items = (data?.data ?? data ?? []) as any[]
    return items.map((w) => ({
      id: w.id,
      name: w.name,
      active: !!w.active,
      description: w.tags?.map((t: any) => t.name).join(', '),
      updatedAt: w.updatedAt,
      lastExecution: null,
    }))
  },

  async getWorkflow(id: string) {
    const { data } = await n8n.get(`/workflows/${id}`)
    return data
  },

  /** Activa / desactiva un workflow. */
  async setActive(id: string, active: boolean) {
    const { data } = await n8n.post(`/workflows/${id}/${active ? 'activate' : 'deactivate'}`)
    return data
  },

  /** Ejecuta un workflow manualmente (requiere trigger compatible). */
  async run(id: string) {
    const { data } = await n8n.post(`/workflows/${id}/run`, {})
    return data
  },

  /** Últimas ejecuciones, opcionalmente filtradas por workflow. */
  async listExecutions(workflowId?: string, limit = 20): Promise<N8nExecution[]> {
    const { data } = await n8n.get('/executions', {
      params: { limit, ...(workflowId ? { workflowId } : {}) },
    })
    const items = (data?.data ?? data ?? []) as any[]
    return items.map((e) => ({
      id: e.id,
      finished: e.finished,
      status: e.status ?? (e.finished ? 'success' : 'running'),
      mode: e.mode,
      startedAt: e.startedAt,
      stoppedAt: e.stoppedAt,
      workflowId: e.workflowId,
    }))
  },

  /**
   * Comprueba la conexión y, si falla, dice *por qué*. Es lo que alimenta el
   * estado de integraciones: sin el motivo, "Sin conexión" obligaba a abrir la
   * consola del navegador para saber qué reconectar.
   */
  async diagnosticar(): Promise<DiagnosticoN8n> {
    try {
      const res = await n8n.get('/workflows', { params: { limit: 1 } })
      // Un 200 con HTML es la pantalla de login de Cloudflare, no la API.
      if (pareceLoginDeCloudflare(res)) {
        return { ok: false, estado: 'acceso', detalle: DETALLE.acceso, status: res.status }
      }
      return { ok: true, estado: 'ok', detalle: DETALLE.ok, status: res.status }
    } catch (error) {
      return clasificar(error)
    }
  },

  /** Atajo booleano sobre `diagnosticar()`. */
  async ping(): Promise<boolean> {
    return (await n8nService.diagnosticar()).ok
  },
}

export default n8nService
