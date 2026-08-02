import { useMemo } from 'react'
import { useEventos, useFollowUpsAgenda, useGoals, usePlanDelRango, useTareas } from '@/hooks/useData'
import { diasDelRango } from '../shared/goalMeta'
import { construirItems, indexarPorFecha, type ItemCalendario } from './itemCalendario'

/**
 * Todos los datos del calendario para un rango de días, ya normalizados.
 *
 * Las cuatro vistas (día, semana, mes, año) usan este mismo hook con rangos
 * distintos: es el único sitio que sabe qué tablas hay que leer, así que
 * cambiar de vista no cambia la forma de pedir los datos, sólo el rango.
 *
 * Las consultas se comparten por queryKey en TanStack Query, así que pasar de
 * la vista de semana a la de día dentro del mismo mes no vuelve a pegarle a la
 * red: `tareas` y `seguimientos` no dependen del rango, y `goals` y `eventos`
 * se cachean por sus fechas.
 */
export function useCalendario(desde: string, hasta: string) {
  // Los eventos se piden por instante, no por día: `inicio`/`fin` son
  // timestamptz. Se cubre el día entero de los bordes.
  const desdeIso = new Date(`${desde}T00:00:00`).toISOString()
  const hastaIso = new Date(`${hasta}T23:59:59`).toISOString()

  const eventos = useEventos(desdeIso, hastaIso)
  const goals = useGoals(desde, hasta)
  const plan = usePlanDelRango(desde, hasta)
  const tareas = useTareas()
  const seguimientos = useFollowUpsAgenda()

  const dias = useMemo(() => diasDelRango(desde, hasta), [desde, hasta])

  const items = useMemo(
    () => construirItems(
      {
        eventos: eventos.data,
        goals: goals.data,
        bloques: plan.data?.bloques,
        tareas: tareas.data,
        seguimientos: seguimientos.data,
      },
      dias,
    ),
    [eventos.data, goals.data, plan.data, tareas.data, seguimientos.data, dias],
  )

  const porFecha = useMemo(() => indexarPorFecha(items), [items])

  return {
    dias,
    items,
    porFecha,
    /** Sólo cuenta la carga inicial: refrescar en segundo plano no debe vaciar la rejilla. */
    cargando: eventos.isLoading || goals.isLoading || plan.isLoading,
  }
}

export type { ItemCalendario }
