// «Añadir desde Google Maps» del CRM: pegas el enlace de una ficha y el lead
// se crea con todos sus datos.
//
//   1. Abre el enlace corto (maps.app.goo.gl/…) hasta llegar a la URL larga.
//   2. Saca de la URL el nombre y las coordenadas (o el place_id si viene).
//   3. Pide la ficha a la API oficial de Google Places (New). Copiar Google
//      Maps con robots lo prohíben sus condiciones y bloquearía la IP de casa.
//   4. La guarda con `importar_leads` en el mismo formato que Apify, así que
//      deduplicación, nicho, mapa y verificador de WhatsApp funcionan igual.
//   5. Si tiene web, encola al robot de contactos (0070), que saca correos,
//      teléfonos y redes de la web en el servidor de casa.
//
// Solo admin y vendedor. Secreto: GOOGLE_PLACES_KEY (clave de Google Cloud
// con «Places API (New)» activada).
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
type Pista = { placeId?: string; nombre?: string; lat?: number; lng?: number; texto?: string }

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
  if (!clave) return responder({ ok: false, error: 'Falta la clave de Google Places (GOOGLE_PLACES_KEY). Pídesela a Juan.' }, 503)

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

  let lugar: Lugar | null
  try {
    lugar = await places(clave, pista)
  } catch (e) {
    console.error('importar-desde-maps:', String(e), largo)
    return responder({ ok: false, error: 'Google Places no respondió. Inténtalo en un momento.' }, 502)
  }
  if (!lugar) {
    console.warn('importar-desde-maps: sin resultado', largo)
    return responder({ ok: false, error: 'No encontré el negocio de ese enlace. Prueba a abrir la ficha en Maps y copiar el enlace desde «Compartir».' }, 404)
  }

  const item = comoApify(lugar)
  const { data: res, error } = await servicio.rpc('importar_leads', {
    p_lote: [item], p_fuente: 'google_maps', p_consulta: null,
  })
  if (error) return responder({ ok: false, error: `No se pudo guardar: ${error.message}` }, 500)

  const detalle = ((res as { detalle?: { resultado: string; motivo?: string }[] })?.detalle ?? [])[0]
  if (detalle?.resultado === 'descartado') {
    return responder({ ok: false, error: `No se añadió: ${detalle.motivo ?? 'descartado'}.`, empresa: item.title }, 409)
  }

  const { data: lead } = await servicio.from('leads')
    .select('id, empresa, web').eq('place_id', lugar.id).is('deleted_at', null)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
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
    buscando_contactos: buscandoContactos,
    cerrado: item.permanentlyClosed ? 'definitivamente' : item.temporarilyClosed ? 'temporalmente' : null,
  })
})
