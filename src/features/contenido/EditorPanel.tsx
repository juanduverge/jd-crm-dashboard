import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, Circle, Eye, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Select, Textarea } from '@/components/ui'
import { cn } from '@/lib/utils'
import { cmsService } from '@/services/cmsService'
import type { CmsDraft, CmsGroup, CmsItem, CmsMercado, CmsScope, CmsStatus, CmsType } from '@/types/cms'
import { Field, PanelSection, TypeFields } from './components'
import { Counter, GoogleSnippet } from './EditorParts'
import { LANGUAGES, MERCADOS, publicUrl, scopeAllows, SCOPE_INFO, SCOPES, seoChecks, STATUSES, suggestSlug } from './model'

export interface PanelProps {
  item: CmsItem
  group: CmsGroup
  type: CmsType
  draft: CmsDraft
  set: <K extends keyof CmsDraft>(key: K, value: CmsDraft[K]) => void
  status: CmsStatus
  setStatus: (status: 'idea' | 'borrador') => void
  slugState: { duplicate: boolean; checking: boolean; failed: boolean }
  disabled: boolean
  canWrite: boolean
  other?: CmsItem
  onShowOther: () => void
}

/** Todo lo que no es escribir: SEO, datos del artículo, fuentes y la pieza. */
export function EditorPanel(p: PanelProps) {
  const { draft, set, item } = p
  const checks = seoChecks(draft)
  const pendientes = checks.filter(c => !c.ok).length
  const slugTitulo = suggestSlug(draft.title_h1)
  return <div>
    <PanelSection title="SEO y Google" defaultOpen
      summary={pendientes ? `${pendientes} por revisar` : 'Todo en orden'}>
      <GoogleSnippet draft={draft} lang={item.lang} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Palabra clave principal">
          <Input value={draft.primary_keyword ?? ''} disabled={p.disabled} onChange={e => set('primary_keyword', e.target.value)}
            placeholder={item.lang === 'en' ? 'shop not on google maps' : 'cuánto cuesta una web'} />
        </Field>
        <Field label="Mercado objetivo" hint="Dónde investigas la palabra clave. No cambia la dirección.">
          <Select value={draft.mercado ?? ''} disabled={p.disabled} onChange={e => set('mercado', (e.target.value || null) as CmsMercado | null)}>
            <option value="">Sin elegir</option>
            {MERCADOS[item.lang].map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={<span className="flex items-center justify-between gap-2">Título SEO <Counter value={draft.title_seo.length} min={30} max={60} /></span>}
        hint={!draft.title_seo && draft.title_h1 ? 'Vacío: se usará el título del artículo.' : undefined}>
        <Input value={draft.title_seo} disabled={p.disabled} onChange={e => set('title_seo', e.target.value)} placeholder={draft.title_h1} />
      </Field>
      <Field label={<span className="flex items-center justify-between gap-2">Descripción <Counter value={draft.meta_description.length} min={120} max={160} /></span>}>
        <Textarea value={draft.meta_description} disabled={p.disabled} onChange={e => set('meta_description', e.target.value)} className="min-h-[84px]"
          placeholder="Lo que verá la gente bajo el título en Google. Una promesa concreta." />
      </Field>
      <Field label="Dirección (slug)" hint={<span className="break-all">{publicUrl(item.lang, draft.slug)}</span>}>
        <Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} disabled={p.disabled}
          onChange={e => set('slug', e.target.value)} aria-invalid={p.slugState.duplicate} />
      </Field>
      {p.slugState.duplicate && <p role="alert" className="aviso-error">Ya hay un artículo en {LANGUAGES[item.lang].toLowerCase()} con esa dirección.</p>}
      {p.slugState.checking && <p className="t-hint">Comprobando la dirección…</p>}
      {p.slugState.failed && <p className="t-hint">No se pudo comprobar ahora; se vuelve a comprobar al guardar.</p>}
      {slugTitulo && slugTitulo !== draft.slug && !p.disabled && item.status !== 'publicado' && <button type="button" onClick={() => set('slug', slugTitulo)}
        className="-mt-2 text-left text-xs font-medium text-primary-600 hover:underline">Usar «{slugTitulo}»</button>}
      {item.status === 'publicado' && <p className="t-hint -mt-2">Ojo: cambiar la dirección de un artículo publicado rompe los enlaces que ya apuntan a él.</p>}
      <ul className="space-y-1.5 rounded-xl bg-surface-2 p-3" aria-label="Comprobaciones SEO">
        {checks.map(c => <li key={c.texto} className="flex items-start gap-2 text-[0.8125rem]">
          {c.ok ? <Check size={14} className="mt-0.5 shrink-0 text-green-600" /> : <Circle size={14} className="mt-0.5 shrink-0 text-muted/60" />}
          <span className={cn(!c.ok && 'text-muted')}>{c.texto}</span>
        </li>)}
      </ul>
    </PanelSection>

    <PanelSection title="Artículo" summary={draft.fecha ?? undefined}>
      <TypeFields fields={p.type.campos} values={draft.fields} lang={item.lang} disabled={p.disabled}
        allowIncomplete={p.status === 'idea'} onChange={fields => set('fields', fields)} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
        <Field label="Autor"><Input value={draft.author} disabled={p.disabled} onChange={e => set('author', e.target.value)} /></Field>
        <Field label="Fecha"><Input type="date" value={draft.fecha ?? ''} disabled={p.disabled} onChange={e => set('fecha', e.target.value || null)} /></Field>
      </div>
      <Field label="URL de la portada" hint="O súbela desde el editor.">
        <Input type="url" value={draft.og_image ?? ''} disabled={p.disabled} onChange={e => set('og_image', e.target.value || null)} placeholder="https://…" />
      </Field>
    </PanelSection>

    <PanelSection title="Fuentes" summary={`${draft.sources.filter(s => s.trim()).length}`}>
      <p className="t-hint -mt-2">Toda cifra del texto con su fuente. Son las mismas en los dos idiomas.</p>
      {draft.sources.map((source, index) => <div key={index} className="flex min-w-0 items-center gap-2">
        <Input type="url" aria-label={`Fuente ${index + 1}`} placeholder="https://…" value={source} disabled={p.disabled}
          onChange={e => set('sources', draft.sources.map((s, i) => i === index ? e.target.value : s))} />
        <Button type="button" variant="ghost" size="icon" disabled={p.disabled} aria-label={`Quitar fuente ${index + 1}`}
          onClick={() => set('sources', draft.sources.filter((_, i) => i !== index))}><Trash2 size={16} /></Button>
      </div>)}
      <Button type="button" variant="outline" size="sm" disabled={p.disabled} onClick={() => set('sources', [...draft.sources, ''])}>
        <Plus size={14} />Añadir fuente
      </Button>
    </PanelSection>

    <PanelSection title="Estado" summary={STATUSES[p.status]}>
      {(['idea', 'borrador'] as CmsStatus[]).includes(item.status) ? <Field label="Etapa"
        hint="Revisar, programar y publicar llegan con el botón Publicar.">
        <Select value={p.status} disabled={p.disabled} onChange={e => p.setStatus(e.target.value as 'idea' | 'borrador')}>
          <option value="idea">Idea: tema y palabra clave</option>
          <option value="borrador">Borrador: escribiendo</option>
        </Select>
      </Field> : <p className="t-hint">Este artículo está en «{STATUSES[item.status]}». Su estado se cambia desde la publicación.</p>}
    </PanelSection>

    <GroupSection group={p.group} canWrite={p.canWrite} />

    {p.other && <PanelSection title={`Versión en ${LANGUAGES[p.other.lang].toLowerCase()}`} summary={STATUSES[p.other.status]}>
      <p className="text-sm font-medium">{p.other.title_h1 || 'Sin título'}</p>
      <p className="t-hint break-all">{publicUrl(p.other.lang, p.other.slug)}</p>
      <Button type="button" variant="outline" size="sm" onClick={p.onShowOther}><Eye size={14} />Ver cómo quedó</Button>
    </PanelSection>}
  </div>
}

