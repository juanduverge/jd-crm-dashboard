import { supabase } from '@/lib/supabaseClient'
import type { CmsAccion, CmsDraft, CmsGroup, CmsItem, CmsLang, CmsNewGroup, CmsPublicacion, CmsScope, CmsType } from '@/types/cms'
import { MERCADO_POR_DEFECTO, scopeAllows, twinValues, validSlug } from '@/features/contenido/model'

export function cmsError(error: unknown): Error {
  const e = error as { code?: string; message?: string; details?: string }
  const detail = `${e?.message ?? ''} ${e?.details ?? ''}`
  if (e?.code === '23505') return new Error(detail.includes('uq_cms_items_grupo_lang')
    ? 'Este grupo ya tiene una versión en ese idioma. Actualiza la ficha.'
    : 'Ya existe ese slug en este idioma y tipo de contenido. Elige otro.')
  if (e?.code === '42501') return new Error('Tu sesión no tiene permiso para esta acción. Consulta a un administrador.')
  return error instanceof Error ? error : new Error(e?.message || 'No se pudo guardar el contenido. Inténtalo de nuevo.')
}

const alive = (group: CmsGroup): CmsGroup => ({ ...group, items: group.items.filter(item => !item.deleted_at) })
async function userId() {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) throw new Error('Inicia sesión de nuevo para guardar contenido.')
  return data.user.id
}

