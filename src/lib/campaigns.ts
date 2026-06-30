import type { Campaign, CampaignStatus, EmailTemplate, Lead } from '@/types'

export const CAMPAIGN_STATUS_META: Record<CampaignStatus, { label: string; cls: string }> = {
  borrador: { label: 'Borrador', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400' },
  activa: { label: 'Activa', cls: 'bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-400' },
  pausada: { label: 'Pausada', cls: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  completada: { label: 'Completada', cls: 'bg-primary-50 text-primary-600 dark:bg-primary-400/15 dark:text-primary-300' },
}

/** Reemplaza variables {{var}} de un template con los datos del lead. */
export function applyTemplate(text: string, lead: Partial<Lead>, problema = 'tiempos de carga lentos en móvil'): string {
  return text
    .replace(/\{\{empresa\}\}/g, lead.empresa || '{{empresa}}')
    .replace(/\{\{nombre\}\}/g, lead.empresa || '{{nombre}}')
    .replace(/\{\{web\}\}/g, lead.web || '{{web}}')
    .replace(/\{\{ciudad\}\}/g, lead.ciudad || '{{ciudad}}')
    .replace(/\{\{score\}\}/g, lead.score != null ? String(lead.score) : '{{score}}')
    .replace(/\{\{problema_detectado\}\}/g, lead.diagnosticoIA || problema)
}

const NICHE_HOOKS: Record<string, string> = {
  'real-estate': 'pierde compradores potenciales porque su web tarda en cargar en móvil',
  restaurantes: 'no tiene un sistema claro de reservas online y eso le cuesta clientes',
  clinicas: 'no transmite confianza a primera vista por un diseño desactualizado',
  abogados: 'no posiciona bien en Google frente a despachos de la zona',
  fitness: 'no convierte visitas en miembros porque falta un CTA claro',
  otros: 'tiene oportunidades claras de mejora en su presencia digital',
}

/**
 * Genera un template de outreach a partir de nicho/ciudad/idioma.
 * Placeholder local (sin llamada a red) — en producción esto se conecta a
 * un workflow n8n que invoca la API de Claude con el mismo contrato de variables.
 */
export function generateTemplate(opts: { nicho: string; ciudad: string; idioma: 'es' | 'en' }): { asunto: string; cuerpo: string } {
  const hook = NICHE_HOOKS[opts.nicho] || NICHE_HOOKS.otros

  if (opts.idioma === 'en') {
    return {
      asunto: `{{empresa}} is losing customers in {{ciudad}} — quick fix`,
      cuerpo:
        `Hi {{nombre}},\n\nI checked {{web}} and noticed it ${hook.replace('su web', 'the site')}. ` +
        `At JDDeveloper we help businesses in {{ciudad}} fix exactly this and turn more visits into clients.\n\n` +
        `Worth a quick 15-min call this week?\n\n— JDDeveloper`,
    }
  }

  return {
    asunto: `{{empresa}}: detecté algo que le está costando clientes en {{ciudad}}`,
    cuerpo:
      `Hola {{nombre}},\n\nRevisé {{web}} y noté que ${hook}. ` +
      `En JDDeveloper ayudamos a negocios de {{ciudad}} a resolver justo esto y convertir más visitas en clientes reales.\n\n` +
      `¿Tienes 15 min esta semana para mostrarte cómo?\n\n— JDDeveloper`,
  }
}

/** Métricas agregadas de una campaña para la tarjeta del grid. */
export function campaignRate(c: Campaign) {
  const conv = c.enviados ? Math.round((c.respondieron / c.enviados) * 1000) / 10 : 0
  return { ...c, conversion: conv }
}

export const DEFAULT_TEMPLATE: EmailTemplate = {
  id: '',
  nombre: '',
  nicho: '',
  asunto: '',
  cuerpo: '',
}
