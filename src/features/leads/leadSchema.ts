import { z } from 'zod'

export const leadSchema = z.object({
  empresa: z.string().min(2, 'Nombre de empresa requerido'),
  nicho: z.string().min(1, 'Selecciona un nicho'),
  ciudad: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  telefono: z.string().optional(),
  web: z.string().url('URL inválida').optional().or(z.literal('')),
  whatsapp: z.string().optional(),
  score: z.coerce.number().min(0).max(100),
  valorEstimado: z.coerce.number().min(0).optional(),
  estado: z.enum([
    'nuevo', 'contactado', 'seguimiento', 'respondio', 'reunion',
    'propuesta', 'negociacion', 'ganado', 'perdido',
  ]),
  prioridad: z.enum(['alta', 'media', 'baja']),
  notas: z.string().optional(),
})

export type LeadFormValues = z.infer<typeof leadSchema>
