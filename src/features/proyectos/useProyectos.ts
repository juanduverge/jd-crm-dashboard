import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { proyectosService } from '@/services/proyectosService'
import type { Proyecto, ProyectoPago } from '@/types'

/**
 * Hooks del módulo Proyectos. Viven junto al módulo y no en `hooks/useData`
 * porque nadie fuera de Proyectos (salvo la pestaña de la ficha del lead) los
 * necesita, y ese archivo ya es enorme.
 */

const CLAVE = ['proyectos'] as const

function useInvalidar() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: CLAVE })
}

export function useProyectos() {
  return useQuery({ queryKey: CLAVE, queryFn: () => proyectosService.list(), staleTime: 20_000 })
}

export function useProyecto(id: string | undefined) {
  return useQuery({
    queryKey: [...CLAVE, 'uno', id],
    queryFn: () => proyectosService.get(id!),
    enabled: !!id,
  })
}

export function useProyectoDeLead(leadId: string | undefined) {
  return useQuery({
    queryKey: [...CLAVE, 'lead', leadId],
    queryFn: () => proyectosService.getByLead(leadId!),
    enabled: !!leadId,
  })
}

export function useCrearProyecto() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: (nombre: string) => proyectosService.create(nombre), onSuccess: invalidar })
}

export function useCrearProyectoDesdeLead() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: (leadId: string) => proyectosService.crearDesdeLead(leadId), onSuccess: invalidar })
}

/**
 * Guardar con actualización optimista en la lista: mover una tarjeta en el
 * tablero tiene que verse al instante, no medio segundo después.
 */
export function useActualizarProyecto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Proyecto> }) => proyectosService.update(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: CLAVE })
      const antes = qc.getQueryData<Proyecto[]>(CLAVE)
      const claveUno = [...CLAVE, 'uno', id]
      const uno = qc.getQueryData<Proyecto | null>(claveUno)
      if (antes) qc.setQueryData<Proyecto[]>(CLAVE, antes.map((p) => (p.id === id ? { ...p, ...patch } : p)))
      if (uno) qc.setQueryData<Proyecto>(claveUno, { ...uno, ...patch })
      return { antes, uno, claveUno }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(CLAVE, ctx.antes)
      if (ctx?.uno) qc.setQueryData(ctx.claveUno, ctx.uno)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: CLAVE }),
  })
}

export function useEliminarProyecto() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: (id: string) => proyectosService.remove(id), onSuccess: invalidar })
}

export function useAgregarPago() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: (p: Omit<ProyectoPago, 'id'>) => proyectosService.addPago(p), onSuccess: invalidar })
}

export function useActualizarPago() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Omit<ProyectoPago, 'id' | 'proyectoId'>> }) =>
      proyectosService.updatePago(id, patch),
    onSuccess: invalidar,
  })
}

export function useEliminarPago() {
  const invalidar = useInvalidar()
  return useMutation({ mutationFn: (id: string) => proyectosService.removePago(id), onSuccess: invalidar })
}
