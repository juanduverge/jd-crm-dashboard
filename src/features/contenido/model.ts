import type { CmsDraft, CmsField, CmsGroup, CmsItem, CmsLang, CmsMercado, CmsScope, CmsStatus } from '@/types/cms'

/**
 * Alcance de una pieza. La web manda al inglés a EE. UU. y al resto del mundo,
 * y al español a los 21 países hispanohablantes (1.3 y src/middleware.ts de la
 * web). Por eso «solo español» no es «solo RD»: es todo el mundo hispano.
 */
export const SCOPES: Record<CmsScope, string> = {
  universal: 'Los dos idiomas',
  solo_en: 'Solo inglés',
  solo_es: 'Solo español',
}
export const SCOPE_INFO: Record<CmsScope, string> = {
  universal: 'El tema interesa en los dos mercados. Cada versión con su propio SEO.',
  solo_en: 'Lo buscan en inglés: EE. UU., Canadá y el resto del mundo.',
  solo_es: 'Lo buscan en español: RD, México, España y Latinoamérica.',
}

export const STATUSES: Record<CmsStatus, string> = {
  idea: 'Idea', borrador: 'Borrador', revision: 'En revisión',
  programado: 'Programado', publicado: 'Publicado', archivado: 'Archivado',
}
export const LANGUAGES: Record<CmsLang, string> = { en: 'Inglés', es: 'Español' }

/** Para qué país se investiga la palabra clave. Solo orienta la redacción. */
export const MERCADOS: Record<CmsLang, { id: CmsMercado; nombre: string }[]> = {
  en: [
    { id: 'us', nombre: 'Estados Unidos' },
    { id: 'ca', nombre: 'Canadá' },
    { id: 'global_en', nombre: 'Inglés general' },
  ],
  es: [
    { id: 'hispano', nombre: 'Hispano general' },
    { id: 'do', nombre: 'República Dominicana' },
    { id: 'mx', nombre: 'México' },
    { id: 'es', nombre: 'España' },
    { id: 'latam', nombre: 'Latinoamérica' },
  ],
}
export const MERCADO_POR_DEFECTO: Record<CmsLang, CmsMercado> = { en: 'us', es: 'hispano' }
export const nombreMercado = (lang: CmsLang, id: CmsMercado | null) =>
  MERCADOS[lang].find(m => m.id === id)?.nombre ?? null

/**
 * Las nueve páginas de servicio de la web, con la ruta exacta de cada idioma.
 * En español el slug cambia (seo-local, no local-seo): con un texto libre era
 * fácil dejar un enlace roto.
 */
export const SERVICES: { en: string; es: string; nombre: { en: string; es: string } }[] = [
  { en: 'webflow-development', es: 'desarrollo-webflow', nombre: { en: 'Webflow development', es: 'Desarrollo Webflow' } },
  { en: 'custom-web-development', es: 'desarrollo-web-a-medida', nombre: { en: 'Custom web development', es: 'Desarrollo web a medida' } },
  { en: 'shopify-development', es: 'tiendas-shopify', nombre: { en: 'Shopify store setup', es: 'Tiendas Shopify' } },
  { en: 'workflow-automation', es: 'automatizacion-de-procesos', nombre: { en: 'Workflow automation', es: 'Automatización de procesos' } },
  { en: 'custom-crm', es: 'crm-a-medida', nombre: { en: 'Custom CRM', es: 'CRM a medida' } },
  { en: 'api-integrations', es: 'integraciones-y-apis', nombre: { en: 'API integrations', es: 'Integraciones y APIs' } },
  { en: 'local-seo', es: 'seo-local', nombre: { en: 'Local SEO', es: 'SEO local' } },
  { en: 'ai-chatbots', es: 'chatbots-con-ia', nombre: { en: 'AI chatbots and agents', es: 'Chatbots con IA' } },
  { en: 'website-maintenance', es: 'mantenimiento-web', nombre: { en: 'Website maintenance', es: 'Mantenimiento web' } },
]
export const servicePath = (lang: CmsLang, s: (typeof SERVICES)[number]) =>
  lang === 'en' ? `/services/${s.en}` : `/es/servicios/${s.es}`

/** Etiquetas legibles para opciones guardadas como clave (cms_types.campos). */
export const OPTION_LABELS: Record<string, Record<string, string>> = {
  article_type: { comparativo: 'Comparativa', problema: 'Problema y solución', metodo: 'Método' },
}

export const validSlug = (slug: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
// El apóstrofo se quita, no se convierte en guion: «isn't» → «isnt», no «isn-t».
export const suggestSlug = (title: string) => title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const isWebUrl = (value: string) => { try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false } }
export const scopeAllows = (scope: CmsScope, lang: CmsLang) => scope === 'universal' || scope === `solo_${lang}`
/** «14 oct 2026». La fecha del artículo es un día sin hora: se fija a mediodía para que la zona horaria no la mueva. */
export const fechaArticulo = (fecha: string) =>
  new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
/** URL pública que tendrá el artículo. */
export const publicUrl = (lang: CmsLang, slug: string) =>
  `https://jddeveloper.com${lang === 'es' ? '/es' : ''}/blog/${slug || '…'}`

export function draftFromItem(item: CmsItem): CmsDraft {
  return { slug: item.slug, title_h1: item.title_h1, title_seo: item.title_seo, meta_description: item.meta_description,
    primary_keyword: item.primary_keyword ?? '', mercado: item.mercado ?? null, author: item.author, fecha: item.fecha,
    sources: [...item.sources], og_image: item.og_image, fields: structuredClone(item.fields), body: item.body }
}

