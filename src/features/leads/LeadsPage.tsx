import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Plus, Download, RefreshCw, Trash2, Search, ArrowUpDown, Mail, MessageCircle,
  Eye, Filter, X, Sparkles,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Select, Badge, Skeleton, EmptyState } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { LeadForm } from './LeadForm'
import { LeadDrawer } from './LeadDrawer'
import { LeadSearchModal } from './LeadSearchModal'
import { NewMessageModal } from '@/features/messages/NewMessageModal'
import { useLeads, useDeleteLead, useDeletePipeline } from '@/hooks/useData'
import { useLeadsStore } from '@/store/leadsStore'
import { DEFAULT_NICHES, PIPELINE_STAGES } from '@/lib/config'
import { scoreColor, fuzzyMatch, formatCurrency, downloadCSV, cn } from '@/lib/utils'
import type { Lead } from '@/types'
import { formToLeadPatch, type LeadFormValues } from './leadSchema'

type SortKey = 'empresa' | 'score' | 'ciudad' | 'valorEstimado' | 'estado'

export function LeadsPage() {
  const { isLoading, isError, refetch, isFetching } = useLeads()
  const leads = useLeadsStore((s) => s.leads)
  const { addLead, updateLead, removeLeads, moveStage, selectedIds, toggleSelect, selectAll, clearSelection } = useLeadsStore()

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [fEstado, setFEstado] = useState('')
  const [fNicho, setFNicho] = useState('')
  const [fScoreMin, setFScoreMin] = useState(0)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null)
  const [composeLead, setComposeLead] = useState<Lead | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const deleteLead = useDeleteLead()
  const deletePipeline = useDeletePipeline()

  const filtered = useMemo(() => {
    let res = leads.filter((l) =>
      fuzzyMatch(`${l.empresa} ${l.email} ${l.ciudad} ${l.web}`, search) &&
      (!fEstado || l.estado === fEstado) &&
      (!fNicho || l.nicho === fNicho) &&
      (l.score >= fScoreMin),
    )
    res = [...res].sort((a, b) => {
      const av = a[sort.key] ?? '', bv = b[sort.key] ?? ''
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return res
  }, [leads, search, fEstado, fNicho, fScoreMin, sort])

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const handleSubmit = (values: LeadFormValues) => {
    const patch = formToLeadPatch(values)
    if (editing) {
      updateLead(editing.id, patch)
      toast.success('Lead actualizado')
    } else {
      addLead({ ...patch, id: `L-${Date.now()}`, fechaCaptura: new Date().toISOString().slice(0, 10) } as Lead)
      toast.success('Lead agregado')
    }
    setFormOpen(false)
    setEditing(null)
  }

  const handleDelete = () => {
    if (!selectedIds.size) return
    setConfirmDeleteOpen(true)
  }

  const confirmDelete = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    await Promise.all(
      ids.flatMap((id) => [
        deleteLead.mutateAsync({ leadId: id }),
        deletePipeline.mutateAsync({ leadId: id }),
      ]),
    )
    removeLeads(ids)
    clearSelection()
    toast.success(`${ids.length} lead(s) eliminado(s)`)
  }

  return (
    <div>
      <PageHeader
        title="👥 Leads"
        subtitle={`${filtered.length} de ${leads.length} leads`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
              <Filter className="h-4 w-4" /> Filtros
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} /> Sincronizar
            </Button>
            <Button variant="outline" size="sm" onClick={() => downloadCSV('leads-jddeveloper.csv', filtered as any)}>
              <Download className="h-4 w-4" /> Exportar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
              <Sparkles className="h-4 w-4" /> Buscar nuevos leads
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true) }}>
              <Plus className="h-4 w-4" /> Agregar lead
            </Button>
          </>
        }
      />

      {/* Barra de búsqueda + filtros */}
      <div className="mb-3 flex flex-col gap-3">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Buscar empresa, email, ciudad…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {showFilters && (
          <div className="card flex flex-wrap items-end gap-3 p-3">
            <label className="text-xs text-muted">Estado
              <Select className="mt-1 w-44" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos</option>
                {PIPELINE_STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </Select>
            </label>
            <label className="text-xs text-muted">Nicho
              <Select className="mt-1 w-44" value={fNicho} onChange={(e) => setFNicho(e.target.value)}>
                <option value="">Todos</option>
                {DEFAULT_NICHES.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
              </Select>
            </label>
            <label className="text-xs text-muted">Score mínimo: {fScoreMin}
              <input type="range" min={0} max={100} value={fScoreMin} onChange={(e) => setFScoreMin(+e.target.value)} className="mt-2 block w-44 accent-primary-400" />
            </label>
            <Button variant="ghost" size="sm" onClick={() => { setFEstado(''); setFNicho(''); setFScoreMin(0) }}>
              <X className="h-4 w-4" /> Limpiar
            </Button>
          </div>
        )}
      </div>

      {/* Barra de acciones bulk */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 dark:bg-primary-400/10">
          <span className="text-sm font-medium text-primary-700 dark:text-primary-300">{selectedIds.size} seleccionado(s)</span>
          <Button size="sm" variant="outline" onClick={() => toast('Campaña creada con leads seleccionados (Fase 2)')}>🎯 Crear campaña</Button>
          <Button size="sm" variant="danger" onClick={handleDelete}><Trash2 className="h-4 w-4" /> Eliminar</Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>Cancelar</Button>
        </div>
      )}

      {/* Tabla */}
      {isError ? (
        <EmptyState
          icon={<Search className="h-8 w-8" />}
          title="No se pudo conectar con n8n"
          description="Verifica que el workflow &quot;CRM API - Leer Sheets&quot; esté activo y vuelve a intentar."
          action={<Button onClick={() => refetch()}>Reintentar</Button>}
        />
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Search className="h-8 w-8" />} title="Sin leads" description="Ajusta los filtros o agrega tu primer lead." action={<Button onClick={() => setFormOpen(true)}><Plus className="h-4 w-4" /> Agregar lead</Button>} />
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allSelected} onChange={(e) => e.target.checked ? selectAll(filtered.map((l) => l.id)) : clearSelection()} className="accent-primary-400" />
                  </th>
                  <Th onClick={() => toggleSort('empresa')}>Empresa</Th>
                  <th className="px-3 py-3 text-left font-medium">Contacto</th>
                  <Th onClick={() => toggleSort('ciudad')}>Ciudad</Th>
                  <th className="px-3 py-3 text-left font-medium">Nicho</th>
                  <Th onClick={() => toggleSort('score')}>Score</Th>
                  <Th onClick={() => toggleSort('estado')}>Estado</Th>
                  <Th onClick={() => toggleSort('valorEstimado')}>Valor</Th>
                  <th className="px-3 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const sc = scoreColor(l.score)
                  const niche = DEFAULT_NICHES.find((n) => n.id === l.nicho)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} className="accent-primary-400" />
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5">
                        <button onClick={() => setDrawerLead(l)} className="block max-w-full truncate font-medium text-fg hover:text-primary-600" title={l.empresa}>{l.empresa}</button>
                        {l.web && <p className="truncate text-xs text-muted" title={l.web}>{l.web.replace(/^https?:\/\//, '')}</p>}
                      </td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 text-muted" title={l.email || l.telefono || undefined}>{l.email || l.telefono || '—'}</td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-muted" title={l.ciudad || undefined}>{l.ciudad || '—'}</td>
                      <td className="px-3 py-2.5">{niche ? <Badge>{niche.emoji} {niche.nombre}</Badge> : '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className={cn('inline-flex h-7 w-9 items-center justify-center rounded-md text-xs font-bold', sc.bg, sc.text)}>{l.score}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge>{PIPELINE_STAGES.find((s) => s.id === l.estado)?.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 font-medium text-fg">{l.valorEstimado ? formatCurrency(l.valorEstimado) : '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {l.email && <button className="btn-ghost h-7 w-7 p-0" onClick={() => setComposeLead(l)} title="Email"><Mail className="h-4 w-4" /></button>}
                          {l.whatsapp && <a className="btn-ghost h-7 w-7 p-0" target="_blank" href={`https://wa.me/${l.whatsapp.replace(/\D/g, '')}`} title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                          <button className="btn-ghost h-7 w-7 p-0" onClick={() => setDrawerLead(l)} title="Ver"><Eye className="h-4 w-4" /></button>
                          <button
                            className="btn-ghost h-7 w-7 p-0 text-red-500 hover:bg-red-500/10"
                            onClick={() => { clearSelection(); toggleSelect(l.id); setConfirmDeleteOpen(true) }}
                            title="Eliminar"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <LeadForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null) }} onSubmit={handleSubmit} initial={editing} />
      <LeadSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <LeadDrawer
        lead={drawerLead}
        onClose={() => setDrawerLead(null)}
        onEdit={(l) => { setDrawerLead(null); setEditing(l); setFormOpen(true) }}
        onMoveStage={(id, estado) => { moveStage(id, estado); toast.success('Etapa actualizada'); setDrawerLead((d) => d ? { ...d, estado } : d) }}
      />
      <NewMessageModal
        open={!!composeLead}
        onClose={() => setComposeLead(null)}
        initialTo={composeLead?.email}
        leadId={composeLead?.id}
        lockTo
      />
      <ConfirmDeleteModal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={confirmDelete}
        title={selectedIds.size > 1 ? `Eliminar ${selectedIds.size} leads` : 'Eliminar lead'}
        itemLabel={selectedIds.size === 1 ? leads.find((l) => selectedIds.has(l.id))?.empresa : undefined}
        warning="También se eliminará su registro en Pipeline. Sus notas y tareas asociadas permanecerán, pero quedarán sin lead visible mientras esté en la Papelera."
      />
    </div>
  )
}

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th className="px-3 py-3 text-left font-medium">
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-fg">
        {children} <ArrowUpDown className="h-3 w-3" />
      </button>
    </th>
  )
}
