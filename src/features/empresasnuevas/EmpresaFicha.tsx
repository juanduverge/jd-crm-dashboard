import { differenceInCalendarDays, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Download, ExternalLink, EyeOff, Mail, MapPin, Phone, Search, User, X } from 'lucide-react'
import { Drawer } from '@/components/ui/Modal'
import { Badge, Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { DominiosEmpresa, EstadoDominio } from '@/lib/dominioEmpresa'
import type { Potencial } from '@/lib/potencialEmpresa'
import { ESTADOS_REGISTRO, type Contacto, type EmpresaNueva } from '@/lib/registrosNuevos'
import type { Investigacion, WebJuzgada } from '@/services/radarService'

/** Color de la nota: verde lo que merece la llamada, gris lo que no. */
export function claseNota(nota: number) {
  if (nota >= 8) return 'bg-emerald-500 text-white'
  if (nota >= 6) return 'bg-amber-400 text-amber-950'
  return 'bg-surface-2 text-muted'
}

const DOMINIO: Record<EstadoDominio, { texto: string; clase: string }> = {
  libre: { texto: 'Libre', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  sin_pagina: { texto: 'Comprado, sin página', clase: 'bg-amber-400/20 text-amber-800 dark:text-amber-300' },
  ocupado: { texto: 'Con página', clase: 'bg-surface-2 text-muted' },
}

const JUICIO: Record<WebJuzgada['es_suya'], { texto: string; clase: string }> = {
  si: { texto: 'Es suya', clase: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  probable: { texto: 'Probablemente suya', clase: 'bg-amber-400/20 text-amber-800 dark:text-amber-300' },
  no: { texto: 'De otra empresa', clase: 'bg-surface-2 text-muted' },
  sin_contenido: { texto: 'Vacía o en construcción', clase: 'bg-amber-400/20 text-amber-800 dark:text-amber-300' },
  aparcado: { texto: 'En venta', clase: 'bg-surface-2 text-muted' },
  no_abre: { texto: 'No abre', clase: 'bg-surface-2 text-muted' },
  sin_juicio: { texto: 'Sin decidir', clase: 'bg-surface-2 text-muted' },
}

export function haceCuanto(fecha: string) {
  const dias = differenceInCalendarDays(new Date(), new Date(`${fecha}T00:00:00`))
  if (dias < 0) return 'fecha futura'
  if (dias === 0) return 'hoy'
  return dias === 1 ? 'ayer' : `hace ${dias} días`
}

export function EmpresaFicha({
  empresa, potencial, contacto, dominios, investigacion, comprobandoDominios, guardando, onGuardar, onDescartar, onClose,
}: {
  /** Lo que el Radar averiguó leyendo sus páginas. Solo en «Listas para contactar». */
  investigacion?: Investigacion | null
  onDescartar?: () => void
  empresa: EmpresaNueva | null
  potencial: Potencial | null
  contacto?: Contacto
  dominios?: DominiosEmpresa | null
  comprobandoDominios: boolean
  guardando: boolean
  onGuardar: () => void
  onClose: () => void
}) {
  if (!empresa || !potencial) return null

  const estado = ESTADOS_REGISTRO.find((s) => s.id === empresa.estado)?.nombre ?? empresa.estado
  const consulta = `"${empresa.nombre}" ${empresa.ciudad} ${empresa.estado}`
  const google = (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}`
  // Búsquedas ya escritas: lo que harías a mano, a un toque.
  const busquedas = [
    { texto: 'Google', url: google(consulta) },
    { texto: 'Google Maps', url: `https://www.google.com/maps/search/${encodeURIComponent(`${empresa.nombre} ${empresa.ciudad} ${empresa.estado}`)}` },
    { texto: 'Instagram', url: google(`site:instagram.com ${consulta}`) },
    { texto: 'Facebook', url: google(`site:facebook.com ${consulta}`) },
    { texto: 'LinkedIn', url: google(`site:linkedin.com ${consulta}`) },
  ]

  const lugar = [empresa.ciudad, empresa.estado].filter(Boolean).join(' ')
  const busquedasPersona = contacto ? [
    { texto: 'LinkedIn', url: google(`site:linkedin.com/in "${contacto.nombre}" ${lugar}`) },
    { texto: 'Facebook', url: google(`site:facebook.com "${contacto.nombre}" ${lugar}`) },
    { texto: 'Google', url: google(`"${contacto.nombre}" "${empresa.nombre}"`) },
  ] : []

  return (
    <Drawer open onClose={onClose} width="max-w-lg">
      <div className="sticky top-0 z-10 border-b border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-bold tabular-nums', claseNota(potencial.nota))}>
              {potencial.nota}
            </span>
            <div className="min-w-0">
              <h3 className="break-words font-semibold leading-snug text-fg">{empresa.nombre}</h3>
              <p className="truncate text-xs text-muted">
                {[empresa.actividad?.nombre ?? 'Actividad sin identificar', empresa.ciudad, estado].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost shrink-0" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" onClick={onGuardar} disabled={guardando}>
            <Download className="h-3.5 w-3.5" /> {guardando ? 'Guardando…' : 'Guardar en Leads'}
          </Button>
          {empresa.correo && (
            <a className="btn btn-outline h-8 px-3 text-xs" href={`mailto:${empresa.correo}`}>
              <Mail className="h-3.5 w-3.5" /> Escribir
            </a>
          )}
          {onDescartar && (
            <button className="btn btn-ghost h-8 px-3 text-xs text-muted" onClick={onDescartar}>
              <EyeOff className="h-3.5 w-3.5" /> No me interesa
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6 p-5">
        {investigacion && (
          <Seccion titulo="Lo que se encontró">
            <p className="text-sm text-fg">{investigacion.resumen}</p>
            {investigacion.que_hace && <p className="t-hint mt-1">{investigacion.que_hace}</p>}

            {investigacion.webs.length > 0 && (
              <ul className="mt-3 space-y-2">
                {investigacion.webs.map((w) => (
                  <li key={w.dominio} className="rounded-lg border border-border p-2.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <a href={w.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate font-medium text-fg underline hover:text-primary-500">
                        {w.dominio} <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                      <Badge className={JUICIO[w.es_suya].clase}>{JUICIO[w.es_suya].texto}</Badge>
                    </div>
                    {w.motivo && <p className="t-hint mt-1">{w.motivo}</p>}
                  </li>
                ))}
              </ul>
            )}

            {(investigacion.correos.length + investigacion.telefonos.length + investigacion.redes.length) > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {investigacion.correos.map((c) => (
                  <li key={c.valor} className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <a href={`mailto:${c.valor}`} className="min-w-0 break-all hover:text-primary-500">{c.valor}</a>
                    <Badge>{c.confianza}</Badge>
                  </li>
                ))}
                {investigacion.telefonos.map((t) => (
                  <li key={t.valor} className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <a href={`tel:${t.valor}`} className="hover:text-primary-500">{t.valor}</a>
                    <Badge>{t.confianza}</Badge>
                  </li>
                ))}
                {investigacion.redes.map((r) => (
                  <li key={r.url} className="flex items-center gap-2">
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <a href={r.url} target="_blank" rel="noreferrer" className="min-w-0 truncate capitalize hover:text-primary-500">{r.red}</a>
                    <Badge>{r.confianza}</Badge>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-hint mt-2">
              {investigacion.metodo === 'paginas+ia'
                ? 'Se abrieron sus páginas y una IA decidió si eran de esta empresa. No se buscó en Google ni en redes.'
                : 'Se abrieron los dominios con su nombre. No hizo falta IA ni se buscó en Google.'}
            </p>
          </Seccion>
        )}

        <Seccion titulo={`Por qué un ${potencial.nota} de 10`}>
          <ul className="space-y-2">
            {potencial.motivos.map((m, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span className={cn(
                  'mt-0.5 w-8 shrink-0 rounded-md py-0.5 text-center text-xs font-semibold tabular-nums',
                  m.puntos > 0 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : m.puntos < 0 ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                    : 'bg-surface-2 text-muted',
                )}>
                  {m.puntos > 0 ? `+${m.puntos}` : m.puntos}
                </span>
                <span className="text-fg">{m.texto}</span>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion titulo="Persona de contacto">
          {contacto ? (
            <>
              <p className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4 shrink-0 text-muted" />
                <span className="font-medium text-fg">{contacto.nombre}</span>
                <Badge>{contacto.rol}</Badge>
              </p>
              {contacto.rol === 'Agente registrado' && (
                <p className="t-hint mt-1.5">El agente recibe las notificaciones legales. En negocios pequeños suele ser el dueño, pero puede ser su abogado o contable.</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {busquedasPersona.map((b) => (
                  <a key={b.texto} href={b.url} target="_blank" rel="noreferrer" className="btn btn-outline h-8 px-3 text-xs">
                    <Search className="h-3.5 w-3.5" /> {b.texto}
                  </a>
                ))}
              </div>
            </>
          ) : (
            <p className="t-hint">El registro no da el nombre de ninguna persona para esta empresa.</p>
          )}
        </Seccion>

        <Seccion titulo="Dominios con su nombre">
          {dominios ? (
            <ul className="space-y-1.5">
              {dominios.dominios.map((d) => (
                <li key={d.dominio} className="flex items-center justify-between gap-3 text-sm">
                  {d.estado === 'ocupado' ? (
                    <a href={`https://${d.dominio}`} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-fg underline hover:text-primary-500">
                      {d.dominio} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : <span className="min-w-0 truncate text-fg">{d.dominio}</span>}
                  <Badge className={DOMINIO[d.estado].clase}>{DOMINIO[d.estado].texto}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-hint">
              {comprobandoDominios ? 'Comprobando…' : dominios === null ? 'El nombre no da para deducir un dominio.' : 'Aún sin comprobar.'}
            </p>
          )}
          {dominios?.resumen === 'ocupado' && (
            <p className="t-hint mt-2">«Con página» puede ser otra empresa con el mismo nombre o un dominio en venta. Ábrelo antes de descartarla.</p>
          )}
        </Seccion>

        <Seccion titulo="Buscar el negocio">
          <div className="flex flex-wrap gap-2">
            {busquedas.map((b) => (
              <a key={b.texto} href={b.url} target="_blank" rel="noreferrer" className="btn btn-outline h-8 px-3 text-xs">
                <Search className="h-3.5 w-3.5" /> {b.texto}
              </a>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Datos del registro">
          <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 text-sm">
            <Dato nombre="Registrada">
              {format(new Date(`${empresa.fecha}T00:00:00`), "d 'de' MMMM yyyy", { locale: es })} · {haceCuanto(empresa.fecha)}
            </Dato>
            <Dato nombre="Estado">{estado}</Dato>
            {empresa.tipo && <Dato nombre="Forma legal">{empresa.tipo}</Dato>}
            {empresa.categoria && <Dato nombre="Actividad oficial">{empresa.categoria}</Dato>}
            {empresa.direccion && (
              <Dato nombre="Dirección">
                <a
                  href={`https://www.google.com/maps/search/${encodeURIComponent(empresa.direccion)}`}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-start gap-1 hover:text-primary-500"
                >
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" /> {empresa.direccion}
                </a>
              </Dato>
            )}
            {empresa.correo && <Dato nombre="Correo"><a href={`mailto:${empresa.correo}`} className="break-all hover:text-primary-500">{empresa.correo}</a></Dato>}
            <Dato nombre="Fuente">
              <a href={empresa.urlRegistro} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline hover:text-primary-500">
                Registro oficial <ExternalLink className="h-3 w-3" />
              </a>
            </Dato>
          </dl>
        </Seccion>
      </div>
    </Drawer>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">{titulo}</h4>
      {children}
    </section>
  )
}

function Dato({ nombre, children }: { nombre: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{nombre}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </>
  )
}
