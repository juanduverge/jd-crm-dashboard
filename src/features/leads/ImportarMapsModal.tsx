import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, Globe, Loader2, MapPin } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui'
import { leadsService, type ImportacionMaps } from '@/services/leadsService'
import { useLeadsStore } from '@/store/leadsStore'
import { esperarContactos } from '@/lib/contactosWeb'

/**
 * «Añadir desde Google Maps»: pegas el enlace de una ficha y el lead se crea
 * con nombre, dirección, ciudad, país y ubicación (OpenStreetMap, gratis).
 * Después el robot de casa lee la ficha de Google (teléfono, web, estrellas,
 * reseñas) y, si hay web, sus correos, WhatsApp y redes (0071).
 *
 * Paso 2, solo si no hay robot de ficha y no se encontró la web: se pide.
 *
 * Desde el móvil: en la app de Maps, Compartir → Copiar, y aquí «Pegar».
 */
export function ImportarMapsModal({
  open, onClose, onCreado,
}: {
  open: boolean
  onClose: () => void
  onCreado: (leadId: string) => void
}) {
  const qc = useQueryClient()
  const patchLocal = useLeadsStore((s) => s.patchLocal)
  const [enlace, setEnlace] = useState('')
  const [web, setWeb] = useState('')
  const [creado, setCreado] = useState<ImportacionMaps | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reiniciar = () => { setEnlace(''); setWeb(''); setCreado(null); setError(null) }
  const cerrar = () => {
    if (cargando) return
    if (creado) onCreado(creado.leadId)
    reiniciar(); onClose()
  }

  const pegar = async (poner: (t: string) => void) => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { poner(t.trim()); setError(null) }
    } catch {
      toast('Mantén pulsado el campo y elige «Pegar»')
    }
  }

  const buscarContactos = async (r: ImportacionMaps) => {
    toast('Buscando correos y redes en su web…', { icon: '🔎' })
    void esperarContactos(r.leadId, r.empresa, await leadsService.getLead(r.leadId).catch(() => null))
  }

  const importar = async () => {
    if (!enlace.trim() || cargando) return
    setCargando(true); setError(null)
    try {
      const r = await leadsService.importarDesdeMaps(enlace.trim())
      await qc.refetchQueries({ queryKey: ['leads'] })
      toast.success(r.nuevo ? `${r.empresa} añadido` : `${r.empresa} ya estaba: se completaron los datos que faltaban`)
      if (r.cerrado) toast(`Ojo: Google lo marca cerrado ${r.cerrado}`, { icon: '⚠️' })
      if (r.leyendoFicha) {
        // El robot trae teléfono, web, estrellas y reseñas de la ficha y, si
        // hay web, los contactos: no hace falta pedir nada a mano.
        toast('Leyendo su ficha de Google y su web…', { icon: '🔎' })
        void esperarContactos(r.leadId, r.empresa, await leadsService.getLead(r.leadId).catch(() => null))
      } else if (r.buscandoContactos) void buscarContactos(r)
      if (!r.web && !r.leyendoFicha) {
        setCreado(r) // paso 2: pedir la web
        return
      }
      reiniciar(); onClose(); onCreado(r.leadId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el enlace')
    } finally {
      setCargando(false)
    }
  }

  const guardarWeb = async () => {
    if (!creado || !web.trim() || cargando) return
    const limpia = web.trim().match(/https?:\/\/\S+|[\w.-]+\.[a-z]{2,}\S*/i)?.[0]
    if (!limpia) { setError('Eso no parece una web. Ejemplo: minegocio.com'); return }
    setCargando(true); setError(null)
    try {
      const lead = await leadsService.updateLead(creado.leadId, { web: limpia })
      patchLocal(creado.leadId, { web: lead.web })
      await leadsService.buscarContactosWeb(creado.leadId)
      void buscarContactos(creado)
      const id = creado.leadId
      reiniciar(); onClose(); onCreado(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la web')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title={creado ? `¿${creado.empresa} tiene web?` : 'Añadir desde Google Maps'}
      footer={creado ? (
        <>
          <Button variant="ghost" onClick={cerrar} disabled={cargando}>No tiene / ahora no</Button>
          <Button onClick={guardarWeb} disabled={!web.trim() || cargando}>
            {cargando ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <><Globe className="h-4 w-4" /> Buscar contactos</>}
          </Button>
        </>
      ) : (
        <>
          <Button variant="ghost" onClick={cerrar} disabled={cargando}>Cancelar</Button>
          <Button onClick={importar} disabled={!enlace.trim() || cargando}>
            {cargando ? <><Loader2 className="h-4 w-4 animate-spin" /> Leyendo la ficha…</> : <><MapPin className="h-4 w-4" /> Añadir lead</>}
          </Button>
        </>
      )}
    >
      {creado ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Lead guardado con su dirección y ubicación. Si en la ficha de Maps sale su web, cópiala aquí
            y se buscan sus correos, teléfonos y redes.
          </p>
          <div className="flex gap-2">
            <input
              value={web}
              onChange={(e) => { setWeb(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void guardarWeb() } }}
              placeholder="minegocio.com"
              inputMode="url"
              autoFocus
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-base sm:text-sm"
            />
            <Button variant="outline" onClick={() => pegar(setWeb)} disabled={cargando} className="shrink-0" title="Pegar del portapapeles">
              <ClipboardPaste className="h-4 w-4" /> <span className="hidden sm:inline">Pegar</span>
            </Button>
          </div>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Pega el enlace de la ficha del negocio. Se guardan su nombre, dirección y ubicación y, si
            tiene web, se buscan sus correos, teléfonos y redes.
          </p>
          <div className="flex gap-2">
            <textarea
              value={enlace}
              onChange={(e) => { setEnlace(e.target.value); setError(null) }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void importar() } }}
              placeholder="https://maps.app.goo.gl/…"
              rows={2}
              autoFocus
              className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-surface px-3 py-2 text-base sm:text-sm"
            />
            <Button variant="outline" onClick={() => pegar(setEnlace)} disabled={cargando} className="shrink-0 self-stretch" title="Pegar del portapapeles">
              <ClipboardPaste className="h-4 w-4" /> <span className="hidden sm:inline">Pegar</span>
            </Button>
          </div>
          {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
          <p className="text-xs text-muted">
            En el móvil: abre el negocio en la app de Maps → Compartir → Copiar, y pulsa «Pegar».
          </p>
        </div>
      )}
    </Modal>
  )
}
