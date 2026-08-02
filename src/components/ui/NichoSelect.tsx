import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Select } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useAgregarNicho, useNichos } from '@/hooks/useData'

/**
 * Selector de nicho (categoría del lead).
 *
 * Con la lista corta de antes casi todo terminaba en "Otros", que es la forma
 * de perder la dimensión más útil para segmentar campañas. Ahora la lista es
 * amplia y va agrupada por sector con `<optgroup>`: un desplegable de 35
 * opciones sin agrupar es peor que uno de 6.
 *
 * "Crear nueva categoría…" vive dentro del propio desplegable, en el momento en
 * que el usuario descubre que la suya falta, y lo que cree queda guardado para
 * siempre (tabla `settings`, clave `nichos_personalizados`).
 */
export function NichoSelect({
  value, onChange, id, className, permitirVacio = true,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  className?: string
  permitirVacio?: boolean
}) {
  const nichos = useNichos()
  const agregar = useAgregarNicho()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')
  const [emoji, setEmoji] = useState('')

  // Se conserva el orden de definición de los grupos en vez de ordenarlos
  // alfabéticamente: están puestos por frecuencia de uso real.
  const grupos = useMemo(() => {
    const m = new Map<string, typeof nichos>()
    for (const n of nichos) {
      const g = m.get(n.grupo) ?? []
      g.push(n)
      m.set(n.grupo, g)
    }
    return [...m.entries()]
  }, [nichos])

  // Un lead antiguo puede llevar un nicho que ya no está en la lista. Se pinta
  // igualmente para que guardar el formulario no lo borre en silencio.
  const huerfano = value && !nichos.some((n) => n.id === value) ? value : null

  const crear = async () => {
    try {
      const id = await agregar.mutateAsync({ nombre, emoji })
      onChange(id)
      setAbierto(false)
      setNombre('')
      setEmoji('')
      toast.success(`Categoría "${nombre.trim()}" creada`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo crear la categoría')
    }
  }

  return (
    <>
      <Select
        id={id}
        className={className}
        value={value}
        onChange={(e) => {
          if (e.target.value === '__nueva') setAbierto(true)
          else onChange(e.target.value)
        }}
      >
        {permitirVacio && <option value="">Sin categoría</option>}
        {huerfano && <option value={huerfano}>{huerfano} (en desuso)</option>}
        {grupos.map(([grupo, items]) => (
          <optgroup key={grupo} label={grupo}>
            {items.map((n) => (
              <option key={n.id} value={n.id}>{n.emoji} {n.nombre}</option>
            ))}
          </optgroup>
        ))}
        <option value="__nueva">＋ Agregar nueva categoría…</option>
      </Select>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Nueva categoría"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={!nombre.trim() || agregar.isPending}>
              {agregar.isPending ? 'Creando…' : 'Crear categoría'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-[4.5rem_1fr] gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Emoji</span>
            <Input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              placeholder="🏷️"
              maxLength={4}
              className="text-center"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-muted">Nombre</span>
            <Input
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) crear() }}
              placeholder="Ej. Estudios de fotografía"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted">
          Se guarda para futuros leads y aparecerá en los filtros y las métricas.
        </p>
      </Modal>
    </>
  )
}

export default NichoSelect
