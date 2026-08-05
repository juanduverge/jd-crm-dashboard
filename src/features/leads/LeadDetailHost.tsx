import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { LeadDrawer } from './LeadDrawer'
import { LeadForm } from './LeadForm'
import { useLeads } from '@/hooks/useData'
import { useLeadsStore } from '@/store/leadsStore'
import { formToLeadPatch, type LeadFormValues } from './leadSchema'

/**
 * Anfitrión de la ficha completa de un lead.
 *
 * Existe para que cualquier módulo (Seguimientos, Calendario, Mensajes…) pueda
 * abrir EXACTAMENTE la misma ficha que el módulo de Leads sin duplicar el
 * cableado: el drawer, el formulario de edición, el guardado y el cambio de
 * etapa viajan juntos porque el drawer por sí solo no sabe editar ni mover.
 *
 * Sólo necesita el id, no el objeto `Lead`: el lead se resuelve del store, así
 * la ficha refleja los cambios optimistas al instante y quien la abre no tiene
 * que cargar la lista de leads por su cuenta.
 *
 * `useLeads()` se llama aquí a propósito: garantiza que el store esté hidratado
 * aunque la pantalla anfitriona no consuma leads (el caso de Seguimientos, que
 * se alimenta de la vista `follow_ups_agenda`). React Query comparte la caché
 * de la clave ['leads'], así que no provoca una petición extra.
 */
export function LeadDetailHost({
  leadId,
  onClose,
}: {
  leadId: string | null
  onClose: () => void
}) {
  const { isLoading } = useLeads()
  const leads = useLeadsStore((s) => s.leads)
  const updateLead = useLeadsStore((s) => s.updateLead)
  const moveStage = useLeadsStore((s) => s.moveStage)

  const [editing, setEditing] = useState<string | null>(null)

  const lead = leadId ? (leads.find((l) => l.id === leadId) ?? null) : null
  const editingLead = editing ? (leads.find((l) => l.id === editing) ?? null) : null

  // Se pidió una ficha, la lista ya cargó y el lead no está: o se borró o el
  // seguimiento apunta a un lead fuera de alcance. Avisar y cerrar es mejor que
  // dejar un panel en blanco. En efecto, no en render: cerrar es un side effect.
  const falta = !!leadId && !lead && !isLoading
  useEffect(() => {
    if (!falta) return
    toast.error('No se encontró el lead (puede haber sido eliminado)')
    onClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falta])

  const guardar = (values: LeadFormValues) => {
    if (!editingLead) return
    try {
      updateLead(editingLead.id, formToLeadPatch(values))
      toast.success('Lead actualizado')
      setEditing(null)
    } catch {
      toast.error('No se pudo guardar el lead')
    }
  }

  return (
    <>
      <LeadDrawer
        lead={lead}
        onClose={onClose}
        // Al editar se cierra la ficha para no apilar dos capas; al guardar o
        // cancelar se vuelve a ella, que es de donde venía el usuario.
        onEdit={(l) => setEditing(l.id)}
        onMoveStage={(id, estado) => {
          moveStage(id, estado)
          toast.success('Etapa actualizada')
        }}
      />
      <LeadForm
        open={!!editingLead}
        onClose={() => setEditing(null)}
        onSubmit={guardar}
        initial={editingLead}
      />
    </>
  )
}

export default LeadDetailHost
