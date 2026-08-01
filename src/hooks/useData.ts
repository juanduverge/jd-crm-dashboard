import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { settingsService } from '@/services/settingsService'
import { n8nService } from '@/services/n8nService'
import { crmApi, REPLY_ALIASES } from '@/services/crmApi'
import { leadsService } from '@/services/leadsService'
import { webLeadsService } from '@/services/webLeadsService'
import { messagesService } from '@/services/messagesService'
import { inboxService } from '@/services/inboxService'
import { campaignsService, type CampaignCreateInput, type CampaignUpdateInput } from '@/services/campaignsService'
import { tasksService } from '@/services/tasksService'
import { goalsService } from '@/services/goalsService'
import { followUpsService } from '@/services/followUpsService'
import { supabase } from '@/lib/supabaseClient'
import { useLeadsStore } from '@/store/leadsStore'
import { useCampaignsStore } from '@/store/campaignsStore'
import { STARTER_TEMPLATES } from '@/lib/campaigns'

/** Carga leads reales (Sheets vía n8n) e hidrata el store local. */
export function useLeads() {
  const setLeads = useLeadsStore((s) => s.setLeads)
  const leads = useLeadsStore((s) => s.leads)

  const query = useQuery({
    queryKey: ['leads'],
    queryFn: () => leadsService.getLeads(),
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
    queryFn: () => messagesService.getMessages(),
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
      const [{ data: deletedLeads }, deletedCampaigns, deletedTareas, { data: deletedWebLeads }] = await Promise.all([
        supabase.from('leads').select('id, empresa, deleted_at').not('deleted_at', 'is', null),
        campaignsService.getTrashCampaigns(),
        tasksService.getDeletedTareas(),
        supabase.from('web_leads').select('id, nombre, email, deleted_at').not('deleted_at', 'is', null),
      ])

      const items: import('@/types').TrashItem[] = []

      for (const p of deletedLeads ?? []) {
        items.push({
          key: `lead-${p.id}`,
          module: 'lead',
          id: p.id,
          label: p.empresa || '(sin nombre)',
          detail: 'Lead',
          eliminadoEn: p.deleted_at ?? undefined,
        })
      }

      for (const c of deletedCampaigns) {
        items.push({
          key: `campaign-${c.id}`,
          module: 'campaign',
          id: c.id,
          label: c.nombre,
          detail: 'Campaña',
          eliminadoEn: c.deletedAt ?? undefined,
        })
      }

      for (const t of deletedTareas) {
        items.push({
          key: `tarea-${t.id}`,
          module: 'tarea',
          id: t.id,
          label: t.titulo || '(sin título)',
          detail: 'Tarea',
          eliminadoEn: t.deletedAt ?? undefined,
        })
      }

      for (const w of deletedWebLeads ?? []) {
        items.push({
          key: `web_lead-${w.id}`,
          module: 'web_lead',
          id: w.id,
          label: w.nombre || w.email || '(sin nombre)',
          detail: 'Solicitud web',
          eliminadoEn: w.deleted_at ?? undefined,
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
        await leadsService.restoreLead(item.id)
      } else if (item.module === 'campaign') {
        await campaignsService.restoreCampaign(item.id)
      } else if (item.module === 'tarea') {
        await tasksService.restoreTarea(item.id)
      } else {
        await webLeadsService.restoreWebLead(item.id)
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
        await leadsService.purgeLead(item.id)
      } else if (item.module === 'campaign') {
        await campaignsService.purgeCampaign(item.id)
      } else if (item.module === 'tarea') {
        await tasksService.purgeTarea(item.id)
      } else {
        await webLeadsService.purgeWebLead(item.id)
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trash'] }),
  })
}

/** Emails recibidos vía IMAP (tabla `inbox_messages`), leído persistido en Supabase. */
export function useInbox() {
  return useQuery({
    queryKey: ['inbox'],
    queryFn: () => inboxService.getInbox(),
    refetchInterval: 30_000,
  })
}

/** Marca un correo de la Bandeja como leído (persistido, no solo local). */
export function useMarkInboxRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => inboxService.markAsRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox'] }),
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

/** Solicitudes del formulario de la web pública (tabla `web_leads`). */
export function useWebLeads() {
  return useQuery({
    queryKey: ['web_leads'],
    queryFn: () => webLeadsService.getWebLeads(),
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useUpdateWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: { id: string; estado?: import('@/types').WebLeadStatus; responsable?: string; notas_internas?: string; prioridad?: import('@/types').WebLeadPriority; etiquetas?: string[] }) =>
      webLeadsService.updateWebLead({
        id: payload.id,
        estado: payload.estado,
        responsable: payload.responsable,
        notasInternas: payload.notas_internas,
        prioridad: payload.prioridad,
        etiquetas: payload.etiquetas,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['web_leads'] }),
  })
}

export function useDeleteWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; eliminadoPor?: string }) => webLeadsService.deleteWebLead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['web_leads'] }),
  })
}

