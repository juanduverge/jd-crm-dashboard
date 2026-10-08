/**
 * Empresas recién registradas, leídas de los registros mercantiles oficiales
 * de EE. UU. (portales de datos abiertos, tecnología Socrata).
 *
 * Son datos públicos, gratuitos y sin llave, y los tres portales responden con
 * CORS abierto, así que el navegador los consulta directo: no hay servidor ni
 * coste por búsqueda.
 *
 * Qué NO traen: teléfono, web ni redes. Solo Connecticut publica el correo.
 * Para el resto hay que enriquecer después (ver docs/PROYECTO_CAPTACION_PROPIA).
 *
 * Florida, Nueva York y Texas publican en otro formato (archivos o portales
 * distintos) y quedan para una segunda pasada.
 */

import { format, subDays } from 'date-fns'
import { supabase } from '@/lib/supabaseClient'
import { clasificarActividad, type Actividad } from '@/lib/actividadEmpresa'

export type EstadoRegistro = 'CO' | 'CT' | 'OR'

export const ESTADOS_REGISTRO: { id: EstadoRegistro; nombre: string }[] = [
  { id: 'CO', nombre: 'Colorado' },
  { id: 'CT', nombre: 'Connecticut' },
  { id: 'OR', nombre: 'Oregón' },
]

export interface EmpresaNueva {
  /** Clave única entre estados: "CO:20268245927". */
  id: string
  estado: EstadoRegistro
  nombre: string
  tipo: string
  /** yyyy-MM-dd */
  fecha: string
  direccion: string
  ciudad: string
  correo?: string
  categoria?: string
  /** A qué se dedica, deducido del nombre. null si no se pudo saber. */
  actividad?: Actividad | null
  /** Enlace estable al registro oficial; es la clave de deduplicación en el CRM. */
  urlRegistro: string
}

export interface ResultadoBusqueda {
  empresas: EmpresaNueva[]
  /** Estados que no respondieron, para avisar sin tumbar los demás. */
  fallidos: EstadoRegistro[]
}

const LIMITE = 2000

type Fila = Record<string, string | undefined>

async function socrata(dominio: string, dataset: string, params: Record<string, string>): Promise<Fila[]> {
  const q = new URLSearchParams(params)
  const res = await fetch(`https://${dominio}/resource/${dataset}.json?${q}`)
  if (!res.ok) throw new Error(`${dominio} respondió ${res.status}`)
  return res.json()
}

const unir = (...partes: (string | undefined)[]) =>
  partes.map((p) => p?.trim()).filter(Boolean).join(', ')

const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(-])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())

async function colorado(desde: string): Promise<EmpresaNueva[]> {
  const filas = await socrata('data.colorado.gov', '4ykn-tg5h', {
    $where: `entityformdate >= '${desde}T00:00:00'`,
    $order: 'entityformdate DESC',
    $limit: String(LIMITE),
  })
  return filas.flatMap((f) => {
    if (!f.entityname || !f.entityid) return []
    return [{
      id: `CO:${f.entityid}`,
      estado: 'CO' as const,
      nombre: f.entityname,
      tipo: f.entitytype ?? '',
      fecha: (f.entityformdate ?? '').slice(0, 10),
      direccion: unir(f.principaladdress1, f.principaladdress2, f.principalcity, f.principalstate, f.principalzipcode),
      ciudad: f.principalcity ?? '',
      urlRegistro: `https://data.colorado.gov/resource/4ykn-tg5h.json?entityid=${f.entityid}`,
    }]
  })
}

async function connecticut(desde: string): Promise<EmpresaNueva[]> {
  const filas = await socrata('data.ct.gov', 'n7gp-d28j', {
    $where: `date_registration >= '${desde}T00:00:00'`,
    $order: 'date_registration DESC',
    $limit: String(LIMITE),
  })
  return filas.flatMap((f) => {
    if (!f.name || !f.accountnumber) return []
    return [{
      id: `CT:${f.accountnumber}`,
      estado: 'CT' as const,
      nombre: f.name,
      tipo: f.business_type ?? '',
      fecha: (f.date_registration ?? '').slice(0, 10),
      direccion: unir(f.billingstreet, f.billingcity, f.billingstate, f.billingpostalcode),
      ciudad: f.billingcity ?? '',
      correo: f.business_email_address?.trim().toLowerCase() || undefined,
      // «Lessors of Residential Buildings and Dwellings (531110)» → sin el código.
      categoria: f.naics_code?.replace(/\s*\(\d+\)\s*$/, '') || undefined,
      urlRegistro: `https://data.ct.gov/resource/n7gp-d28j.json?accountnumber=${f.accountnumber}`,
    }]
  })
}

