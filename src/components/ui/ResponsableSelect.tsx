import { useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, Select } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { useAgregarResponsable, useResponsables } from '@/hooks/useData'
import { RESPONSABLE_POR_DEFECTO } from '@/lib/equipo'

/**
 * Selector de responsable, pensado para el CRM multiusuario que viene.
 *
 * Sustituye a los `<Input>` de texto libre repartidos por los formularios: con
 * texto libre, "JD", "Juan" y "Juan Duvergé" acababan siendo tres personas
 * distintas a ojos de cualquier filtro o métrica.
 *
 * La opción "Añadir responsable…" está dentro del propio desplegable a
 * propósito: si estuviera en Configuración, nadie la encontraría en el momento
 * en que la necesita, que es justo mientras rellena el formulario.
 */
export function ResponsableSelect({
  value, onChange, id, className,
}: {
  value: string
  onChange: (v: string) => void
  id?: string
  className?: string
}) {
  // `value` entra en la lista aunque no esté dado de alta: así un registro
  // antiguo con un responsable desconocido no se borra solo al guardar.
  const responsables = useResponsables(value)
  const agregar = useAgregarResponsable()
  const [abierto, setAbierto] = useState(false)
  const [nombre, setNombre] = useState('')

  const guardar = async () => {
    try {
      const creado = await agregar.mutateAsync(nombre)
      onChange(creado)
      setAbierto(false)
      setNombre('')
      toast.success(`Responsable "${creado}" disponible`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo añadir el responsable')
    }
  }

  return (
    <>
      <Select
        id={id}
        className={className}
        value={value || RESPONSABLE_POR_DEFECTO}
        onChange={(e) => {
          if (e.target.value === '__nuevo') setAbierto(true)
          else onChange(e.target.value)
        }}
      >
        {responsables.map((r) => <option key={r} value={r}>{r}</option>)}
        <option value="__nuevo">＋ Añadir responsable…</option>
      </Select>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Añadir responsable"
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={!nombre.trim() || agregar.isPending}>
              {agregar.isPending ? 'Guardando…' : 'Añadir'}
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Nombre completo</span>
          <Input
            autoFocus
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && nombre.trim()) guardar() }}
            placeholder="Ej. María Pérez"
          />
        </label>
        <p className="mt-2 text-xs text-muted">
          Queda guardado y disponible en todo el CRM. Si ya existe, no se duplica.
        </p>
      </Modal>
    </>
  )
}

export default ResponsableSelect