export function useRestoreWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => webLeadsService.restoreWebLead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['web_leads'] }),
  })
}

export function usePurgeWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => webLeadsService.purgeWebLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['web_leads'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

/**
 * Convierte una solicitud del Inbox en un Lead real: crea la fila en `leads`,
 * el evento inicial de pipeline, y marca la solicitud como cerrada — todo de
 * forma atómica vía el RPC `convert_web_lead` (ver 0003_functions.sql). Un
 * solo clic desde el Inbox de Leads.
 */
export function useConvertWebLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (lead: import('@/types').WebLead) => webLeadsService.convertWebLead(lead.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['web_leads'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
    },
  })
}

// -------------------------------------------------------------
// SEGUIMIENTOS (follow_ups) — migración 0013
// -------------------------------------------------------------
// Ojo: distinto de `useTareas` (tabla `tasks`), que sigue igual que siempre.
// Aquí viven los toques comerciales sobre un lead, con resultado y secuencia.

/** Agenda de seguimientos pendientes (vencidos / hoy / próximos), sin archivados. */
export function useFollowUpsAgenda() {
  return useQuery({
    queryKey: ['follow_ups_agenda'],
    queryFn: () => followUpsService.getAgenda(),
    refetchInterval: 60_000,
    retry: 1,
  })
}

/** Historial completo de seguimientos de un lead (para el timeline de su ficha). */
export function useLeadFollowUps(leadId?: string) {
  return useQuery({
    queryKey: ['follow_ups', leadId],
    queryFn: () => followUpsService.getByLead(leadId as string),
    enabled: !!leadId,
    retry: 1,
  })
}

/**
 * Invalida todo lo que un cambio de seguimiento puede afectar: la agenda, el
 * historial del lead, y `leads` — porque el trigger de la BD actualiza
 * `leads.proximo_seguimiento` por detrás y el kanban lo muestra.
 */
function useInvalidateFollowUps() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['follow_ups_agenda'] })
    qc.invalidateQueries({ queryKey: ['follow_ups'] })
    qc.invalidateQueries({ queryKey: ['leads'] })
  }
}

export function useProgramarFollowUp() {
  const invalidate = useInvalidateFollowUps()
  return useMutation({
    mutationFn: (p: Parameters<typeof followUpsService.programar>[0]) => followUpsService.programar(p),
    onSuccess: invalidate,
  })
}

export function useCompletarFollowUp() {
  const invalidate = useInvalidateFollowUps()
  return useMutation({
    mutationFn: ({ id, resultado, nota }: {
      id: string
      resultado: Parameters<typeof followUpsService.completar>[1]
      nota?: string
    }) => followUpsService.completar(id, resultado, nota),
    onSuccess: invalidate,
  })
}

export function useReprogramarFollowUp() {
  const invalidate = useInvalidateFollowUps()
  return useMutation({
    mutationFn: ({ id, fecha }: { id: string; fecha: string }) =>
      followUpsService.reprogramar(id, fecha),
    onSuccess: invalidate,
  })
}

/** Cierra un lead (ganado/perdido): lo archiva y cancela su seguimiento pendiente. */
export function useCerrarLead() {
  const invalidate = useInvalidateFollowUps()
  return useMutation({
    mutationFn: ({ leadId, estado, motivo }: {
      leadId: string
      estado: 'ganado' | 'perdido'
      motivo?: string
    }) => followUpsService.cerrarLead(leadId, estado, motivo),
    onSuccess: invalidate,
  })
}

/** Devuelve un lead archivado al pipeline, en su etapa previa. */
export function useReactivarLead() {
  const invalidate = useInvalidateFollowUps()
  return useMutation({
    mutationFn: (leadId: string) => followUpsService.reactivarLead(leadId),
    onSuccess: invalidate,
  })
}

