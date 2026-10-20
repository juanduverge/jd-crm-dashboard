import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button, Input, Select } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cmsService } from '@/services/cmsService'
import type { CmsGroup, CmsLang, CmsScope, CmsType } from '@/types/cms'
import { Field } from './components'
import { LANGUAGES, SCOPES, suggestSlug, validSlug } from './model'

export function NewContentDialog({ type, group, lang: targetLang, onClose }: { type: CmsType; group?: CmsGroup; lang?: CmsLang; onClose: () => void }) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [scope, setScope] = useState<CmsScope>('universal')
  const [lang, setLang] = useState<CmsLang>(targetLang ?? 'en')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [manualSlug, setManualSlug] = useState(false)
  const [idea, setIdea] = useState(false)
  const create = useMutation({
    mutationFn: () => group ? cmsService.createTwin(group.id, lang, slug) : cmsService.create({ type: type.id, alcance: scope, lang, slug, title, idea }),
    onSuccess: async item => { await client.invalidateQueries({ queryKey: ['cms'] }); toast.success('Contenido creado'); onClose(); navigate(`/contenido/item/${item.id}`) },
    onError: error => toast.error(error.message),
  })
  return <Modal open onClose={() => { if (!create.isPending) onClose() }} title={group ? `Crear versión en ${LANGUAGES[lang].toLowerCase()}` : `Nuevo ${type.nombre.toLowerCase()}`}>
    <form className="space-y-4" onSubmit={e => { e.preventDefault(); create.mutate() }}>
      {group ? <p className="text-sm text-muted">Solo se copiarán autor, fecha, fuentes, portada y campos comunes. Los títulos y el cuerpo comenzarán vacíos.</p> : <>
        <Field label="Alcance"><Select value={scope} onChange={e => { const value = e.target.value as CmsScope; setScope(value); if (value !== 'universal') setLang(value === 'solo_en' ? 'en' : 'es') }}>{Object.entries(SCOPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Idioma de origen"><Select value={lang} disabled={scope !== 'universal'} onChange={e => setLang(e.target.value as CmsLang)}>{Object.entries(LANGUAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
        <Field label="Título de trabajo" hint="Podrás cambiarlo después."><Input value={title} onChange={e => { setTitle(e.target.value); if (!manualSlug) setSlug(suggestSlug(e.target.value)) }} /></Field>
      </>}
      <Field label="Slug" hint="Letras minúsculas, números y guiones. Es obligatorio para crear la ficha."><Input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug} onChange={e => { setManualSlug(true); setSlug(e.target.value) }} placeholder={lang === 'en' ? 'article-topic' : 'tema-del-articulo'} /></Field>
      {!group && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={idea} onChange={e => setIdea(e.target.checked)} />Solo la idea</label>}
      {create.error && <p role="alert" className="break-words text-sm text-red-600">{create.error.message}</p>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>Cancelar</Button><Button disabled={!validSlug(slug) || create.isPending}>{create.isPending ? 'Creando…' : 'Crear y escribir'}</Button></div>
    </form>
  </Modal>
}
