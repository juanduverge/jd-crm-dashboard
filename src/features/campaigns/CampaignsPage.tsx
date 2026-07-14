import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Megaphone, Plus, Pause, Play, Copy, Send, X, Mail, Users, TrendingUp, DollarSign, Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Button, Badge, EmptyState, Skeleton, Input, Textarea } from '@/components/ui'
import { Drawer } from '@/components/ui/Modal'
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal'
import { useLeads, useCampaigns, useCreateCampaign, useUpdateCampaign, useDeleteCampaign } from '@/hooks/useData'
import { useCampaignsStore } from '@/store/campaignsStore'
import { n8nService } from '@/services/n8nService'
import { config } from '@/lib/config'
import { CAMPAIGN_STATUS_META, applyTemplate } from '@/lib/campaigns'
import { formatCurrency, cn } from '@/lib/utils'
import { CampaignWizard, type WizardResult } from './CampaignWizard'
import type { Campaign, EmailTemplate } from '@/types'

export function CampaignsPage() {
  const { leads, isLoading: leadsLoading } = useLeads()
  const { campaigns, templates, isLoading } = useCampaigns()
  const { addTemplate } = useCampaignsStore()
  const createCampaign = useCreateCampaign()
  const updateCampaignMutation = useUpdateCampaign()
  const deleteCampaign = useDeleteCampaign()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [detail, setDetail] = useState<Campaign | null>(null)
  const [tab, setTab] = useState<'campaigns' | 'templates'>('campaigns')
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null)

  const totals = useMemo(() => {
    const enviados = campaigns.reduce((s, c) => s + c.enviados, 0)
    const respuestas = campaigns.reduce((s, c) => s + c.respondieron, 0)
    const valor = campaigns.reduce((s, c) => s + c.valorGenerado, 0)
    return { enviados, respuestas, valor, activas: campaigns.filter((c) => c.estado === 'activa').length }
  }, [campaigns])

  const launchCampaign = async (result: WizardResult) => {
    const estado = result.scheduledAt ? 'borrador' : 'activa'
    try {
      await createCampaign.mutateAsync({
        nombre: result.nombre,
        nicho: result.nicho,
        idioma: result.idioma,
        estado,
        template: result.cuerpo,
        leadIds: result.leadIds,
        totalLeads: result.leadIds.length,
      })

      if (!result.scheduledAt && config.workflows.envioEmails) {
        n8nService.run(config.workflows.envioEmails).catch(() => {})
      }
      toast.success(result.scheduledAt ? 'Campaña programada' : 'Campaña lanzada — workflow de envío disparado')
    } catch {
      toast.error('No se pudo guardar la campaña')
    }
  }

  const togglePause = async (c: Campaign) => {
    const next = c.estado === 'activa' ? 'pausada' : 'activa'
    try {
      await updateCampaignMutation.mutateAsync({ id: c.id, estado: next })
      toast.success(next === 'pausada' ? 'Campaña pausada' : 'Campaña reanudada')
    } catch {
      toast.error('No se pudo actualizar la campaña')
    }
  }

  const duplicate = async (c: Campaign) => {
    try {
      await createCampaign.mutateAsync({
        nombre: `${c.nombre} (copia)`,
        nicho: c.nicho,
        idioma: c.idioma,
        estado: 'borrador',
        template: c.templateId,
        leadIds: c.leadIds,
        totalLeads: c.totalLeads,
      })
      toast.success('Campaña duplicada')
    } catch {
      toast.error('No se pudo duplicar la campaña')
    }
  }

  const sendFollowUp = (c: Campaign) => {
    if (config.workflows.seguimientoEmail) n8nService.run(config.workflows.seguimientoEmail).catch(() => {})
    toast.success('Seguimiento enviado')
  }

  return (
    <div>
      <PageHeader
        title="📣 Campañas"
        subtitle={`${campaigns.length} campañas · ${totals.activas} activas`}
        actions={<Button onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4" /> Nueva campaña</Button>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard icon={<Mail className="h-4 w-4" />} label="Enviados" value={totals.enviados} />
        <MetricCard icon={<Users className="h-4 w-4" />} label="Respuestas" value={totals.respuestas} />
        <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Conversión prom." value={`${totals.enviados ? Math.round((totals.respuestas / totals.enviados) * 100) : 0}%`} />
        <MetricCard icon={<DollarSign className="h-4 w-4" />} label="Valor generado" value={formatCurrency(totals.valor)} />
      </div>

      <div className="mb-4 flex gap-2 border-b border-border">
        {(['campaigns', 'templates'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium',
              tab === t ? 'border-primary-400 text-fg' : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {t === 'campaigns' ? 'Campañas' : 'Templates'}
          </button>
        ))}
      </div>

      {tab === 'campaigns' ? (
        isLoading || leadsLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : !campaigns.length ? (
          <EmptyState icon={<Megaphone className="h-8 w-8" />} title="Sin campañas" description="Crea tu primera campaña de outreach." action={<Button onClick={() => setWizardOpen(true)}><Plus className="h-4 w-4" /> Nueva campaña</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.map((c) => (
              <CampaignCard
                key={c.id}
                campaign={c}
                onOpen={() => setDetail(c)}
                onTogglePause={() => togglePause(c)}
                onDuplicate={() => duplicate(c)}
                onDelete={() => setDeleteTarget(c)}
              />
            ))}
          </div>
        )
      ) : (
        <TemplatesLibrary templates={templates} onAdd={addTemplate} />
      )}

      <CampaignWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        leads={leads}
        templates={templates}
        onLaunch={launchCampaign}
      />

      <CampaignDetail
        campaign={detail}
        leads={leads}
        onClose={() => setDetail(null)}
        onTogglePause={() => detail && togglePause(detail)}
        onDuplicate={() => detail && duplicate(detail)}
        onFollowUp={() => detail && sendFollowUp(detail)}
        onDelete={() => detail && setDeleteTarget(detail)}
      />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Eliminar campaña"
        itemLabel={deleteTarget?.nombre}
        onConfirm={async () => {
          if (!deleteTarget) return
          await deleteCampaign.mutateAsync(deleteTarget.id)
          toast.success('Campaña eliminada')
          setDetail(null)
          setDeleteTarget(null)
        }}
      />
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <Card className="flex items-center gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-400/15">{icon}</div>
      <div>
        <p className="text-xs text-muted">{label}</p>
        <p className="text-lg font-bold text-fg">{value}</p>
      </div>
    </Card>
  )
}

