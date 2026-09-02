import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
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
import { metricsService } from '@/services/metricsService'
import { timeService } from '@/services/timeService'
import { eventosService, type EventoPayload } from '@/services/eventosService'
import { followUpsService } from '@/services/followUpsService'
import { supabase } from '@/lib/supabaseClient'
import { useLeadsStore } from '@/store/leadsStore'
import { useCampaignsStore } from '@/store/campaignsStore'
import { STARTER_TEMPLATES } from '@/lib/campaigns'
import { DEFAULT_NICHES, type Niche } from '@/lib/config'
import { nichosService } from '@/services/nichosService'
import { CLAVE_RESPONSABLES, claveResponsable, componerResponsables } from '@/lib/equipo'

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

/**
 * Ultima corrida de `importar_leads`. Se refresca seguido porque el import lo
 * dispara n8n en segundo plano: es lo que explica por que Apify trajo 20 y en
 * la lista solo hay N nuevos.
 */
export function useUltimaImportacion() {
  return useQuery({
    queryKey: ['ultima-importacion'],
    queryFn: () => leadsService.getUltimaImportacion(),
    refetchInterval: 30_000,
  })
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

/**
 * Ultimas busquedas de leads disparadas, para la campana de notificaciones.
 * Lee de `lead_imports` en Supabase. Antes iba contra la hoja "search_log" de
 * Google Sheets vía webhook: ese sondeo cada 30 s llevaba meses fallando (la
 * credencial OAuth de Google caduco) y era el 99% de los errores de n8n.
 */
export function useUltimasBusquedas() {
  return useQuery({
    queryKey: ['ultimas-busquedas'],
    queryFn: () => leadsService.getUltimasBusquedas(8),
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
 * `leads.proximo_seguimiento` y el touch por detrás, y el kanban lo muestra.
 */
function useInvalidateFollowUps() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['follow_ups_agenda'] })
    qc.invalidateQueries({ queryKey: ['follow_ups'] })
    qc.invalidateQueries({ queryKey: ['leads'] })
    // Un toque completado mueve el touch del lead, su etapa y, por tanto, las
    // metas automáticas y el panel de métricas. Se invalidan aquí y no en cada
    // pantalla para que registrar el contacto sea la única acción del usuario.
    qc.invalidateQueries({ queryKey: ['goals'] })
    qc.invalidateQueries({ queryKey: ['metricas_crm'] })
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

/** Edita un seguimiento pendiente completo (migración 0020). */
export function useActualizarFollowUp() {
  const invalidate = useInvalidateFollowUps()
  return useMutation({
    mutationFn: (p: Parameters<typeof followUpsService.actualizar>[0]) => followUpsService.actualizar(p),
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

/**
 * Tocar una tarea mueve medio módulo, así que se invalida medio módulo.
 *
 * Cambiar el estado o el vencimiento de una tarea cambia el calendario (donde
 * se pinta el día en que vence), las métricas (que cuentan tareas cumplidas) y
 * las metas a las que esa tarea alimenta. Invalidar sólo `['tareas']` dejaba
 * las otras tres pantallas enseñando el estado anterior hasta el siguiente
 * refresco automático, que es justo el "módulos aislados" que había que
 * romper.
 */
export function useUpdateTarea() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: Parameters<typeof tasksService.updateTarea>[0]) => tasksService.updateTarea(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['time_entries_rango'] })
      qc.invalidateQueries({ queryKey: ['tiempo_resumen'] })
    },
  })
}

// -------------------------------------------------------------
// MÉTRICAS (metricas_crm) — migración 0028
// -------------------------------------------------------------

/**
 * Panel de métricas de un rango. Se recalcula solo: cualquier mutación de
 * seguimientos, leads o metas invalida `['metricas_crm']`, así que los números
 * salen siempre de las acciones reales y nunca de un contador que alguien
 * tenga que acordarse de subir.
 */
export function useMetricasCrm(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['metricas_crm', desde, hasta],
    queryFn: () => metricsService.getMetricas(desde, hasta),
    staleTime: 30_000,
    retry: 1,
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
    qc.invalidateQueries({ queryKey: ['metricas_crm'] })
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

/**
 * La plantilla de horario y lo que se marcó como hecho en un rango. Es el
 * «plan» con el que Métricas compara la realidad: los bloques dicen lo que
 * se pensaba hacer cada día de la semana, las completions lo que se hizo.
 */
export function usePlanDelRango(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['horario_rango', desde, hasta],
    queryFn: async () => {
      const [bloques, completados] = await Promise.all([
        goalsService.getBloques(),
        goalsService.getCompletadosDelRango(desde, hasta),
      ])
      return { bloques, completados }
    },
    staleTime: 30_000,
    retry: 1,
  })
}

