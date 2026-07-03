import { useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Sparkles, Info, Lock } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input } from '@/components/ui'
import { crmApi, type LeadSourceKey } from '@/services/crmApi'
import { cn } from '@/lib/utils'

/** Sugerencias comunes de tipo de negocio (texto libre, esto solo autocompleta). */
const SUGERENCIAS = [
  'real estate agency', 'restaurantes', 'arquitectura', 'abogados',
  'clínicas dentales', 'gimnasios', 'salones de belleza', 'talleres mecánicos',
]

const FUENTES: { id: LeadSourceKey; label: string; disabled?: boolean; note?: string }[] = [
  { id: 'google_maps', label: 'Google Maps' },
  { id: 'google_web', label: 'Google (búsqueda web)' },
  { id: 'linkedin', label: 'LinkedIn', disabled: true, note: 'Experimental — próximamente' },
  { id: 'instagram', label: 'Instagram', disabled: true, note: 'Experimental — próximamente' },
  { id: 'facebook', label: 'Facebook', disabled: true, note: 'Experimental — próximamente' },
]

export function LeadSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tipo, setTipo] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [max, setMax] = useState(20)
  const [fuente, setFuente] = useState<LeadSourceKey>('google_maps')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!tipo.trim() || !ciudad.trim()) {
      toast.error('Completa tipo de negocio y ciudad')
      return
    }
    setSending(true)
    try {
      await crmApi.buscarLeads({ tipo_negocio: tipo.trim(), ciudad: ciudad.trim(), max, fuente })
      toast.success('Búsqueda iniciada — los nuevos prospectos aparecerán en unos minutos', { duration: 6000 })
      setTipo('')
      setCiudad('')
      onClose()
    } catch {
      toast.error('No se pudo iniciar la búsqueda. Revisa la conexión a n8n.')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Buscar nuevos prospectos"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={submit} disabled={sending}>
            <Search className={sending ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
            {sending ? 'Iniciando…' : 'Buscar prospectos'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-xl bg-primary-50 p-3 text-xs text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Busca negocios reales en Google Maps (vía Apify) y los agrega a tus Leads con diagnóstico web automático.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Fuente de búsqueda</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {FUENTES.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={f.disabled}
                title={f.note}
                onClick={() => !f.disabled && setFuente(f.id)}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                  f.disabled
                    ? 'cursor-not-allowed border-border/60 text-muted/50'
                    : fuente === f.id
                      ? 'border-primary-400 bg-primary-400 text-white'
                      : 'border-border text-muted hover:text-fg',
                )}
              >
                {f.disabled && <Lock className="h-3 w-3" />}
                {f.label}
              </button>
            ))}
          </div>
          {FUENTES.find((f) => f.id === fuente)?.note && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{FUENTES.find((f) => f.id === fuente)?.note}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Tipo de negocio / nicho</label>
          <Input
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder="ej. restaurantes, abogados, real estate agency…"
            list="sugerencias-nicho"
          />
          <datalist id="sugerencias-nicho">
            {SUGERENCIAS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Ciudad / ubicación</label>
          <Input
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder="ej. Miami, FL, USA"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Cantidad máxima de resultados</label>
          <Input
            type="number"
            min={1}
            max={50}
            value={max}
            onChange={(e) => setMax(Math.min(50, Math.max(1, Number(e.target.value) || 20)))}
          />
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-[11px] text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Cada búsqueda consume créditos de Apify. La captura tarda unos minutos; los prospectos aparecerán solos en la lista de Leads cuando termine.</p>
        </div>
      </div>
    </Modal>
  )
}
