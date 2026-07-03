import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { sheetsService } from '@/services/sheetsService'
import { n8nService } from '@/services/n8nService'
import { crmApi, type CampaignCreatePayload, type CampaignUpdatePayload } from '@/services/crmApi'
import { useLeadsStore } from '@/store/leadsStore'
import { useCampaignsStore } from '@/store/campaignsStore'
import { STARTER_TEMPLATES } from '@/lib/campaigns'

/** Carga leads reales (Sheets vía n8n) e hidrata el store local. */
export function useLeads() {
  const setLeads = useLeadsStore((s) => s.setLeads)
  const leads = useLeadsStore((s) => s.leads)

  const query = useQuery({
    queryKey: ['leads'],
    queryFn: () => sheetsService.getLeads(),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  useEffect(() => {
    if (query.data) setLeads(query.data)
  }, [query.data, setLeads])

  return { ...query, leads }
}

export function useMessages() {
  return useQuery({
    queryKey: ['messages'],
    queryFn: () => sheetsService.getMessages(),
    refetchInterval: 30_000,
  })
}

/** Emails recibidos vía IMAP (hoja "inbox"), leídos sin marcar en el servidor. */
export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: () => sheetsService.getInbox(),
    refetchInterval: 30_000,
  })
}

/** Historial de búsquedas de leads disparadas (hoja "search_log"), para notificaciones. */
export function useSearchLog() {
  return useQuery({
    queryKey: ['search_log'],
    queryFn: () => crmApi.readSheet('search_log'),
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => n8nService.listWorkflows(),
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useExecutions(workflowId?: string) {
  return useQuery({
    queryKey: ['executions', workflowId ?? 'all'],
    queryFn: () => n8nService.listExecutions(workflowId),
    refetchInterval: 30_000,
    retry: 1,
  })
}

/**
 * Campañas: persistidas en la hoja "campaigns" de Google Sheets vía n8n.
 * Los templates son contenido editable de arranque (no datos de negocio) y
 * viven solo en el store local.
 */
export function useCampaigns() {
  const setTemplates = useCampaignsStore((s) => s.setTemplates)
  const templates = useCampaignsStore((s) => s.templates)

  useEffect(() => {
    if (!templates.length) setTemplates(STARTER_TEMPLATES)
  }, [templates.length, setTemplates])

  const query = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => sheetsService.getCampaigns(),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  return { ...query, campaigns: query.data ?? [], templates }
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CampaignCreatePayload) => crmApi.createCampaign(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CampaignUpdatePayload) => crmApi.updateCampaign(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

/** Configuración clave/valor (hoja "config") vía el CRM API. */
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => sheetsService.getConfig(),
    staleTime: 20_000,
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) => crmApi.updateConfig(clave, valor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
}

/** Actividad reciente derivada de mensajes reales (sheet "messages"). */
export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: () => sheetsService.getActivity(),
    refetchInterval: 30_000,
  })
}