function useInvalidateHorario() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['horario_dia'] })
    // Métricas compara el plan con la realidad: marcar un bloque lo mueve.
    qc.invalidateQueries({ queryKey: ['horario_rango'] })
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

// -------------------------------------------------------------
// REGISTRO DE TIEMPO (time_entries) — migración 0016
// -------------------------------------------------------------
// El tiempo mide, no puntúa: ninguna de estas mutaciones invalida ['goals'],
// porque parar un cronómetro no mueve ningún contador de metas.

export function useEntradasDelDia(fecha: string) {
  return useQuery({
    queryKey: ['time_entries', fecha],
    queryFn: () => timeService.getEntradasDelDia(fecha),
    staleTime: 10_000,
    retry: 1,
  })
}

/**
 * El cronómetro que corre ahora. Se refresca solo cada minuto porque puede
 * haberse arrancado (o cerrado, al arrancar otro) desde otra pestaña.
 */
export function useEntradaAbierta(responsable?: string) {
  return useQuery({
    queryKey: ['time_entry_abierta', responsable ?? ''],
    queryFn: () => timeService.getEntradaAbierta(responsable),
    staleTime: 10_000,
    refetchInterval: 60_000,
    retry: 1,
  })
}

/** Tiempo agregado por día y meta, para las Métricas. */
export function useResumenTiempo(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['tiempo_resumen', desde, hasta],
    queryFn: () => timeService.getResumenDiario(desde, hasta),
    staleTime: 30_000,
    retry: 1,
  })
}

/** Tramos cerrados de un rango, para el detalle por actividad de Métricas. */
export function useEntradasDelRango(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['time_entries_rango', desde, hasta],
    queryFn: () => timeService.getEntradasDelRango(desde, hasta),
    staleTime: 30_000,
    retry: 1,
  })
}

function useInvalidateTiempo() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['time_entries'] })
    qc.invalidateQueries({ queryKey: ['time_entry_abierta'] })
    // Métricas lee agregados del mismo dato: parar un cronómetro los mueve.
    qc.invalidateQueries({ queryKey: ['time_entries_rango'] })
    qc.invalidateQueries({ queryKey: ['tiempo_resumen'] })
  }
}

export function useIniciarTiempo() {
  const invalidate = useInvalidateTiempo()
  return useMutation({
    mutationFn: (p: Parameters<typeof timeService.iniciar>[0]) => timeService.iniciar(p),
    onSuccess: invalidate,
  })
}

export function usePararTiempo() {
  const invalidate = useInvalidateTiempo()
  return useMutation({
    mutationFn: ({ id, responsable }: { id?: string; responsable?: string } = {}) =>
      timeService.parar(id, responsable),
    onSuccess: invalidate,
  })
}

export function useRegistrarTiempoManual() {
  const invalidate = useInvalidateTiempo()
  return useMutation({
    mutationFn: (p: Parameters<typeof timeService.registrarManual>[0]) =>
      timeService.registrarManual(p),
    onSuccess: invalidate,
  })
}

export function useActualizarEntradaTiempo() {
  const invalidate = useInvalidateTiempo()
  return useMutation({
    mutationFn: (p: Parameters<typeof timeService.actualizar>[0]) => timeService.actualizar(p),
    onSuccess: invalidate,
  })
}

