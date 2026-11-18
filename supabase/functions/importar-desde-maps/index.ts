// «Añadir desde Google Maps» del CRM: pegas el enlace de una ficha y el lead
// se crea con sus datos.
//
//   1. Abre el enlace corto (maps.app.goo.gl/…) hasta llegar a la URL larga.
//   2. Saca de la URL el nombre y las coordenadas (o el place_id si viene).
//   3. Completa la ficha:
//      · Sin clave de Google (lo normal, 0 €): OpenStreetMap. Nominatim da la
//        dirección, ciudad y país; Overpass, el teléfono y la web si alguien
//        los apuntó en OSM. Sin valoración ni reseñas: eso solo lo tiene Google.
//      · Con GOOGLE_PLACES_KEY: la API oficial de Google Places (New), que lo
//        trae todo. Pide facturación en Google Cloud; hoy no está activada.
//      Copiar Google Maps con robots lo prohíben sus condiciones y bloquearía
//      la IP de casa: descartado.
//   4. La guarda con `importar_leads` en el mismo formato que Apify, así que
//      deduplicación, nicho, mapa y verificador de WhatsApp funcionan igual.
//   5. Si tiene web, encola al robot de contactos (0070). Si no, el CRM pide
//      la web y la encola él.
//
// Solo admin y vendedor.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ORIGENES = ['https://workspace.jddeveloper.com', 'http://localhost:3000']

function cabeceras(origen: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
}

// ---------------------------------------------------------------
// 1-2. Del enlace a «qué negocio es»
// ---------------------------------------------------------------
type Pista = { placeId?: string; nombre?: string; lat?: number; lng?: number; texto?: string; ftid?: string }

/** Sigue las redirecciones a mano: así se ve la URL larga aunque Google mande a la página de cookies. */
async function resolver(url: string): Promise<string> {
  let actual = url
  for (let i = 0; i < 8; i++) {
    const u = new URL(actual)
    // La página de consentimiento de cookies lleva el destino real en `continue`.
    if (u.hostname.startsWith('consent.')) {
      const c = u.searchParams.get('continue')
      if (c) { actual = c; continue }
    }
    if (u.hostname.includes('google.') && u.pathname.startsWith('/maps')) return actual
    const r = await fetch(actual, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'es' } })
    const destino = r.headers.get('location')
    await r.body?.cancel()
    if (!destino) return actual
    actual = new URL(destino, actual).toString()
  }
  return actual
}

function leerPista(url: string): Pista {
  const p: Pista = {}
  const u = new URL(url)
  const q = u.searchParams

  p.placeId = q.get('query_place_id') ?? q.get('place_id') ?? undefined

  const lugar = u.pathname.match(/\/place\/([^/]+)/)
  if (lugar) p.nombre = decodeURIComponent(lugar[1].replace(/\+/g, ' '))

  // `!3d…!4d…` es la posición del negocio; `@lat,lng` es el centro de la
  // pantalla, que vale si no hay otra cosa.
  const exacta = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  const centro = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const c = exacta ?? centro
  if (c) { p.lat = Number(c[1]); p.lng = Number(c[2]) }

  // Identificador interno de la ficha (`!1s0x…:0x…` o `ftid=`): no cambia
  // aunque cambie el resto de la URL, así que sirve de enlace estable.
  const ftid = url.match(/!1s(0x[0-9a-f]+:0x[0-9a-f]+)/i)?.[1] ?? q.get('ftid') ?? undefined
  if (ftid && /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(ftid)) p.ftid = ftid

  const qq = q.get('q') ?? q.get('query')
  if (qq) {
    const coords = qq.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/)
    if (coords && p.lat === undefined) { p.lat = Number(coords[1]); p.lng = Number(coords[2]) }
    else if (!coords) p.texto = qq
  }
  return p
}

// ---------------------------------------------------------------
// 3. Google Places (New)
// ---------------------------------------------------------------
const CAMPOS = [
  'id', 'displayName', 'formattedAddress', 'addressComponents', 'location', 'googleMapsUri',
  'primaryTypeDisplayName', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'rating', 'userRatingCount', 'regularOpeningHours', 'businessStatus', 'editorialSummary',
]

type Lugar = {
  id: string
  displayName?: { text: string }
  formattedAddress?: string
  addressComponents?: { longText: string; shortText: string; types: string[] }[]
  location?: { latitude: number; longitude: number }
  googleMapsUri?: string
  primaryTypeDisplayName?: { text: string }
  nationalPhoneNumber?: string
  internationalPhoneNumber?: string
  websiteUri?: string
  rating?: number
  userRatingCount?: number
  regularOpeningHours?: { weekdayDescriptions?: string[] }
  businessStatus?: string
  editorialSummary?: { text: string }
}

