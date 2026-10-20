import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Button, Input } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { cmsService } from '@/services/cmsService'
import type { CmsGroup, CmsLang, CmsScope, CmsType } from '@/types/cms'
import { Field } from './components'
import { groupTitle, LANGUAGES, publicUrl, SCOPE_INFO, SCOPES, suggestSlug, validSlug } from './model'

/**
 * Crear una pieza nueva o la versión del otro idioma de una existente.
 *
 * La dirección (slug) se pide ya porque la base no admite un artículo sin ella;
 * se propone desde el título y se puede cambiar después.
 */
export function NewContentDialog({ type, group, lang: targetLang, onClose }: {
  type: CmsType; group?: CmsGroup; lang?: CmsLang; onClose: () => void
}) {
  const navigate = useNavigate()
  const client = useQueryClient()
  const [scope, setScope] = useState<CmsScope>('universal')
  const [lang, setLang] = useState<CmsLang>(targetLang ?? 'en')
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [manualSlug, setManualSlug] = useState(false)
  const [idea, setIdea] = useState(false)
  const create = useMutation({
    mutationFn: () => group
      ? cmsService.createTwin(group.id, lang, slug)
      : cmsService.create({ type: type.id, alcance: scope, lang, slug, title, idea }),
    onSuccess: async item => {
      await client.invalidateQueries({ queryKey: ['cms'] })
      toast.success(group ? `Versión en ${LANGUAGES[lang].toLowerCase()} creada` : 'Artículo creado')
      onClose()
      navigate(`/contenido/item/${item.id}`)
    },
    onError: error => toast.error(error.message),
  })
  const pickScope = (value: CmsScope) => {
    setScope(value)
    if (value !== 'universal') setLang(value === 'solo_en' ? 'en' : 'es')
  }

  return <Modal open onClose={() => { if (!create.isPending) onClose() }}
    title={group ? `Versión en ${LANGUAGES[lang].toLowerCase()}` : 'Nuevo artículo'}
    footer={<>
      <Button type="button" variant="outline" disabled={create.isPending} onClick={onClose}>Cancelar</Button>
      <Button type="submit" form="cms-nuevo" disabled={!validSlug(slug) || create.isPending}>
        {create.isPending ? 'Creando…' : idea ? 'Guardar la idea' : 'Crear y escribir'}
      </Button>
    </>}>
    <form id="cms-nuevo" className="space-y-5" onSubmit={e => { e.preventDefault(); create.mutate() }}>
      {group ? <div className="rounded-xl bg-surface-2 p-3 text-sm">
        <p className="font-medium">{groupTitle(group)}</p>
        <p className="t-hint mt-1">
          Se copian autor, fecha, fuentes, portada, tipo y servicio. El título, la descripción, la palabra clave y el
          texto se escriben de nuevo para {lang === 'es' ? 'quien busca en español' : 'quien busca en inglés'}: es otra
          pieza de SEO, no una traducción.
        </p>
      </div> : <>
        <fieldset className="space-y-2">
          <legend className="t-label mb-2">¿Para quién es?</legend>
          {(Object.keys(SCOPES) as CmsScope[]).map(value => <label key={value}
            className={cn('flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors',
              scope === value ? 'border-primary-400 bg-primary-50/60 dark:bg-primary-900/20' : 'border-border hover:bg-surface-2')}>
            <input type="radio" name="alcance" className="mt-1 accent-[#ff7448]" checked={scope === value} onChange={() => pickScope(value)} />
            <span><span className="block text-sm font-semibold">{SCOPES[value]}</span><span className="t-hint">{SCOPE_INFO[value]}</span></span>
          </label>)}
        </fieldset>
        {scope === 'universal' && <Field label="¿En qué idioma lo escribes primero?">
          <div className="flex gap-2">{(['en', 'es'] as const).map(value => <button key={value} type="button" onClick={() => setLang(value)}
            className={cn('h-9 flex-1 rounded-xl border text-sm font-medium transition-colors',
              lang === value ? 'border-fg bg-fg text-bg' : 'border-border hover:bg-surface-2')}>{LANGUAGES[value]}</button>)}
          </div>
        </Field>}
        <Field label="Título de trabajo" hint="Lo puedes cambiar luego.">
          <Input autoFocus value={title} placeholder={lang === 'en' ? 'Why isn’t my shop on Google Maps?' : '¿Cuánto cuesta una web para un negocio?'}
            onChange={e => { setTitle(e.target.value); if (!manualSlug) setSlug(suggestSlug(e.target.value)) }} />
        </Field>
      </>}
      <Field label="Dirección (slug)" hint={<span className="break-all">{publicUrl(lang, slug)}</span>}>
        <Input autoFocus={!!group} required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={slug}
          onChange={e => { setManualSlug(true); setSlug(e.target.value) }}
          placeholder={lang === 'en' ? 'palabra-clave-en-ingles' : 'palabra-clave-en-espanol'} />
      </Field>
      {!group && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 accent-[#ff7448]" checked={idea} onChange={e => setIdea(e.target.checked)} />
        <span>Solo guardar la idea <span className="t-hint block">Tema y palabra clave para escribirlo más adelante.</span></span>
      </label>}
      {create.error && <p role="alert" className="aviso-error break-words">{create.error.message}</p>}
    </form>
  </Modal>
}