/** La pieza: alcance, intención de búsqueda y notas. Se guarda aparte del artículo. */
function GroupSection({ group, canWrite }: { group: CmsGroup; canWrite: boolean }) {
  const client = useQueryClient()
  const [values, setValues] = useState({ alcance: group.alcance, intencion: group.intencion ?? '', notas: group.notas ?? '' })
  const dirty = values.alcance !== group.alcance || values.intencion !== (group.intencion ?? '') || values.notas !== (group.notas ?? '')
  const save = useMutation({
    mutationFn: () => cmsService.saveGroup(group, values),
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ['cms'] }); toast.success('Pieza guardada') },
    onError: error => toast.error(error.message),
  })
  return <PanelSection title="La pieza" summary={SCOPES[group.alcance]}>
    <Field label="Para quién es" hint={SCOPE_INFO[values.alcance]}>
      <Select value={values.alcance} disabled={!canWrite} onChange={e => setValues({ ...values, alcance: e.target.value as CmsScope })}>
        {(Object.keys(SCOPES) as CmsScope[]).map(scope => <option key={scope} value={scope}
          disabled={group.items.some(i => !scopeAllows(scope, i.lang))}>{SCOPES[scope]}</option>)}
      </Select>
    </Field>
    <Field label="Intención de búsqueda" hint="Qué quiere resolver quien busca esto.">
      <Textarea value={values.intencion} disabled={!canWrite} className="min-h-[72px]" onChange={e => setValues({ ...values, intencion: e.target.value })} />
    </Field>
    <Field label="Notas internas" hint="No se publican.">
      <Textarea value={values.notas} disabled={!canWrite} className="min-h-[72px]" onChange={e => setValues({ ...values, notas: e.target.value })} />
    </Field>
    {canWrite && <Button type="button" size="sm" variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
      {save.isPending ? 'Guardando…' : 'Guardar la pieza'}
    </Button>}
  </PanelSection>
}