async function places(clave: string, pista: Pista): Promise<Lugar | null> {
  // Inglés como en Apify: la categoría («Dentist») es lo que entiende el
  // catálogo de nichos (normalizar_nicho).
  if (pista.placeId) {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(pista.placeId)}?languageCode=en`, {
      headers: { 'X-Goog-Api-Key': clave, 'X-Goog-FieldMask': CAMPOS.join(',') },
    })
    if (r.ok) return await r.json()
    if (r.status !== 404 && r.status !== 400) throw new Error(`Google respondió ${r.status}: ${(await r.text()).slice(0, 300)}`)
  }

  const consulta = pista.nombre ?? pista.texto
  if (!consulta) return null
  const cuerpo: Record<string, unknown> = { textQuery: consulta, languageCode: 'en', pageSize: 5 }
  if (pista.lat !== undefined && pista.lng !== undefined) {
    cuerpo.locationBias = { circle: { center: { latitude: pista.lat, longitude: pista.lng }, radius: 500 } }
  }
  const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': clave,
      'X-Goog-FieldMask': CAMPOS.map((c) => `places.${c}`).join(','),
    },
    body: JSON.stringify(cuerpo),
  })
  if (!r.ok) throw new Error(`Google respondió ${r.status}: ${(await r.text()).slice(0, 300)}`)
  const lugares: Lugar[] = (await r.json()).places ?? []
  if (!lugares.length) return null
  if (pista.lat === undefined || pista.lng === undefined) return lugares[0]
  // Con coordenadas, el más cercano: una cadena tiene varios locales con el
  // mismo nombre y el que importa es el del enlace.
  const d = (l: Lugar) => l.location
    ? (l.location.latitude - pista.lat!) ** 2 + (l.location.longitude - pista.lng!) ** 2
    : Infinity
  return [...lugares].sort((a, b) => d(a) - d(b))[0]
}

/** Al formato de un item de Apify, que es lo que lee `importar_leads`. */
function comoApify(l: Lugar) {
  const comp = (tipo: string) => l.addressComponents?.find((c) => c.types.includes(tipo))
  const intl = l.internationalPhoneNumber
  const lat = l.location?.latitude
  const lng = l.location?.longitude
  return {
    title: l.displayName?.text,
    placeId: l.id,
    url: l.googleMapsUri,
    categoryName: l.primaryTypeDisplayName?.text,
    address: l.formattedAddress,
    city: comp('locality')?.longText ?? comp('postal_town')?.longText ?? comp('administrative_area_level_2')?.longText,
    state: comp('administrative_area_level_1')?.longText,
    countryCode: comp('country')?.shortText,
    phone: intl ?? l.nationalPhoneNumber,
    phoneUnformatted: intl ? '+' + intl.replace(/\D/g, '') : undefined,
    phones: intl ? [intl] : l.nationalPhoneNumber ? [l.nationalPhoneNumber] : [],
    website: l.websiteUri,
    totalScore: l.rating,
    reviewsCount: l.userRatingCount ?? 0,
    location: lat !== undefined ? { lat, lng } : undefined,
    lat, lng,
    // Apify: [{ day: 'Monday', hours: '9 AM to 5 PM' }]
    openingHours: l.regularOpeningHours?.weekdayDescriptions?.map((s) => {
      const i = s.indexOf(':')
      return i > 0 ? { day: s.slice(0, i).trim(), hours: s.slice(i + 1).trim() } : { day: s, hours: '' }
    }),
    description: l.editorialSummary?.text,
    permanentlyClosed: l.businessStatus === 'CLOSED_PERMANENTLY',
    temporarilyClosed: l.businessStatus === 'CLOSED_TEMPORARILY',
  }
}

// ---------------------------------------------------------------
// 3b. OpenStreetMap (gratis)
// ---------------------------------------------------------------
// Nominatim pide identificarse y no pasar de una consulta por segundo: aquí
// se hacen una o dos por lead añadido a mano, muy lejos de ese límite.
const UA_OSM = 'crm-leads-importer/1.0'

type Direccion = {
  road?: string; house_number?: string; city?: string; town?: string; village?: string
  municipality?: string; county?: string; state?: string; country_code?: string; suburb?: string
}

// Nominatim rechaza a menudo las peticiones que salen de servidores en la
// nube (como las Edge Functions), sin dar motivo. Photon (komoot) usa los
// mismos datos de OSM y sí las acepta: se prueba primero Nominatim y, si no
// contesta, Photon.
async function nominatimInverso(lat: number, lng: number): Promise<{ display_name?: string; address?: Direccion } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=es&lat=${lat}&lon=${lng}`,
    { headers: { 'User-Agent': UA_OSM }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  if (r?.ok) {
    const j = await r.json().catch(() => null)
    if (j?.address) return j
  } else console.warn('importar-desde-maps: nominatim', r?.status ?? 'sin respuesta')
  return await photonInverso(lat, lng)
}

async function photonInverso(lat: number, lng: number): Promise<{ display_name?: string; address?: Direccion } | null> {
  const r = await fetch(`https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`,
    { headers: { 'User-Agent': UA_OSM }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  if (!r?.ok) { console.warn('importar-desde-maps: photon', r?.status ?? 'sin respuesta'); return null }
  const p = (await r.json().catch(() => null))?.features?.[0]?.properties
  if (!p) return null
  // Si el punto cae en la calle, Photon pone su nombre en `name`, no en `street`.
  const calle = p.street ?? (p.type === 'street' ? p.name : undefined)
  const address: Direccion = {
    road: calle, house_number: p.housenumber, city: p.city ?? p.district, county: p.county,
    state: p.state, country_code: p.countrycode?.toLowerCase(),
  }
  return { address, display_name: [calle && [calle, p.housenumber].filter(Boolean).join(' '), p.city, p.state, p.country].filter(Boolean).join(', ') }
}

async function nominatimBuscar(q: string): Promise<{ lat: string; lon: string; display_name?: string; address?: Direccion } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&accept-language=es&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': UA_OSM }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  if (r?.ok) {
    const lista = await r.json().catch(() => []) as { lat: string; lon: string; display_name?: string; address?: Direccion }[]
    if (lista[0]) return lista[0]
  }
  // Igual que en la inversa: si Nominatim no contesta, Photon.
  const p = await fetch(`https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': UA_OSM }, signal: AbortSignal.timeout(5000) }).catch(() => null)
  const f = p?.ok ? (await p.json().catch(() => null))?.features?.[0] : null
  if (!f) return null
  const [lon, lat] = f.geometry.coordinates as [number, number]
  const inv = await photonInverso(lat, lon)
  return { lat: String(lat), lon: String(lon), ...(inv ?? {}) }
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** El negocio en OSM a menos de 80 m con un nombre parecido. Sus etiquetas traen teléfono, web, horario… */
async function overpass(nombre: string, lat: number, lng: number): Promise<Record<string, string> | null> {
  const consulta = `[out:json][timeout:5];nwr(around:80,${lat},${lng})[name];out tags 40;`
  const r = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST', headers: { 'User-Agent': UA_OSM, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'data=' + encodeURIComponent(consulta), signal: AbortSignal.timeout(6000),
  }).catch(() => null)
  if (!r?.ok) return null
  const els = ((await r.json()).elements ?? []) as { tags?: Record<string, string> }[]
  const objetivo = sinAcentos(nombre)
  const palabras = objetivo.split(' ').filter((p) => p.length > 2)
  let mejor: Record<string, string> | null = null
  let puntos = 0
  for (const e of els) {
    const n = sinAcentos(e.tags?.name ?? '')
    if (!n) continue
    const p = n === objetivo ? 100
      : n.includes(objetivo) || objetivo.includes(n) ? 80
      : palabras.filter((w) => n.includes(w)).length / Math.max(palabras.length, 1) * 60
    if (p > puntos) { puntos = p; mejor = e.tags ?? null }
  }
  return puntos >= 40 ? mejor : null
}

/** Mismo formato de item de Apify, con lo que se sepa de OSM. */
function comoApifyOsm(o: {
  nombre: string; lat?: number; lng?: number; enlace: string
  dir?: { display_name?: string; address?: Direccion } | null; tags?: Record<string, string> | null
}) {
  const a = o.dir?.address ?? {}
  const t = o.tags ?? {}
  const tel = t['phone'] ?? t['contact:phone'] ?? t['contact:mobile']
  const telefonos = (tel ?? '').split(';').map((x) => x.trim()).filter(Boolean)
  const calle = [t['addr:street'] ?? a.road, t['addr:housenumber'] ?? a.house_number].filter(Boolean).join(' ')
  const ciudad = t['addr:city'] ?? a.city ?? a.town ?? a.village ?? a.municipality ?? a.county
  const categoria = t['shop'] ?? t['amenity'] ?? t['craft'] ?? t['office'] ?? t['healthcare'] ?? t['tourism'] ?? t['leisure']
  const red = (k: string) => t[`contact:${k}`] ?? t[k]
  return {
    title: o.nombre,
    url: o.enlace,
    categoryName: categoria && categoria !== 'yes' ? categoria.replace(/_/g, ' ') : undefined,
    address: calle ? [calle, ciudad, a.state].filter(Boolean).join(', ') : o.dir?.display_name,
    city: ciudad,
    state: a.state,
    countryCode: a.country_code?.toUpperCase(),
    phone: telefonos[0],
    phones: telefonos,
    emails: [t['email'] ?? t['contact:email']].filter(Boolean),
    website: t['website'] ?? t['contact:website'] ?? t['url'],
    instagrams: [red('instagram')].filter(Boolean),
    facebooks: [red('facebook')].filter(Boolean),
    // Sin `location`: importar_leads la usa de dirección si no hay otra y en
    // la ficha salían las coordenadas en bruto. Basta con lat/lng.
    lat: o.lat, lng: o.lng,
    description: t['description'],
  }
}

// ---------------------------------------------------------------
Deno.serve(async (req) => {
  const h = cabeceras(req.headers.get('origin') ?? '')
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: h })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'POST') return responder({ ok: false, error: 'método no permitido' }, 405)

  const servicio = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: usuario } = await servicio.auth.getUser(jwt)
  if (!usuario?.user) return responder({ ok: false, error: 'Inicia sesión de nuevo.' }, 401)
  const { data: perfil } = await servicio.from('profiles').select('role').eq('id', usuario.user.id).maybeSingle()
  if (perfil?.role !== 'admin' && perfil?.role !== 'vendedor') {
    return responder({ ok: false, error: 'No tienes permiso para añadir leads.' }, 403)
  }

  const clave = Deno.env.get('GOOGLE_PLACES_KEY')

  let b: { enlace?: string }
  try { b = await req.json() } catch { return responder({ ok: false, error: 'cuerpo ilegible' }, 400) }

  // Al compartir desde la app de Maps llega «Nombre del negocio\nhttps://…»:
  // se coge el enlace y el texto de delante sirve de nombre si la URL no lo trae.
  const texto = (b.enlace ?? '').trim()
  const enlace = texto.match(/https?:\/\/\S+/)?.[0]
  if (!enlace) return responder({ ok: false, error: 'Pega un enlace de Google Maps.' }, 400)
  const delante = texto.slice(0, texto.indexOf(enlace)).trim()

  let pista: Pista
  let largo: string
  try {
    largo = await resolver(enlace)
    const host = new URL(largo).hostname
    if (!/(^|\.)google\.[a-z.]+$|(^|\.)goo\.gl$/.test(host)) {
      return responder({ ok: false, error: 'Ese enlace no es de Google Maps.' }, 400)
    }
    pista = leerPista(largo)
  } catch {
    return responder({ ok: false, error: 'No se pudo abrir el enlace. ¿Está completo?' }, 400)
  }
  if (!pista.nombre && !pista.texto && delante) pista.nombre = delante

  // --- Ficha: Google si hay clave, OpenStreetMap si no ---
  // deno-lint-ignore no-explicit-any
  let item: Record<string, any>
  let cerrado: string | null = null
  if (clave) {
    let lugar: Lugar | null
    try {
      lugar = await places(clave, pista)
    } catch (e) {
      console.error('importar-desde-maps:', String(e), largo)
      return responder({ ok: false, error: 'Google Places no respondió. Inténtalo en un momento.' }, 502)
    }
    if (!lugar) return responder({ ok: false, error: 'No encontré el negocio de ese enlace. Prueba a copiar el enlace desde «Compartir» en Maps.' }, 404)
    item = comoApify(lugar)
    cerrado = item.permanentlyClosed ? 'definitivamente' : item.temporarilyClosed ? 'temporalmente' : null
  } else {
    // Sin nombre no hay lead: un enlace con solo coordenadas es un punto del
    // mapa, no un negocio.
    let nombre = pista.nombre ?? (pista.texto && !/\d{3,}/.test(pista.texto) ? pista.texto.split(',')[0] : undefined)
    let lat = pista.lat, lng = pista.lng
    let dir: Awaited<ReturnType<typeof nominatimInverso>> = null
    // Overpass a la vez que Nominatim: es el más lento y el público va a
    // menudo saturado. Si no contesta a tiempo, se sigue sin él.
    const tagsPronto = nombre && lat !== undefined && lng !== undefined
      ? overpass(nombre.trim(), lat, lng).catch(() => null) : null
    try {
      if (lat !== undefined && lng !== undefined) dir = await nominatimInverso(lat, lng)
      else if (pista.texto ?? pista.nombre) {
        const r = await nominatimBuscar((pista.texto ?? pista.nombre)!)
        if (r) { lat = Number(r.lat); lng = Number(r.lon); dir = r }
      }
    } catch (e) { console.warn('importar-desde-maps: nominatim', String(e)) }
    if (!nombre) {
      return responder({ ok: false, error: 'Ese enlace no trae el nombre del negocio. Abre la ficha del negocio en Maps y copia el enlace desde «Compartir».' }, 422)
    }
    nombre = nombre.trim()
    const tags = tagsPronto ? await tagsPronto
      : lat !== undefined && lng !== undefined ? await overpass(nombre, lat, lng).catch(() => null) : null
    // Enlace estable a la ficha: con el identificador de Google si viene en la
    // URL, para que pegar dos veces el mismo negocio no cree dos leads.
    const fijo = pista.ftid ? `https://www.google.com/maps?ftid=${pista.ftid}` : largo
    item = comoApifyOsm({ nombre, lat, lng, enlace: fijo, dir, tags })
  }

  // --- ¿Ya estaba? (p. ej. traído antes por Apify, con otro enlace) ---
  // Mismo nombre a menos de ~300 m, o mismo nombre y ciudad. Si existe, se le
  // pasa su propia clave a importar_leads para que complete ese lead.
  let existente: { id: string; place_id: string | null; google_maps: string | null; empresa: string } | null = null
  {
    const { data: candidatos } = await servicio.from('leads')
      .select('id, place_id, google_maps, empresa, ciudad, latitud, longitud')
      .ilike('empresa', String(item.title).replace(/[\\%_]/g, (m) => '\\' + m)).is('deleted_at', null).limit(10)
    existente = (candidatos ?? []).find((c) =>
      (item.placeId && c.place_id === item.placeId)
      || (c.latitud != null && item.lat !== undefined && Math.abs(c.latitud - item.lat) < 0.003 && Math.abs(c.longitud - item.lng) < 0.003)
      || (c.ciudad && item.city && sinAcentos(c.ciudad) === sinAcentos(item.city))) ?? null
    if (existente) {
      item.title = existente.empresa
      if (existente.place_id) item.placeId = existente.place_id
      if (existente.google_maps) item.url = existente.google_maps
      else if (!existente.place_id) delete item.url // sin claves: importar_leads empareja por nombre + ciudad
    }
  }

  const { data: res, error } = await servicio.rpc('importar_leads', {
    p_lote: [item], p_fuente: 'google_maps', p_consulta: null,
  })
  if (error) return responder({ ok: false, error: `No se pudo guardar: ${error.message}` }, 500)

  const detalle = ((res as { detalle?: { resultado: string; motivo?: string }[] })?.detalle ?? [])[0]
  if (detalle?.resultado === 'descartado') {
    return responder({ ok: false, error: `No se añadió: ${detalle.motivo ?? 'descartado'}.`, empresa: item.title }, 409)
  }

  let consulta = servicio.from('leads').select('id, empresa, web').is('deleted_at', null)
  consulta = existente ? consulta.eq('id', existente.id)
    : item.placeId ? consulta.eq('place_id', item.placeId)
    : consulta.eq('google_maps', item.url)
  const { data: lead } = await consulta.order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!lead) return responder({ ok: false, error: 'Se guardó pero no lo encuentro. Recarga la lista.' }, 500)

  let buscandoContactos = false
  if (lead.web) {
    const { error: e2 } = await servicio.rpc('contactos_web_encolar', { p_lead_id: lead.id })
    if (e2) console.error('importar-desde-maps: no se pudo encolar contactos', e2.message)
    else buscandoContactos = true
  }

  return responder({
    ok: true,
    lead_id: lead.id,
    empresa: lead.empresa,
    nuevo: ((res as { insertados?: number })?.insertados ?? 0) > 0,
    web: lead.web ?? null,
    buscando_contactos: buscandoContactos,
    cerrado,
    fuente: clave ? 'google' : 'osm',
  })
})
