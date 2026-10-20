export type CmsLang = 'en' | 'es'
export type CmsScope = 'universal' | 'solo_en' | 'solo_es'
export type CmsStatus = 'idea' | 'borrador' | 'revision' | 'programado' | 'publicado' | 'archivado'
export type CmsValue = string | number | boolean | null | CmsValue[] | { [key: string]: CmsValue }
export interface CmsField {
  clave: string
  etiqueta: string
  tipo: 'opcion' | 'texto' | 'texto_largo' | 'fecha' | 'numero' | 'url' | 'lista'
  obligatorio?: boolean
  opciones?: string[]
}
export interface CmsType { id: string; nombre: string; activo: boolean; campos: CmsField[] }
export interface CmsItem {
  id: string
  group_id: string
  type: string
  lang: CmsLang
  status: CmsStatus
  slug: string
  title_h1: string
  title_seo: string
  meta_description: string
  primary_keyword: string | null
  author: string
  fecha: string | null
  sources: string[]
  og_image: string | null
  fields: Record<string, CmsValue>
  body: string
  updated_at: string
  deleted_at: string | null
}
export interface CmsGroup {
  id: string
  type: string
  alcance: CmsScope
  intencion: string | null
  notas: string | null
  updated_at: string
  items: CmsItem[]
}
export type CmsDraft = Pick<CmsItem, 'slug' | 'title_h1' | 'title_seo' | 'meta_description' | 'primary_keyword' | 'author' | 'fecha' | 'sources' | 'og_image' | 'fields' | 'body'>
export interface CmsNewGroup {
  type: string
  alcance: CmsScope
  lang: CmsLang
  slug: string
  title: string
  idea: boolean
}