/** Tareas / seguimientos manuales (tabla `tasks` en Supabase). */
export function useTareas() {
  return useQuery({
    queryKey: ['tareas'],
    queryFn: () => tasksService.getTareas(),
    refetchInterval: 30_000,
    retry: 1,
  })
}

export function useCreateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof tasksService.createTarea>[0]) => tasksService.createTarea(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function useDeleteTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; eliminadoPor?: string }) => tasksService.deleteTarea(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function useRestoreTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksService.restoreTarea(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

export function usePurgeTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tasksService.purgeTarea(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useUpdateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof tasksService.updateTarea>[0]) => tasksService.updateTarea(p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas'] }),
  })
}

// -------------------------------------------------------------
// METAS + HORARIO (goals / horario_bloques) — migración 0015
// -------------------------------------------------------------
// Una sola query por rango de fechas alimenta las tres vistas de metas
// (mes / semana / día): todas las metas del mes caen dentro del mismo rango
// y de ahí se derivan la jerarquía y el `tieneHijas`.

export function useGoals(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['goals', desde, hasta],
    queryFn: () => goalsService.getGoals(desde, hasta),
    staleTime: 10_000,
    retry: 1,
  })
}

/**
 * Invalida metas + horario a la vez: registrar avance cambia las metas, y la
 * vista de horario muestra el progreso de la meta ligada a cada bloque.
 */
function useInvalidateGoals() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['goals'] })
    qc.invalidateQueries({ queryKey: ['horario_dia'] })
  }
}

export function useCrearMetaMensual() {
  const invalidate = useInvalidateGoals()
  return useMutation({
    mutationFn: (p: Parameters<typeof goalsService.crearMetaMensual>[0]) =>
      goalsService.crearMetaMensual(p),
    onSuccess: invalidate,
  })
}

export function useCrearMetaSuelta() {
  const invalidate = useInvalidateGoals()
  return useMutation({
    mutationFn: (p: Parameters<typeof goalsService.crearMetaSuelta>[0]) =>
      goalsService.crearMetaSuelta(p),
    onSuccess: invalidate,
  })
}

export function useActualizarMeta() {
  const invalidate = useInvalidateGoals()
  return useMutation({
    mutationFn: (p: Parameters<typeof goalsService.actualizarMeta>[0]) =>
      goalsService.actualizarMeta(p),
    onSuccess: invalidate,
  })
}

/** Suma o resta avance en una meta hoja; la BD lo sube a semana y mes. */
export function useRegistrarAvance() {
  const invalidate = useInvalidateGoals()
  return useMutation({
    mutationFn: ({ id, delta }: { id: string; delta: number }) =>
      goalsService.registrarAvance(id, delta),
    onSuccess: invalidate,
  })
}

export function useGenerarCascada() {
  const invalidate = useInvalidateGoals()
  return useMutation({
    mutationFn: ({ id, diasLaborables }: { id: string; diasLaborables?: number[] }) =>
      goalsService.generarCascada(id, diasLaborables),
    onSuccess: invalidate,
  })
}

export function useEliminarMeta() {
  const invalidate = useInvalidateGoals()
  return useMutation({
    mutationFn: (id: string) => goalsService.eliminarMeta(id),
    onSuccess: invalidate,
  })
}

/** Plantilla de horario + qué bloques están completados en `fecha`. */
export function useHorarioDia(fecha: string) {
  return useQuery({
    queryKey: ['horario_dia', fecha],
    queryFn: async () => {
      const [bloques, completados] = await Promise.all([
        goalsService.getBloques(),
        goalsService.getCompletadosDelDia(fecha),
      ])
      const hechos = new Set(completados)
      return bloques.map((b) => ({ ...b, completado: hechos.has(b.id) }))
    },
    staleTime: 10_000,
    retry: 1,
  })
}

function useInvalidateHorario() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['horario_dia'] })
    qc.invalidateQueries({ queryKey: ['goals'] })
  }
}

export function useCrearBloque() {
  const invalidate = useInvalidateHorario()
  return useMutation({
    mutationFn: (p: Parameters<typeof goalsService.crearBloque>[0]) => goalsService.crearBloque(p),
    onSuccess: invalidate,
  })
}

export function useActualizarBloque() {
  const invalidate = useInvalidateHorario()
  return useMutation({
    mutationFn: (p: Parameters<typeof goalsService.actualizarBloque>[0]) =>
      goalsService.actualizarBloque(p),
    onSuccess: invalidate,
  })
}

