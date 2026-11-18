import { useState } from 'react'
import toast from 'react-hot-toast'
import { useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, Loader2, MapPin } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui'
import { leadsService } from '@/services/leadsService'
import { esperarContactos } from '@/lib/contactosWeb'

/**
 * «Añadir desde Google Maps»: pegas el enlace de una ficha y el lead se crea
 * con nombre, teléfono, web, dirección, valoración, horario y coordenadas.
 * Si tiene web, el robot de contactos busca después correos, más teléfonos,
 * WhatsApp y redes, y la ficha se completa sola en unos segundos.
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
  const [enlace, setEnlace] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cerrar = () => {
    if (cargando) return
    setEnlace(''); setError(null); onClose()
  }

  const pegar = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (t) { setEnlace(t.trim()); setError(null) }
    } catch {
      toast('Mantén pulsado el campo y elige «Pegar»')
    }
  }

  const importar = async () => {
    if (!enlace.trim() || cargando) return
    setCargando(true); setError(null)
    try {
      const r = await leadsService.importarDesdeMaps(enlace.trim())
      await qc.refetchQueries({ queryKey: ['leads'] })
      toast.success(r.nuevo ? `${r.empresa} añadido` : `${r.empresa} ya estaba: se completaron los datos que faltaban`)
      if (r.cerrado) toast(`Ojo: Google lo marca cerrado ${r.cerrado}`, { icon: '⚠️' })
      if (r.buscandoContactos) {
        toast('Buscando correos y redes en su web…', { icon: '🔎' })
        void esperarContactos(r.leadId, r.empresa, await leadsService.getLead(r.leadId).catch(() => null))
      }
      setEnlace('')
      onClose()
      onCreado(r.leadId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el enlace')
    } finally {
      setCargando(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      title="Añadir desde Google Maps"
      footer={
        <>
          <Button variant="ghost" onClick={cerrar} disabled={cargando}>Cancelar</Button>
          <Button onClick={importar} disabled={!enlace.trim() || cargando}>
            {cargando ? <><Loader2 className="h-4 w-4 animate-spin" /> Leyendo la ficha…</> : <><MapPin className="h-4 w-4" /> Añadir lead</>}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Pega el enlace de la ficha del negocio. Se traen sus datos de Google y, si tiene web,
          se buscan sus correos, teléfonos y redes.
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
          <Button variant="outline" onClick={pegar} disabled={cargando} className="shrink-0 self-stretch" title="Pegar del portapapeles">
            <ClipboardPaste className="h-4 w-4" /> <span className="hidden sm:inline">Pegar</span>
          </Button>
        </div>
        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">{error}</p>}
        <p className="text-xs text-muted">
          En el móvil: abre el negocio en la app de Maps → Compartir → Copiar, y pulsa «Pegar».
        </p>
      </div>
    </Modal>
  )
}
