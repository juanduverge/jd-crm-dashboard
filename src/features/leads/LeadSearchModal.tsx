import { useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Search, Sparkles, Info, Bookmark, BookmarkPlus, History, X, Star, ChevronDown } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, Input } from '@/components/ui'
import { crmApi, type LeadSourceKey } from '@/services/crmApi'
import {
  useHistorialBusquedas, useBusquedasGuardadas, useGuardarBusqueda, useBorrarBusqueda, useNichos,
} from '@/hooks/useData'
import type { Niche } from '@/lib/config'
import {
  TERMINOS_BUSQUEDA, TERMINOS_FAVORITOS, NICHOS_EXTRA, claveTermino, type TerminoBusqueda,
} from '@/lib/nichosBusqueda'
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

/** Cuántos términos por grupo se pintan cuando no se está filtrando. */
const MAX_POR_GRUPO_SIN_FILTRO = 8

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

/**
 * Campo "tipo de negocio" con el catálogo de términos detrás.
 *
 * Antes era un `<input list>` con ocho sugerencias a mano, y el resultado era
 * el de la captura: un desplegable de cinco líneas del que no sale ninguna
 * búsqueda que funcione, así que había que saberse de memoria cómo llama
 * Google a cada sector. Ahora se abre un panel agrupado por sector con lo que
 * de verdad devuelve resultados, y arriba dos atajos:
 *
 *   - "Lo que más te funciona": sale de `lead_imports` — los términos con los
 *     que tú ya has capturado leads, ordenados por cuántos entraron. Es el
 *     único dato de esta lista que no es una opinión.
 *   - "Recomendados": los marcados `favorito` en el catálogo (negocio local,
 *     ticket alto, web mala), para cuando aún no hay historial de un sector.
 *
 * Sigue siendo texto libre: escribir algo que no está en la lista funciona
 * igual, la lista solo filtra mientras escribes.
 */