export function useEliminarBloque() {
  const invalidate = useInvalidateHorario()
  return useMutation({
    mutationFn: (id: string) => goalsService.eliminarBloque(id),
    onSuccess: invalidate,
  })
}

/** Marca/desmarca un bloque en una fecha; el RPC ajusta la meta diaria ligada. */
export function useToggleBloque() {
  const invalidate = useInvalidateHorario()
  return useMutation({
    mutationFn: ({ id, fecha, completado }: { id: string; fecha: string; completado: boolean }) =>
      completado
        ? goalsService.descompletarBloque(id, fecha)
        : goalsService.completarBloque(id, fecha),
    onSuccess: invalidate,
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
 * Campañas: persistidas en Supabase (tablas `campaigns` + `campaign_leads`).
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
    queryFn: () => campaignsService.getCampaigns(),
    refetchInterval: 30_000,
    staleTime: 20_000,
  })

  return { ...query, campaigns: query.data ?? [], templates }
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CampaignCreateInput) => campaignsService.createCampaign(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CampaignUpdateInput) => campaignsService.updateCampaign(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useRestoreCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => campaignsService.restoreCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function useDeleteLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ leadId }: { leadId: string; eliminadoPor?: string }) => leadsService.deleteLead(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function useRestoreLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => leadsService.restoreLead(leadId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
  })
}

export function usePurgeLead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (leadId: string) => leadsService.purgeLead(leadId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

export function useDeleteCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => campaignsService.deleteCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['campaigns'] }),
  })
}

export function usePurgeCampaign() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => campaignsService.purgeCampaign(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      queryClient.invalidateQueries({ queryKey: ['trash'] })
    },
  })
}

/** Configuración clave/valor (tabla `settings` en Supabase). */
export function useConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => settingsService.getConfig(),
    staleTime: 20_000,
  })
}

export function useUpdateConfig() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) => settingsService.updateConfig(clave, valor),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['config'] }),
  })
}

/**
 * Alias de remitente disponibles para componer/responder correos.
 * Se administran desde Configuración (clave "email_aliases" en la hoja config,
 * JSON: [{ email, label }]). Hostinger no expone API para importarlos
 * automáticamente, así que viven en el CRM. Si no hay config o es inválida,
 * cae a REPLY_ALIASES (valor por defecto en crmApi.ts).
 */
export function useEmailAliases(): { email: string; label: string }[] {
  const { data: cfg } = useConfig()
  const raw = cfg?.['email_aliases']
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length && parsed.every((a) => a?.email)) return parsed
    } catch {
      // JSON inválido: usar default
    }
  }
  return [...REPLY_ALIASES]
}

/** Contactos de un lead (hoja "contactos", varios por lead). */
export function useContacts(leadId?: string) {
  return useQuery({
    queryKey: ['contactos', leadId],
    queryFn: () => leadsService.getContacts(leadId as string),
    enabled: !!leadId,
    staleTime: 10_000,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof leadsService.createContact>[0]) => leadsService.createContact(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contactos', vars.leadId] }),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof leadsService.updateContact>[0]) => leadsService.updateContact(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contactos', vars.leadId] }),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof leadsService.deleteContact>[0]) => leadsService.deleteContact(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['contactos', vars.leadId] }),
  })
}

/** Historial de notas de un lead (tabla `notes` en Supabase). */
export function useNotes(leadId?: string) {
  return useQuery({
    queryKey: ['notas', leadId],
    queryFn: () => leadsService.getNotes(leadId as string),
    enabled: !!leadId,
    staleTime: 10_000,
  })
}

export function useCreateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof leadsService.createNote>[0]) => leadsService.createNote(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['notas', vars.leadId] }),
  })
}

export function useUpdateNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof leadsService.updateNote>[0]) => leadsService.updateNote(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['notas', vars.leadId] }),
  })
}

export function useDeleteNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: Parameters<typeof leadsService.deleteNote>[0]) => leadsService.deleteNote(payload),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['notas', vars.leadId] }),
  })
}

/** Actividad reciente derivada de outreach_messages + inbox_messages (Supabase). */
export function useActivity() {
  return useQuery({
    queryKey: ['activity'],
    queryFn: () => settingsService.getActivity(),
    refetchInterval: 30_000,
  })
}
