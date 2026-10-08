/**
 * ¿Están cogidos los dominios que le tocarían a esta empresa?
 *
 * Se pregunta al DNS público de Google (dns.google), que responde JSON con
 * CORS abierto: no hay servidor por medio ni coste. Solo se mira si el nombre
 * resuelve; no se visita ninguna página.
 *
 * Se prueban varias terminaciones porque un negocio nuevo no siempre coge el
 * .com: muchos acaban en .co, .net o .io cuando el .com ya está vendido.
 *
 * Qué significa cada respuesta, y qué NO:
 *  - `libre`      el dominio no existe.
 *  - `sin_pagina` existe pero no apunta a ningún servidor: alguien lo compró y
 *                 aún no montó nada.
 *  - `ocupado`    apunta a un servidor. OJO: puede ser de otra empresa con el
 *                 mismo nombre en otro estado, o un dominio aparcado en venta.
 *                 Hay que abrirlo para saberlo; por eso se da el enlace.
 */

export type EstadoDominio = 'libre' | 'sin_pagina' | 'ocupado'

/** De la más probable a la menos para un negocio local de EE. UU. */
export const TERMINACIONES = ['com', 'net', 'co', 'io', 'us'] as const

export interface DominioComprobado {
  dominio: string
  estado: EstadoDominio
}

export interface DominiosEmpresa {
  /** Uno por terminación que respondió, en el orden de `TERMINACIONES`. */
  dominios: DominioComprobado[]
  /**
   * Resumen para ordenar y filtrar: `ocupado` si alguna terminación tiene
   * servidor, `sin_pagina` si alguna está comprada sin montar, `libre` si no
   * existe ninguna.
   */
  resumen: EstadoDominio
}

const FORMAS_SOCIETARIAS = /\b(l\.?l\.?c\.?|p\.?l\.?l\.?c\.?|l\.?l\.?p\.?|l\.?p\.?|inc(orporated)?\.?|corp(oration)?\.?|co\.?|company|ltd\.?|limited|p\.?c\.?|p\.?a\.?|dba)\s*$/i

/**
 * «Robby's Classic Hair Shop LLC» → `robbysclassichairshop`.
 * Devuelve null si el nombre no da para un dominio creíble.
 */
export function baseDominio(nombre: string): string | null {
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
  return base
}

async function comprobarDominio(dominio: string, signal?: AbortSignal): Promise<DominioComprobado> {
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
 * Comprueba todas las terminaciones de una empresa. Devuelve null si el nombre
 * no da para un dominio o si no respondió ninguna consulta.
 */
export async function comprobarDominiosEmpresa(nombre: string, signal?: AbortSignal): Promise<DominiosEmpresa | null> {
  const base = baseDominio(nombre)
  if (!base) return null
  const respuestas = await Promise.allSettled(TERMINACIONES.map((t) => comprobarDominio(`${base}.${t}`, signal)))
  const dominios = respuestas.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
  if (dominios.length === 0) return null
  const resumen: EstadoDominio = dominios.some((d) => d.estado === 'ocupado') ? 'ocupado'
    : dominios.some((d) => d.estado === 'sin_pagina') ? 'sin_pagina'
    : 'libre'
  return { dominios, resumen }
}

/**
 * Comprueba varias empresas con pocas a la vez, avisando de cada resultado
 * según llega para que la lista se vaya rellenando.
 */
export async function comprobarVariasEmpresas(
  empresas: { id: string; nombre: string }[],
  alResolver: (id: string, r: DominiosEmpresa | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  const cola = [...empresas]
  const trabajador = async () => {
    for (let e = cola.shift(); e; e = cola.shift()) {
      if (signal?.aborted) return
      try { alResolver(e.id, await comprobarDominiosEmpresa(e.nombre, signal)) } catch { alResolver(e.id, null) }
    }
  }
  // Cada empresa son cinco consultas: tres a la vez mantiene ~15 en vuelo.
  await Promise.all(Array.from({ length: 3 }, trabajador))
}
