import { useConfig, useUpdateConfig } from '@/hooks/useData'

/**
 * Perfil de trabajo de Juan: desde qué números llama y cuál es su horario.
 *
 * Vive en `settings` (clave/valor global), no en una tabla: son dos listas
 * cortas que solo se leen al llamar o al buscar huecos para una reunión.
 */

export interface MiNumero {
  id: string
  /** Cómo lo llamas tú: «Móvil trabajo», «Personal», «RD»… */
  etiqueta: string
  numero: string
  whatsapp: boolean
}

export interface HorarioLaboral {
  /** ISO dow: 1 = lunes … 7 = domingo. */
  dias: number[]
  desde: string   // HH:MM
  hasta: string   // HH:MM
  /** Lo que dura una reunión normalmente, en minutos. */
  duracionReunion: number
}

export const HORARIO_POR_DEFECTO: HorarioLaboral = { dias: [1, 2, 3, 4, 5], desde: '09:00', hasta: '18:00', duracionReunion: 30 }

const CLAVE_NUMEROS = 'mis_telefonos'
const CLAVE_HORARIO = 'horario_laboral'

function leerJson<T>(valor: string | undefined, porDefecto: T): T {
  if (!valor) return porDefecto
  try { return { ...(porDefecto as object), ...JSON.parse(valor) } as T } catch { return porDefecto }
}

export function usePerfilTrabajo() {
  const { data, isLoading } = useConfig()
  const guardar = useUpdateConfig()

  let numeros: MiNumero[] = []
  try { numeros = data?.[CLAVE_NUMEROS] ? (JSON.parse(data[CLAVE_NUMEROS]) as MiNumero[]) : [] } catch { numeros = [] }
  const horario = leerJson<HorarioLaboral>(data?.[CLAVE_HORARIO], HORARIO_POR_DEFECTO)

  return {
    cargando: isLoading,
    numeros,
    horario,
    guardando: guardar.isPending,
    guardarNumeros: (n: MiNumero[]) => guardar.mutateAsync({ clave: CLAVE_NUMEROS, valor: JSON.stringify(n) }),
    guardarHorario: (h: HorarioLaboral) => guardar.mutateAsync({ clave: CLAVE_HORARIO, valor: JSON.stringify(h) }),
  }
}

/** Cómo se guarda el número usado en el historial del contacto. */
export const textoNumero = (n: MiNumero) => `${n.etiqueta} · ${n.numero}`

/** Solo dígitos, para wa.me y tel:. */
export const digitos = (t?: string) => (t ?? '').replace(/\D/g, '')
