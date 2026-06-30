import axios from 'axios'
import { config } from '@/lib/config'
import type { WorkflowInfo } from '@/types'

/** Cliente axios para la API pública de n8n. */
const n8n = axios.create({
  baseURL: config.n8n.base,
  headers: { 'X-N8N-API-KEY': config.n8n.apiKey, 'Content-Type': 'application/json' },
  timeout: 12000,
})

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

  /** Comprueba si la API responde (para el test de conexión). */
  async ping(): Promise<boolean> {
    try {
      await n8n.get('/workflows', { params: { limit: 1 } })
      return true
    } catch {
      return false
    }
  },
}

export default n8nService
