import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  Plus, Download, RefreshCw, Trash2, Search, ArrowUpDown, Mail, MessageCircle,
  Eye, Filter, X, Sparkles, Star,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Select, Badge, Skeleton, EmptyState } from '@/components/ui'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { LeadForm } from './LeadForm'
import { LeadDrawer } from './LeadDrawer'
import { LeadSearchModal } from './LeadSearchModal'
import { NewMessageModal } from '@/features/messages/NewMessageModal'
import { useLeads, useDeleteLead, useNichos, useUltimaImportacion } from '@/hooks/useData'
import { useLeadsStore } from '@/store/leadsStore'
import { PIPELINE_STAGES } from '@/lib/config'
import { scoreColor, formatCurrency, downloadCSV, cn } from '@/lib/utils'
import { crearFiltroLeads, relevanciaLead } from '@/lib/leadSearch'
import { AyudaBusqueda } from './AyudaBusqueda'
import { TouchFilterBar } from '@/components/TouchFilterBar'
import { pasaFiltroToque } from '@/lib/touches'
import { today } from '@/lib/followUps'
import type { Lead } from '@/types'
import type { LeadImport } from '@/services/leadsService'
import { formToLeadPatch, type LeadFormValues } from './leadSchema'

type SortKey = 'empresa' | 'score' | 'ciudad' | 'valorEstimado' | 'estado' | 'favorito' | 'fechaCaptura' | 'actualizado'

/** Fecha corta legible (ej. "14 jul 2026"); vacío si no hay valor o no parsea. */
function fmtShort(v?: string): string {
  if (!v) return ''
  const d = new Date(v.length <= 10 ? v + 'T00:00:00' : v)
  if (isNaN(d.getTime())) return v
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Pestañas rápidas por estado (Todos + Favoritos + etapas del pipeline). */
const STATE_TABS: { key: 'todos' | 'favoritos' | Lead['estado']; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'favoritos', label: 'Favoritos' },
  ...PIPELINE_STAGES.map((s) => ({ key: s.id as Lead['estado'], label: s.label })),
]

/** Filtros inteligentes adicionales (aditivos, un solo activo a la vez). */
const SMART_PILLS: { key: 'prioridad' | 'conIA' | 'sinIA' | 'sinResponsable'; label: string }[] = [
  { key: 'prioridad', label: 'Alta prioridad' },
  { key: 'conIA', label: 'Con puntuación IA' },
  { key: 'sinIA', label: 'Sin puntuación IA' },
  { key: 'sinResponsable', label: 'Sin responsable' },
]

