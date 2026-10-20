import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Eye, Save, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui'
import { Drawer } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { cmsService } from '@/services/cmsService'
import { useAuthStore } from '@/store/authStore'
import type { CmsDraft, CmsGroup, CmsItem, CmsLang, CmsType } from '@/types/cms'
import { BackToContent, ContentError, LangChip, LoadingContent, StatusBadge, UnsavedChangesDialog } from './components'
import { Cover, FormatBar, PreviewOverlay, useAutosize } from './EditorParts'
import { EditorPanel } from './EditorPanel'
import { useCmsGroup, useCmsItem, useCmsTypes, useDebounced, useUnsavedChanges } from './hooks'
import { draftFromItem, isWebUrl, LANGUAGES, localizationWarnings, nombreMercado, OPTION_LABELS, scopeAllows, suggestSlug, validateTypeFields, validSlug } from './model'
import { NewContentDialog } from './NewContentDialog'
import { PublishControls, PublishStatus } from './PublishControls'

/**
 * Editor de un artículo.
 *
 * Escribir es lo principal: título grande y texto, como un documento. Todo lo
 * demás (SEO, servicio, fuentes, la pieza) va en el panel de la derecha, que
 * en el móvil se abre desde abajo. El cambio de idioma está arriba: EN | ES.
 */
export default function EditorPage() {
  const { itemId = '' } = useParams()
  const item = useCmsItem(itemId)
  const group = useCmsGroup(item.data?.group_id ?? '')
  const types = useCmsTypes()
  if (item.isError || group.isError || types.isError) return <ContentError retry={() => { void item.refetch(); void group.refetch(); void types.refetch() }} />
  if (item.isLoading || group.isLoading || types.isLoading) return <LoadingContent />
  const type = types.data?.find(t => t.id === item.data?.type)
  if (!item.data || !group.data || !type) return <div className="space-y-4"><BackToContent /><p>Este artículo no existe o su tipo no está activo.</p></div>
  return <EditorForm key={item.data.id} initial={item.data} group={group.data} type={type} />
}

