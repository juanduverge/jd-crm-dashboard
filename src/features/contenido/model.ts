import type { CmsDraft, CmsField, CmsGroup, CmsItem, CmsLang, CmsScope, CmsStatus } from '@/types/cms'

export const SCOPES: Record<CmsScope, string> = { universal: 'Universal', solo_en: 'Solo EE. UU.', solo_es: 'Solo RD' }
export const STATUSES: Record<CmsStatus, string> = { idea: 'Idea', borrador: 'Borrador', revision: 'En revisión', programado: 'Programado', publicado: 'Publicado', archivado: 'Archivado' }
export const LANGUAGES: Record<CmsLang, string> = { en: 'Inglés', es: 'Español' }
export const validSlug = (slug: string) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
export const suggestSlug = (title: string) => title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
export const isWebUrl = (value: string) => { try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false } }
export const scopeAllows = (scope: CmsScope, lang: CmsLang) => scope === 'universal' || scope === `solo_${lang}`

export function draftFromItem(item: CmsItem): CmsDraft {
  return { slug: item.slug, title_h1: item.title_h1, title_seo: item.title_seo, meta_description: item.meta_description,
    primary_keyword: item.primary_keyword ?? '', author: item.author, fecha: item.fecha, sources: [...item.sources],
    og_image: item.og_image, fields: structuredClone(item.fields), body: item.body }
}

// Las versiones comparten datos, nunca texto redactado para un idioma.
export function twinValues(item: CmsItem): Omit<CmsDraft, 'slug'> {
  return { title_h1: '', title_seo: '', meta_description: '', primary_keyword: '', body: '',
    author: item.author, fecha: item.fecha, sources: [...item.sources], og_image: item.og_image, fields: structuredClone(item.fields) }
}

export function filterGroups(groups: CmsGroup[], lang: string, status: string, search: string) {
  const term = search.trim().toLocaleLowerCase()
  return groups.filter(group => group.items.some(item =>
    (!lang || item.lang === lang) && (!status || item.status === status) &&
    (!term || [item.title_h1, item.slug].some(text => text.toLocaleLowerCase().includes(term))),
  ))
}

export function localizationWarnings(draft: CmsDraft, other?: CmsItem) {
  if (!other) return []
  const warnings: string[] = []
  if (draft.slug && draft.slug === other.slug) warnings.push('El slug es igual al de la otra versión. Revisa si conviene localizarlo.')
  if (draft.title_h1.trim() && draft.title_h1.trim().toLocaleLowerCase() === other.title_h1.trim().toLocaleLowerCase()) warnings.push('El título es igual al de la otra versión. Revisa su localización.')
  const sources = (values: string[]) => JSON.stringify([...new Set(values.map(s => s.trim()).filter(Boolean))].sort())
  if (sources(draft.sources) !== sources(other.sources)) warnings.push('Las fuentes son distintas de las de la otra versión. Comprueba que los datos coinciden.')
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
