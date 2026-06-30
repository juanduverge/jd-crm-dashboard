import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { sheetsService } from '@/services/sheetsService'
import { n8nService } from '@/services/n8nService'
import { useLeadsStore } from '@/store/leadsStore'
import { useCampaignsStore } from '@/store/campaignsStore'
import { mockCampaigns, mockActivity, mockTemplates } from '@/services/mockData'

/** Carga leads (Sheets o mock) e hidrata el store local. */
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

/** Campañas: se hidratan una vez desde datos de ejemplo y luego viven en el store local. */
export function useCampaigns() {
  const setCampaigns = useCampaignsStore((s) => s.setCampaigns)
  const setTemplates = useCampaignsStore((s) => s.setTemplates)
  const campaigns = useCampaignsStore((s) => s.campaigns)
  const templates = useCampaignsStore((s) => s.templates)
  const hydrated = useCampaignsStore((s) => s.hydrated)

  const query = useQuery({ queryKey: ['campaigns'], queryFn: async () => mockCampaigns })

  useEffect(() => {
    if (query.data && !hydrated) setCampaigns(query.data)
  }, [query.data, hydrated, setCampaigns])

  useEffect(() => {
    if (!templates.length) setTemplates(mockTemplates)
  }, [templates.length, setTemplates])

  return { ...query, campaigns, templates }
}

export function useActivity() {
  return useQuery({ queryKey: ['activity'], queryFn: async () => mockActivity })
}