function EditorForm({ initial, group, type }: { initial: CmsItem; group: CmsGroup; type: CmsType }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const canWrite = useAuthStore(state => state.user?.role === 'admin' || state.user?.role === 'vendedor')
  const isAdmin = useAuthStore(state => state.user?.role === 'admin')
  const [item, setItem] = useState(initial)
  const [draft, setDraft] = useState<CmsDraft>(() => draftFromItem(initial))
  const [panelOpen, setPanelOpen] = useState(false)
  const [preview, setPreview] = useState<'mine' | 'other' | null>(null)
  const [twinLang, setTwinLang] = useState<CmsLang | null>(null)
  const [validation, setValidation] = useState('')
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  useAutosize(titleRef, draft.title_h1)
  useAutosize(bodyRef, draft.body)

  const other = group.items.find(i => i.lang !== item.lang)
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromItem(item))
  const set = useCallback(<K extends keyof CmsDraft>(key: K, value: CmsDraft[K]) => setDraft(prev => ({ ...prev, [key]: value })), [])
  // Como en Webflow: la dirección sigue al título mientras nadie la haya tocado
  // a mano y el artículo no esté publicado (cambiarla entonces rompe enlaces).
  const slugAuto = item.status !== 'publicado' && item.status !== 'archivado'
  const setTitle = (title: string) => setDraft(prev => {
    const sigue = slugAuto && (!prev.slug || prev.slug === suggestSlug(prev.title_h1))
    return { ...prev, title_h1: title, slug: sigue && suggestSlug(title) ? suggestSlug(title) : prev.slug }
  })

  const settledSlug = useDebounced(draft.slug)
  const slugCheck = useQuery({
    queryKey: ['cms', 'slug', item.type, item.lang, settledSlug, item.id],
    queryFn: () => cmsService.slugExists(item.type, item.lang, settledSlug, item.id),
    enabled: canWrite && validSlug(settledSlug), retry: false,
  })
  const duplicate = draft.slug === settledSlug && slugCheck.data === true

  const save = useMutation({
    // El estado lo cambian los botones de publicación (PublishControls), no el guardado.
    mutationFn: (values: CmsDraft) => cmsService.saveItem(item, values),
    onSuccess: async saved => {
      setItem(saved); setDraft(draftFromItem(saved)); setValidation('')
      await client.invalidateQueries({ queryKey: ['cms'] })
      toast.success('Guardado')
    },
    onError: error => toast.error(error.message),
  })
  const upload = useMutation({
    mutationFn: (file: File) => cmsService.uploadCover(item.id, file),
    onSuccess: url => { set('og_image', url); toast.success('Portada lista. Guarda para conservarla.') },
    onError: error => toast.error(error.message),
  })
  const navigation = useUnsavedChanges(canWrite && (dirty || upload.isPending || save.isPending))
  const disabled = !canWrite || save.isPending || upload.isPending
  const warnings = localizationWarnings(draft, other)

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    if (disabled || !dirty) return
    const sources = draft.sources.map(s => s.trim()).filter(Boolean)
    const fail = (message: string, openPanel = true) => { setValidation(message); if (openPanel) setPanelOpen(true) }
    if (sources.some(s => !isWebUrl(s))) return fail('Cada fuente tiene que ser una dirección completa que empiece por https://.')
    if (draft.og_image && !isWebUrl(draft.og_image)) return fail('La URL de la portada tiene que empezar por https://.')
    if (duplicate || !validSlug(draft.slug)) return fail('Corrige la dirección (slug): solo minúsculas, números y guiones, y que no esté repetida.')
    const typeError = validateTypeFields(draft, type.campos, item.status === 'idea')
    if (typeError) return fail(typeError)
    setValidation('')
    save.mutate({ ...draft, sources })
  }
  // Ctrl/Cmd+S guarda, como en cualquier editor.
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); submitRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const goLang = (lang: CmsLang) => {
    if (lang === item.lang) return
    const target = group.items.find(i => i.lang === lang)
    if (target) navigate(`/contenido/item/${target.id}`)
    else if (canWrite) setTwinLang(lang)
  }
  const words = draft.body.trim() ? draft.body.trim().split(/\s+/).length : 0
  const saveLabel = save.isPending ? 'Guardando…' : dirty ? 'Sin guardar' : 'Guardado'
  const panelProps = {
    item, group, type, draft, set, disabled, canWrite, other,
    slugState: { duplicate, checking: slugCheck.isFetching, failed: slugCheck.isError },
    onShowOther: () => setPreview('other'),
  }

  // Las barras fijas se apilan bajo la del CRM (--topbar-h). La del editor mide 49px.
  return <><form noValidate onSubmit={submit} className="min-w-0">
    {/* Barra superior: siempre a la vista mientras se escribe. */}
    <div className="sticky top-[calc(var(--topbar-h)+var(--safe-top))] z-20 -mx-3 -mt-4 mb-5 flex h-[49px] items-center gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur sm:-mx-4 sm:-mt-5 sm:px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
      <BackToContent />
      <div className="ml-1 flex items-center gap-1.5 sm:ml-3">
        {(['en', 'es'] as const).filter(lang => scopeAllows(group.alcance, lang)).map(lang =>
          <LangChip key={lang} lang={lang} item={group.items.find(i => i.lang === lang)} active={lang === item.lang}
            missing={!group.items.some(i => i.lang === lang)} onClick={() => goLang(lang)} />)}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span role="status" className={cn('hidden text-xs sm:inline', dirty ? 'text-amber-700 dark:text-amber-400' : 'text-muted')}>{saveLabel}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => setPreview('mine')} aria-label="Vista previa">
          <Eye size={15} /><span className="hidden sm:inline">Vista previa</span>
        </Button>
        <Button type="button" variant="outline" size="sm" className="lg:hidden" onClick={() => setPanelOpen(true)} aria-label="Ajustes">
          <SlidersHorizontal size={15} />
        </Button>
        {canWrite && <Button type="submit" size="sm" variant={dirty ? 'primary' : 'outline'} disabled={disabled || !dirty || duplicate} aria-label="Guardar">
          <Save size={15} /><span className="hidden sm:inline">{save.isPending ? 'Guardando…' : 'Guardar'}</span>
        </Button>}
        <PublishControls item={item} dirty={dirty} canWrite={canWrite} isAdmin={isAdmin} onChange={setItem} />
      </div>
    </div>

    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="mx-auto w-full min-w-0 max-w-[760px] space-y-4">
        <PublishStatus item={item} onRetry={isAdmin ? () => { void cmsService.publish('reconstruir')
          .then(() => client.invalidateQueries({ queryKey: ['cms'] })).catch((e: Error) => toast.error(e.message)) } : undefined} />
        {item.status === 'publicado' && <p className="rounded-xl px-3 py-2 text-[0.8125rem]"
          style={{ color: 'rgb(var(--warn))', background: 'rgb(var(--warn-soft) / 0.55)' }}>
          Está publicado. Lo que guardes llega a la web al pulsar «Actualizar la web».
        </p>}
        {item.status === 'programado' && item.programado_para && <p className="rounded-xl bg-surface-2 px-3 py-2 text-[0.8125rem]">
          Programado para el {new Date(item.programado_para).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}.
        </p>}
        {warnings.length > 0 && <div className="rounded-xl border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-[0.8125rem] text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          <p className="font-semibold">Revisa la localización</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">{warnings.map(w => <li key={w}>{w}</li>)}</ul>
        </div>}
        {(validation || save.error) && <p role="alert" className="aviso-error break-words">{validation || save.error?.message}</p>}
        {!canWrite && <p className="t-hint">Tu usuario puede leer, pero no editar.</p>}

        <Cover url={draft.og_image} uploading={upload.isPending} disabled={disabled}
          onUpload={file => upload.mutate(file)} onRemove={() => set('og_image', null)} />

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <StatusBadge status={item.status} />
          <span>{LANGUAGES[item.lang]}</span>
          {draft.mercado && <><span aria-hidden>·</span><span>{nombreMercado(item.lang, draft.mercado)}</span></>}
          {OPTION_LABELS.article_type[String(draft.fields.article_type ?? '')] && <><span aria-hidden>·</span><span>{OPTION_LABELS.article_type[String(draft.fields.article_type)]}</span></>}
        </div>

        <textarea ref={titleRef} rows={1} value={draft.title_h1} disabled={disabled} onChange={e => setTitle(e.target.value.replace(/\n/g, ' '))}
          placeholder="Título del artículo" aria-label="Título del artículo" spellCheck lang={item.lang}
          className="block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[1.75rem] font-bold leading-tight tracking-tight text-fg placeholder:text-muted/50 focus:outline-none focus:ring-0 sm:text-[2.25rem]" />

        <div className="sticky top-[calc(var(--topbar-h)+var(--safe-top)+49px)] z-10 -mx-1 border-b border-border bg-bg/95 px-1 py-1 backdrop-blur">
          <FormatBar target={bodyRef} disabled={disabled} onChange={value => set('body', value)} />
        </div>

        <textarea ref={bodyRef} value={draft.body} disabled={disabled} onChange={e => set('body', e.target.value)}
          placeholder={item.lang === 'en' ? 'Start with the answer. Then explain.' : 'Empieza por la respuesta. Después, explica.'}
          aria-label="Texto del artículo" spellCheck lang={item.lang}
          className="block min-h-[50vh] w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[1.0625rem] leading-[1.75] text-fg placeholder:text-muted/50 focus:outline-none focus:ring-0" />

        <p className="border-t border-border pt-3 text-xs text-muted">
          {words} palabras · {Math.max(1, Math.round(words / 200))} min de lectura · Markdown: ## subtítulo, **negrita**, [enlace](https://…)
        </p>
      </div>

      <aside className="hidden lg:block">
        <div className="card sticky top-[calc(var(--topbar-h)+var(--safe-top)+65px)] max-h-[calc(100dvh-var(--topbar-h)-var(--safe-top)-81px)] overflow-y-auto overscroll-contain p-0">
          <EditorPanel {...panelProps} />
        </div>
      </aside>
    </div>
  </form>

    {/* Fuera del <form>: el diálogo de versión nueva lleva su propio formulario. */}
    <Drawer open={panelOpen} onClose={() => setPanelOpen(false)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="t-card">Ajustes del artículo</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setPanelOpen(false)}>Listo</Button>
      </div>
      <EditorPanel {...panelProps} />
    </Drawer>

    {preview === 'mine' && <PreviewOverlay draft={draft} lang={item.lang} onClose={() => setPreview(null)} />}
    {preview === 'other' && other && <PreviewOverlay draft={draftFromItem(other)} lang={other.lang}
      note={`La versión en ${LANGUAGES[other.lang].toLowerCase()}, solo para mirar.`} onClose={() => setPreview(null)} />}
    {twinLang && <NewContentDialog type={type} group={group} lang={twinLang} onClose={() => setTwinLang(null)} />}
    <UnsavedChangesDialog navigation={navigation} />
  </>
}
