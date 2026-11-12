import type { EtapaProyecto, EstadoRecopilacion, Proyecto, ProyectoPago } from '@/types'

/**
 * Vocabulario del módulo Proyectos (migración 0064). Mismo patrón que
 * `lib/pipeline.ts`: lo que se pinta vive aquí y no repartido por pantallas.
 */

/** Fases en el orden en que se recorren. `hint` es lo que se espera en cada una. */
export const ETAPAS_PROYECTO: { id: EtapaProyecto; label: string; color: string; hint: string }[] = [
  { id: 'por_arrancar', label: 'Por arrancar', color: '#94a3b8', hint: 'Ganado, falta la reunión de arranque y el anticipo' },
  { id: 'recopilando', label: 'Recopilando info', color: '#0082f3', hint: 'Pidiendo logo, textos, fotos y accesos' },
  { id: 'diseno', label: 'Diseño', color: '#6248ff', hint: 'Maquetando en Figma' },
  { id: 'revision', label: 'Revisión del cliente', color: '#f38744', hint: 'El cliente revisa el diseño' },
  { id: 'desarrollo', label: 'Desarrollo', color: '#ef6820', hint: 'Construyendo la web' },
  { id: 'pruebas', label: 'Pruebas', color: '#f59e0b', hint: 'Revisión final, móvil, velocidad y SEO' },
  { id: 'entregado', label: 'Entregado', color: '#16a34a', hint: 'Publicado y entregado al cliente' },
  { id: 'mantenimiento', label: 'Mantenimiento', color: '#0d9488', hint: 'Soporte o mantenimiento mensual' },
]

export const ETAPA_PROYECTO_META = Object.fromEntries(
  ETAPAS_PROYECTO.map((e) => [e.id, e]),
) as Record<EtapaProyecto, (typeof ETAPAS_PROYECTO)[number]>

/** Fases en las que el proyecto ya no está «en curso»: no avisan de atrasos. */
const ETAPAS_CERRADAS: EtapaProyecto[] = ['entregado', 'mantenimiento']

/**
 * Tipos de proyecto con las páginas que suelen llevar. Al elegir uno, si la
 * lista de páginas está vacía se propone esta: es el punto de partida, no un
 * molde, y se edita como cualquier otra cosa.
 */
export const TIPOS_PROYECTO: { id: string; label: string; paginas: string[] }[] = [
  { id: 'web_corporativa', label: 'Web corporativa', paginas: ['Inicio', 'Nosotros', 'Servicios', 'Contacto'] },
  { id: 'landing', label: 'Landing page', paginas: ['Landing'] },
  { id: 'tienda', label: 'Tienda online', paginas: ['Inicio', 'Catálogo', 'Producto', 'Carrito', 'Checkout', 'Contacto'] },
  { id: 'blog', label: 'Blog / revista', paginas: ['Inicio', 'Listado de artículos', 'Artículo', 'Categorías', 'Contacto'] },
  { id: 'portafolio', label: 'Portafolio', paginas: ['Inicio', 'Proyectos', 'Detalle de proyecto', 'Sobre mí', 'Contacto'] },
  { id: 'app_web', label: 'App web / sistema', paginas: ['Acceso', 'Panel', 'Ajustes'] },
  { id: 'rediseno', label: 'Rediseño de web', paginas: [] },
  { id: 'seo', label: 'SEO / posicionamiento', paginas: [] },
  { id: 'mantenimiento', label: 'Mantenimiento', paginas: [] },
  { id: 'otro', label: 'Otro', paginas: [] },
]

export const TIPO_PROYECTO_LABEL = Object.fromEntries(TIPOS_PROYECTO.map((t) => [t.id, t.label])) as Record<string, string>

export const PLATAFORMAS = [
  'Webflow', 'Next.js', 'React', 'WordPress', 'Shopify', 'Framer', 'Wix', 'HTML a medida', 'Otra',
]

/** Funcionalidades frecuentes. Se pueden añadir otras escritas a mano. */
export const FUNCIONALIDADES = [
  'Formulario de contacto', 'Botón de WhatsApp', 'Blog', 'Multidioma', 'Reservas / citas',
  'Pasarela de pago', 'Catálogo de productos', 'Galería', 'Mapa de ubicación', 'Buscador',
  'Área de clientes', 'Newsletter', 'Chat en vivo', 'Integración con CRM', 'SEO básico',
  'Google Analytics', 'Animaciones', 'Panel autoadministrable (CMS)',
]

export const MONEDAS = ['USD', 'DOP', 'EUR']

export const ENLACES_PROYECTO: { key: keyof Proyecto['enlaces']; label: string; placeholder: string }[] = [
  { key: 'diseno', label: 'Diseño', placeholder: 'https://figma.com/…' },
  { key: 'desarrollo', label: 'Desarrollo / staging', placeholder: 'https://….webflow.io' },
  { key: 'produccion', label: 'Web publicada', placeholder: 'https://cliente.com' },
  { key: 'repositorio', label: 'Repositorio', placeholder: 'https://github.com/…' },
  { key: 'carpeta', label: 'Carpeta del cliente', placeholder: 'https://drive.google.com/…' },
]

