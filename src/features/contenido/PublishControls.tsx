import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, Loader2, Rocket } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { cmsService } from '@/services/cmsService'
import type { CmsAccion, CmsItem, CmsPublicacion } from '@/types/cms'
import { publicUrl } from './model'

/**
 * Publicación de un artículo.
 *
 * El camino normal: Idea → Borrador → En revisión → Publicado (o Programado).
 * Publicar recompila la web en GitHub (≈3 min); aquí se ve cómo va gracias a
 * cms_publicaciones, que la Action actualiza al empezar y al terminar.
 */

const ACTIVA = (p?: CmsPublicacion) => p?.estado === 'pendiente' || p?.estado === 'compilando'

export function usePublicaciones() {
  return useQuery({
    queryKey: ['cms', 'publicaciones'],
    queryFn: () => cmsService.publicaciones(10),
    // Mientras hay una en marcha se consulta cada 4 s; si no, ni se molesta.
    refetchInterval: q => (q.state.data?.some(ACTIVA) ? 4000 : false),
  })
}

const hace = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  return h < 24 ? `hace ${h} h` : new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

/** Cómo va la última recompilación de la web. Toda recompilación afecta a todos los artículos. */
export function PublishStatus({ item, onRetry }: { item?: CmsItem; onRetry?: () => void }) {
  const pubs = usePublicaciones()
  const last = pubs.data?.[0]
  if (!last) return null
  const mine = !item || last.item_ids.includes(item.id) || last.accion === 'reconstruir'
  const reciente = Date.now() - new Date(last.created_at).getTime() < 6 * 3600_000
  if (ACTIVA(last)) return <Aviso tono="info" icon={<Loader2 size={16} className="animate-spin" />}
    texto={last.estado === 'pendiente' ? 'Preparando la publicación…' : 'Publicando la web… suele tardar unos 3 minutos.'}
    link={last.run_url ? { href: last.run_url, texto: 'Ver en GitHub' } : undefined} />
  if (last.estado === 'fallo' && reciente) return <Aviso tono="error" icon={<AlertTriangle size={16} />}
    texto={`La última publicación falló (${hace(last.created_at)}). La web sigue como estaba.`}
    link={last.run_url ? { href: last.run_url, texto: 'Ver qué pasó' } : undefined}
    accion={onRetry ? { texto: 'Reintentar', run: onRetry } : undefined} />
  if (last.estado === 'ok' && reciente && mine) return <Aviso tono="ok" icon={<CheckCircle2 size={16} />}
    texto={`Web actualizada ${hace(last.terminado_en ?? last.created_at)}.`}
    link={item?.status === 'publicado' ? { href: publicUrl(item.lang, item.slug), texto: 'Ver el artículo' } : undefined} />
  return null
}

function Aviso({ tono, icon, texto, link, accion }: {
  tono: 'info' | 'ok' | 'error'; icon: ReactNode; texto: string
  link?: { href: string; texto: string }; accion?: { texto: string; run: () => void }
}) {
  const color = { info: '--muted', ok: '--ok', error: '--danger' }[tono]
  return <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-[0.8125rem]"
    style={{ color: `rgb(var(${color}))`, background: tono === 'info' ? 'rgb(var(--surface-2))' : `rgb(var(${color}-soft) / 0.55)` }}>
    <span className="flex min-w-0 flex-1 items-center gap-2 text-fg">{icon}<span>{texto}</span></span>
    {link && <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline">
      {link.texto}<ExternalLink size={12} /></a>}
    {accion && <button type="button" onClick={accion.run} className="font-medium underline-offset-2 hover:underline">{accion.texto}</button>}
  </div>
}

/** `web`: la acción recompila la web, así que espera a que no haya cambios sin guardar ni otra publicación en marcha. */
type Op = { texto: string; run: () => void; web?: boolean; peligro?: boolean }