export const cmsService = {
  async types(): Promise<CmsType[]> {
    const { data, error } = await supabase.from('cms_types').select('*').eq('activo', true).order('nombre')
    if (error) throw cmsError(error)
    return data ?? []
  },
  async groups(typeIds: string[]): Promise<CmsGroup[]> {
    if (!typeIds.length) return []
    const groups: CmsGroup[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from('cms_groups').select('*,items:cms_items(*)').in('type', typeIds)
        .is('deleted_at', null).order('updated_at', { ascending: false }).range(offset, offset + 499)
      if (error) throw cmsError(error)
      groups.push(...((data ?? []) as CmsGroup[]).map(alive))
      if (!data || data.length < 500) return groups
    }
  },
  async group(id: string): Promise<CmsGroup> {
    const { data, error } = await supabase.from('cms_groups').select('*,items:cms_items(*)').eq('id', id).is('deleted_at', null).single()
    if (error) throw cmsError(error)
    return alive(data as CmsGroup)
  },
  async item(id: string): Promise<CmsItem> {
    const { data, error } = await supabase.from('cms_items').select('*').eq('id', id).is('deleted_at', null).single()
    if (error) throw cmsError(error)
    return data as CmsItem
  },
  async slugExists(type: string, lang: CmsLang, slug: string, exceptId?: string): Promise<boolean> {
    let query = supabase.from('cms_items').select('id').eq('type', type).eq('lang', lang).eq('slug', slug).is('deleted_at', null)
    if (exceptId) query = query.neq('id', exceptId)
    const { data, error } = await query.limit(1)
    if (error) throw cmsError(error)
    return !!data?.length
  },
  async create(input: CmsNewGroup): Promise<CmsItem> {
    if (!validSlug(input.slug)) throw new Error('Escribe un slug válido: letras minúsculas, números y guiones entre palabras.')
    if (!scopeAllows(input.alcance, input.lang)) throw new Error('El idioma no corresponde al alcance elegido.')
    if (!(await cmsService.types()).some(type => type.id === input.type)) throw new Error('Este tipo de contenido no está activo.')
    if (await cmsService.slugExists(input.type, input.lang, input.slug)) throw new Error('Ya existe ese slug en este idioma. Elige otro.')
    const created_by = await userId()
    const { data: group, error: groupError } = await supabase.from('cms_groups')
      .insert({ type: input.type, alcance: input.alcance, created_by }).select('id').single()
    if (groupError) throw cmsError(groupError)
    const { data, error } = await supabase.from('cms_items').insert({ group_id: group.id, type: input.type,
      lang: input.lang, slug: input.slug, title_h1: input.title, mercado: MERCADO_POR_DEFECTO[input.lang],
      status: input.idea ? 'idea' : 'borrador', created_by }).select('*').single()
    if (error) {
      // Sin RPC transaccional, retiramos el grupo vacío si falla el segundo paso.
      const cleanup = await supabase.from('cms_groups').update({ deleted_at: new Date().toISOString() }).eq('id', group.id)
      if (cleanup.error) throw new Error(`${cmsError(error).message} No se pudo retirar el grupo vacío ${group.id}; comunícalo al administrador.`)
      throw cmsError(error)
    }
    return data as CmsItem
  },
  async createTwin(groupId: string, lang: CmsLang, slug: string, title = ''): Promise<CmsItem> {
    const group = await cmsService.group(groupId)
    if (group.alcance !== 'universal') throw new Error('Solo un grupo universal puede tener las dos versiones.')
    if (group.items.some(item => item.lang === lang)) throw new Error('La versión ya existe. Actualiza la ficha.')
    const source = group.items.find(item => item.lang !== lang)
    if (!source) throw new Error('Falta el artículo de origen para esta versión.')
    if (!validSlug(slug)) throw new Error('Escribe un slug válido para el nuevo idioma.')
    if (await cmsService.slugExists(group.type, lang, slug)) throw new Error('Ya existe ese slug en este idioma. Elige otro.')
    const { data, error } = await supabase.from('cms_items').insert({ ...twinValues(source, lang), title_h1: title.trim(), slug, group_id: groupId,
      type: group.type, lang, status: 'borrador', created_by: await userId() }).select('*').single()
    if (error) throw cmsError(error)
    return data as CmsItem
  },
  async saveGroup(group: CmsGroup, values: { alcance: CmsScope; intencion: string; notas: string }): Promise<CmsGroup> {
    if (group.items.some(item => !scopeAllows(values.alcance, item.lang))) throw new Error('El alcance elegido dejaría fuera una versión existente. Conserva Universal o el idioma de esa versión.')
    const { data, error } = await supabase.from('cms_groups').update({ alcance: values.alcance, intencion: values.intencion, notas: values.notas })
      .eq('id', group.id).eq('updated_at', group.updated_at).is('deleted_at', null).select('*,items:cms_items(*)').maybeSingle()
    if (error) throw cmsError(error)
    if (!data) throw new Error('El grupo cambió en otra sesión. Recarga antes de guardar para no sobrescribir sus cambios.')
    return alive(data as CmsGroup)
  },
  async saveItem(item: CmsItem, draft: CmsDraft, status?: 'idea' | 'borrador'): Promise<CmsItem> {
    if (!validSlug(draft.slug)) throw new Error('El slug solo admite letras minúsculas, números y guiones entre palabras.')
    if (status !== undefined && (!['idea', 'borrador'].includes(status) || !['idea', 'borrador'].includes(item.status))) throw new Error('En este editor solo puedes cambiar entre Idea y Borrador.')
    // Lista explícita: un objeto de formulario nunca puede sobrescribir publicación ni grupo/idioma.
    const payload = { slug: draft.slug, title_h1: draft.title_h1, title_seo: draft.title_seo,
      meta_description: draft.meta_description, primary_keyword: draft.primary_keyword, mercado: draft.mercado, author: draft.author,
      fecha: draft.fecha || null, sources: draft.sources, og_image: draft.og_image || null, fields: draft.fields, body: draft.body,
      tldr: draft.tldr.map(t => t.trim()).filter(Boolean), faqs: draft.faqs.filter(f => f.q.trim()), cierre: draft.cierre?.titulo.trim() ? draft.cierre : null,
      ...(status !== undefined ? { status } : {}) }
    const { data, error } = await supabase.from('cms_items').update(payload).eq('id', item.id)
      .eq('updated_at', item.updated_at).eq('status', item.status).is('deleted_at', null).select('*').maybeSingle()
    if (error) throw cmsError(error)
    if (!data) throw new Error('Este artículo cambió en otra sesión. Tu texto sigue aquí; cópialo antes de recargar y comparar.')
    return data as CmsItem
  },
  /**
   * Cambios de estado que no tocan la web: idea, borrador, revisión y programado.
   * Programar lo bloquea la base para quien no es admin (trigger de la 0057).
   */
  async setStatus(item: CmsItem, status: 'idea' | 'borrador' | 'revision' | 'programado', programadoPara?: string): Promise<CmsItem> {
    if (status === 'programado' && !programadoPara) throw new Error('Elige el día y la hora.')
    const { data, error } = await supabase.from('cms_items')
      .update({ status, programado_para: status === 'programado' ? programadoPara : null })
      .eq('id', item.id).eq('updated_at', item.updated_at).is('deleted_at', null).select('*').maybeSingle()
    if (error) throw cmsError(error)
    if (!data) throw new Error('Este artículo cambió en otra sesión. Recarga la página.')
    return data as CmsItem
  },
  /** Publicar, retirar o actualizar la web. Lo hace la Edge Function cms-publicar (solo admin). */
  async publish(accion: CmsAccion, itemId?: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('cms-publicar', { body: { accion, item_id: itemId } })
    if (error) {
      // El mensaje útil viene en el cuerpo de la respuesta, no en el error genérico.
      const body = await (error as { context?: Response }).context?.json?.().catch(() => null)
      throw new Error(body?.error ?? 'No se pudo publicar. Inténtalo de nuevo.')
    }
    return (data as { publicacion_id: string }).publicacion_id
  },
  async publicaciones(limit = 10): Promise<CmsPublicacion[]> {
    const { data, error } = await supabase.from('cms_publicaciones')
      .select('id,item_ids,accion,estado,detalle,run_url,created_at,iniciado_en,terminado_en')
      .order('created_at', { ascending: false }).limit(limit)
    if (error) throw cmsError(error)
    return (data ?? []) as CmsPublicacion[]
  },
  /** Leads del formulario por artículo leído (0061): { '/blog/slug': 3 }. */
  async leadsPorArticulo(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('web_leads').select('articulo').not('articulo', 'is', null).is('deleted_at', null)
    if (error) throw cmsError(error)
    const cuenta: Record<string, number> = {}
    for (const { articulo } of (data ?? []) as { articulo: string }[]) cuenta[articulo] = (cuenta[articulo] ?? 0) + 1
    return cuenta
  },
  async uploadCover(itemId: string, file: File): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'].includes(file.type)) throw new Error('Elige una imagen JPG, PNG, WebP, AVIF o GIF.')
    if (file.size > 10 * 1024 * 1024) throw new Error('La portada puede ocupar hasta 10 MB.')
    const name = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const path = `articulos/${itemId}/${crypto.randomUUID()}-${name}`
    const created_by = await userId()
    const { error } = await supabase.storage.from('cms').upload(path, file, { upsert: false, contentType: file.type })
    if (error) throw cmsError(error)
    const { data } = supabase.storage.from('cms').getPublicUrl(path)
    const { error: mediaError } = await supabase.from('cms_media').insert({ path, url: data.publicUrl, created_by })
    if (mediaError) throw new Error(`La imagen se subió, pero no se pudo registrar (${path}). Comunícalo al administrador antes de volver a subirla.`)
    return data.publicUrl
  },
}
