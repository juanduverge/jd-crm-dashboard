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

/**
 * Papelera: registros con soft-delete (Eliminado / estado=eliminada) que aún no
 * fueron purgados. Une leads+pipeline en una sola entrada porque siempre se
 * eliminan/restauran juntos (ver LeadsPage/PipelinePage).
 */
export function useTrash() {
  return useQuery({
    queryKey: ['trash'],
    queryFn: async () => {
      const [prospects, pipeline, campaigns, tareas, webLeads] = await Promise.all([
        crmApi.readSheet('prospects'),
        crmApi.readSheet('pipeline'),
        crmApi.readSheet('campaigns'),
        crmApi.readSheet('tareas'),
        crmApi.readSheet('web_leads'),
      ])

      const pipelineByLead = new Map(pipeline.map((p) => [p['ID Lead'], p]))
      const items: import('@/types').TrashItem[] = []

      for (const p of prospects) {
        if (!p['Eliminado'] || p['Purgado']) continue
        items.push({
          key: `lead-${p['ID Lead']}`,
          module: 'lead',
          id: p['ID Lead'],
          label: p['Nombre empresa'] || '(sin nombre)',
          detail: pipelineByLead.get(p['ID Lead']) ? 'Lead + Pipeline' : 'Lead',
          eliminadoEn: p['Eliminado'],
          eliminadoPor: p['Eliminado_por'],
        })
      }

      for (const c of campaigns) {
        if (!c['id'] || c['estado'] !== 'eliminada') continue
        items.push({
          key: `campaign-${c['id']}`,
          module: 'campaign',
          id: c['id'],
          label: c['nombre'] || '(sin nombre)',
          detail: 'Campaña',
        })
      }

      for (const t of tareas) {
        if (!t['id'] || !t['Eliminado'] || t['Purgado']) continue
        items.push({
          key: `tarea-${t['id']}`,
          module: 'tarea',
          id: t['id'],
          label: t['titulo'] || '(sin título)',
          detail: 'Tarea',
          eliminadoEn: t['Eliminado'],
          eliminadoPor: t['Eliminado_por'],
        })
      }

      for (const w of webLeads) {
        if (!w['id'] || !w['Eliminado'] || w['Purgado']) continue
        items.push({
          key: `web_lead-${w['id']}`,
          module: 'web_lead',
          id: w['id'],
          label: w['nombre'] || w['email'] || '(sin nombre)',
          detail: 'Solicitud web',
          eliminadoEn: w['Eliminado'],
          eliminadoPor: w['Eliminado_por'],
        })
      }

      return items.sort((a, b) => (b.eliminadoEn || '').localeCompare(a.eliminadoEn || ''))
    },
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useRestoreTrashItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: import('@/types').TrashItem) => {
      if (item.module === 'lead') {
        await Promise.all([crmApi.restoreLead(item.id), crmApi.restorePipeline(item.id)])
      } else if (item.module === 'campaign') {
        await crmApi.restoreCampaign(item.id)
      } else if (item.module === 'tarea') {
        await crmApi.restoreTarea(item.id)
      } else {
        await crmApi.restoreWebLead(item.id)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['trash'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
      qc.invalidateQueries({ queryKey: ['campaigns'] })
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['web_leads'] })
    },
  })
}

export function usePurgeTrashItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: import('@/types').TrashItem) => {
      if (item.module === 'lead') {
        await Promise.all([crmApi.purgeLead(item.id), crmApi.purgePipeline(item.id)])
      } else if (item.module === 'campaign') {
        await crmApi.purgeCampaign(item.id)
      } else if (item.module === 'tarea') {
        await crmApi.purgeTarea(item.id)
      } else {
        await crmApi.purgeWebLead(item.id)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
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

/** Solicitudes del formulario de la web pública (hoja "web_leads"). */
export function useWebLeads() {
  return useQuery({
    queryKey: ['web_leads'],
    queryFn: async () => {
      const rows = await crmApi.readSheet('web_leads')
      return rows
        .filter((r) => !r['Eliminado'])
        .map((r): import('@/types').WebLead => ({
          id: r.id ?? '',
          fechaHora: r.fecha_hora ?? '',
          nombre: r.nombre ?? '',
          email: r.email ?? '',
          empresa: r.empresa,
          telefono: r.telefono,
          asunto: r.asunto,
          mensaje: r.mensaje ?? '',
          pagina: r.pagina,
          url: r.url,
          referrer: r.referrer,
          utmSource: r.utm_source,
          utmMedium: r.utm_medium,
          utmCampaign: r.utm_campaign,
          ip: r.ip,
          userAgent: r.user_agent,
          fuente: r.fuente || 'web',
          formulario: r.formulario,
          estado: (r.estado as import('@/types').WebLeadStatus) || 'nuevo',
          prioridad: (r.prioridad as import('@/types').WebLeadPriority) || 'media',
          etiquetas: (r.etiquetas || '').split(',').map((t) => t.trim()).filter(Boolean),
          responsable: r.responsable,
          notasInternas: r.notas_internas,
          actualizado: r.actualizado,
        }))
        .filter((l) => l.id)
        .sort((a, b) => (b.fechaHora || '').localeCompare(a.fechaHora || ''))
    },
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useUpdateWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; estado?: string; responsable?: string; notas_internas?: string; prioridad?: string; etiquetas?: string }) =>
      crmApi.updateWebLead(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['web_leads'] }),
  })
}

