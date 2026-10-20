import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Eye, Plus, Save, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { cmsService } from '@/services/cmsService'
import { useAuthStore } from '@/store/authStore'
import type { CmsDraft, CmsGroup, CmsItem, CmsType } from '@/types/cms'
import { BackToContent, ContentError, Field, LoadingContent, StatusBadge, TypeFields, UnsavedChangesDialog } from './components'
import { useCmsGroup, useCmsItem, useCmsTypes, useDebounced, useUnsavedChanges } from './hooks'
import { draftFromItem, isWebUrl, LANGUAGES, localizationWarnings, suggestSlug, validateTypeFields, validSlug } from './model'
import { ArticlePreview } from './ArticlePreview'

export default function EditorPage() {
  const { itemId = '' } = useParams()
  const item = useCmsItem(itemId)
  const group = useCmsGroup(item.data?.group_id ?? '')
  const types = useCmsTypes()
  if (item.isError || group.isError || types.isError) return <ContentError retry={() => { void item.refetch(); void group.refetch(); void types.refetch() }} />
  if (item.isLoading || group.isLoading || types.isLoading) return <LoadingContent />
  const type = types.data?.find(t => t.id === item.data?.type)
  if (!item.data || !group.data || !type) return <><BackToContent /><p>Este artículo no existe o su tipo no está activo.</p></>
  return <EditorForm key={item.data.id} initial={item.data} group={group.data} type={type} />
}

