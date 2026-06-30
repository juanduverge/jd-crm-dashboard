import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import {
  Megaphone, Plus, Pause, Play, Copy, Send, X, Mail, Users, TrendingUp, DollarSign,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, Button, Badge, EmptyState, Skeleton, Input, Textarea } from '@/components/ui'
import { Drawer } from '@/components/ui/Modal'
import { useLeads, useCampaigns } from '@/hooks/useData'
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
  const { addCampaign, updateCampaign, addEvent, duplicateCampaign, addTemplate } = useCampaignsStore()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [detail, setDetail] = useState<Campaign | null>(null)
  const [tab, setTab] = useState<'campaigns' | 'templates'>('campaigns')

  const totals = useMemo(() => {
    const enviados = campaigns.reduce((s, c) => s + c.enviados, 0)
    const respuestas = campaigns.reduce((s, c) => s + c.respondieron, 0)
    const valor = campaigns.reduce((s, c) => s + c.valorGenerado, 0)
    return { enviados, respuestas, valor, activas: campaigns.filter((c) => c.estado === 'activa').length }
  }, [campaigns])

  const launchCampaign = async (result: WizardResult) => {
    const id = `C-${Date.now()}`
    const campaign: Campaign = {
      id,
      nombre: result.nombre,
      nicho: result.nicho,
      ciudad: result.ciudad,
      idioma: result.idioma,
      estado: result.scheduledAt ? 'borrador' : 'activa',
      totalLeads: result.leadIds.length,
      enviados: 0,
      respondieron: 0,
      conversion: 0,
      valorGenerado: 0,
      createdAt: new Date().toISOString(),
      leadIds: result.leadIds,
      scheduledAt: result.scheduledAt,
      events: [{ label: 'Campaña creada', timestamp: new Date().toISOString() }],
    }
    addCampaign(campaign)

    if (!result.scheduledAt && config.workflows.envioEmails) {
      n8nService.run(config.workflows.envioEmails).catch(() => {})
      addEvent(id, 'Workflow de envío disparado en n8n')
    }
    toast.success(result.scheduledAt ? 'Campaña programada' : 'Campaña lanzada — workflow de envío disparado')
  }

  const togglePause = (c: Campaign) => {
    const next = c.estado === 'activa' ? 'pausada' : 'activa'
    updateCampaign(c.id, { estado: next })
    addEvent(c.id, next === 'pausada' ? 'Campaña pausada' : 'Campaña reanudada')
    toast.success(next === 'pausada' ? 'Campaña pausada' : 'Campaña reanudada')
  }

  const sendFollowUp = (c: Campaign) => {
    if (config.workflows.seguimientoEmail) n8nService.run(config.workflows.seguimientoEmail).catch(() => {})
    addEvent(c.id, 'Seguimiento disparado en n8n')
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
                onDuplicate={() => { duplicateCampaign(c.id); toast.success('Campaña duplicada') }}
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
        onDuplicate={() => { if (detail) { duplicateCampaign(detail.id); toast.success('Campaña duplicada') } }}
        onFollowUp={() => detail && sendFollowUp(detail)}
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
  campaign, onOpen, onTogglePause, onDuplicate,
}: {
  campaign: Campaign
  onOpen: () => void
  onTogglePause: () => void
  onDuplicate: () => void
}) {
  const meta = CAMPAIGN_STATUS_META[campaign.estado]
  const rate = campaign.enviados ? Math.round((campaign.respondieron / campaign.enviados) * 100) : 0
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="text-left">
          <p className="text-sm font-semibold text-fg hover:text-primary-600">{campaign.nombre}</p>
          <p className="mt-0.5 text-xs text-muted">{campaign.nicho} {campaign.ciudad ? `· ${campaign.ciudad}` : ''}</p>
        </button>
        <Badge className={meta.cls}>{meta.label}</Badge>
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
      </div>
    </Card>
  )
}

function CampaignDetail({
  campaign, leads, onClose, onTogglePause, onDuplicate, onFollowUp,
}: {
  campaign: Campaign | null
  leads: ReturnType<typeof useLeads>['leads']
  onClose: () => void
  onTogglePause: () => void
  onDuplicate: () => void
  onFollowUp: () => void
}) {
  const campaignLeads = useMemo(
    () => leads.filter((l) => campaign?.leadIds?.includes(l.id)),
    [leads, campaign],
  )

  return (
    <Drawer open={!!campaign} onClose={onClose} width="max-w-xl">
      {campaign && (
        <>
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-surface p-5">
            <div>
              <h3 className="font-semibold text-fg">{campaign.nombre}</h3>
              <p className="text-xs text-muted">{campaign.nicho} {campaign.ciudad ? `· ${campaign.ciudad}` : ''}</p>
            </div>
            <button onClick={onClose} className="btn-ghost"><X className="h-4 w-4" /></button>
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

            <div>
              <p className="mb-2 text-xs font-medium text-muted">Timeline</p>
              <div className="space-y-2 border-l border-border pl-4">
                {(campaign.events ?? []).slice().reverse().map((e, i) => (
                  <div key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary-400" />
                    <p className="text-xs font-medium text-fg">{e.label}</p>
                    <p className="text-[11px] text-muted">{new Date(e.timestamp).toLocaleString('es')}</p>
                  </div>
                ))}
                {!campaign.events?.length && <p className="text-xs text-muted">Sin eventos todavía.</p>}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-muted">Leads en la campaña ({campaignLeads.length})</p>
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {campaignLeads.map((l) => (
                  <div key={l.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-xs">
                    <span className="text-fg">{l.empresa}</span>
                    <span className="text-muted">{l.estado}</span>
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
            <p className="text-sm font-semibold text-fg">{t.nombre}</p>
            <p className="text-xs font-medium text-muted">{applyTemplate(t.asunto, {})}</p>
            <p className="line-clamp-4 text-xs text-muted">{applyTemplate(t.cuerpo, {})}</p>
          </Card>
        ))}
        {!templates.length && <p className="text-sm text-muted">No hay templates guardados.</p>}
      </div>
    </div>
  )
}