export function useEliminarEntradaTiempo() {
  const invalidate = useInvalidateTiempo()
  return useMutation({
    mutationFn: (id: string) => timeService.eliminar(id),
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

/** Últimas búsquedas de captación, sin repetidas (sale de `lead_imports`). */
export function useHistorialBusquedas() {
  return useQuery({
    queryKey: ['historial-busquedas'],
    queryFn: () => leadsService.getHistorialBusquedas(),
    staleTime: 60_000,
  })
}

/** Una búsqueda guardada como plantilla, para repetirla sin volver a escribirla. */
export interface BusquedaGuardada {
  id: string
  nombre: string
  fuente: string
  tipo: string
  ciudad: string
  max: number
}

export const CLAVE_BUSQUEDAS = 'busquedas_guardadas'

/**
 * Plantillas de búsqueda. Viven en `settings` y no en una tabla propia: son
 * cuatro campos y un puñado de filas, y así no hace falta una migración para
 * algo que es preferencia del usuario, no dato del negocio.
 */
export function useBusquedasGuardadas(): BusquedaGuardada[] {
  const { data: cfg } = useConfig()
  const raw = cfg?.[CLAVE_BUSQUEDAS]
  return useMemo(() => {
    if (!raw) return []
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? (p as BusquedaGuardada[]).filter((b) => b?.id && b?.tipo) : []
    } catch {
      return []
    }
  }, [raw])
}

/** Guarda (o pisa, si repites nombre) una plantilla de búsqueda. */
export function useGuardarBusqueda() {
  const actualizar = useUpdateConfig()
  const guardadas = useBusquedasGuardadas()
  return useMutation({
    mutationFn: async (b: Omit<BusquedaGuardada, 'id'> & { id?: string }) => {
      const id = b.id ?? crypto.randomUUID()
      // Mismo nombre = misma plantilla: es lo que espera cualquiera al
      // "guardar" dos veces, en vez de acabar con tres iguales en la lista.
      const resto = guardadas.filter(
        (g) => g.id !== id && g.nombre.trim().toLowerCase() !== b.nombre.trim().toLowerCase(),
      )
      await actualizar.mutateAsync({
        clave: CLAVE_BUSQUEDAS,
        valor: JSON.stringify([...resto, { ...b, id }]),
      })
      return id
    },
  })
}

export function useBorrarBusqueda() {
  const actualizar = useUpdateConfig()
  const guardadas = useBusquedasGuardadas()
  return useMutation({
    mutationFn: (id: string) => actualizar.mutateAsync({
      clave: CLAVE_BUSQUEDAS,
      valor: JSON.stringify(guardadas.filter((g) => g.id !== id)),
    }),
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

/**
 * Responsables del equipo. Mismo patrón que `useEmailAliases`: la lista vive en
 * `settings` (clave `responsables`, JSON de strings) y siempre incluye el valor
 * por defecto, así que nunca puede quedar vacía.
 *
 * `actual` es el responsable que ya tiene la ficha que se está editando: se
 * añade aunque no esté dado de alta, para que el desplegable no lo borre en
 * silencio al guardar un registro antiguo.
 */
export function useResponsables(actual?: string): string[] {
  const { data: cfg } = useConfig()
  const raw = cfg?.[CLAVE_RESPONSABLES]
  let guardados: string[] = []
  if (raw) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) guardados = parsed.filter((n): n is string => typeof n === 'string')
    } catch {
      // JSON inválido: se ignora y queda el valor por defecto.
    }
  }
  return componerResponsables(guardados, actual)
}

/** Da de alta un responsable nuevo. Si ya existe (ignorando acentos), no duplica. */
export function useAgregarResponsable() {
  const { data: cfg } = useConfig()
  const update = useUpdateConfig()
  return useMutation({
    mutationFn: async (nombre: string) => {
      const limpio = nombre.trim()
      if (!limpio) throw new Error('El nombre no puede estar vacío')

      const actuales = (() => {
        try {
          const p = JSON.parse(cfg?.[CLAVE_RESPONSABLES] ?? '[]')
          return Array.isArray(p) ? (p as string[]) : []
        } catch { return [] }
      })()

      // Se compara contra la lista compuesta, no sólo contra la guardada: así
      // "Juan Duvergé" no se puede dar de alta por segunda vez.
      const yaEsta = componerResponsables(actuales).some(
        (n) => claveResponsable(n) === claveResponsable(limpio),
      )
      if (!yaEsta) {
        await update.mutateAsync({ clave: CLAVE_RESPONSABLES, valor: JSON.stringify([...actuales, limpio]) })
      }
      return limpio
    },
  })
}

/**
 * El catálogo de nichos, desde Supabase (tabla `nichos`, migración 0033).
 *
 * Antes se armaba aquí mismo: `DEFAULT_NICHES` más un JSON guardado en
 * `settings`. El problema no era la lista, era dónde vivía: el importador de
 * Apify normaliza el nicho en SQL y no podía leerla, así que `leads.nicho`
 * acababa con el texto crudo de Google ("Roofing contractor") y la columna
 * Nicho salía "—" en toda la tabla. Bajando el catálogo a la BD, importador e
 * interfaz miran por fin lo mismo.
 *
 * Devuelve un array y no el objeto de la query para no tocar los ~10 sitios
 * que ya lo llaman. Mientras carga —o si falla— caen los de fábrica: un
 * desplegable de nichos vacío es peor que uno desactualizado.
 */
export function useNichosQuery() {
  return useQuery({
    queryKey: ['nichos'],
    queryFn: () => nichosService.listar(),
    staleTime: 5 * 60_000,
  })
}

export function useNichos(): Niche[] {
  const { data } = useNichosQuery()
  return useMemo(() => {
    if (!data?.length) return DEFAULT_NICHES
    // "Otros" al final pase lo que pase: es el cajón de sastre y tiene que
    // quedar después de lo que hayas creado tú, tenga el `orden` que tenga.
    const otros = data.filter((n) => n.id === 'otros')
    return [...data.filter((n) => n.id !== 'otros'), ...otros]
  }, [data])
}

/** Los nichos que creó el importador y aún no has revisado (bandeja). */
export function useNichosPendientes(): Niche[] {
  const nichos = useNichos()
  return useMemo(() => nichos.filter((n) => n.pendiente), [nichos])
}

/** Cuántos leads vivos hay por nicho. Sirve para saber qué se está fusionando. */
export function useConteoNichos() {
  return useQuery({
    queryKey: ['nichos', 'conteos'],
    queryFn: () => nichosService.conteos(),
    staleTime: 60_000,
  })
}

/** Convierte un nombre libre en un id estable y seguro para la BD. */
export function idDeNicho(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Crea un nicho nuevo y lo deja disponible para siempre. Devuelve su id. */
export function useAgregarNicho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: { nombre: string; emoji?: string; color?: string; grupo?: string }) => {
      const nombre = p.nombre.trim()
      const id = idDeNicho(nombre)
      if (!id) throw new Error('El nombre del nicho no es válido')
      // `upsert` con el id como clave: si ya existía, esto no lo pisa con
      // valores por defecto — se manda sólo lo que el usuario escribió.
      await nichosService.guardar({
        id, nombre,
        emoji: p.emoji?.trim() || '🏷️',
        color: p.color || '#94a3b8',
        grupo: p.grupo || 'Mis categorías',
        origen: 'usuario',
        // Nace revisado: lo acabas de escribir tú, no lo adivinó nadie.
        pendiente: false,
      })
      return id
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nichos'] }) },
  })
}