export function useDeleteWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, eliminadoPor }: { id: string; eliminadoPor?: string }) => crmApi.deleteWebLead(id, eliminadoPor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['web_leads'] }),
  })
}

export function useRestoreWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.restoreWebLead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['web_leads'] }),
  })
}

export function usePurgeWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.purgeWebLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['web_leads'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

/**
 * Convierte una solicitud del Inbox en un Lead real: crea la fila en `prospects`
 * (módulo Leads), la mete al Pipeline en etapa "Contactado", y marca la solicitud
 * como cerrada + etiqueta "convertido". Un solo clic desde el Inbox de Leads.
 */
export function useConvertWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (lead: import('@/types').WebLead) => {
      const leadId = `L-${lead.id}`
      await crmApi.createLead({
        leadId,
        empresa: lead.empresa || lead.nombre,
        emailContacto: lead.email,
        telefono: lead.telefono,
        whatsapp: lead.telefono,
        notas: lead.asunto ? `${lead.asunto}: ${lead.mensaje}` : lead.mensaje,
        fuente: 'web',
      })
      await crmApi.updatePipeline({
        leadId,
        empresa: lead.empresa || lead.nombre,
        estado: 'contactado',
        canalPrincipal: 'email',
        notas: lead.mensaje,
      })
      await crmApi.updateWebLead({
        id: lead.id,
        estado: 'cerrado',
        etiquetas: [...new Set([...lead.etiquetas, 'convertido'])].join(','),
      })
      return leadId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['web_leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

/** Tareas / seguimientos manuales (hoja "tareas"). */
export function useTareas() {
  return useQuery({
    queryKey: ['tareas'],
    queryFn: async () => {
      const rows = await crmApi.readSheet('tareas')
      return rows
        .filter((r) => !r['Eliminado'])
        .map((r): import('@/types').Tarea => ({
          id: r.id ?? '',
          titulo: r.titulo ?? '',
          tipo: (r.tipo as import('@/types').TareaTipo) || 'seguimiento',
          leadId: r.lead_id,
          leadNombre: r.lead_nombre,
          fechaVencimiento: r.fecha_vencimiento,
          estado: (r.estado as import('@/types').TareaEstado) || 'pendiente',
          prioridad: (r.prioridad as import('@/types').WebLeadPriority) || 'media',
          responsable: r.responsable,
          notas: r.notas,
          creado: r.creado,
          actualizado: r.actualizado,
        }))
        .filter((t) => t.id)
        .sort((a, b) => (a.fechaVencimiento || '9999').localeCompare(b.fechaVencimiento || '9999'))
    },
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useCreateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof crmApi.createTarea>[0]) => crmApi.createTarea(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function useDeleteTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, eliminadoPor }: { id: string; eliminadoPor?: string }) => crmApi.deleteTarea(id, eliminadoPor),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function useRestoreTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.restoreTarea(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function usePurgeTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.purgeTarea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useUpdateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof crmApi.updateTarea>[0]) => crmApi.updateTarea(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
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

export function useRestoreCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.restoreCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, eliminadoPor }: { leadId: string; eliminadoPor?: string }) => crmApi.deleteLead(leadId, eliminadoPor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useRestoreLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => crmApi.restoreLead(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useDeletePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId, eliminadoPor }: { leadId: string; eliminadoPor?: string }) => crmApi.deletePipeline(leadId, eliminadoPor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useRestorePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => crmApi.restorePipeline(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function usePurgeLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => crmApi.purgeLead(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function usePurgePipeline() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => crmApi.purgePipeline(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function usePurgeCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => crmApi.purgeCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
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

/** Contactos de un lead (hoja "contactos", varios por lead). */
export function useContacts(leadId?: string) {
  return useQuery({
    queryKey: ['contactos', leadId],
    queryFn: () => sheetsService.getContacts(leadId as string),
    enabled: !!leadId,
    staleTime: 10_000,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.createContact>[0]) => crmApi.createContact(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contactos', vars.leadId] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.updateContact>[0]) => crmApi.updateContact(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contactos', vars.leadId] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.deleteContact>[0]) => crmApi.deleteContact(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contactos', vars.leadId] }),
  })
}

/** Historial de notas de un lead (hoja "notas"). */
export function useNotes(leadId?: string) {
  return useQuery({
    queryKey: ['notas', leadId],
    queryFn: () => sheetsService.getNotes(leadId as string),
    enabled: !!leadId,
    staleTime: 10_000,
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.createNote>[0]) => crmApi.createNote(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['notas', vars.leadId] }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.updateNote>[0]) => crmApi.updateNote(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['notas', vars.leadId] }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof crmApi.deleteNote>[0]) => crmApi.deleteNote(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['notas', vars.leadId] }),
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
