import { z } from 'zod'

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
  const { etiquetas, ...rest } = values
  return {
    ...rest,
    etiquetas: (etiquetas ?? '').split(',').map((t) => t.trim()).filter(Boolean),
  }
}
