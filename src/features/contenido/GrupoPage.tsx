import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Card, Input, Select, Textarea } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import { cmsService } from '@/services/cmsService'
import type { CmsGroup, CmsLang, CmsScope, CmsType } from '@/types/cms'
import { BackToContent, ContentError, Field, LoadingContent, StatusBadge, UnsavedChangesDialog } from './components'
import { useCmsGroup, useCmsTypes, useUnsavedChanges } from './hooks'
import { LANGUAGES, scopeAllows, SCOPES } from './model'
import { NewContentDialog } from './NewContentDialog'

export default function GrupoPage() {
  const { groupId = '' } = useParams()
  const group = useCmsGroup(groupId)
  const types = useCmsTypes()
  if (group.isLoading || types.isLoading) return <LoadingContent />
  if (group.isError || types.isError) return <ContentError retry={() => { void group.refetch(); void types.refetch() }} />
  const type = types.data?.find(t => t.id === group.data?.type)
  if (!group.data || !type) return <><BackToContent /><p>Este grupo no existe o su tipo de contenido no está activo.</p></>
  return <GroupForm key={group.data.id} initial={group.data} type={type} />
}

function GroupForm({ initial, type }: { initial: CmsGroup; type: CmsType }) {
  const client = useQueryClient()
  const canWrite = useAuthStore(state => state.user?.role === 'admin' || state.user?.role === 'vendedor')
  const [group, setGroup] = useState(initial)
  const [scope, setScope] = useState(group.alcance)
  const [intention, setIntention] = useState(group.intencion ?? '')
  const [notes, setNotes] = useState(group.notas ?? '')
  const [creatingLang, setCreatingLang] = useState<CmsLang | null>(null)
  const dirty = scope !== group.alcance || intention !== (group.intencion ?? '') || notes !== (group.notas ?? '')
  const navigation = useUnsavedChanges(canWrite && dirty)
  const save = useMutation({
    mutationFn: () => cmsService.saveGroup(group, { alcance: scope, intencion: intention, notas: notes }),
    onSuccess: async saved => { setGroup(saved); await client.invalidateQueries({ queryKey: ['cms'] }); toast.success('Grupo guardado') },
    onError: error => toast.error(error.message),
  })
  // Las mutaciones de otra pantalla no se vuelcan sobre un formulario abierto.
  const shownItems = initial.items
  return <div className="min-w-0 space-y-5">
    <BackToContent />
    <PageHeader title="Versiones del contenido" subtitle={`${type.nombre} · ${SCOPES[group.alcance]}`} />
    <form className="card space-y-4" onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <fieldset disabled={!canWrite || save.isPending} className="grid min-w-0 gap-4 md:grid-cols-2">
        <Field label="Alcance"><Select value={scope} onChange={e => setScope(e.target.value as CmsScope)}>{Object.entries(SCOPES).map(([value,label]) => <option key={value} value={value} disabled={shownItems.some(item => !scopeAllows(value as CmsScope, item.lang))}>{label}</option>)}</Select></Field>
        <Field label="Intención de búsqueda"><Input value={intention} onChange={e => setIntention(e.target.value)} placeholder="¿Qué necesita resolver quien busca?" /></Field>
        <div className="md:col-span-2"><Field label="Notas"><Textarea value={notes} onChange={e => setNotes(e.target.value)} /></Field></div>
      </fieldset>
      {canWrite && <div className="flex flex-wrap items-center gap-3"><Button disabled={!dirty || save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar grupo'}</Button><span role="status" className="text-xs text-muted">{dirty ? 'Cambios sin guardar' : 'Todo guardado'}</span></div>}
      {save.error && <p role="alert" className="text-sm text-red-600">{save.error.message}</p>}
    </form>
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">{(['en','es'] as const).map(lang => {
      const item = shownItems.find(i => i.lang === lang)
      const allowed = scopeAllows(group.alcance, lang)
      return <Card key={lang} className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{lang.toUpperCase()} · {LANGUAGES[lang]}</h2><StatusBadge item={item} /></div>
        {item ? <><h3 className="break-words text-lg font-semibold">{item.title_h1 || 'Sin título todavía'}</h3><dl className="space-y-2 text-sm"><div><dt className="text-muted">Slug</dt><dd className="break-all">{item.slug}</dd></div><div><dt className="text-muted">Fecha</dt><dd>{item.fecha ?? 'Sin fecha'}</dd></div></dl><Link className="btn border border-border px-4 py-2" to={`/contenido/item/${item.id}`}>{canWrite ? 'Editar' : 'Ver artículo'}</Link></> : <><p className="text-sm text-muted">{allowed ? 'Esta versión todavía no está escrita.' : 'Este idioma no forma parte del alcance del grupo.'}</p>{canWrite && allowed && group.alcance === 'universal' && shownItems.length > 0 && <Button variant="outline" disabled={dirty} onClick={() => setCreatingLang(lang)}>Crear versión en {LANGUAGES[lang].toLowerCase()}</Button>}{dirty && allowed && <p className="text-xs text-muted">Guarda los cambios del grupo antes de crear otra versión.</p>}</>}
      </Card>
    })}</div>
    {creatingLang && <NewContentDialog type={type} group={group} lang={creatingLang} onClose={() => setCreatingLang(null)} />}
    <UnsavedChangesDialog navigation={navigation} />
  </div>
}
