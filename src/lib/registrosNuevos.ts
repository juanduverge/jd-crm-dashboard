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

/**
 * La persona que el registro asocia a la empresa. El `rol` importa: un «Dueño»
 * lo es; un «Agente registrado» es quien recibe las notificaciones legales, que
 * en un negocio pequeño suele ser el propio dueño pero puede ser su abogado o
 * su contable.
 */
export interface Contacto {
  nombre: string
  rol: 'Dueño' | 'Representante autorizado' | 'Agente registrado'
}

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
  /** Persona que da el registro. En Connecticut llega aparte, con `buscarDuenosCT`. */
  contacto?: Contacto
  /** Id interno del registro de Connecticut: con él se piden los dueños. */
  idInterno?: string
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

const persona = (...partes: (string | undefined)[]) => {
  const n = partes.map((x) => x?.trim()).filter(Boolean).join(' ')
  return n ? titulo(n) : undefined
}

const titulo = (s: string) =>
  s.toLowerCase().replace(/(^|[\s(-])([a-záéíóúñ])/g, (_, a, b) => a + b.toUpperCase())

function agenteCO(f: Fila): Contacto | undefined {
  // Si el agente es una empresa de agentes («United States Corporation
  // Agents»), no hay persona que valga.
  const nombre = f.agentorganizationname ? undefined : persona(f.agentfirstname, f.agentlastname)
  return nombre ? { nombre, rol: 'Agente registrado' } : undefined
}

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
      contacto: agenteCO(f),
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
      idInterno: f.id,
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
  // El dataset trae una fila por cada cosa asociada a la empresa: dirección
  // postal, sede, agente registrado, representante. Se queda una dirección por
  // empresa (prefiriendo la postal) y, aparte, la mejor persona que haya.
  const porEmpresa = new Map<string, Fila>()
  const personas = new Map<string, Contacto>()
  for (const f of filas) {
    if (!f.registry_number || !f.business_name) continue
    const previa = porEmpresa.get(f.registry_number)
    if (!previa || (f.associated_name_type === 'MAILING ADDRESS' && previa.associated_name_type !== 'MAILING ADDRESS')) {
      porEmpresa.set(f.registry_number, f)
    }
    const nombre = persona(f.first_name, f.last_name)
    if (!nombre) continue
    if (f.associated_name_type === 'AUTHORIZED REPRESENTATIVE') {
      personas.set(f.registry_number, { nombre, rol: 'Representante autorizado' })
    } else if (f.associated_name_type === 'REGISTERED AGENT' && !personas.has(f.registry_number)) {
      personas.set(f.registry_number, { nombre, rol: 'Agente registrado' })
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
    contacto: personas.get(f.registry_number!),
    urlRegistro: `https://data.oregon.gov/resource/tckn-sxa6.json?registry_number=${f.registry_number}`,
  }))
}

/**
 * Dueños de empresas de Connecticut. Vienen en un dataset aparte («Principals»)
 * enlazado por el id interno, así que se piden solo para las que hagan falta y
 * por tandas, no para las miles de la lista.
 */
export async function buscarDuenosCT(empresas: EmpresaNueva[]): Promise<Map<string, Contacto>> {
  const conId = empresas.filter((e) => e.estado === 'CT' && e.idInterno)
  const duenos = new Map<string, Contacto>()
  for (let i = 0; i < conId.length; i += 40) {
    const tanda = conId.slice(i, i + 40)
    const filas = await socrata('data.ct.gov', 'ka36-64k6', {
      $where: `business_id in (${tanda.map((e) => `'${e.idInterno!.replace(/'/g, '')}'`).join(',')})`,
      $limit: '500',
    })
    for (const f of filas) {
      const e = tanda.find((x) => x.idInterno === f.business_id)
      const nombre = persona(f.firstname, f.lastname) ?? (f.name__c ? titulo(f.name__c) : undefined)
      // Si hay varios socios se queda el primero; el resto está en el registro.
      if (e && nombre && !duenos.has(e.id)) duenos.set(e.id, { nombre, rol: 'Dueño' })
    }
  }
  return duenos
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
  /** Personas que se añadieron como contacto del lead. */
  contactos: number
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
      // «Shelton, CT»: sin el estado, la ciudad sola no dice dónde está.
      city: [e.ciudad, e.estado].filter(Boolean).join(', '),
      address: e.direccion || undefined,
      country: 'US',
      countryCode: 'US',
      email: e.correo,
      // El término del catálogo va primero: es el que `nicho_alias` sabe normalizar.
      category: e.actividad?.termino ?? e.categoria ?? (e.tipo ? `Empresa nueva (${e.tipo})` : 'Empresa nueva'),
      bio: `Registrada el ${e.fecha} en ${nombreEstado(e.estado)} (${e.estado})${e.tipo ? ` como ${e.tipo}` : ''}.${e.contacto ? ` ${e.contacto.rol}: ${e.contacto.nombre}.` : ''} Fuente: registro mercantil oficial.${extra ? ` ${extra}` : ''}`,
    }
  })

  const total: ResumenImportacion = { recibidos: 0, insertados: 0, actualizados: 0, descartados: 0, contactos: 0 }
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
  total.contactos = await guardarContactos(empresas)
  return total
}

/**
 * `importar_leads` no sabe de personas, así que el contacto se añade después,
 * buscando cada lead por la URL del registro. Si esto falla el lead ya está
 * guardado y el nombre sigue en su descripción: no se tumba la importación.
 */
async function guardarContactos(empresas: EmpresaNueva[]): Promise<number> {
  const conPersona = empresas.filter((e) => e.contacto)
  if (conPersona.length === 0) return 0
  try {
    const { data: leads, error } = await supabase
      .from('leads').select('id, perfil_url')
      .in('perfil_url', conPersona.map((e) => e.urlRegistro))
      .is('deleted_at', null)
    if (error || !leads?.length) return 0
    const { data: yaTienen } = await supabase
      .from('contacts').select('lead_id')
      .in('lead_id', leads.map((l) => l.id))
      .is('deleted_at', null)
    const conContacto = new Set((yaTienen ?? []).map((c) => c.lead_id))
    const filas = leads.flatMap((l) => {
      const e = conPersona.find((x) => x.urlRegistro === l.perfil_url)
      if (!e?.contacto || conContacto.has(l.id)) return []
      return [{ lead_id: l.id, nombre: e.contacto.nombre, cargo: e.contacto.rol }]
    })
    if (filas.length === 0) return 0
    const { error: errInsert } = await supabase.from('contacts').insert(filas)
    return errInsert ? 0 : filas.length
  } catch {
    return 0
  }
}

const nombreEstado = (id: EstadoRegistro) => ESTADOS_REGISTRO.find((s) => s.id === id)?.nombre ?? id