export const ESTADO_RECOPILACION: Record<EstadoRecopilacion, { label: string; cls: string; siguiente: EstadoRecopilacion }> = {
  pendiente: { label: 'Pendiente', cls: 'badge-neutral', siguiente: 'pedido' },
  pedido: { label: 'Pedido', cls: 'badge-warn', siguiente: 'recibido' },
  recibido: { label: 'Recibido', cls: 'badge-ok', siguiente: 'pendiente' },
}

// ---------------------------------------------------------------
// Cuentas que se enseñan en tablero y ficha
// ---------------------------------------------------------------

export interface ResumenCobros {
  total: number
  cobrado: number
  pendiente: number
  porcentaje: number
  vencidos: number
}

/**
 * El total es el precio del proyecto; si no hay precio, la suma del plan de
 * pagos. Así un proyecto sin precio puesto sigue enseñando algo con sentido.
 */
export function resumenCobros(p: Pick<Proyecto, 'precio' | 'pagos'>, hoy: string): ResumenCobros {
  const plan = p.pagos.reduce((s, g) => s + g.monto, 0)
  const total = p.precio ?? plan
  const cobrado = p.pagos.filter((g) => g.cobradoEn).reduce((s, g) => s + g.monto, 0)
  const vencidos = p.pagos.filter((g) => !g.cobradoEn && g.fechaPrevista && g.fechaPrevista < hoy).length
  return {
    total,
    cobrado,
    pendiente: Math.max(0, total - cobrado),
    porcentaje: total > 0 ? Math.min(100, Math.round((cobrado / total) * 100)) : 0,
    vencidos,
  }
}

/** Recibidos sobre el total de lo que hay que pedir (checklist + accesos). */
export function progresoRecopilacion(p: Pick<Proyecto, 'checklist' | 'accesos'>): { hechos: number; total: number } {
  const items = [...p.checklist, ...p.accesos]
  return { hechos: items.filter((i) => i.estado === 'recibido').length, total: items.length }
}

export type SituacionEntrega = 'sin_fecha' | 'en_plazo' | 'pronto' | 'atrasado' | 'cerrado'

/** Cómo va la fecha de entrega. «Pronto» = quedan 7 días o menos. */
export function situacionEntrega(p: Pick<Proyecto, 'etapa' | 'fechaEntregaPrevista'>, hoy: string): { sit: SituacionEntrega; dias: number | null } {
  if (ETAPAS_CERRADAS.includes(p.etapa)) return { sit: 'cerrado', dias: null }
  if (!p.fechaEntregaPrevista) return { sit: 'sin_fecha', dias: null }
  const dias = Math.round(
    (Date.parse(`${p.fechaEntregaPrevista}T00:00:00`) - Date.parse(`${hoy}T00:00:00`)) / 86_400_000,
  )
  return { sit: dias < 0 ? 'atrasado' : dias <= 7 ? 'pronto' : 'en_plazo', dias }
}

export function textoEntrega(p: Pick<Proyecto, 'etapa' | 'fechaEntregaPrevista' | 'fechaEntregado'>, hoy: string): { texto: string; cls: string } | null {
  const { sit, dias } = situacionEntrega(p, hoy)
  if (sit === 'cerrado') {
    return p.fechaEntregado ? { texto: `Entregado ${fechaCorta(p.fechaEntregado)}`, cls: 'text-muted' } : null
  }
  if (sit === 'sin_fecha' || dias === null) return { texto: 'Sin fecha de entrega', cls: 'text-muted' }
  if (sit === 'atrasado') return { texto: `Atrasado ${Math.abs(dias)} d`, cls: 'text-red-600 dark:text-red-400 font-semibold' }
  if (dias === 0) return { texto: 'Se entrega hoy', cls: 'text-amber-600 dark:text-amber-400 font-semibold' }
  if (sit === 'pronto') return { texto: `Entrega en ${dias} d`, cls: 'text-amber-600 dark:text-amber-400 font-medium' }
  return { texto: `Entrega ${fechaCorta(p.fechaEntregaPrevista!)}`, cls: 'text-muted' }
}

export function fechaCorta(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

/** Días en la fase actual: un proyecto 3 semanas en «Revisión» está parado. */
export function diasEnEtapa(p: Pick<Proyecto, 'etapaDesde'>): number {
  return Math.max(0, Math.floor((Date.now() - Date.parse(p.etapaDesde)) / 86_400_000))
}

export function siguientePagoPendiente(pagos: ProyectoPago[]): ProyectoPago | undefined {
  return [...pagos].sort((a, b) => a.orden - b.orden).find((g) => !g.cobradoEn)
}
