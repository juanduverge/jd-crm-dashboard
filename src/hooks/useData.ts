import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { sheetsService } from '@/services/sheetsService'
import { n8nService } from '@/services/n8nService'
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
 * Campañas: no hay hoja de Sheets para campañas (es una feature local de este
 * dashboard). Arranca vacío (0 campañas reales enviadas) y vive en el store;
 * los templates se siembran una vez con una librería base editable.
 */
export function useCampaigns() {
  const setTemplates = useCampaignsStore((s) => s.setTemplates)
  const campaigns = useCampaignsStore((s) => s.campaigns)
  const templates = useCampaignsStore((s) => s.templates)

  useEffect(() => {
    if (!templates.length) setTemplates(STARTER_TEMPLATES)
  }, [templates.length, setTemplates])

  return { campaigns, templates, isLoading: false }
}

/** Actividad reciente derivada de mensajes reales (sheet "messages"). */
export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: () => sheetsService.getActivity(),
    refetchInterval: 30_000,
  })
}