function EditorForm({ initial, group, type }: { initial: CmsItem; group: CmsGroup; type: CmsType }) {
  const client = useQueryClient()
  const canWrite = useAuthStore(state => state.user?.role === 'admin' || state.user?.role === 'vendedor')
  const [item, setItem] = useState(initial)
  const [draft, setDraft] = useState<CmsDraft>(() => draftFromItem(initial))
  const [status, setStatus] = useState(initial.status)
  const [tab, setTab] = useState<'write' | 'preview' | 'other'>('write')
  const [showOther, setShowOther] = useState(false)
  const [validation, setValidation] = useState('')
  const other = group.items.find(i => i.id !== item.id && i.lang !== item.lang)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromItem(item)) || status !== item.status
  const set = <K extends keyof CmsDraft>(key: K, value: CmsDraft[K]) => setDraft(previous => ({ ...previous, [key]: value }))
  const settledSlug = useDebounced(draft.slug)
  const preview = useDebounced(draft, 250)
  const slugCheck = useQuery({ queryKey: ['cms', 'slug', item.type, item.lang, settledSlug, item.id],
    queryFn: () => cmsService.slugExists(item.type, item.lang, settledSlug, item.id), enabled: canWrite && validSlug(settledSlug), retry: false })
  const duplicate = draft.slug === settledSlug && slugCheck.data === true
  const save = useMutation({
    mutationFn: (values: CmsDraft) => cmsService.saveItem(item, values, status !== item.status && (status === 'idea' || status === 'borrador') ? status : undefined),
    onSuccess: async saved => { setItem(saved); setDraft(draftFromItem(saved)); setStatus(saved.status); setValidation(''); await client.invalidateQueries({ queryKey: ['cms'] }); toast.success('Contenido guardado') },
    onError: error => toast.error(error.message),
  })
  const upload = useMutation({ mutationFn: (file: File) => cmsService.uploadCover(item.id, file),
    onSuccess: url => { set('og_image', url); toast.success('Portada subida. Guarda el artículo para asociarla.') },
    onError: error => toast.error(error.message),
  })
  const navigation = useUnsavedChanges(canWrite && (dirty || upload.isPending || save.isPending))
  const warnings = localizationWarnings(draft, other)
  const disabled = !canWrite || save.isPending || upload.isPending
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (disabled) return
    const sources = draft.sources.map(source => source.trim()).filter(Boolean)
    if (sources.some(source => !isWebUrl(source))) { setValidation('Cada fuente debe ser una URL completa que empiece por http:// o https://.'); return }
    if (draft.og_image && !isWebUrl(draft.og_image)) { setValidation('La URL de portada debe empezar por http:// o https://.'); return }
    if (duplicate || !validSlug(draft.slug)) { setValidation('Corrige el slug antes de guardar.'); return }
    const typeError = validateTypeFields(draft, type.campos, status === 'idea')
    if (typeError) { setValidation(typeError); setTab('write'); return }
    setValidation('')
    save.mutate({ ...draft, sources })
  }
  return <div className="min-w-0 space-y-4">
    <BackToContent />
    <PageHeader title={draft.title_h1 || 'Escribir contenido'} subtitle={`${LANGUAGES[item.lang]} · ${type.nombre}`} actions={<Link className="btn border border-border px-4 py-2 text-sm" to={`/contenido/grupo/${group.id}`}>Ver grupo EN / ES</Link>} />
    <div className="flex flex-wrap items-center gap-3"><StatusBadge item={item} /><span role="status" className="text-xs text-muted">{save.isPending ? 'Guardando…' : dirty ? 'Cambios sin guardar' : 'Todo guardado'}</span>{!canWrite && <span className="text-xs text-muted">Tu sesión tiene acceso de solo lectura.</span>}{other && <Button type="button" variant="outline" size="sm" onClick={() => { setShowOther(!showOther); setTab(showOther ? 'write' : 'other') }}><Eye size={14} />{showOther ? 'Ocultar otra versión' : 'Ver la otra versión'}</Button>}</div>
    {item.status === 'publicado' && <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">Los cambios se verán en la web cuando se vuelva a publicar</p>}
    {warnings.length > 0 && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><p className="mb-1 font-semibold">Revisa la localización</p><ul className="list-disc space-y-1 pl-5">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}
    <div role="tablist" aria-label="Vista del editor" className="flex flex-wrap gap-2 xl:hidden">{([['write','Escribir'],['preview','Vista previa'], ...(showOther ? [['other','Otra versión']] : [])] as [typeof tab, string][]).map(([value,label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`rounded-lg border px-4 py-2 text-sm ${tab === value ? 'border-primary-400 bg-primary-50 text-primary-800' : 'border-border'}`}>{label}</button>)}</div>
    <form noValidate onSubmit={submit} className="min-w-0 space-y-4">
      <div className={`grid min-w-0 items-start gap-5 xl:grid-cols-2 ${showOther ? '2xl:grid-cols-3' : ''}`}>
        <section aria-label="Escribir artículo" className={`${tab === 'write' ? '' : 'hidden'} min-w-0 space-y-5 xl:block`}>
          <fieldset disabled={disabled} className="card min-w-0 space-y-4">
            <h2 className="font-semibold">Datos del artículo</h2>
            <Field label="Título H1"><Input value={draft.title_h1} onChange={e => set('title_h1', e.target.value)} /></Field>
            <Field label="Título SEO" hint={<span className={draft.title_seo.length > 60 ? 'text-amber-700' : ''}>{draft.title_seo.length}/60{draft.title_seo.length > 60 ? ' · Conviene acortarlo' : ''}</span>}><Input value={draft.title_seo} onChange={e => set('title_seo', e.target.value)} /></Field>
            <Field label="Descripción para buscadores" hint={<span className={draft.meta_description.length > 160 ? 'text-amber-700' : ''}>{draft.meta_description.length}/160{draft.meta_description.length > 160 ? ' · Conviene acortarla' : ''}</span>}><Textarea value={draft.meta_description} onChange={e => set('meta_description', e.target.value)} /></Field>
            <Field label="Slug" hint="Solo letras minúsculas, números y guiones entre palabras."><Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={e => set('slug', e.target.value)} /></Field>
            {suggestSlug(draft.title_h1) && suggestSlug(draft.title_h1) !== draft.slug && <Button type="button" variant="ghost" size="sm" onClick={() => set('slug', suggestSlug(draft.title_h1))}>Proponer desde el título</Button>}
            {duplicate && <p role="alert" className="text-sm text-red-600">Ya existe ese slug en este idioma. Elige otro.</p>}
            {slugCheck.isFetching && <p className="text-xs text-muted">Comprobando slug…</p>}
            {slugCheck.isError && <p className="text-xs text-amber-700">No se pudo comprobar el slug. Al guardar se volverá a validar en la base de datos.</p>}
            <Field label="Palabra clave principal"><Input value={draft.primary_keyword ?? ''} onChange={e => set('primary_keyword', e.target.value)} /></Field>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2"><Field label="Autor"><Input value={draft.author} onChange={e => set('author', e.target.value)} /></Field><Field label="Fecha"><Input type="date" value={draft.fecha ?? ''} onChange={e => set('fecha', e.target.value || null)} /></Field></div>
            {(['idea','borrador'] as string[]).includes(item.status) && <Field label="Etapa de escritura"><Select value={status} onChange={e => setStatus(e.target.value as 'idea' | 'borrador')}><option value="idea">Idea</option><option value="borrador">Borrador</option></Select></Field>}
          </fieldset>
          <fieldset disabled={disabled} className="card min-w-0 space-y-4"><h2 className="font-semibold">Campos de {type.nombre.toLowerCase()}</h2><TypeFields fields={type.campos} values={draft.fields} disabled={disabled} allowIncomplete={status === 'idea'} onChange={fields => set('fields', fields)} /></fieldset>
          <fieldset disabled={disabled} className="card min-w-0 space-y-4"><h2 className="font-semibold">Fuentes</h2>{draft.sources.map((source,index) => <div key={index} className="flex min-w-0 items-start gap-2"><Input type="url" aria-label={`Fuente ${index + 1}`} placeholder="https://…" value={source} onChange={e => set('sources', draft.sources.map((s,i) => i === index ? e.target.value : s))} /><Button type="button" variant="ghost" size="icon" aria-label={`Quitar fuente ${index + 1}`} onClick={() => set('sources', draft.sources.filter((_,i) => i !== index))}><Trash2 size={16} /></Button></div>)}<Button type="button" variant="outline" size="sm" onClick={() => set('sources', [...draft.sources, ''])}><Plus size={14} />Añadir fuente</Button></fieldset>
          <fieldset disabled={disabled} className="card min-w-0 space-y-4"><h2 className="font-semibold">Portada</h2><Field label="URL de la portada"><Input type="url" value={draft.og_image ?? ''} onChange={e => set('og_image', e.target.value)} placeholder="https://…" /></Field><Field label="O subir una imagen" hint="JPG, PNG, WebP, AVIF o GIF. Hasta 10 MB."><input className="block w-full min-w-0 text-sm file:mr-3 file:rounded-lg file:border file:border-border file:bg-surface-2 file:px-3 file:py-2" type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" onChange={e => { const file = e.target.files?.[0]; if (file) upload.mutate(file); e.target.value = '' }} /></Field></fieldset>
          {upload.isPending && <p role="status" className="text-sm text-muted">Subiendo portada…</p>}
          {upload.error && <p role="alert" className="break-words text-sm text-red-600">{upload.error.message}</p>}
          <fieldset disabled={disabled} className="card min-w-0 space-y-3"><Field label="Cuerpo en Markdown"><Textarea className="min-h-[460px] font-mono text-sm" spellCheck lang={item.lang} value={draft.body} onChange={e => set('body', e.target.value)} placeholder="# Título del artículo\n\nEscribe aquí…" /></Field></fieldset>
        </section>
        <section aria-label="Vista previa" className={`${tab === 'preview' ? '' : 'hidden'} min-w-0 space-y-3 xl:sticky xl:top-4 xl:block`}><h2 className="font-semibold">Vista previa</h2><ArticlePreview draft={preview} lang={item.lang} /><p className="text-xs text-muted">La vista previa se actualiza mientras escribes.</p></section>
        {showOther && other && <section aria-label="Otra versión, solo lectura" className={`${tab === 'other' ? '' : 'hidden'} min-w-0 space-y-3 xl:block`}><h2 className="font-semibold">{LANGUAGES[other.lang]} · Solo lectura</h2><p className="break-words text-xs text-muted">{other.slug}</p><ArticlePreview draft={draftFromItem(other)} lang={other.lang} title="Otra versión, solo lectura" /><details className="card"><summary className="cursor-pointer text-sm">Ver Markdown original</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{other.body || 'Todavía no tiene cuerpo.'}</pre></details></section>}
      </div>
      {(validation || save.error) && <p role="alert" className="break-words rounded-xl bg-red-50 p-3 text-sm text-red-700">{validation || save.error?.message}</p>}
      {canWrite && <div className="sticky bottom-2 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 shadow-card"><span className="text-xs text-muted">{dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}</span><Button type="submit" disabled={disabled || !dirty || duplicate}><Save size={16} />{save.isPending ? 'Guardando…' : 'Guardar'}</Button></div>}
    </form>
    <UnsavedChangesDialog navigation={navigation} />
  </div>
}