function SelectorNicho({
  valor, onChange, placeholder, historial,
}: {
  valor: string
  onChange: (v: string) => void
  placeholder: string
  historial: { tipo: string; insertados: number; veces: number }[]
}) {
  const [abierto, setAbierto] = useState(false)
  const contenedor = useRef<HTMLDivElement>(null)
  const nichos = useNichos()

  // Lo tuyo primero: mismo tipo buscado varias veces cuenta una sola, y manda
  // cuántos leads entraron, no cuántas veces se lanzó (una búsqueda repetida
  // que no trae nada no es un acierto).
  const masUsados = useMemo(() => {
    const m = new Map<string, { termino: string; insertados: number }>()
    for (const h of historial) {
      const t = h.tipo.trim()
      if (!t) continue
      const clave = claveTermino(t)
      const ya = m.get(clave)
      if (ya) ya.insertados += h.insertados
      else m.set(clave, { termino: t, insertados: h.insertados })
    }
    return [...m.values()].sort((a, b) => b.insertados - a.insertados).slice(0, 8)
  }, [historial])

  const filtro = claveTermino(valor)
  // Filtrar solo cuando el texto no es ya exactamente una opción elegida: si
  // no, al hacer clic en "roofing contractor" el panel se queda con una única
  // línea y parece que se ha roto.
  const filtrando = filtro.length >= 2

  // El agrupado lo manda el catálogo de nichos, no este archivo: los mismos
  // sectores, nombres y emojis que ves en la tabla y en los filtros. Así un
  // nicho que te crees en Ajustes aparece también aquí (con su propio nombre
  // como término, que es lo único que se sabe de él), en vez de quedarse fuera
  // del buscador.
  const grupos = useMemo(() => {
    const porNicho = new Map<string, TerminoBusqueda[]>()
    for (const t of TERMINOS_BUSQUEDA) {
      const ya = porNicho.get(t.nicho)
      if (ya) ya.push(t)
      else porNicho.set(t.nicho, [t])
    }

    // Los nichos de `NICHOS_EXTRA` que la BD todavía no tenga (migración 0046
    // sin aplicar): se pintan igual para que la lista no pierda sectores.
    const conocidos = new Set(nichos.map((n) => n.id))
    const catalogo: Niche[] = [
      ...nichos,
      ...NICHOS_EXTRA.filter((n) => !conocidos.has(n.id)).map((n) => ({ ...n, color: '#94a3b8' })),
    ]

    const salida: {
      grupo: string
      nicho: string
      etiqueta: string
      terminos: TerminoBusqueda[]
      ocultos: number
    }[] = []

    for (const n of catalogo) {
      // "Otros" no aporta nada como sector de búsqueda, y un nicho pendiente es
      // texto crudo de Google sin revisar: no es un término que quieras buscar.
      if (n.id === 'otros' || n.pendiente) continue
      const propios = porNicho.get(n.id) ?? [{ termino: n.nombre.toLowerCase(), nicho: n.id }]
      const encajan = filtrando
        ? propios.filter((t) => claveTermino(t.termino).includes(filtro))
        : propios.slice(0, MAX_POR_GRUPO_SIN_FILTRO)
      if (encajan.length === 0) continue
      salida.push({
        grupo: n.grupo,
        nicho: n.id,
        etiqueta: `${n.emoji} ${n.nombre}`,
        terminos: encajan,
        ocultos: filtrando ? 0 : propios.length - encajan.length,
      })
    }
    return salida
  }, [filtro, filtrando, nichos])

  const elegir = (t: string) => {
    onChange(t)
    setAbierto(false)
  }

  // `t` es un término del catálogo o uno del historial (que no tiene nicho:
  // es texto que escribiste tú), así que sólo se pide lo que se pinta.
  const Fila = ({ t, nota }: { t: { termino: string; nota?: string }; nota?: string }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()} // que no pierda el foco antes del clic
      onClick={() => elegir(t.termino)}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors',
        'hover:bg-primary-50 dark:hover:bg-primary-500/10',
        claveTermino(t.termino) === filtro && 'bg-primary-50 dark:bg-primary-500/10',
      )}
    >
      <span className="truncate">{t.termino}</span>
      {(nota ?? t.nota) && (
        <span className="shrink-0 text-[11px] text-muted">{nota ?? t.nota}</span>
      )}
    </button>
  )

  return (
    <div
      ref={contenedor}
      className="relative"
      onBlur={(e) => {
        if (!contenedor.current?.contains(e.relatedTarget as Node)) setAbierto(false)
      }}
    >
      <div className="relative">
        <Input
          value={valor}
          onChange={(e) => { onChange(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={(e) => { if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false) } }}
          placeholder={placeholder}
          className="pr-9"
          autoComplete="off"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setAbierto((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-fg"
          aria-label={abierto ? 'Cerrar sugerencias' : 'Ver sectores'}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', abierto && 'rotate-180')} />
        </button>
      </div>

      {abierto && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg p-1 shadow-lg">
          {!filtrando && masUsados.length > 0 && (
            <div className="mb-1">
              <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <History className="h-3 w-3" /> Lo que más te funciona
              </p>
              {masUsados.map((m) => (
                <Fila
                  key={`usado-${m.termino}`}
                  t={{ termino: m.termino }}
                  nota={m.insertados > 0 ? `${m.insertados} leads` : 'sin resultados'}
                />
              ))}
            </div>
          )}

          {!filtrando && (
            <div className="mb-1 border-t border-border pt-1">
              <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <Star className="h-3 w-3" /> Recomendados para vender webs
              </p>
              {TERMINOS_FAVORITOS.slice(0, 12).map((t) => (
                <Fila key={`fav-${t.termino}`} t={t} />
              ))}
            </div>
          )}

          {grupos.map((g, i) => (
            <div key={g.nicho} className="border-t border-border pt-1">
              {/* El sector del catálogo sólo se repite cuando cambia: es la
                  cabecera de arriba, y los nichos que cuelgan de él van dentro. */}
              {g.grupo !== grupos[i - 1]?.grupo && (
                <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                  {g.grupo}
                </p>
              )}
              <p className="px-2 py-0.5 text-xs font-medium text-fg">{g.etiqueta}</p>
              {g.terminos.map((t) => <Fila key={`${g.nicho}-${t.termino}`} t={t} />)}
              {g.ocultos > 0 && (
                <p className="px-2 pb-1 text-[11px] text-muted">
                  +{g.ocultos} más — escribe para filtrar
                </p>
              )}
            </div>
          ))}

          {filtrando && grupos.length === 0 && (
            <p className="px-2 py-3 text-xs text-muted">
              «{valor}» no está en la lista. Se puede buscar igual: se manda tal cual a Google Maps.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

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
          <SelectorNicho
            valor={tipo}
            onChange={setTipo}
            placeholder={fuenteActiva.placeholderTipo}
            historial={historial ?? []}
          />
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
