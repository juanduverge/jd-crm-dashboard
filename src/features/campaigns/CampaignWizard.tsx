import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Sparkles, Loader2, Check, ChevronLeft, ChevronRight, Rocket } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input, Select, Textarea, Badge } from '@/components/ui'
import { DEFAULT_NICHES } from '@/lib/config'
import { fuzzyMatch, formatCurrency, scoreColor, cn } from '@/lib/utils'
import { applyTemplate } from '@/lib/campaigns'
import { crmApi } from '@/services/crmApi'
import type { Lead, EmailTemplate } from '@/types'

const STEPS = ['Info básica', 'Leads', 'Template y envío'] as const

export interface WizardResult {
  nombre: string
  nicho: string
  ciudad: string
  idioma: 'es' | 'en'
  leadIds: string[]
  asunto: string
  cuerpo: string
  scheduledAt: string // '' = ahora
}

export function CampaignWizard({
  open, onClose, leads, templates, onLaunch,
}: {
  open: boolean
  onClose: () => void
  leads: Lead[]
  templates: EmailTemplate[]
  onLaunch: (result: WizardResult) => void
}) {
  const [step, setStep] = useState(0)
  const [nombre, setNombre] = useState('')
  const [nicho, setNicho] = useState(DEFAULT_NICHES[0].id)
  const [ciudad, setCiudad] = useState('')
  const [idioma, setIdioma] = useState<'es' | 'en'>('es')

  const [search, setSearch] = useState('')
  const [fScoreMin, setFScoreMin] = useState(0)
  const [fEstado, setFEstado] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [templateId, setTemplateId] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [scheduleNow, setScheduleNow] = useState(true)
  const [scheduledAt, setScheduledAt] = useState('')

  const reset = () => {
    setStep(0); setNombre(''); setNicho(DEFAULT_NICHES[0].id); setCiudad(''); setIdioma('es')
    setSearch(''); setFScoreMin(0); setFEstado(''); setSelected(new Set())
    setTemplateId(''); setAsunto(''); setCuerpo(''); setScheduleNow(true); setScheduledAt('')
  }

  const close = () => { reset(); onClose() }

  const filteredLeads = useMemo(
    () =>
      leads.filter(
        (l) =>
          fuzzyMatch(`${l.empresa} ${l.ciudad}`, search) &&
          l.score >= fScoreMin &&
          (!fEstado || l.estado === fEstado) &&
          (!nicho || l.nicho === nicho),
      ),
    [leads, search, fScoreMin, fEstado, nicho],
  )

  const toggle = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }
  const selectAllFiltered = () => setSelected(new Set(filteredLeads.map((l) => l.id)))

  const previewLead = leads.find((l) => selected.has(l.id)) || filteredLeads[0]

  const applyTemplateChoice = (id: string) => {
    setTemplateId(id)
    const t = templates.find((tt) => tt.id === id)
    if (t) { setAsunto(t.asunto); setCuerpo(t.cuerpo) }
  }

  const generateWithAI = async () => {
    setAiLoading(true)
    try {
      const result = await crmApi.generateWithAI({
        nicho,
        idioma,
        tipoMensaje: 'email',
        contextoLead: ciudad || undefined,
        nombreEmpresa: previewLead?.empresa,
      })
      if (!result.ok || !result.asunto || !result.cuerpo) {
        throw new Error(result.error || 'Respuesta vacía')
      }
      setAsunto(result.asunto); setCuerpo(result.cuerpo); setTemplateId('')
    } catch {
      toast.error('No se pudo generar el mensaje con IA. Intenta de nuevo.')
    } finally {
      setAiLoading(false)
    }
  }

  const canNext =
    (step === 0 && nombre.trim().length > 1) ||
    (step === 1 && selected.size > 0) ||
    step === 2

  const launch = () => {
    onLaunch({
      nombre, nicho, ciudad, idioma,
      leadIds: [...selected],
      asunto, cuerpo,
      scheduledAt: scheduleNow ? '' : scheduledAt,
    })
    close()
  }

  return (
    <Modal open={open} onClose={close} title="🎯 Nueva campaña" size="lg" footer={
      <>
        {step > 0 && <Button variant="outline" onClick={() => setStep((s) => s - 1)}><ChevronLeft className="h-4 w-4" /> Atrás</Button>}
        <Button variant="ghost" onClick={close}>Cancelar</Button>
        {step < 2 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>Siguiente <ChevronRight className="h-4 w-4" /></Button>
        ) : (
          <Button onClick={launch} disabled={!asunto || !cuerpo}><Rocket className="h-4 w-4" /> Lanzar campaña</Button>
        )}
      </>
    }>
      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
              i < step ? 'bg-green-500 text-white' : i === step ? 'bg-primary-400 text-white' : 'bg-surface-2 text-muted',
            )}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn('hidden text-xs sm:block', i === step ? 'font-semibold text-fg' : 'text-muted')}>{s}</span>
            {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="sm:col-span-2 block">
            <span className="mb-1 block text-xs font-medium text-muted">Nombre de la campaña *</span>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Real Estate Miami Q3" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Nicho *</span>
            <Select value={nicho} onChange={(e) => setNicho(e.target.value)}>
              {DEFAULT_NICHES.map((n) => <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Ciudad / Región</span>
            <Input value={ciudad} onChange={(e) => setCiudad(e.target.value)} placeholder="Miami" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Idioma</span>
            <Select value={idioma} onChange={(e) => setIdioma(e.target.value as 'es' | 'en')}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </Select>
          </label>
        </div>
      )}

      {step === 1 && (
        <div>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <Input className="max-w-xs" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <label className="text-xs text-muted">Estado
              <Select className="mt-1 w-36" value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                <option value="">Todos</option>
                <option value="nuevo">Nuevo</option>
                <option value="contactado">Contactado</option>
                <option value="seguimiento">Seguimiento</option>
              </Select>
            </label>
            <label className="text-xs text-muted">Score mínimo: {fScoreMin}
              <input type="range" min={0} max={100} value={fScoreMin} onChange={(e) => setFScoreMin(+e.target.value)} className="mt-2 block w-36 accent-primary-400" />
            </label>
            <Button size="sm" variant="outline" onClick={selectAllFiltered}>Seleccionar todos los filtrados</Button>
            <Badge className="bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300">{selected.size} leads seleccionados</Badge>
          </div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-border bg-surface-2 text-xs text-muted">
                <tr><th className="w-8 px-3 py-2"></th><th className="max-w-[220px] px-3 py-2 text-left">Empresa</th><th className="px-3 py-2 text-left">Ciudad</th><th className="px-3 py-2 text-left">Score</th></tr>
              </thead>
              <tbody>
                {filteredLeads.map((l) => {
                  const sc = scoreColor(l.score)
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-2/60">
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} className="accent-primary-400" /></td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-fg">{l.empresa}</td>
                      <td className="max-w-[140px] truncate px-3 py-2 text-muted">{l.ciudad || '—'}</td>
                      <td className="px-3 py-2"><span className={cn('rounded-md px-1.5 py-0.5 text-xs font-bold', sc.bg, sc.text)}>{l.score}</span></td>
                    </tr>
                  )
                })}
                {!filteredLeads.length && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted">Sin leads que coincidan.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">Template</span>
              <Select className="w-56" value={templateId} onChange={(e) => applyTemplateChoice(e.target.value)}>
                <option value="">— Elegir template —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </label>
            <Button size="sm" variant="outline" onClick={generateWithAI} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {aiLoading ? 'Generando…' : 'Generar con IA'}
            </Button>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Asunto</span>
            <Input value={asunto} onChange={(e) => setAsunto(e.target.value)} placeholder="{{empresa}}: …" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Cuerpo (usa {'{{empresa}}'}, {'{{nombre}}'}, {'{{web}}'}, {'{{ciudad}}'}, {'{{score}}'}, {'{{problema_detectado}}'})</span>
            <Textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} className="min-h-[140px]" />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="radio" checked={scheduleNow} onChange={() => setScheduleNow(true)} /> Enviar ahora
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="radio" checked={!scheduleNow} onChange={() => setScheduleNow(false)} /> Programar
            </label>
            {!scheduleNow && (
              <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-56" />
            )}
          </div>

          {previewLead && (asunto || cuerpo) && (
            <div className="rounded-xl border border-border bg-surface-2 p-3">
              <p className="mb-1 text-xs font-medium text-muted">Preview · {previewLead.empresa}</p>
              <p className="text-sm font-semibold text-fg">{applyTemplate(asunto, previewLead)}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{applyTemplate(cuerpo, previewLead)}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
