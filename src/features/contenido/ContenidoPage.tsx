import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, ImageOff, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Input } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { cmsService } from '@/services/cmsService'
import type { CmsGroup, CmsLang, CmsStatus } from '@/types/cms'
import { ContentError, LangChip, LoadingContent } from './components'
import { useCmsTypes } from './hooks'
import { fechaArticulo, filterGroups, groupTitle, OPTION_LABELS, scopeAllows, SCOPES } from './model'
import { NewContentDialog } from './NewContentDialog'

/**
 * Contenido — los artículos de la web, uno por fila aunque tengan dos idiomas.
 *
 * Las pestañas filtran por estado de cualquiera de sus versiones: una pieza
 * publicada en inglés con el español en borrador aparece en las dos. Así
 * «Borradores» responde a la pregunta útil: qué tengo a medio escribir.
 */

const PESTANAS: { id: '' | CmsStatus; texto: string }[] = [
  { id: '', texto: 'Todo' },
  { id: 'idea', texto: 'Ideas' },
  { id: 'borrador', texto: 'Borradores' },
  { id: 'revision', texto: 'En revisión' },
  { id: 'programado', texto: 'Programados' },
  { id: 'publicado', texto: 'Publicados' },
]

export default function ContenidoPage() {
  const navigate = useNavigate()
  const types = useCmsTypes()
  const ids = (types.data ?? []).map(type => type.id)
  const groups = useQuery({ queryKey: ['cms', 'groups', ids], queryFn: () => cmsService.groups(ids), enabled: types.isSuccess })
  const canWrite = useAuthStore(state => state.user?.role === 'admin' || state.user?.role === 'vendedor')
  const [status, setStatus] = useState<'' | CmsStatus>('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [twinFor, setTwinFor] = useState<{ group: CmsGroup; lang: CmsLang } | null>(null)
  const type = types.data?.[0]

  const all = useMemo(() => groups.data ?? [], [groups.data])
  const list = filterGroups(all, status, search)
  const counts = useMemo(() => Object.fromEntries(PESTANAS.map(p =>
    [p.id, p.id ? all.filter(g => g.items.some(i => i.status === p.id)).length : all.length])), [all])

  const abrir = (group: CmsGroup, lang?: CmsLang) => {
    const item = group.items.find(i => i.lang === lang) ?? group.items[0]
    if (item) navigate(`/contenido/item/${item.id}`)
  }

  return <div className="min-w-0">
    <PageHeader title="Blog CMS" subtitle="Los artículos del blog de jddeveloper.com, en inglés y en español."
      actions={canWrite && type ? <Button onClick={() => setCreating(true)}><Plus size={16} />Nuevo artículo</Button> : undefined} />

    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div role="tablist" aria-label="Filtrar por estado"
        className="-mx-3 flex gap-1 overflow-x-auto px-3 sin-barra scroll-aislado lg:mx-0 lg:px-0">
        {PESTANAS.map(p => <button key={p.id} type="button" role="tab" aria-selected={status === p.id} onClick={() => setStatus(p.id)}
          className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors',
            status === p.id ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
          {p.texto}<span className={cn('text-xs tabular-nums', status === p.id ? 'opacity-70' : 'opacity-60')}>{counts[p.id] ?? 0}</span>
        </button>)}
      </div>
      <label className="relative min-w-0 lg:w-72">
        <span className="sr-only">Buscar por título o dirección</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar artículo" />
      </label>
    </div>

    {(types.isLoading || groups.isLoading) ? <LoadingContent />
      : (types.isError || groups.isError) ? <ContentError retry={() => { void types.refetch(); void groups.refetch() }} />
      : list.length === 0 ? <EmptyState icon={<FileText size={28} />}
          title={all.length ? 'Nada en esta pestaña' : 'Todavía no hay artículos'}
          description={all.length ? 'Prueba con otra pestaña o cambia la búsqueda.' : 'Empieza por la idea: el tema y la palabra clave. El texto viene después.'}
          action={!all.length && canWrite ? <Button onClick={() => setCreating(true)}><Plus size={16} />Nuevo artículo</Button> : undefined} />
      : <ul className="card divide-y divide-border overflow-hidden p-0">{list.map(group => {
          const cover = group.items.find(i => i.og_image)?.og_image
          const ref = group.items.find(i => i.status === 'publicado') ?? group.items[0]
          const tipo = String(ref?.fields.article_type ?? '')
          return <li key={group.id} className="relative flex min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-surface-2 sm:gap-4 sm:px-4">
            <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:h-16 sm:w-24">
              {cover ? <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center text-muted/50"><ImageOff size={18} /></div>}
            </div>
            <div className="min-w-0 flex-1">
              {/* El enlace cubre la fila; las píldoras quedan por encima para abrir un idioma concreto. */}
              <button type="button" onClick={() => abrir(group)} className="text-left after:absolute after:inset-0">
                <h2 className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug">{groupTitle(group)}</h2>
              </button>
              <p className="mt-1 truncate text-xs text-muted">
                {[SCOPES[group.alcance], OPTION_LABELS.article_type[tipo], ref?.fecha ? fechaArticulo(ref.fecha) : null].filter(Boolean).join(' · ')}
              </p>
            </div>
            <div className="relative z-10 flex shrink-0 flex-col gap-1.5 sm:flex-row">
              {(['en', 'es'] as const).filter(lang => scopeAllows(group.alcance, lang)).map(lang => {
                const item = group.items.find(i => i.lang === lang)
                return <LangChip key={lang} lang={lang} item={item} missing={!item}
                  onClick={item ? () => abrir(group, lang) : canWrite ? () => setTwinFor({ group, lang }) : undefined} />
              })}
            </div>
          </li>
        })}</ul>}

    {creating && type && <NewContentDialog type={type} onClose={() => setCreating(false)} />}
    {twinFor && type && <NewContentDialog type={type} group={twinFor.group} lang={twinFor.lang} onClose={() => setTwinFor(null)} />}
  </div>
}