export function LeadsPage() {
  const { isLoading, isError, refetch, isFetching } = useLeads()
  const leads = useLeadsStore((s) => s.leads)
  const { addLead, updateLead, removeLeads, moveStage, selectedIds, toggleSelect, selectAll, clearSelection, toggleFavorito } = useLeadsStore()

  const [search, setSearch] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [fNicho, setFNicho] = useState('')
  const [fScoreMin, setFScoreMin] = useState(0)
  const [tab, setTab] = useState<'todos' | 'favoritos' | Lead['estado']>('todos')
  const [fToque, setFToque] = useState('')
  const [smart, setSmart] = useState<'' | 'prioridad' | 'conIA' | 'sinIA' | 'sinResponsable'>('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'score', dir: 'desc' })
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Lead | null>(null)
  const [drawerLeadId, setDrawerLeadId] = useState<string | null>(null)
  const drawerLead = drawerLeadId ? (leads.find((l) => l.id === drawerLeadId) ?? null) : null

  // `/leads?lead=<id>` abre la ficha directamente: así la paleta global (⌘K)
  // puede llevarte al lead concreto en vez de dejarte en la lista.
  const [params, setParams] = useSearchParams()
  const leadParam = params.get('lead')
  useEffect(() => {
    if (leadParam) setDrawerLeadId(leadParam)
  }, [leadParam])
  const cerrarDrawer = () => {
    setDrawerLeadId(null)
    if (leadParam) {
      const p = new URLSearchParams(params)
      p.delete('lead')
      setParams(p, { replace: true })
    }
  }
  const [composeLead, setComposeLead] = useState<Lead | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const deleteLead = useDeleteLead()
  const nichos = useNichos()
  const ultimaImportacion = useUltimaImportacion().data

  // Base: aplica búsqueda + filtros avanzados (nicho/score), sin la pestaña ni pills.
  // La búsqueda recorre TODOS los campos de la ficha y admite sintaxis por
  // campo (`ciudad:madrid`, `tel:600`, `creado:>2026-01`); ver `lib/leadSearch`.
  const base = useMemo(() => {
    const coincide = crearFiltroLeads(search)
    return leads.filter((l) =>
      coincide(l) &&
      (!fNicho || l.nicho === fNicho) &&
      (l.score >= fScoreMin),
    )
  }, [leads, search, fNicho, fScoreMin])

  // Conteos por pestaña, calculados sobre la base (respetan búsqueda/filtros).
  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: base.length, favoritos: base.filter((l) => l.favorito).length }
    for (const s of PIPELINE_STAGES) c[s.id] = base.filter((l) => l.estado === s.id).length
    return c
  }, [base])

  const smartMatch = (l: Lead) => {
    switch (smart) {
      case 'prioridad': return l.prioridad === 'alta'
      case 'conIA': return l.scoreIA !== undefined
      case 'sinIA': return l.scoreIA === undefined
      // Sin responsable de verdad: vacío. Antes se colaba aquí la abreviatura
      // 'JD' del importador, que ya no existe (0028 unificó los responsables).
      case 'sinResponsable': return !l.responsable?.trim()
      default: return true
    }
  }

  // Conjunto sobre el que la barra de toques cuenta: pestaña y pills ya
  // aplicadas, para que sus números coincidan con la tabla resultante.
  const conPestana = useMemo(
    () => base.filter((l) =>
      (tab === 'todos' ? true : tab === 'favoritos' ? l.favorito : l.estado === tab) &&
      smartMatch(l),
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, tab, smart],
  )

  const hoy = today()
  const filtered = useMemo(() => {
    let res = conPestana.filter((l) => pasaFiltroToque(l, fToque, hoy))
    const sortVal = (l: Lead): string | number => {
      if (sort.key === 'favorito') return l.favorito ? 1 : 0
      if (sort.key === 'actualizado') return l.fechaUltimoMovimiento || l.ultimaAccion || ''
      return l[sort.key] ?? ''
    }
    // Con búsqueda activa manda la relevancia: lo que claramente buscabas
    // (teléfono exacto, empresa que empieza igual) va primero. Dentro del mismo
    // tramo sigue mandando el orden de columna que hayas elegido.
    const rel = new Map(res.map((l) => [l.id, relevanciaLead(l, search)]))
    res = [...res].sort((a, b) => {
      const dr = (rel.get(b.id) ?? 0) - (rel.get(a.id) ?? 0)
      if (dr !== 0) return dr
      const av = sortVal(a)
      const bv = sortVal(b)
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return res
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conPestana, fToque, hoy, sort, search])

  const allSelected = filtered.length > 0 && filtered.every((l) => selectedIds.has(l.id))

  const toggleSort = (key: SortKey) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))

  const handleSubmit = async (values: LeadFormValues) => {
    const patch = formToLeadPatch(values)
    try {
      if (editing) {
        updateLead(editing.id, patch)
        toast.success('Lead actualizado')
      } else {
        await addLead(patch)
        toast.success('Lead agregado')
      }
      setFormOpen(false)
      setEditing(null)
    } catch {
      toast.error('No se pudo guardar el lead')
    }
  }

  const handleDelete = () => {
    if (!selectedIds.size) return
    setConfirmDeleteOpen(true)
  }

  const confirmDelete = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    // Sin try/catch, un borrado rechazado (RLS, red) dejaba una promesa sin
    // capturar y la seleccion sin limpiar: la pantalla se quedaba a medias.
    try {
      await Promise.all(ids.map((id) => deleteLead.mutateAsync({ leadId: id })))
      removeLeads(ids)
      clearSelection()
      toast.success(`${ids.length} lead(s) eliminado(s)`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudieron eliminar los leads')
    }
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

      <ResumenImportacion resumen={ultimaImportacion ?? null} />

      {/* Barra de búsqueda + filtros */}
      <div className="mb-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative max-w-md flex-1"
            onSubmit={(e) => {
              // El filtrado ya es en vivo; Enter abre la ficha del primer
              // resultado, que es lo que espera quien pega un teléfono.
              e.preventDefault()
              if (filtered.length > 0) setDrawerLeadId(filtered[0].id)
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-9 pr-9"
              placeholder="Buscar en toda la ficha: teléfono, ciudad, nicho, calle, fecha…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </form>
          <AyudaBusqueda onEjemplo={(q) => setSearch(q)} />
        </div>

        {/* Pestañas rápidas por estado (un clic cambia la vista, estilo Pipeline) */}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {STATE_TABS.map((t) => {
            const active = tab === t.key
            const isFav = t.key === 'favoritos'
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? isFav
                      ? 'border-amber-400 bg-amber-400/10 text-amber-500'
                      : 'border-primary-400 bg-primary-400/10 text-primary-600 dark:text-primary-300'
                    : 'border-border text-muted hover:text-fg',
                )}
              >
                {isFav && <Star className={cn('h-3.5 w-3.5', active && 'fill-amber-400')} />}
                {t.label}
                <span className={cn('rounded-full px-1.5 text-[10px] tabular-nums', active ? 'bg-white/50 text-fg dark:bg-black/25' : 'bg-surface-2 text-muted')}>
                  {counts[t.key] ?? 0}
                </span>
              </button>
            )
          })}
        </div>

        {/* Filtros inteligentes */}
        <div className="flex flex-wrap gap-1.5">
          {SMART_PILLS.map((p) => {
            const active = smart === p.key
            return (
              <button
                key={p.key}
                onClick={() => setSmart((v) => (v === p.key ? '' : p.key))}
                className={cn(
                  'inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                  active ? 'border-primary-400 bg-primary-400/10 text-primary-600 dark:text-primary-300' : 'border-border text-muted hover:text-fg',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* Toque y situación de seguimiento — mismo catálogo que Pipeline y
            Seguimiento, para que los tres respondan lo mismo. */}
        <TouchFilterBar leads={conPestana} value={fToque} onChange={setFToque} />

        {showFilters && (
          <div className="card flex flex-wrap items-end gap-3 p-3">
            <label className="text-xs text-muted">Nicho
              <Select className="mt-1 w-44" value={fNicho} onChange={(e) => setFNicho(e.target.value)}>
                <option value="">Todos</option>
                {nichos.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
              </Select>
            </label>
            <label className="text-xs text-muted">Score mínimo: {fScoreMin}
              <input type="range" min={0} max={100} value={fScoreMin} onChange={(e) => setFScoreMin(+e.target.value)} className="mt-2 block w-44 accent-primary-400" />
            </label>
            <Button variant="ghost" size="sm" onClick={() => { setFNicho(''); setFScoreMin(0) }}>
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
          <div className="max-h-[calc(100vh-16rem)] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-surface-2 text-xs text-muted">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input type="checkbox" checked={allSelected} onChange={(e) => e.target.checked ? selectAll(filtered.map((l) => l.id)) : clearSelection()} className="accent-primary-400" />
                  </th>
                  <Th onClick={() => toggleSort('favorito')}><span className="sr-only">Favorito</span><Star className="h-3.5 w-3.5" /></Th>
                  <Th onClick={() => toggleSort('empresa')}>Empresa</Th>
                  <th className="px-3 py-3 text-left font-medium">Contacto</th>
                  <Th onClick={() => toggleSort('ciudad')}>Ciudad</Th>
                  <th className="px-3 py-3 text-left font-medium">Nicho</th>
                  <Th onClick={() => toggleSort('score')}>Score</Th>
                  <Th onClick={() => toggleSort('estado')}>Estado</Th>
                  <Th onClick={() => toggleSort('valorEstimado')}>Valor</Th>
                  <Th onClick={() => toggleSort('fechaCaptura')}>Creado</Th>
                  <Th onClick={() => toggleSort('actualizado')}>Actualizado</Th>
                  <th className="px-3 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((l) => {
                  const sc = scoreColor(l.score)
                  const niche = nichos.find((n) => n.id === l.nicho)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={selectedIds.has(l.id)} onChange={() => toggleSelect(l.id)} className="accent-primary-400" />
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          onClick={() => toggleFavorito(l.id)}
                          className={cn('flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-surface-2', l.favorito ? 'text-amber-400' : 'text-muted/50 hover:text-muted')}
                          title={l.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
                        >
                          <Star className={cn('h-4 w-4', l.favorito && 'fill-amber-400')} />
                        </button>
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5">
                        <button onClick={() => setDrawerLeadId(l.id)} className="block max-w-full truncate font-medium text-fg hover:text-primary-600" title={l.empresa}>{l.empresa}</button>
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
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">{fmtShort(l.fechaCaptura) || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted">{fmtShort(l.fechaUltimoMovimiento || l.ultimaAccion) || '—'}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {l.email && <button className="btn-ghost h-7 w-7 p-0" onClick={() => setComposeLead(l)} title="Email"><Mail className="h-4 w-4" /></button>}
                          {l.whatsapp && <a className="btn-ghost h-7 w-7 p-0" target="_blank" href={`https://wa.me/${l.whatsapp.replace(/\D/g, '')}`} title="WhatsApp"><MessageCircle className="h-4 w-4" /></a>}
                          <button className="btn-ghost h-7 w-7 p-0" onClick={() => setDrawerLeadId(l.id)} title="Ver"><Eye className="h-4 w-4" /></button>
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
        onClose={cerrarDrawer}
        onEdit={(l) => { cerrarDrawer(); setEditing(l); setFormOpen(true) }}
        onMoveStage={(id, estado) => { moveStage(id, estado); toast.success('Etapa actualizada') }}
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


/**
 * Explica el hueco entre lo que Apify encontro y lo que se ve en la lista:
 * los repetidos se actualizan (no suman fila nueva) y los descartados traen
 * su motivo. Sin esto la diferencia "20 en Apify / 16 en el CRM" es invisible.
 */
function ResumenImportacion({ resumen }: { resumen: LeadImport | null }) {
  const [oculto, setOculto] = useState(false)
  if (!resumen || oculto) return null
  // Solo interesa mientras es reciente: 24 h despues ya es ruido.
  const horas = (Date.now() - new Date(resumen.fecha).getTime()) / 3_600_000
  if (!(horas >= 0 && horas < 24)) return null

  return (
    <div className="mb-3 flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-xs">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-fg">
          Última búsqueda{resumen.consulta ? ` (${resumen.consulta})` : ''}: {resumen.recibidos} encontrados
          {' · '}{resumen.insertados} nuevos
          {' · '}{resumen.actualizados} ya existían
          {' · '}{resumen.descartados} descartados
        </p>
        {resumen.motivos.length > 0 && (
          <p className="mt-0.5 text-muted">
            Descartados por: {resumen.motivos.map((m) => `${m.motivo} (${m.cantidad})`).join(', ')}.
            {resumen.motivos.some((m) => m.motivo === 'borrado previamente') &&
              ' Los que borraste antes no vuelven a entrar; restáuralos desde la Papelera si los quieres.'}
            {resumen.motivos.some((m) => m.motivo.startsWith('ya lo capturaste')) &&
              ' Lo que Apify ya te habia devuelto alguna vez no vuelve a salir, aunque no llegara a tu lista.'}
          </p>
        )}
        {/* El caso que dejaba a Juan mirando "20 encontrados, 1 lead" sin
            explicación: los repetidos no crean fila, así que hay que nombrarlos
            o parece que se perdieron. */}
        {resumen.yaExistian.length > 0 && (
          <p className="mt-0.5 text-muted">
            Ya estaban en tu lista (se actualizaron, no crean fila nueva):{' '}
            {resumen.yaExistian.slice(0, 6).map((y) => y.empresa).join(', ')}
            {resumen.yaExistian.length > 6 && ` y ${resumen.yaExistian.length - 6} más`}.
          </p>
        )}
      </div>
      <button type="button" className="shrink-0 text-muted hover:text-fg" onClick={() => setOculto(true)}>✕</button>
    </div>
  )
}
