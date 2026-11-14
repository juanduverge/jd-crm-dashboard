import { z } from 'zod'
import type { LeadIdioma, LeadOrigen } from '@/types'

export const leadSchema = z.object({
  // Empresa
  empresa: z.string().min(2, 'Nombre de empresa requerido'),
  nicho: z.string().min(1, 'Selecciona un nicho'),
  web: z.string().url('URL inválida').optional().or(z.literal('')),
  direccion: z.string().optional(),
  ciudad: z.string().optional(),
  pais: z.string().optional(),
  // Contacto principal
  cargo: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  whatsapp: z.string().optional(),
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  linkedin: z.string().optional(),
  // Comercial / gestión
  fuente: z.string().optional(),
  // Por dónde llegó y en qué idioma habla (0065). '' = sin dato.
  origen: z.string().optional(),
  referidoPor: z.string().optional(),
  idioma: z.string().optional(),
  responsable: z.string().optional(),
  etiquetas: z.string().optional(), // CSV en el form; se serializa a array al persistir
  scoreManual: z.coerce.number().min(0).max(100).optional(),
  valorEstimado: z.coerce.number().min(0).optional(),
  estado: z.enum([
    'nuevo', 'contactado', 'seguimiento', 'respondio', 'reunion',
    'propuesta', 'negociacion', 'ganado', 'perdido',
  ]),
  prioridad: z.enum(['alta', 'media', 'baja']),
  notas: z.string().optional(),
})

export type LeadFormValues = z.infer<typeof leadSchema>

/** Convierte los valores del form (etiquetas CSV) a un patch de Lead (etiquetas array). */
export function formToLeadPatch(values: LeadFormValues) {
  const { etiquetas, origen, idioma, ...rest } = values
  return {
    ...rest,
    origen: (origen || '') as LeadOrigen,
    idioma: (idioma || '') as LeadIdioma,
    etiquetas: (etiquetas ?? '').split(',').map((t) => t.trim()).filter(Boolean),
  }
}
