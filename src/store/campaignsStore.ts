import { create } from 'zustand'
import type { EmailTemplate } from '@/types'

/**
 * Store local de templates de email (contenido editable de arranque, no
 * datos de negocio). Las campañas en sí viven en Sheets y se manejan con
 * React Query (ver useCampaigns/useCreateCampaign/... en useData.ts).
 */
interface CampaignsState {
  templates: EmailTemplate[]
  setTemplates: (t: EmailTemplate[]) => void
  addTemplate: (t: EmailTemplate) => void
}

export const useCampaignsStore = create<CampaignsState>((set, get) => ({
  templates: [],
  setTemplates: (templates) => set({ templates }),
  addTemplate: (t) => set({ templates: [t, ...get().templates] }),
}))
