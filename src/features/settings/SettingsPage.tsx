import { useEffect, useMemo, useState, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import {
  Building2, CheckCircle2, XCircle, Loader2, ExternalLink, Workflow,
  Mail as MailIcon, Plus, Trash2, AtSign, Tags, Plug,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Input, Textarea, Skeleton } from '@/components/ui'
import { useConfig, useUpdateConfig, useWorkflows, useEmailAliases } from '@/hooks/useData'
import { NichosCard } from './NichosCard'
import { crmApi } from '@/services/crmApi'
import { n8nService } from '@/services/n8nService'
import { config } from '@/lib/config'

const PROFILE_FIELDS: { key: string; label: string; fallback: string; hint?: string; type?: string }[] = [
  { key: 'nombre_agencia', label: 'Nombre de la agencia', fallback: config.business.name },
  { key: 'email_contacto', label: 'Email de contacto', fallback: config.business.emailMain, type: 'email' },
  { key: 'email_outreach', label: 'Email de outreach', fallback: config.business.emailOutreach, type: 'email', hint: 'La dirección desde la que salen las campañas.' },
  { key: 'whatsapp_contacto', label: 'WhatsApp de contacto', fallback: config.business.whatsapp },
  { key: 'booking_url', label: 'Link de agendamiento', fallback: config.business.booking, hint: 'Se inserta en las plantillas que ofrecen una llamada.' },
]

const SECCIONES = [
  { id: 'agencia', label: 'Agencia', icon: Building2 },
  { id: 'correo', label: 'Correo', icon: MailIcon },
  { id: 'nichos', label: 'Nichos', icon: Tags },
  { id: 'conexiones', label: 'Conexiones', icon: Plug },
]

export function SettingsPage() {
  const { data: cfg, isLoading: cfgLoading, isError: cfgError } = useConfig()
  const updateConfig = useUpdateConfig()
  const savedAliases = useEmailAliases()

  // Un original por sección: es lo que permite saber si hay algo sin guardar
  // y, sobre todo, poder descartar. Antes cada campo se guardaba por su cuenta
  // y no había forma de arrepentirse.
  const [profile, setProfile] = useState<Record<string, string>>({})
  const [firma, setFirma] = useState('')
  const [aliases, setAliases] = useState<{ email: string; label: string }[]>([])
  const [guardando, setGuardando] = useState<string | null>(null)

  const profileOriginal = useMemo(() => {
    const o: Record<string, string> = {}
    PROFILE_FIELDS.forEach((f) => { o[f.key] = cfg?.[f.key] ?? f.fallback })
    return o
  }, [cfg])
  const firmaOriginal = cfg?.['firma_email'] ?? `\n\n— ${config.business.name}\n${config.business.emailOutreach}`

  useEffect(() => { setProfile(profileOriginal) }, [profileOriginal])
  useEffect(() => { setFirma(firmaOriginal) }, [firmaOriginal])
  useEffect(() => { setAliases(savedAliases) }, [cfg]) // eslint-disable-line react-hooks/exhaustive-deps

  const perfilSucio = PROFILE_FIELDS.some((f) => (profile[f.key] ?? '') !== profileOriginal[f.key])
  const firmaSucia = firma !== firmaOriginal
  const aliasSucios = JSON.stringify(aliases) !== JSON.stringify(savedAliases)

  const guardar = async (seccion: string, entradas: { clave: string; valor: string }[]) => {
    setGuardando(seccion)
    try {
      for (const e of entradas) await updateConfig.mutateAsync(e)
      toast.success('Cambios guardados')
    } catch {
      toast.error('No se pudo guardar. Revisa los permisos de la tabla «settings» en Supabase.')
    } finally {
      setGuardando(null)
    }
  }

  const guardarAlias = () => {
    const limpios = aliases.filter((a) => /\S+@\S+\.\S+/.test(a.email.trim()))
    if (!limpios.length) { toast.error('Hace falta al menos una dirección válida'); return }
    setAliases(limpios)
    void guardar('alias', [{ clave: 'email_aliases', valor: JSON.stringify(limpios) }])
  }

  return (
    <div>
      <PageHeader
        title="Configuración"
        subtitle="Los datos de la agencia, cómo sale tu correo y a qué está conectado el CRM"
      />

      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
        {/* El índice fija el orden de lectura: primero lo tuyo, al final la
            fontanería. En pantallas estrechas sobra, porque las secciones ya
            van una debajo de otra. */}
        <nav className="hidden lg:block">
          <ul className="sticky top-[calc(var(--topbar-h)+1.5rem)] space-y-0.5">
            {SECCIONES.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg"
                >
                  <Icon className="h-4 w-4 shrink-0" /> {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-10">
          {/* ---------- Agencia ---------- */}
          <Seccion
            id="agencia"
            titulo="Agencia"
            descripcion="Tus datos. Aparecen en las plantillas de correo y en lo que ve el lead."
          >
            {cfgLoading ? (
              <CamposCargando n={5} />
            ) : cfgError ? (
              <p className="aviso-error">No se pudo leer la configuración.</p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {PROFILE_FIELDS.map((f) => (
                    <div key={f.key} className={f.key === 'booking_url' ? 'sm:col-span-2' : undefined}>
                      <label htmlFor={f.key} className="t-label mb-1.5">{f.label}</label>
                      <Input
                        id={f.key}
                        type={f.type}
                        value={profile[f.key] ?? ''}
                        onChange={(e) => setProfile((p) => ({ ...p, [f.key]: e.target.value }))}
                      />
                      {f.hint && <p className="t-hint mt-1.5 text-xs">{f.hint}</p>}
                    </div>
                  ))}
                </div>
                <BarraGuardar
                  sucio={perfilSucio}
                  guardando={guardando === 'perfil'}
                  onDescartar={() => setProfile(profileOriginal)}
                  onGuardar={() => guardar('perfil', PROFILE_FIELDS
                    .filter((f) => (profile[f.key] ?? '') !== profileOriginal[f.key])
                    .map((f) => ({ clave: f.key, valor: profile[f.key] ?? '' })))}
                />
              </>
            )}
          </Seccion>

          {/* ---------- Correo ---------- */}
          <Seccion
            id="correo"
            titulo="Correo"
            descripcion="La firma que cierra cada respuesta y las direcciones desde las que puedes escribir."
          >
            <div className="space-y-8">
              <div>
                <label htmlFor="firma" className="t-label mb-1.5">Firma</label>
                <Textarea
                  id="firma"
                  value={firma}
                  onChange={(e) => setFirma(e.target.value)}
                  className="min-h-[9rem] font-mono text-[0.8125rem] leading-relaxed"
                />
                <p className="t-hint mt-1.5 text-xs">Se añade al final de cada respuesta enviada desde la Bandeja.</p>
                <BarraGuardar
                  sucio={firmaSucia}
                  guardando={guardando === 'firma'}
                  onDescartar={() => setFirma(firmaOriginal)}
                  onGuardar={() => guardar('firma', [{ clave: 'firma_email', valor: firma }])}
                />
              </div>

              <div className="border-t border-border pt-6">
                <div className="flex items-center gap-2">
                  <AtSign className="h-4 w-4 text-muted" />
                  <h3 className="t-card">Direcciones de envío</h3>
                </div>
                <p className="t-hint mt-1.5 max-w-prose text-xs">
                  Se ofrecen como «Enviar desde» en la Bandeja. El envío real usa las credenciales SMTP de n8n
                  para <span className="font-medium text-fg">info@</span> y <span className="font-medium text-fg">sales@</span>;
                  cualquier otra saldrá con la credencial más parecida.
                </p>

                <div className="mt-4 space-y-2">
                  {aliases.map((a, i) => (
                    <div key={i} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Input
                        value={a.email}
                        onChange={(e) => setAliases((prev) => prev.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))}
                        placeholder="correo@jddeveloper.com"
                        type="email"
                        className="sm:flex-1"
                        aria-label="Dirección"
                      />
                      <div className="flex items-center gap-2">
                        <Input
                          value={a.label}
                          onChange={(e) => setAliases((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                          placeholder="Etiqueta (ej. Ventas)"
                          className="flex-1 sm:w-44 sm:flex-none"
                          aria-label="Etiqueta"
                        />
                        <button
                          onClick={() => setAliases((prev) => prev.filter((_, j) => j !== i))}
                          className="btn-ghost h-11 w-11 shrink-0 p-0 text-muted hover:bg-red-500/10 hover:text-red-500 sm:h-9 sm:w-9"
                          aria-label={`Quitar ${a.email || 'dirección'}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!aliases.length && (
                    <p className="t-hint rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs">
                      Ninguna dirección configurada.
                    </p>
                  )}
                </div>

                <Button variant="outline" size="sm" className="mt-3" onClick={() => setAliases((p) => [...p, { email: '', label: '' }])}>
                  <Plus className="h-3.5 w-3.5" /> Añadir dirección
                </Button>

                <BarraGuardar
                  sucio={aliasSucios}
                  guardando={guardando === 'alias'}
                  onDescartar={() => setAliases(savedAliases)}
                  onGuardar={guardarAlias}
                />
              </div>
            </div>
          </Seccion>

          {/* ---------- Nichos ---------- */}
          <Seccion
            id="nichos"
            titulo="Nichos"
            descripcion="El catálogo con el que se clasifican los leads al importarlos."
            sinCaja
          >
            <NichosCard />
          </Seccion>

          {/* ---------- Conexiones ---------- */}
          <Conexiones />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

/** Una sección con el título fuera de la caja: el encabezado pertenece a la
 *  página, no a la tarjeta, y así el índice se sigue leyendo aunque la caja
 *  esté cargando o vacía. */
function Seccion({
  id, titulo, descripcion, children, sinCaja,
}: {
  id: string
  titulo: string
  descripcion: string
  children: ReactNode
  sinCaja?: boolean
}) {
  return (
    <section id={id} className="scroll-mt-[calc(var(--topbar-h)+1.5rem)]">
      <h2 className="t-card text-base">{titulo}</h2>
      <p className="t-hint mt-1 max-w-prose">{descripcion}</p>
      <div className={sinCaja ? 'mt-4' : 'card mt-4 p-5'}>{children}</div>
    </section>
  )
}

/** Aparece sólo cuando hay algo que guardar. Un botón permanentemente
 *  disponible enseña a pulsarlo por si acaso; uno que aparece dice «tienes
 *  cambios sin guardar» sin necesidad de escribirlo. */
function BarraGuardar({
  sucio, guardando, onGuardar, onDescartar,
}: {
  sucio: boolean
  guardando: boolean
  onGuardar: () => void
  onDescartar: () => void
}) {
  if (!sucio) return null
  return (
    <div className="mt-5 flex flex-col-reverse items-stretch gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
      <Button variant="ghost" size="sm" onClick={onDescartar} disabled={guardando}>Descartar</Button>
      <Button size="sm" onClick={onGuardar} disabled={guardando}>
        {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Guardar cambios
      </Button>
    </div>
  )
}

function CamposCargando({ n }: { n: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i}>
          <Skeleton className="mb-2 h-3 w-28" />
          <Skeleton className="h-9" />
        </div>
      ))}
    </div>
  )
}

/** Antes eran dos tarjetas que decían lo mismo: una lista de «workflows
 *  activos» y, al lado, otra con esos mismos workflows y su estado. Aquí van
 *  juntos: primero lo que puede estar caído, luego el detalle. */
function Conexiones() {
  const { data: workflows, isLoading: wfLoading, isError: wfError } = useWorkflows()

  const hookPing = useQuery({ queryKey: ['integration-hook-ping'], queryFn: () => crmApi.ping(), refetchInterval: 30_000 })
  const n8nPing = useQuery({ queryKey: ['integration-n8n-ping'], queryFn: () => n8nService.diagnosticar(), refetchInterval: 30_000 })

  return (
    <Seccion
      id="conexiones"
      titulo="Conexiones"
      descripcion="Lo que el CRM necesita por debajo. Aquí no se configura nada: se mira cuando algo deja de funcionar."
    >
      <div className="space-y-2">
        <FilaEstado
          label="n8n"
          para="Automatizaciones y envío de correo"
          ok={n8nPing.data?.ok}
          loading={n8nPing.isLoading}
          detalle={n8nPing.data && !n8nPing.data.ok ? n8nPing.data.detalle : undefined}
        />
        <FilaEstado
          label="CRM API"
          para="Los webhooks que escriben en el CRM"
          ok={hookPing.data}
          loading={hookPing.isLoading}
        />
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-muted" />
          <h3 className="t-card">Workflows</h3>
        </div>

        {wfError ? (
          <p className="aviso-error mt-3">No se pudo conectar a n8n para leer los workflows.</p>
        ) : wfLoading ? (
          <div className="mt-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : !workflows?.length ? (
          <p className="t-hint mt-3 text-xs">n8n no devolvió ningún workflow.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {workflows.map((w) => (
              <li key={w.id}>
                <a
                  href={`${config.n8n.url}/workflow/${w.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:border-primary-300 hover:bg-surface-2"
                >
                  {/* Un punto en vez de una insignia: son ocho filas, y ocho
                      etiquetas de colores compiten con lo que sí importa. */}
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: w.active ? 'rgb(var(--ok))' : 'rgb(var(--border))' }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm text-fg" title={w.name}>{w.name}</span>
                  <span className="shrink-0 text-xs text-muted">{w.active ? 'Activo' : 'Pausado'}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Seccion>
  )
}

/** `detalle` sólo se pinta cuando hay fallo: explica qué reconectar y cómo. */
function FilaEstado({
  label, para, ok, loading, detalle,
}: {
  label: string
  para: string
  ok?: boolean
  loading?: boolean
  detalle?: string
}) {
  return (
    <div className="rounded-xl border border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{label}</p>
          <p className="t-hint truncate text-xs">{para}</p>
        </div>
        {loading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" />
        ) : ok ? (
          <span className="badge-ok shrink-0"><CheckCircle2 className="h-3 w-3" /> Conectado</span>
        ) : (
          <span className="badge-danger shrink-0"><XCircle className="h-3 w-3" /> Sin conexión</span>
        )}
      </div>
      {!loading && !ok && detalle && <p className="t-hint mt-2 text-xs">{detalle}</p>}
    </div>
  )
}
