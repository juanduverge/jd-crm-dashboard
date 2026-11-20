import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageCircle, Phone, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import { cn } from '@/lib/utils'
import { HORARIO_POR_DEFECTO, usePerfilTrabajo, type HorarioLaboral, type MiNumero } from '@/lib/perfilTrabajo'

/**
 * «Mi perfil de trabajo»: los números desde los que llamas y tu horario.
 * Los números salen al llamar desde la ficha del lead («¿desde cuál?») y el
 * horario decide qué huecos se ofrecen al agendar una reunión.
 */

const DIAS = [
  { iso: 1, l: 'L' }, { iso: 2, l: 'M' }, { iso: 3, l: 'X' }, { iso: 4, l: 'J' },
  { iso: 5, l: 'V' }, { iso: 6, l: 'S' }, { iso: 7, l: 'D' },
]

export function PerfilTrabajoCard() {
  const perfil = usePerfilTrabajo()
  const [numeros, setNumeros] = useState<MiNumero[]>([])
  const [horario, setHorario] = useState<HorarioLaboral>(HORARIO_POR_DEFECTO)
  const [cargado, setCargado] = useState(false)

  // Se copia una sola vez al cargar: después manda lo que se edita aquí.
  useEffect(() => {
    if (perfil.cargando || cargado) return
    setNumeros(perfil.numeros)
    setHorario(perfil.horario)
    setCargado(true)
  }, [perfil.cargando, perfil.numeros, perfil.horario, cargado])

  const cambiar = (id: string, campo: Partial<MiNumero>) => setNumeros((ns) => ns.map((n) => (n.id === id ? { ...n, ...campo } : n)))
  const anadir = () => setNumeros((ns) => [...ns, { id: crypto.randomUUID(), etiqueta: ns.length ? `Número ${ns.length + 1}` : 'Móvil trabajo', numero: '', whatsapp: true }])

  async function guardar() {
    const limpios = numeros.map((n) => ({ ...n, etiqueta: n.etiqueta.trim(), numero: n.numero.trim() })).filter((n) => n.numero)
    if (limpios.some((n) => !n.etiqueta)) { toast.error('Ponle un nombre a cada número'); return }
    if (horario.desde >= horario.hasta) { toast.error('La hora de fin va antes que la de inicio'); return }
    if (!horario.dias.length) { toast.error('Elige al menos un día de trabajo'); return }
    try {
      await perfil.guardarNumeros(limpios)
      await perfil.guardarHorario(horario)
      setNumeros(limpios)
      toast.success('Perfil guardado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-fg">Mis números</p>
        <p className="mt-0.5 text-xs text-muted">Al llamar a un lead te preguntará desde cuál. Queda apuntado en su historial.</p>
        <div className="mt-3 space-y-2">
          {numeros.map((n) => (
            <div key={n.id} className="grid grid-cols-[1fr_1.2fr_auto_auto] items-center gap-2">
              <Input value={n.etiqueta} onChange={(e) => cambiar(n.id, { etiqueta: e.target.value })} placeholder="Móvil trabajo" aria-label="Nombre del número" />
              <Input value={n.numero} onChange={(e) => cambiar(n.id, { numero: e.target.value })} placeholder="+1 809 000 0000" inputMode="tel" aria-label="Número" />
              <button
                type="button"
                onClick={() => cambiar(n.id, { whatsapp: !n.whatsapp })}
                title={n.whatsapp ? 'Tiene WhatsApp' : 'Sin WhatsApp'}
                className={cn('inline-flex h-9 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium', n.whatsapp ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' : 'border-border text-muted')}
              >
                <MessageCircle className="h-3.5 w-3.5" />WhatsApp
              </button>
              <button type="button" onClick={() => setNumeros((ns) => ns.filter((x) => x.id !== n.id))} className="rounded-md p-2 text-muted hover:text-[rgb(var(--danger))]" aria-label="Quitar número"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {!numeros.length && <p className="flex items-center gap-2 text-xs text-muted"><Phone className="h-3.5 w-3.5" />Aún no has añadido ninguno.</p>}
          <Button variant="outline" size="sm" onClick={anadir}><Plus className="h-4 w-4" />Añadir número</Button>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-fg">Mi horario</p>
        <p className="mt-0.5 text-xs text-muted">Al agendar una reunión solo se ofrecen huecos dentro de este horario y libres en tu calendario.</p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Días</span>
            <div className="flex gap-1">
              {DIAS.map((d) => {
                const on = horario.dias.includes(d.iso)
                return (
                  <button key={d.iso} type="button"
                    onClick={() => setHorario((h) => ({ ...h, dias: on ? h.dias.filter((x) => x !== d.iso) : [...h.dias, d.iso].sort() }))}
                    className={cn('h-9 w-9 rounded-lg border text-xs font-semibold', on ? 'border-primary-400 bg-primary-500 text-white' : 'border-border text-muted')}>
                    {d.l}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Desde</span>
            <Input type="time" value={horario.desde} onChange={(e) => setHorario((h) => ({ ...h, desde: e.target.value }))} className="w-32" />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Hasta</span>
            <Input type="time" value={horario.hasta} onChange={(e) => setHorario((h) => ({ ...h, hasta: e.target.value }))} className="w-32" />
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Una reunión dura</span>
            <Select value={horario.duracionReunion} onChange={(e) => setHorario((h) => ({ ...h, duracionReunion: Number(e.target.value) }))} className="w-32">
              {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} min</option>)}
            </Select>
          </div>
        </div>
      </div>

      <Button onClick={guardar} disabled={perfil.guardando}>{perfil.guardando ? 'Guardando…' : 'Guardar perfil'}</Button>
    </div>
  )
}