/** Botón principal según el estado, y el resto de acciones en un menú. */
export function PublishControls({ item, dirty, canWrite, isAdmin, onChange }: {
  item: CmsItem; dirty: boolean; canWrite: boolean; isAdmin: boolean; onChange: (item: CmsItem) => void
}) {
  const client = useQueryClient()
  const pubs = usePublicaciones()
  const enMarcha = ACTIVA(pubs.data?.[0])
  const [confirmar, setConfirmar] = useState<null | CmsAccion>(null)
  const [programar, setProgramar] = useState(false)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const fuera = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [menu])

  const refrescar = async () => {
    onChange(await cmsService.item(item.id))
    await client.invalidateQueries({ queryKey: ['cms'] })
  }
  const estado = useMutation({
    mutationFn: ({ status, cuando }: { status: 'idea' | 'borrador' | 'revision' | 'programado'; cuando?: string }) =>
      cmsService.setStatus(item, status, cuando),
    onSuccess: async saved => { onChange(saved); setProgramar(false); await client.invalidateQueries({ queryKey: ['cms'] }); toast.success('Estado cambiado') },
    onError: e => toast.error(e.message),
  })
  const publicar = useMutation({
    mutationFn: (accion: CmsAccion) => cmsService.publish(accion, accion === 'reconstruir' ? undefined : item.id),
    onSuccess: async (_, accion) => {
      setConfirmar(null)
      toast.success(accion === 'despublicar' ? 'Retirando de la web…' : 'Publicando… tarda unos 3 minutos')
      await refrescar()
    },
    onError: e => toast.error(e.message),
  })
  const ocupado = estado.isPending || publicar.isPending
  if (!canWrite) return null

  const ops: { main?: Op; resto: Op[] } = { resto: [] }
  const st = (texto: string, s: 'idea' | 'borrador' | 'revision'): Op => ({ texto, run: () => estado.mutate({ status: s }) })
  const web = (texto: string, accion: CmsAccion, peligro = false): Op => ({ texto, run: () => setConfirmar(accion), web: true, peligro })
  const prog = (texto: string): Op => ({ texto, run: () => setProgramar(true) })
  switch (item.status) {
    case 'idea': ops.main = st('Pasar a borrador', 'borrador'); break
    case 'borrador': ops.main = st('Enviar a revisión', 'revision'); ops.resto.push(st('Volver a idea', 'idea')); break
    case 'revision':
      if (isAdmin) { ops.main = web('Publicar', 'publicar'); ops.resto.push(prog('Programar…')) }
      ops.resto.push(st('Volver a borrador', 'borrador')); break
    case 'programado':
      if (isAdmin) { ops.main = web('Publicar ya', 'publicar'); ops.resto.push(prog('Cambiar fecha…')) }
      ops.resto.push(st('Cancelar programación', 'revision')); break
    case 'publicado':
      if (isAdmin) { ops.main = web('Actualizar la web', 'reconstruir'); ops.resto.push(web('Retirar de la web', 'despublicar', true)) }
      break
    case 'archivado':
      if (isAdmin) ops.main = web('Volver a publicar', 'publicar')
      ops.resto.push(st('Pasar a borrador', 'borrador')); break
  }
  const bloqueo = dirty ? 'Guarda los cambios primero' : enMarcha ? 'Hay una publicación en marcha' : undefined
  const bloqueada = (op: Op) => ocupado || (!!op.web && !!bloqueo)
  const esWeb = !!ops.main?.web

  return <>
    <div ref={menuRef} className="relative flex">
      {ops.main && <Button type="button" size="sm" variant={esWeb ? 'primary' : 'outline'} title={esWeb ? bloqueo : undefined}
        disabled={bloqueada(ops.main)} onClick={ops.main.run}
        className={cn(ops.resto.length > 0 && 'rounded-r-none')}>
        {esWeb && <Rocket size={15} />}<span className={cn(esWeb ? 'hidden sm:inline' : '')}>{ops.main.texto}</span>
      </Button>}
      {ops.resto.length > 0 && <Button type="button" size="sm" variant="outline" aria-label="Más acciones" aria-expanded={menu}
        disabled={ocupado} onClick={() => setMenu(!menu)}
        className={cn('px-2', ops.main && 'rounded-l-none border-l-0')}>
        <ChevronDown size={15} />
      </Button>}
      {menu && <div role="menu" className="card absolute right-0 top-full z-30 mt-1 w-56 p-1">
        {ops.resto.map(op => <button key={op.texto} type="button" role="menuitem" disabled={bloqueada(op)}
          onClick={() => { setMenu(false); op.run() }}
          className={cn('block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2 disabled:opacity-50', op.peligro && 'text-red-600')}>
          {op.texto}
        </button>)}
      </div>}
    </div>

    {confirmar && <Modal open title={{ publicar: 'Publicar en la web', despublicar: 'Retirar de la web', reconstruir: 'Actualizar la web' }[confirmar]}
      onClose={() => !publicar.isPending && setConfirmar(null)}
      footer={<>
        <Button type="button" variant="outline" disabled={publicar.isPending} onClick={() => setConfirmar(null)}>Cancelar</Button>
        <Button type="button" variant={confirmar === 'despublicar' ? 'danger' : 'primary'} disabled={publicar.isPending} onClick={() => publicar.mutate(confirmar)}>
          {publicar.isPending ? 'Enviando…' : { publicar: 'Publicar', despublicar: 'Retirar', reconstruir: 'Actualizar' }[confirmar]}
        </Button>
      </>}>
      <div className="space-y-3 text-sm">
        {confirmar === 'publicar' && <p>Saldrá en <span className="break-all font-medium">{publicUrl(item.lang, item.slug)}</span>.</p>}
        {confirmar === 'despublicar' && <p>El artículo dejará de estar en la web y su dirección dará «no encontrado». Queda guardado como archivado y se puede volver a publicar.</p>}
        {confirmar === 'reconstruir' && <p>La web se vuelve a generar con lo último que hay guardado en todos los artículos publicados.</p>}
        <p className="t-hint">Tarda unos 3 minutos. Puedes seguir trabajando; aquí verás cuándo termina.</p>
      </div>
    </Modal>}

    {programar && <ProgramarDialog actual={item.programado_para} pending={estado.isPending}
      onClose={() => setProgramar(false)} onSave={cuando => estado.mutate({ status: 'programado', cuando })} />}
  </>
}

function ProgramarDialog({ actual, pending, onClose, onSave }: {
  actual: string | null; pending: boolean; onClose: () => void; onSave: (iso: string) => void
}) {
  // datetime-local trabaja en hora local: mañana a las 9:00 por defecto.
  const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  const manana = new Date(); manana.setDate(manana.getDate() + 1); manana.setHours(9, 0, 0, 0)
  const [valor, setValor] = useState(local(actual ? new Date(actual) : manana))
  const fecha = new Date(valor)
  const valida = !Number.isNaN(fecha.getTime()) && fecha.getTime() > Date.now()
  return <Modal open title="Programar la publicación" onClose={() => !pending && onClose()}
    footer={<>
      <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button>
      <Button type="button" disabled={!valida || pending} onClick={() => onSave(fecha.toISOString())}>{pending ? 'Guardando…' : 'Programar'}</Button>
    </>}>
    <div className="space-y-3">
      <Input type="datetime-local" value={valor} onChange={e => setValor(e.target.value)} />
      {!valida && <p className="aviso-error">Elige una fecha futura.</p>}
      <p className="t-hint">A esa hora se publica sola (lo hace n8n cada 15 minutos). Hasta entonces puedes seguir editándolo.</p>
    </div>
  </Modal>
}
