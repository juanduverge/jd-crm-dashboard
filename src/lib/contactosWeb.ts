import toast from 'react-hot-toast'
import { leadsService } from '@/services/leadsService'
import { useLeadsStore } from '@/store/leadsStore'
import type { Lead } from '@/types'

/**
 * Espera a que el robot de contactos (servidor de casa, cola 0070) termine
 * con un lead y mete el resultado en la ficha sin recargar toda la lista.
 *
 * El robot tarda unos segundos por web, más si está con otros en cola. Si no
 * termina en ~2 min no pasa nada: la lista se refresca sola cada 30 s y el
 * dato aparecerá igual. Esto solo es para verlo al momento.
 */
const esperando = new Set<string>()

function ponerEnLista(lead: Lead) {
  const { leads, setLeads } = useLeadsStore.getState()
  setLeads(leads.some((l) => l.id === lead.id)
    ? leads.map((l) => (l.id === lead.id ? lead : l))
    : [lead, ...leads])
}

function resumen(antes: Lead | null, despues: Lead): string {
  const nuevos = (a?: string[], b?: string[]) => (b ?? []).filter((x) => !(a ?? []).includes(x)).length
  const partes: string[] = []
  const e = nuevos(antes?.emails, despues.emails)
  const t = nuevos(antes?.telefonos, despues.telefonos)
  if (e) partes.push(`${e} correo${e > 1 ? 's' : ''}`)
  if (t) partes.push(`${t} teléfono${t > 1 ? 's' : ''}`)
  if (!antes?.whatsapp && despues.whatsapp) partes.push('WhatsApp')
  const redes = (['instagram', 'facebook', 'linkedin', 'youtube', 'tiktok', 'twitter', 'pinterest'] as const)
    .filter((k) => !antes?.[k] && despues[k]).length
  if (redes) partes.push(`${redes} red${redes > 1 ? 'es' : ''}`)
  if (!antes?.web && despues.web) partes.unshift('web')
  if (!antes?.ratingGoogle && despues.ratingGoogle) partes.push(`${despues.ratingGoogle}★`)
  return partes.join(', ')
}

const MOTIVOS: Record<string, string> = {
  sin_datos: 'su web no publica contactos',
  web_caida: 'su web no carga',
  dominio_aparcado: 'su dominio no tiene web (página del hosting)',
  robots_prohibe: 'su web no permite que se lea',
  solo_redes: 'su «web» es una red social',
  sin_web: 'no tiene web en Google',
  error: 'no se pudo leer su web',
}

export async function esperarContactos(leadId: string, empresa: string, antes: Lead | null) {
  if (esperando.has(leadId)) return
  esperando.add(leadId)
  const marca = antes?.lastEnrichedAt
  try {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 4000))
      const lead = await leadsService.getLead(leadId).catch(() => null)
      if (!lead) return
      if (lead.lastEnrichedAt && lead.lastEnrichedAt !== marca) {
        ponerEnLista(lead)
        const r = resumen(antes, lead)
        if (r) toast.success(`${empresa}: ${r}`)
        else toast(`${empresa}: nada nuevo — ${MOTIVOS[lead.enrichmentStatus ?? ''] ?? 'ya tenía esos datos'}`)
        return
      }
    }
  } finally {
    esperando.delete(leadId)
  }
}

export function motivoEnriquecimiento(estado?: string): string | undefined {
  return estado && estado !== 'ok' ? MOTIVOS[estado] : undefined
}