async function oregon(desde: string): Promise<EmpresaNueva[]> {
  const filas = await socrata('data.oregon.gov', 'tckn-sxa6', {
    $where: `registry_date >= '${desde}T00:00:00'`,
    $order: 'registry_date DESC',
    $limit: String(LIMITE * 3),
  })
  // El dataset trae una fila por dirección asociada (postal, agente, etc.).
  // Una sola por empresa, prefiriendo la postal.
  const porEmpresa = new Map<string, Fila>()
  for (const f of filas) {
    if (!f.registry_number || !f.business_name) continue
    const previa = porEmpresa.get(f.registry_number)
    if (!previa || (f.associated_name_type === 'MAILING ADDRESS' && previa.associated_name_type !== 'MAILING ADDRESS')) {
      porEmpresa.set(f.registry_number, f)
    }
  }
  return [...porEmpresa.values()].map((f) => ({
    id: `OR:${f.registry_number}`,
    estado: 'OR' as const,
    nombre: f.business_name!,
    tipo: titulo(f.entity_type ?? ''),
    fecha: (f.registry_date ?? '').slice(0, 10),
    direccion: unir(f.address, f.city, f.state, f.zip),
    ciudad: titulo(f.city ?? ''),
    urlRegistro: `https://data.oregon.gov/resource/tckn-sxa6.json?registry_number=${f.registry_number}`,
  }))
}

const FUENTES: Record<EstadoRegistro, (desde: string) => Promise<EmpresaNueva[]>> = {
  CO: colorado,
  CT: connecticut,
  OR: oregon,
}

/** Trae las empresas registradas en los últimos `dias` días en todos los estados. */
export async function buscarEmpresasNuevas(dias: number): Promise<ResultadoBusqueda> {
  const desde = format(subDays(new Date(), dias), 'yyyy-MM-dd')
  const ids = Object.keys(FUENTES) as EstadoRegistro[]
  const respuestas = await Promise.allSettled(ids.map((id) => FUENTES[id](desde)))

  const empresas: EmpresaNueva[] = []
  const fallidos: EstadoRegistro[] = []
  respuestas.forEach((r, i) => {
    if (r.status === 'fulfilled') empresas.push(...r.value)
    else fallidos.push(ids[i])
  })
  for (const e of empresas) e.actividad = clasificarActividad(e.nombre, e.categoria)
  empresas.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return { empresas, fallidos }
}

/**
 * Sociedades que casi siempre son vehículos de inversión o de patrimonio, no
 * negocios que necesiten web. No es un filtro perfecto: es una criba barata.
 */
const NOMBRE_DE_VEHICULO = /\b(holdings?|invest\w*|capital|propert\w*|realty|real estate|trust|funds?|assets?|equity|acquisitions?|ventures?|partners|family|estates?|lending|mortgage)\b/i

/** «320 North Ave LLC»: una sociedad con nombre de dirección suele existir solo para tener ese inmueble. */
const NOMBRE_DE_DIRECCION = /^\d+\s.*\b(ave(nue)?|st(reet)?|r(oa)?d|blvd|boulevard|l(a)?ne?|dr(ive)?|way|c(our)?t|pl(ace)?|h(igh)?wy|terrace|circle)\b/i

export const pareceVehiculo = (e: EmpresaNueva) => NOMBRE_DE_VEHICULO.test(e.nombre) || NOMBRE_DE_DIRECCION.test(e.nombre)

export interface ResumenImportacion {
  recibidos: number
  insertados: number
  actualizados: number
  descartados: number
}

/**
 * Manda las empresas elegidas al CRM con `importar_leads`, la misma función que
 * usa la búsqueda de Apify: no duplica, solo rellena huecos y respeta los
 * leads que ya se borraron a propósito.
 */
export async function importarEmpresasNuevas(
  empresas: EmpresaNueva[],
  /** Texto que se añade a la descripción del lead: la nota y lo que se vio de sus dominios. */
  notaExtra?: (e: EmpresaNueva) => string,
): Promise<ResumenImportacion> {
  const lote = empresas.map((e) => {
    const extra = notaExtra?.(e)
    return {
      name: e.nombre,
      // Clave de deduplicación para fuentes que no son Google Maps.
      profileUrl: e.urlRegistro,
      city: e.ciudad || undefined,
      address: e.direccion || undefined,
      country: 'US',
      countryCode: 'US',
      email: e.correo,
      // El término del catálogo va primero: es el que `nicho_alias` sabe normalizar.
      category: e.actividad?.termino ?? e.categoria ?? (e.tipo ? `Empresa nueva (${e.tipo})` : 'Empresa nueva'),
      bio: `Registrada el ${e.fecha} en ${e.estado}${e.tipo ? ` como ${e.tipo}` : ''}. Fuente: registro mercantil oficial.${extra ? ` ${extra}` : ''}`,
    }
  })

  const total: ResumenImportacion = { recibidos: 0, insertados: 0, actualizados: 0, descartados: 0 }
  // Por tandas: una sola llamada con cientos de filas alarga la transacción.
  for (let i = 0; i < lote.length; i += 100) {
    const { data, error } = await supabase.rpc('importar_leads', {
      p_lote: lote.slice(i, i + 100),
      p_fuente: 'registro_estatal',
      p_consulta: `Empresas nuevas (${[...new Set(empresas.map((e) => e.estado))].join(', ')})`,
    })
    if (error) throw new Error(error.message)
    const r = data as ResumenImportacion
    total.recibidos += r.recibidos
    total.insertados += r.insertados
    total.actualizados += r.actualizados
    total.descartados += r.descartados
  }
  return total
}
