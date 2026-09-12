import { useState, type ReactNode } from 'react'
import { ExternalLink, MapPin, Navigation, Phone, Globe, Copy, Star, MessageSquare } from 'lucide-react'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui'
import { cn, copiarAlPortapapeles } from '@/lib/utils'
import { consultaMapa, urlEmbebido, urlExterna, urlComoLlegar } from '@/lib/mapas'
import { VisorWebModal } from './VisorWeb'

/** Lo que sabemos de la ficha de Google. Todo opcional: se pinta lo que haya. */
export type FichaMapa = {
  nombre?: string
  categoria?: string
  rating?: number
  resenas?: number
  direccion?: string
  telefono?: string
  web?: string
}

/**
 * Ficha de Google dentro del CRM: los datos a la izquierda y el mapa a la
 * derecha, como el panel de Google Maps.
 *
 * Ese panel lateral de Google NO se puede embeber (Google lo bloquea), así que
 * se dibuja con lo que ya tenemos guardado de la importación de Apify. Por eso
 * no hay foto, ni horario, ni el texto de las reseñas: eso no está en la base,
 * haría falta la Places API. El botón «Abrir en Google Maps» sigue ahí.
 */
export function MapaModal({
  open, onClose, consulta, enlaceExterno, ficha, titulo,
}: {
  open: boolean
  onClose: () => void
  consulta: string
  enlaceExterno?: string
  ficha?: FichaMapa
  titulo?: string
}) {
  const embebido = urlEmbebido(consulta)
  const externo = enlaceExterno || urlExterna(consulta)
  const comoLlegar = urlComoLlegar(consulta)

  const copiar = async (texto: string, que: string) => {
    const ok = await copiarAlPortapapeles(texto)
    if (ok) toast.success(`${que} copiado`)
    else toast.error(`No se pudo copiar ${que.toLowerCase()}`)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={ficha?.nombre || titulo || consulta || 'Ficha de Google'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {externo && (
            <a href={externo} target="_blank" rel="noopener noreferrer">
              <Button className="w-full"><ExternalLink className="mr-2 h-4 w-4" />Abrir en Google Maps</Button>
            </a>
          )}
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Panel de detalles */}
        <div className="min-w-0 space-y-3">
          {ficha?.nombre && <h4 className="text-lg font-semibold leading-tight text-fg">{ficha.nombre}</h4>}

          {(ficha?.rating !== undefined || ficha?.categoria) && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {ficha?.rating !== undefined && (
                <span className="inline-flex items-center gap-1 font-medium text-fg">
                  {ficha.rating.toFixed(1).replace('.', ',')}
                  <Estrellas valor={ficha.rating} />
                  {ficha.resenas !== undefined && <span className="text-muted">({ficha.resenas})</span>}
                </span>
              )}
              {ficha?.categoria && <span className="text-muted">{ficha.categoria}</span>}
            </div>
          )}

          {/* Acciones, como los botones redondos de Google */}
          <div className="flex flex-wrap gap-2">
            {comoLlegar && <Accion href={comoLlegar} icon={Navigation} label="Cómo llegar" />}
            {ficha?.telefono && <Accion href={`tel:${ficha.telefono.replace(/\s/g, '')}`} icon={Phone} label="Llamar" />}
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            {ficha?.direccion && <Dato icon={MapPin} texto={ficha.direccion} onCopiar={() => copiar(ficha.direccion!, 'Dirección')} />}
            {ficha?.telefono && <Dato icon={Phone} texto={ficha.telefono} onCopiar={() => copiar(ficha.telefono!, 'Teléfono')} />}
            {ficha?.web && <Dato icon={Globe} texto={ficha.web} web={ficha.web} onCopiar={() => copiar(ficha.web!, 'Web')} />}
            {ficha?.resenas !== undefined && (
              <Dato
                icon={MessageSquare}
                texto={`${ficha.resenas} ${ficha.resenas === 1 ? 'reseña' : 'reseñas'} en Google`}
                href={externo}
              />
            )}
          </div>
        </div>

        {/* Mapa */}
        {embebido ? (
          <iframe
            src={embebido}
            title={`Mapa de ${consulta}`}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-56 w-full rounded-xl border border-border sm:h-full sm:min-h-[18rem]"
          />
        ) : (
          <p className="py-8 text-center text-sm text-muted">No hay dirección que mostrar en el mapa.</p>
        )}
      </div>
    </Modal>
  )
}

function Estrellas({ valor }: { valor: number }) {
  return (
    <span className="inline-flex" aria-label={`${valor} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= Math.round(valor) ? 'fill-amber-400 text-amber-400' : 'text-border')} />
      ))}
    </span>
  )
}

function Accion({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-surface-2 dark:text-primary-300"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </a>
  )
}

/**
 * Una línea de dato. Si es una web se abre en el visor del CRM (`web`); si es
 * otro enlace (las reseñas de Google) se va fuera, que ahí no hay alternativa.
 */
function Dato({ icon: Icon, texto, href, web, onCopiar }: { icon: any; texto: string; href?: string; web?: string; onCopiar?: () => void }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      {web
        ? <EnlaceWebLazy url={web} texto={texto} />
        : href
          ? <a href={href} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words text-primary-600 hover:underline dark:text-primary-300">{texto}</a>
          : <span className="min-w-0 flex-1 break-words text-fg">{texto}</span>}
      {onCopiar && (
        <button type="button" onClick={onCopiar} aria-label="Copiar" title="Copiar" className="shrink-0 rounded p-1 text-muted hover:text-fg">
          <Copy className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** La web de la ficha: se abre en el visor del CRM, no en otra ventana. */
function EnlaceWebLazy({ url, texto }: { url: string; texto: string }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="min-w-0 flex-1 break-words text-left text-primary-600 hover:underline dark:text-primary-300">
        {texto}
      </button>
      <VisorWebModal open={abierto} onClose={() => setAbierto(false)} url={url} />
    </>
  )
}

/** Enlace que abre la ficha. Sustituye a los `<a target="_blank">` a Google Maps. */
export function EnlaceMapa({
  partes, enlaceExterno, ficha, children, className, title,
}: {
  partes: (string | undefined | null)[]
  enlaceExterno?: string
  ficha?: FichaMapa
  children: ReactNode
  className?: string
  title?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const consulta = consultaMapa(...partes)
  if (!consulta && !enlaceExterno) return <>{children}</>
  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        title={title || `Ver la ficha de ${consulta}`}
        className={cn('min-w-0 truncate text-left text-primary-600 hover:underline', className)}
      >
        {children}
      </button>
      <MapaModal open={abierto} onClose={() => setAbierto(false)} consulta={consulta} enlaceExterno={enlaceExterno} ficha={ficha} />
    </>
  )
}

/** Icono-botón compacto para tablas y listas. */
export function BotonMapa({ partes, enlaceExterno, ficha, className }: { partes: (string | undefined | null)[]; enlaceExterno?: string; ficha?: FichaMapa; className?: string }) {
  const [abierto, setAbierto] = useState(false)
  const consulta = consultaMapa(...partes)
  if (!consulta && !enlaceExterno) return null
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAbierto(true) }}
        aria-label="Ver la ficha en el mapa"
        title="Ver la ficha en el mapa"
        className={cn('btn-ghost h-8 w-8 p-0', className)}
      >
        <MapPin className="h-4 w-4" />
      </button>
      <MapaModal open={abierto} onClose={() => setAbierto(false)} consulta={consulta} enlaceExterno={enlaceExterno} ficha={ficha} />
    </>
  )
}
