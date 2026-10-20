import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, EmptyState, Input, Select } from '@/components/ui'
import { useAuthStore } from '@/store/authStore'
import { cmsService } from '@/services/cmsService'
import { ContentError, LoadingContent, StatusBadge } from './components'
import { useCmsTypes } from './hooks'
import { filterGroups, SCOPES, STATUSES } from './model'
import { NewContentDialog } from './NewContentDialog'

export default function ContenidoPage() {
  const types = useCmsTypes()
  const ids = (types.data ?? []).map(type => type.id)
  const groups = useQuery({ queryKey: ['cms', 'groups', ids], queryFn: () => cmsService.groups(ids), enabled: types.isSuccess })
  const canWrite = useAuthStore(state => state.user?.role === 'admin' || state.user?.role === 'vendedor')
  const [lang, setLang] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [typeId, setTypeId] = useState('')
  const [creating, setCreating] = useState(false)
  const type = types.data?.find(t => t.id === typeId) ?? types.data?.[0]
  const list = filterGroups(groups.data ?? [], lang, status, search).filter(group => !typeId || group.type === typeId)
  return <div className="min-w-0 space-y-5">
    <PageHeader title="Contenido" subtitle="Escribe y guarda cada versión de tus artículos." actions={canWrite && type ? <Button onClick={() => setCreating(true)}><Plus size={16} />Nuevo {type.nombre.toLowerCase()}</Button> : undefined} />
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label className="relative min-w-0"><span className="sr-only">Buscar por título o slug</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted sm:top-2.5" /><Input className="pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por título o slug" /></label>
      <Select aria-label="Filtrar por idioma" value={lang} onChange={e => setLang(e.target.value)}><option value="">Todos los idiomas</option><option value="en">Inglés</option><option value="es">Español</option></Select>
      <Select aria-label="Filtrar por estado" value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos los estados</option>{Object.entries(STATUSES).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select>
      <Select aria-label="Filtrar por tipo" value={typeId} onChange={e => setTypeId(e.target.value)}><option value="">Todos los tipos activos</option>{types.data?.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</Select>
    </div>
    {(types.isLoading || groups.isLoading) ? <LoadingContent /> : (types.isError || groups.isError) ? <ContentError retry={() => { void types.refetch(); void groups.refetch() }} /> : list.length ? <div className="card divide-y divide-border p-0">{list.map(group => <Link key={group.id} to={`/contenido/grupo/${group.id}`} className="grid min-w-0 gap-3 px-4 py-4 transition hover:bg-surface-2 sm:grid-cols-[minmax(0,1fr)_auto]">
      <div className="min-w-0"><h2 className="break-words font-semibold">{group.items.find(item => item.title_h1)?.title_h1 || group.items[0]?.slug || 'Grupo sin artículo'}</h2><p className="mt-1 text-xs text-muted">{SCOPES[group.alcance]} · {types.data?.find(t => t.id === group.type)?.nombre}</p></div>
      <div className="flex flex-wrap items-center gap-3">{(['en','es'] as const).map(language => <span key={language} className="flex items-center gap-1.5 text-xs font-medium">{language.toUpperCase()}<StatusBadge item={group.items.find(item => item.lang === language)} /></span>)}</div>
    </Link>)}</div> : <EmptyState icon={<FileText size={28} />} title="No hay contenido con estos filtros" description="Cambia la búsqueda o crea el primer artículo." />}
    {creating && type && <NewContentDialog type={type} onClose={() => setCreating(false)} />}
  </div>
}
