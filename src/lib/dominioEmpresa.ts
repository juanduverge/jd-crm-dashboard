/**
 * ¿Está cogido el .com que le tocaría a esta empresa?
 *
 * Se pregunta al DNS público de Google (dns.google), que responde JSON con
 * CORS abierto: no hay servidor por medio ni coste. Solo se mira si el nombre
 * resuelve; no se visita ninguna página.
 *
 * Qué significa cada respuesta, y qué NO:
 *  - `libre`      el dominio no existe. Señal fuerte de que no tienen web.
 *  - `sin_pagina` existe pero no apunta a ningún servidor: alguien lo compró y
 *                 aún no montó nada.
 *  - `ocupado`    apunta a un servidor. OJO: puede ser de otra empresa con el
 *                 mismo nombre en otro estado, o un dominio aparcado en venta.
 *                 Hay que abrirlo para saberlo; por eso se da el enlace.
 */

export type EstadoDominio = 'libre' | 'sin_pagina' | 'ocupado'

export interface ResultadoDominio {
  dominio: string
  estado: EstadoDominio
}

const FORMAS_SOCIETARIAS = /\b(l\.?l\.?c\.?|p\.?l\.?l\.?c\.?|l\.?l\.?p\.?|l\.?p\.?|inc(orporated)?\.?|corp(oration)?\.?|co\.?|company|ltd\.?|limited|p\.?c\.?|p\.?a\.?|dba)\s*$/i

/**
 * «Robby's Classic Hair Shop LLC» → `robbysclassichairshop.com`.
 * Devuelve null si el nombre no da para un dominio creíble.
 */
export function dominioCandidato(nombre: string): string | null {
  let n = nombre.trim().replace(/[,.\s]+$/, '')
  // Puede haber dos seguidas: «Acme Co., LLC».
  for (let i = 0; i < 2; i++) n = n.replace(FORMAS_SOCIETARIAS, '').replace(/[,.\s]+$/, '')
  const base = n
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
  if (base.length < 4 || base.length > 40) return null
  return `${base}.com`
}

export async function comprobarDominio(dominio: string, signal?: AbortSignal): Promise<ResultadoDominio> {
  const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=A`, { signal })
  if (!res.ok) throw new Error(`dns.google respondió ${res.status}`)
  const r = (await res.json()) as { Status: number; Answer?: { type: number }[] }
  // 3 = NXDOMAIN: el nombre no existe.
  if (r.Status === 3) return { dominio, estado: 'libre' }
  if (r.Status !== 0) throw new Error(`respuesta DNS inesperada (${r.Status})`)
  const apunta = (r.Answer ?? []).some((a) => a.type === 1)
  return { dominio, estado: apunta ? 'ocupado' : 'sin_pagina' }
}

/**
 * Comprueba varios dominios con pocas peticiones a la vez, avisando de cada
 * resultado según llega para que la lista se vaya rellenando.
 */
export async function comprobarDominios(
  dominios: string[],
  alResolver: (r: ResultadoDominio) => void,
  signal?: AbortSignal,
): Promise<{ fallidos: number }> {
  const cola = [...new Set(dominios)]
  let fallidos = 0
  const trabajador = async () => {
    for (let d = cola.shift(); d; d = cola.shift()) {
      if (signal?.aborted) return
      try { alResolver(await comprobarDominio(d, signal)) } catch { fallidos++ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, trabajador))
  return { fallidos }
}