/** Edita un nicho existente (nombre, emoji, color, grupo, orden, revisado). */
export function useGuardarNicho() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (n: Partial<Niche> & { id: string }) => nichosService.guardar(n),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['nichos'] }) },
  })
}

/**
 * Mueve todos los leads de un nicho a otro y borra el de origen. Además deja
 * aprendido el alias, así que la próxima importación con ese mismo texto de
 * Google ya cae en el sitio bueno sin que tengas que repetir la corrección.
 */
export function useFusionarNichos() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (p: { desde: string; hacia: string }) => nichosService.fusionar(p.desde, p.hacia),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nichos'] })
      qc.invalidateQueries({ queryKey: ['leads'] })
    },
  })
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

// -----------------------------------------------------------
// CALENDARIO (eventos) — migración 0018
// -----------------------------------------------------------

/**
 * Eventos que se solapan con un rango. La clave lleva el rango porque el
 * calendario cambia de mes constantemente y cada rango es una caché distinta.
 */
export function useEventos(desdeIso: string, hastaIso: string) {
  return useQuery({
    queryKey: ['eventos', desdeIso, hastaIso],
    queryFn: () => eventosService.getDelRango(desdeIso, hastaIso),
    staleTime: 30_000,
    retry: 1,
  })
}

function useInvalidateEventos() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['eventos'] })
  }
}

export function useCrearEvento() {
  const invalidar = useInvalidateEventos()
  return useMutation({
    mutationFn: (p: EventoPayload) => eventosService.crear(p),
    onSuccess: invalidar,
  })
}

export function useActualizarEvento() {
  const invalidar = useInvalidateEventos()
  return useMutation({
    mutationFn: ({ id, ...p }: Partial<EventoPayload> & { id: string }) =>
      eventosService.actualizar(id, p),
    onSuccess: invalidar,
  })
}

/** Arrastrar o estirar en la rejilla. Sin `fin` conserva la duración. */
export function useMoverEvento() {
  const invalidar = useInvalidateEventos()
  return useMutation({
    mutationFn: ({ id, inicio, fin }: { id: string; inicio: string; fin?: string }) =>
      eventosService.mover(id, inicio, fin),
    onSuccess: invalidar,
  })
}

export function useDuplicarEvento() {
  const invalidar = useInvalidateEventos()
  return useMutation({
    mutationFn: ({ id, inicio }: { id: string; inicio?: string }) =>
      eventosService.duplicar(id, inicio),
    onSuccess: invalidar,
  })
}

export function useEliminarEvento() {
  const invalidar = useInvalidateEventos()
  return useMutation({
    mutationFn: (id: string) => eventosService.eliminar(id),
    onSuccess: invalidar,
  })
}
