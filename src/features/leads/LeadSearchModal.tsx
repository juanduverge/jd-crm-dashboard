import { useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Sparkles, Info, Bookmark, BookmarkPlus, History, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input } from '@/components/ui'
import { crmApi, type LeadSourceKey } from '@/services/crmApi'
import {
  useHistorialBusquedas, useBusquedasGuardadas, useGuardarBusqueda, useBorrarBusqueda,
} from '@/hooks/useData'
import { cn } from '@/lib/utils'

/** Fecha compacta para el historial: "12 ago". El año solo si no es este. */
function fechaCorta(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** Sugerencias comunes de tipo de negocio (texto libre, esto solo autocompleta). */
const SUGERENCIAS = [
  'real estate agency', 'restaurantes', 'arquitectura', 'abogados',
  'clínicas dentales', 'gimnasios', 'salones de belleza', 'talleres mecánicos',
]

interface Fuente {
  id: LeadSourceKey
  label: string
  /** Qué captura esta fuente — se muestra arriba al seleccionarla. */
  descripcion: string
  /** Qué se busca en el campo "tipo de negocio". */
  placeholderTipo: string
  /** Qué se busca en el campo de ubicación. */
  labelUbicacion: string
  placeholderUbicacion: string
  /** Las redes pueden buscarse solo por nicho/hashtag, sin ciudad. */
  ubicacionOpcional?: boolean
}

const FUENTES: Fuente[] = [
  {
    id: 'google_maps',
    label: 'Google Maps',
    descripcion: 'Busca negocios reales en Google Maps (vía Apify) y los agrega a tus Leads con diagnóstico web automático.',
    placeholderTipo: 'ej. restaurantes, abogados, real estate agency…',
    labelUbicacion: 'Ciudad / ubicación',
    placeholderUbicacion: 'ej. Miami, FL, USA',
  },
  {
    id: 'google_web',
    label: 'Google (búsqueda web)',
    descripcion: 'Rastrea resultados de Google y extrae los sitios web de negocios que coinciden con el nicho.',
    placeholderTipo: 'ej. "immigration lawyer" site web',
    labelUbicacion: 'Ciudad / ubicación',
    placeholderUbicacion: 'ej. Miami, FL, USA',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    descripcion: 'Captura empresas y perfiles profesionales de LinkedIn. Devuelve cargo y web corporativa; el teléfono rara vez está disponible.',
    placeholderTipo: 'ej. immigration law firm, marketing agency…',
    labelUbicacion: 'Ubicación (opcional)',
    placeholderUbicacion: 'ej. Miami, FL, USA',
    ubicacionOpcional: true,
  },
  {
    id: 'instagram',
    label: 'Instagram',
    descripcion: 'Captura cuentas de negocio por hashtag o palabra clave. Devuelve perfil, bio y web del enlace; el email depende de que esté en la bio.',
    placeholderTipo: 'ej. #abogadosmiami, dentista, barbershop…',
    labelUbicacion: 'Ubicación (opcional)',
    placeholderUbicacion: 'ej. Miami, FL, USA',
    ubicacionOpcional: true,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    descripcion: 'Captura páginas de negocio de Facebook. Suele traer teléfono, dirección y web, igual que una ficha de Maps.',
    placeholderTipo: 'ej. restaurantes, clínicas dentales…',
    labelUbicacion: 'Ciudad / ubicación',
    placeholderUbicacion: 'ej. Miami, FL, USA',
    ubicacionOpcional: true,
  },
]

export function LeadSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tipo, setTipo] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [max, setMax] = useState(20)
  const [fuente, setFuente] = useState<LeadSourceKey>('google_maps')
  const [sending, setSending] = useState(false)

  // Plantillas e historial. Repetir una búsqueda es lo normal —otra ciudad,
  // el mismo nicho— y hasta ahora había que reescribirla entera cada vez.
  const guardadas = useBusquedasGuardadas()
  const guardar = useGuardarBusqueda()
  const borrar = useBorrarBusqueda()
  const { data: historial } = useHistorialBusquedas()
  const [nombrando, setNombrando] = useState(false)
  const [nombre, setNombre] = useState('')

  const cargar = (b: { fuente?: string; tipo: string; ciudad: string; max?: number }) => {
    if (b.fuente && FUENTES.some((f) => f.id === b.fuente)) setFuente(b.fuente as LeadSourceKey)
    setTipo(b.tipo)
    setCiudad(b.ciudad)
    if (b.max) setMax(b.max)
  }

  const guardarPlantilla = async () => {
    if (!tipo.trim()) { toast.error('Escribe primero qué quieres buscar'); return }
    const n = nombre.trim() || [tipo.trim(), ciudad.trim()].filter(Boolean).join(' / ')
    try {
      await guardar.mutateAsync({ nombre: n, fuente, tipo: tipo.trim(), ciudad: ciudad.trim(), max })
      toast.success(`Plantilla «${n}» guardada`)
      setNombrando(false)
      setNombre('')
    } catch {
      toast.error('No se pudo guardar la plantilla')
    }
  }

  const fuenteActiva = FUENTES.find((f) => f.id === fuente) ?? FUENTES[0]

  const submit = async () => {
    if (!tipo.trim()) {
      toast.error('Indica el tipo de negocio o nicho a buscar')
      return
    }
    if (!fuenteActiva.ubicacionOpcional && !ciudad.trim()) {
      toast.error('Completa tipo de negocio y ciudad')
      return
    }
    setSending(true)
    try {
      await crmApi.buscarLeads({ tipo_negocio: tipo.trim(), ciudad: ciudad.trim(), max, fuente })
      toast.success('Búsqueda iniciada — los nuevos prospectos aparecerán en unos minutos', { duration: 6000 })
      // Los campos se quedan puestos: lo normal es repetir la misma búsqueda
      // cambiando solo la ciudad, y vaciarlos obligaba a reescribir todo.
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
          <p>{fuenteActiva.descripcion}</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Fuente de búsqueda</label>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {FUENTES.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFuente(f.id)}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors',
                  fuente === f.id
                    ? 'border-primary-400 bg-primary-400 text-white'
                    : 'border-border text-muted hover:text-fg',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">Tipo de negocio / nicho</label>
          <Input
            value={tipo}
            onChange={(e) => setTipo(e.target.value)}
            placeholder={fuenteActiva.placeholderTipo}
            list="sugerencias-nicho"
          />
          <datalist id="sugerencias-nicho">
            {SUGERENCIAS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-muted">{fuenteActiva.labelUbicacion}</label>
          <Input
            value={ciudad}
            onChange={(e) => setCiudad(e.target.value)}
            placeholder={fuenteActiva.placeholderUbicacion}
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

        {guardadas.length > 0 && (
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Bookmark className="h-3.5 w-3.5" /> Tus plantillas
            </label>
            <div className="flex flex-wrap gap-1.5">
              {guardadas.map((b) => (
                <span key={b.id} className="group flex items-center gap-1 rounded-lg border border-border bg-surface-2 pl-2 text-xs">
                  <button type="button" onClick={() => cargar(b)} className="py-1.5 text-fg hover:text-primary-500"
                    title={`${b.tipo}${b.ciudad ? ' / ' + b.ciudad : ''} · ${FUENTES.find((f) => f.id === b.fuente)?.label ?? b.fuente}`}>
                    {b.nombre}
                  </button>
                  <button type="button" onClick={() => borrar.mutate(b.id)}
                    className="px-1.5 py-1.5 text-muted/60 hover:text-rose-400" title="Borrar plantilla">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {nombrando ? (
          <div className="flex items-center gap-2">
            <Input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
              placeholder={[tipo.trim(), ciudad.trim()].filter(Boolean).join(' / ') || 'Nombre de la plantilla'}
              onKeyDown={(e) => { if (e.key === 'Enter') guardarPlantilla(); if (e.key === 'Escape') setNombrando(false) }} />
            <Button size="sm" onClick={guardarPlantilla} disabled={guardar.isPending}>Guardar</Button>
            <Button size="sm" variant="ghost" onClick={() => setNombrando(false)}>Cancelar</Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setNombrando(true)}>
            <BookmarkPlus className="h-4 w-4" /> Guardar esta búsqueda como plantilla
          </Button>
        )}

        {!!historial?.length && (
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
              <History className="h-3.5 w-3.5" /> Últimas búsquedas
            </label>
            <div className="max-h-40 space-y-0.5 overflow-y-auto">
              {historial.map((h) => (
                <button
                  key={h.fuente + h.consulta}
                  type="button"
                  onClick={() => cargar(h)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-surface-2"
                >
                  <span className="truncate text-fg">{h.consulta}</span>
                  <span className="shrink-0 text-[11px] text-muted">
                    {FUENTES.find((f) => f.id === h.fuente)?.label ?? h.fuente}
                    {' · '}{h.insertados} nuevo{h.insertados === 1 ? '' : 's'}
                    {' · '}{fechaCorta(h.fecha)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface-2 p-3 text-[11px] text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>Cada búsqueda consume créditos de Apify. La captura tarda unos minutos; los prospectos aparecerán solos en la lista de Leads cuando termine.</p>
        </div>
      </div>
    </Modal>
  )
}