// Las versiones comparten datos, nunca texto redactado para un idioma. El
// servicio relacionado se traduce a la ruta del otro idioma; el mercado no se
// copia (es una decisión de redacción de cada versión).
export function twinValues(item: CmsItem, lang: CmsLang): Omit<CmsDraft, 'slug'> {
  const fields = structuredClone(item.fields)
  const service = SERVICES.find(s => fields.related_service === servicePath(item.lang, s))
  if (service) fields.related_service = servicePath(lang, service)
  return { title_h1: '', title_seo: '', meta_description: '', primary_keyword: '', body: '', mercado: MERCADO_POR_DEFECTO[lang],
    author: item.author, fecha: item.fecha, sources: [...item.sources], og_image: item.og_image, fields }
}

/** Título que representa a una pieza en la lista: el de cualquier versión que lo tenga. */
export const groupTitle = (group: CmsGroup) =>
  group.items.find(item => item.title_h1.trim())?.title_h1 || group.items[0]?.slug || 'Sin título'

export function filterGroups(groups: CmsGroup[], status: string, search: string) {
  const term = search.trim().toLocaleLowerCase()
  return groups.filter(group => group.items.some(item =>
    (!status || item.status === status) &&
    (!term || [item.title_h1, item.slug].some(text => text.toLocaleLowerCase().includes(term))),
  ))
}

export function localizationWarnings(draft: CmsDraft, other?: CmsItem) {
  if (!other) return []
  const warnings: string[] = []
  if (draft.slug && draft.slug === other.slug) warnings.push('La dirección (slug) es igual a la de la otra versión: sale de la palabra clave de cada idioma.')
  if (draft.title_h1.trim() && draft.title_h1.trim().toLocaleLowerCase() === other.title_h1.trim().toLocaleLowerCase()) warnings.push('El título es igual al de la otra versión.')
  const sources = (values: string[]) => JSON.stringify([...new Set(values.map(s => s.trim()).filter(Boolean))].sort())
  if (sources(draft.sources) !== sources(other.sources)) warnings.push('Las fuentes no coinciden con las de la otra versión: un dato no cambia por idioma.')
  return warnings
}

export function validateTypeFields(draft: CmsDraft, fields: CmsField[], idea: boolean): string | null {
  for (const field of fields) {
    const value = draft.fields[field.clave]
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.every(v => !String(v).trim()))
    if (field.obligatorio && !idea && empty) return `Completa el campo ${field.etiqueta}.`
    if (empty) continue
    if (field.tipo === 'url' && !isWebUrl(String(value))) return `${field.etiqueta} debe ser una URL http:// o https://.`
    if (field.tipo === 'numero' && (typeof value !== 'number' || !Number.isFinite(value))) return `${field.etiqueta} debe ser un número válido.`
    if (field.tipo === 'opcion' && !field.opciones?.includes(String(value))) return `Selecciona una opción válida para ${field.etiqueta}.`
  }
  return null
}

/* ---------- Comprobaciones SEO ---------- */

const plano = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const STOP = new Set(['para', 'with', 'from', 'that', 'this', 'your', 'como', 'what', 'when', 'donde', 'cual', 'sobre', 'entre', 'the', 'and', 'del', 'las', 'los', 'una', 'por', 'con', 'sin'])
/** Palabras con peso de la palabra clave: sin acentos, sin palabras vacías. */
const palabrasClave = (keyword: string) =>
  plano(keyword).split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w))

/** Contiene la palabra clave si aparecen todas sus palabras con peso. */
const contiene = (text: string, keyword: string) => {
  const words = palabrasClave(keyword)
  const haystack = plano(text)
  return words.length > 0 && words.every(w => haystack.includes(w))
}

/** Primer párrafo del cuerpo, quitando el H1 y la firma como hace la web. */
export const primerParrafo = (body: string) =>
  body.replace(/\r\n/g, '\n').replace(/^\s*# .*\n/, '').replace(/^\s*(By|Por) .*\n/m, '').trim().split('\n\n')[0] ?? ''

export interface SeoCheck { ok: boolean; texto: string }

export function seoChecks(draft: CmsDraft): SeoCheck[] {
  const kw = (draft.primary_keyword ?? '').trim()
  const seoTitle = draft.title_seo || draft.title_h1
  const checks: SeoCheck[] = [
    { ok: seoTitle.length >= 30 && seoTitle.length <= 60, texto: `Título SEO entre 30 y 60 caracteres (${seoTitle.length})` },
    { ok: draft.meta_description.length >= 120 && draft.meta_description.length <= 160, texto: `Descripción entre 120 y 160 caracteres (${draft.meta_description.length})` },
  ]
  if (!kw) return [{ ok: false, texto: 'Falta la palabra clave principal' }, ...checks]
  return [
    { ok: contiene(seoTitle, kw), texto: 'La palabra clave está en el título SEO' },
    { ok: contiene(draft.meta_description, kw), texto: 'Está en la descripción' },
    { ok: contiene(draft.slug.replace(/-/g, ' '), kw), texto: 'Está en la dirección (slug)' },
    { ok: contiene(draft.title_h1, kw), texto: 'Está en el título del artículo' },
    { ok: contiene(primerParrafo(draft.body), kw), texto: 'Está en el primer párrafo' },
    ...checks,
  ]
}