function CampaignCard({
  campaign, onOpen, onTogglePause, onDuplicate, onDelete,
}: {
  campaign: Campaign
  onOpen: () => void
  onTogglePause: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const meta = CAMPAIGN_STATUS_META[campaign.estado]
  const rate = campaign.enviados ? Math.round((campaign.respondieron / campaign.enviados) * 100) : 0
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-semibold text-fg hover:text-primary-600" title={campaign.nombre}>{campaign.nombre}</p>
          <p className="mt-0.5 truncate text-xs text-muted">{campaign.nicho} {campaign.ciudad ? `· ${campaign.ciudad}` : ''}</p>
        </button>
        <Badge className={cn('shrink-0', meta.cls)}>{meta.label}</Badge>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div><p className="text-base font-bold text-fg">{campaign.totalLeads}</p><p className="text-muted">Leads</p></div>
        <div><p className="text-base font-bold text-fg">{campaign.enviados}</p><p className="text-muted">Enviados</p></div>
        <div><p className="text-base font-bold text-fg">{rate}%</p><p className="text-muted">Respuesta</p></div>
      </div>

      <p className="text-xs text-muted">Valor generado: <span className="font-semibold text-fg">{formatCurrency(campaign.valorGenerado)}</span></p>

      <div className="mt-auto flex gap-2 border-t border-border pt-3">
        {campaign.estado !== 'borrador' && campaign.estado !== 'completada' && (
          <Button size="sm" variant="outline" onClick={onTogglePause}>
            {campaign.estado === 'activa' ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Reanudar</>}
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /> Duplicar</Button>
        <button onClick={onDelete} className="btn-ghost ml-auto h-8 w-8 p-0 text-red-500 hover:bg-red-500/10" title="Eliminar">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  )
}

function CampaignDetail({
  campaign, leads, onClose, onTogglePause, onDuplicate, onFollowUp, onDelete,
}: {
  campaign: Campaign | null
  leads: ReturnType<typeof useLeads>['leads']
  onClose: () => void
  onTogglePause: () => void
  onDuplicate: () => void
  onFollowUp: () => void
  onDelete: () => void
}) {
  const campaignLeads = useMemo(
    () => leads.filter((l) => campaign?.leadIds?.includes(l.id)),
    [leads, campaign],
  )

  return (
    <Drawer open={!!campaign} onClose={onClose} width="max-w-xl">
      {campaign && (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface p-5">
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-semibold text-fg" title={campaign.nombre}>{campaign.nombre}</h3>
              <p className="truncate text-xs text-muted">{campaign.nicho} {campaign.ciudad ? `· ${campaign.ciudad}` : ''}</p>
            </div>
            <button onClick={onDelete} className="btn-ghost shrink-0 text-red-500 hover:bg-red-500/10" title="Eliminar"><Trash2 className="h-4 w-4" /></button>
            <button onClick={onClose} className="btn-ghost shrink-0"><X className="h-4 w-4" /></button>
          </div>

          <div className="space-y-5 p-5">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div><p className="text-base font-bold text-fg">{campaign.totalLeads}</p><p className="text-muted">Leads</p></div>
              <div><p className="text-base font-bold text-fg">{campaign.enviados}</p><p className="text-muted">Enviados</p></div>
              <div><p className="text-base font-bold text-fg">{campaign.respondieron}</p><p className="text-muted">Respuestas</p></div>
              <div><p className="text-base font-bold text-fg">{formatCurrency(campaign.valorGenerado)}</p><p className="text-muted">Valor</p></div>
            </div>

            <div className="flex flex-wrap gap-2">
              {campaign.estado !== 'completada' && (
                <Button size="sm" variant="outline" onClick={onTogglePause}>
                  {campaign.estado === 'activa' ? <><Pause className="h-3.5 w-3.5" /> Pausar</> : <><Play className="h-3.5 w-3.5" /> Reanudar</>}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onDuplicate}><Copy className="h-3.5 w-3.5" /> Duplicar</Button>
              <Button size="sm" variant="outline" onClick={onFollowUp}><Send className="h-3.5 w-3.5" /> Enviar seguimiento</Button>
            </div>

            {campaign.createdAt && (
              <p className="text-xs text-muted">Creada el {new Date(campaign.createdAt).toLocaleString('es')}</p>
            )}

            <div>
              <p className="mb-2 text-xs font-medium text-muted">Leads en la campaña ({campaignLeads.length})</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {campaignLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-xs">
                    <span className="min-w-0 flex-1 truncate text-fg" title={l.empresa}>{l.empresa}</span>
                    <span className="shrink-0 text-muted">{l.estado}</span>
                  </div>
                ))}
                {!campaignLeads.length && <p className="text-xs text-muted">No hay leads asociados.</p>}
              </div>
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}

function TemplatesLibrary({ templates, onAdd }: { templates: EmailTemplate[]; onAdd: (t: EmailTemplate) => void }) {
  const [editing, setEditing] = useState(false)
  const [nombre, setNombre] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')

  const save = () => {
    if (!nombre.trim() || !asunto.trim() || !cuerpo.trim()) return
    onAdd({ id: `T-${Date.now()}`, nombre, asunto, cuerpo })
    setNombre(''); setAsunto(''); setCuerpo(''); setEditing(false)
    toast.success('Template guardado')
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> {editing ? 'Cancelar' : 'Nuevo template'}
        </Button>
      </div>

      {editing && (
        <Card className="mb-4 space-y-3">
          <Input placeholder="Nombre del template" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input placeholder="Asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
          <Textarea placeholder="Cuerpo del mensaje…" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} className="min-h-[120px]" />
          <Button size="sm" onClick={save}>Guardar template</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {templates.map((t) => (
          <Card key={t.id} className="space-y-2">
            <p className="truncate text-sm font-semibold text-fg" title={t.nombre}>{t.nombre}</p>
            <p className="truncate text-xs font-medium text-muted" title={applyTemplate(t.asunto, {})}>{applyTemplate(t.asunto, {})}</p>
            <p className="line-clamp-4 text-xs text-muted">{applyTemplate(t.cuerpo, {})}</p>
          </Card>
        ))}
        {!templates.length && <p className="text-sm text-muted">No hay templates guardados.</p>}
      </div>
    </div>
  )
}
