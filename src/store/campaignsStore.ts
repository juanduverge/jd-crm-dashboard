import { create } from 'zustand'
import type { Campaign, EmailTemplate } from '@/types'

/** Store local de campañas y templates (feature sin hoja de Sheets propia). */
interface CampaignsState {
  campaigns: Campaign[]
  templates: EmailTemplate[]
  hydrated: boolean
  setCampaigns: (c: Campaign[]) => void
  setTemplates: (t: EmailTemplate[]) => void
  addCampaign: (c: Campaign) => void
  updateCampaign: (id: string, patch: Partial<Campaign>) => void
  addEvent: (id: string, label: string) => void
  duplicateCampaign: (id: string) => void
  addTemplate: (t: EmailTemplate) => void
}

export const useCampaignsStore = create<CampaignsState>((set, get) => ({
  campaigns: [],
  templates: [],
  hydrated: false,
  setCampaigns: (campaigns) => {
    if (!get().hydrated) set({ campaigns, hydrated: true })
  },
  setTemplates: (templates) => set({ templates }),
  addCampaign: (c) => set({ campaigns: [c, ...get().campaigns] }),
  updateCampaign: (id, patch) =>
    set({ campaigns: get().campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
  addEvent: (id, label) =>
    set({
      campaigns: get().campaigns.map((c) =>
        c.id === id
          ? { ...c, events: [...(c.events ?? []), { label, timestamp: new Date().toISOString() }] }
          : c,
      ),
    }),
  duplicateCampaign: (id) => {
    const orig = get().campaigns.find((c) => c.id === id)
    if (!orig) return
    const copy: Campaign = {
      ...orig,
      id: `C-${Date.now()}`,
      nombre: `${orig.nombre} (copia)`,
      estado: 'borrador',
      enviados: 0,
      respondieron: 0,
      conversion: 0,
      valorGenerado: 0,
      createdAt: new Date().toISOString(),
      events: [{ label: 'Campaña duplicada', timestamp: new Date().toISOString() }],
    }
    set({ campaigns: [copy, ...get().campaigns] })
  },
  addTemplate: (t) => set({ templates: [t, ...get().templates] }),
}))
