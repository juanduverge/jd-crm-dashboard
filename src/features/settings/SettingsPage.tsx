import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, Save, CheckCircle2, XCircle, Loader2, ExternalLink, Workflow, Database, Mail as MailIcon, Plus, Trash2, AtSign,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader, CardTitle, Button, Input, Textarea, Badge, Skeleton } from '@/components/ui'
import { useConfig, useUpdateConfig, useWorkflows, useEmailAliases } from '@/hooks/useData'
import { crmApi } from '@/services/crmApi'
import { n8nService } from '@/services/n8nService'
import { config } from '@/lib/config'
import { cn } from '@/lib/utils'

const PROFILE_FIELDS: { key: string; label: string; fallback: string; placeholder?: string }[] = [
  { key: 'nombre_agencia', label: 'Nombre de la agencia', fallback: config.business.name },
  { key: 'email_contacto', label: 'Email de contacto', fallback: config.business.emailMain },
  { key: 'email_outreach', label: 'Email de outreach', fallback: config.business.emailOutreach },
  { key: 'whatsapp_contacto', label: 'WhatsApp de contacto', fallback: config.business.whatsapp },
  { key: 'booking_url', label: 'Link de agendamiento', fallback: config.business.booking },
]

export function SettingsPage() {
  const { data: cfg, isLoading: cfgLoading, isError: cfgError } = useConfig()
  const updateConfig = useUpdateConfig()
  const { data: workflows, isLoading: wfLoading, isError: wfError } = useWorkflows()
  const savedAliases = useEmailAliases()

  const [profile, setProfile] = useState<Record<string, string>>({})
  const [firma, setFirma] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [aliases, setAliases] = useState<{ email: string; label: string }[]>([])
  const [savingAliases, setSavingAliases] = useState(false)

  useEffect(() => {
    if (!cfg) return
    const next: Record<string, string> = {}
    PROFILE_FIELDS.forEach((f) => { next[f.key] = cfg[f.key] ?? f.fallback })
    setProfile(next)
    setFirma(cfg['firma_email'] ?? `\n\n— ${config.business.name}\n${config.business.emailOutreach}`)
  }, [cfg])

  useEffect(() => { setAliases(savedAliases) }, [cfg]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveAliases = async () => {
    const clean = aliases.filter((a) => a.email.trim() && /\S+@\S+\.\S+/.test(a.email.trim()))
    if (!clean.length) { toast.error('Debe haber al menos un alias válido'); return }
    setSavingAliases(true)
    try {
      await updateConfig.mutateAsync({ clave: 'email_aliases', valor: JSON.stringify(clean) })
      setAliases(clean)
      toast.success('Alias guardados')
    } catch {
      toast.error('No se pudo guardar. Verifica los permisos en la tabla "settings" de Supabase.')
    } finally {
      setSavingAliases(false)
    }
  }

  const saveField = async (key: string, value: string) => {
    setSavingKey(key)
    try {
      await updateConfig.mutateAsync({ clave: key, valor: value })
      toast.success('Guardado')
    } catch {
      toast.error('No se pudo guardar. Verifica los permisos en la tabla "settings" de Supabase.')
    } finally {
      setSavingKey(null)
    }
  }

  const sheetsPing = useQuery({
    queryKey: ['integration-sheets-ping'],
    queryFn: () => crmApi.ping(),
    refetchInterval: 30_000,
  })
  const n8nPing = useQuery({
    queryKey: ['integration-n8n-ping'],
    queryFn: () => n8nService.ping(),
    refetchInterval: 30_000,
  })

  const wfByName = (needle: string) => (workflows ?? []).find((w) => w.name.toLowerCase().includes(needle))

  return (
    <div>
      <PageHeader title="⚙️ Configuración" subtitle="Perfil, firma de email, integraciones y accesos a n8n" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Perfil de la agencia */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> Perfil de la agencia</CardTitle></CardHeader>
          {cfgLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : cfgError ? (
            <p className="py-4 text-xs text-red-500">No se pudo leer la hoja de configuración.</p>
          ) : (
            <div className="space-y-3">
              {PROFILE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-muted">{f.label}</label>
                  <div className="flex gap-2">
                    <Input
                      value={profile[f.key] ?? ''}
                      onChange={(e) => setProfile((p) => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                    />
                    <Button
                      size="sm" variant="outline"
                      disabled={savingKey === f.key}
                      onClick={() => saveField(f.key, profile[f.key] ?? '')}
                    >
                      {savingKey === f.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Firma de email */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MailIcon className="h-4 w-4" /> Firma de email</CardTitle></CardHeader>
          {cfgLoading ? <Skeleton className="h-40" /> : (
            <div className="space-y-3">
              <Textarea value={firma} onChange={(e) => setFirma(e.target.value)} className="min-h-[160px]" />
              <p className="text-xs text-muted">Se agrega automáticamente al final de cada respuesta enviada desde la Bandeja.</p>
              <Button size="sm" disabled={savingKey === 'firma_email'} onClick={() => saveField('firma_email', firma)}>
                {savingKey === 'firma_email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Guardar firma
              </Button>
            </div>
          )}
        </Card>

        {/* Alias de correo */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AtSign className="h-4 w-4" /> Alias de correo</CardTitle></CardHeader>
          {cfgLoading ? <Skeleton className="h-40" /> : (
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Direcciones disponibles como "Enviar desde" en la Bandeja y en mensajes nuevos. Hostinger no ofrece una API
                para leer alias automáticamente, así que se administran aquí. El envío real usa las credenciales SMTP
                configuradas en n8n para <span className="font-medium text-fg">info@</span> y <span className="font-medium text-fg">sales@</span>;
                otros alias que agregues aquí se mostrarán en el selector pero se enviarán usando la credencial más cercana disponible.
              </p>
              <div className="space-y-2">
                {aliases.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={a.email}
                      onChange={(e) => setAliases((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                      placeholder="correo@jddeveloper.com"
                      className="flex-1"
                    />
                    <Input
                      value={a.label}
                      onChange={(e) => setAliases((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                      placeholder="Etiqueta (ej. Ventas)"
                      className="w-40"
                    />
                    <button
                      onClick={() => setAliases((prev) => prev.filter((_, j) => j !== i))}
                      className="btn-ghost h-9 w-9 shrink-0 text-red-500 hover:bg-red-500/10"
                      title="Eliminar alias"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAliases((prev) => [...prev, { email: '', label: '' }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Agregar alias
                </Button>
                <Button size="sm" disabled={savingAliases} onClick={saveAliases}>
                  {savingAliases ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Guardar alias
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Estado de integraciones */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Database className="h-4 w-4" /> Estado de integraciones</CardTitle></CardHeader>
          <div className="space-y-2">
            <StatusRow label="n8n (API pública)" ok={n8nPing.data} loading={n8nPing.isLoading} />
            <StatusRow label="CRM API (webhooks Sheets)" ok={sheetsPing.data} loading={sheetsPing.isLoading} />
            <StatusRow
              label="Envío de emails"
              ok={wfByName('envío de emails')?.active ?? wfByName('envio')?.active}
              loading={wfLoading}
            />
            <StatusRow
              label="Seguimiento email"
              ok={wfByName('seguimiento email')?.active}
              loading={wfLoading}
            />
            <StatusRow
              label="WhatsApp seguimiento"
              ok={wfByName('whatsapp')?.active}
              loading={wfLoading}
            />
            {wfError && <p className="text-xs text-red-500">No se pudo conectar a n8n para leer el estado de los workflows.</p>}
          </div>
        </Card>

        {/* Accesos rápidos */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Workflow className="h-4 w-4" /> Accesos rápidos a n8n</CardTitle></CardHeader>
          {wfLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9" />)}</div>
          ) : !workflows?.length ? (
            <p className="py-4 text-xs text-muted">No se pudo listar los workflows de n8n.</p>
          ) : (
            <div className="space-y-2">
              {workflows.map((w) => (
                <a
                  key={w.id}
                  href={`${config.n8n.url}/workflow/${w.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-fg" title={w.name}>{w.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge className={cn(w.active ? 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400' : 'bg-surface-2 text-muted')}>
                      {w.active ? 'Activo' : 'Inactivo'}
                    </Badge>
                    <ExternalLink className="h-3.5 w-3.5 text-muted" />
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

function StatusRow({ label, ok, loading }: { label: string; ok?: boolean; loading?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{label}</span>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
      ) : ok ? (
        <Badge className="gap-1 bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
      ) : (
        <Badge className="gap-1 bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"><XCircle className="h-3 w-3" /> Sin conexión</Badge>
      )}
    </div>
  )
}
