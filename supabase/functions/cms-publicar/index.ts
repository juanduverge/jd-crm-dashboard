// Botón Publicar del Blog CMS.
//
// Lo llama el CRM con la sesión del usuario. Solo un admin puede usarlo (la
// base ya impide a cualquier otro poner `publicado`; aquí se comprueba antes
// para dar un error claro). Hace tres cosas:
//
//   1. publicar / despublicar: cambia el estado del artículo (con la clave de
//      servicio, que es lo que el trigger de la 0057 deja pasar).
//   2. Apunta la publicación en cms_publicaciones con un código de un solo uso.
//   3. Pide a GitHub que compile y despliegue la web (workflow publicar.yml).
//      La Action avisa del resultado a cms-publicacion-estado con ese código.
//
// Si GitHub no acepta el encargo, el artículo vuelve a su estado anterior: no
// puede quedar «publicado» en el CRM y ausente en la web.
//
// Secreto: GITHUB_TOKEN_PUBLICAR (token de GitHub con permiso Actions sobre
// juanduverge/jd-developer-site).
import { createClient } from 'npm:@supabase/supabase-js@2'

const REPO = 'juanduverge/jd-developer-site'
const WORKFLOW = 'publicar.yml'
const ORIGENES = ['https://workspace.jddeveloper.com', 'http://localhost:3000']

type Accion = 'publicar' | 'despublicar' | 'reconstruir'

function cabeceras(origen: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
}

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const h = cabeceras(req.headers.get('origin') ?? '')
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: h })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'POST') return responder({ ok: false, error: 'método no permitido' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const servicio = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // Quién llama: la sesión del CRM.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: usuario } = await servicio.auth.getUser(jwt)
  if (!usuario?.user) return responder({ ok: false, error: 'Inicia sesión de nuevo.' }, 401)
  const { data: perfil } = await servicio.from('profiles').select('role').eq('id', usuario.user.id).maybeSingle()
  if (perfil?.role !== 'admin') return responder({ ok: false, error: 'Solo un administrador puede publicar.' }, 403)

  let b: { accion?: Accion; item_id?: string }
  try { b = await req.json() } catch { return responder({ ok: false, error: 'cuerpo ilegible' }, 400) }
  const accion = b.accion
  if (!accion || !['publicar', 'despublicar', 'reconstruir'].includes(accion)) {
    return responder({ ok: false, error: 'Acción desconocida.' }, 400)
  }

  const token = Deno.env.get('GITHUB_TOKEN_PUBLICAR')
  if (!token) return responder({ ok: false, error: 'Falta configurar el token de GitHub (GITHUB_TOKEN_PUBLICAR).' }, 500)

  // 1. Estado del artículo
  let anterior: { id: string; status: string } | null = null
  if (accion !== 'reconstruir') {
    if (!b.item_id) return responder({ ok: false, error: 'Falta el artículo.' }, 400)
    const { data: item, error } = await servicio.from('cms_items')
      .select('id, status, title_h1, slug, body, meta_description, deleted_at').eq('id', b.item_id).maybeSingle()
    if (error || !item || item.deleted_at) return responder({ ok: false, error: 'No existe ese artículo.' }, 404)
    if (accion === 'publicar') {
      const falta = [
        !item.title_h1?.trim() && 'el título',
        !item.body?.trim() && 'el texto',
        !item.meta_description?.trim() && 'la descripción',
      ].filter(Boolean)
      if (falta.length) return responder({ ok: false, error: `Antes de publicar falta ${falta.join(', ')}.` }, 422)
    }
    const nuevo = accion === 'publicar' ? 'publicado' : 'archivado'
    if (item.status !== nuevo) {
      anterior = { id: item.id, status: item.status }
      const { error: e2 } = await servicio.from('cms_items').update({ status: nuevo }).eq('id', item.id)
      if (e2) return responder({ ok: false, error: `No se pudo cambiar el estado: ${e2.message}` }, 500)
    }
  }

  // 2. Apuntar la publicación
  const aviso = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const { data: pub, error: e3 } = await servicio.from('cms_publicaciones').insert({
    item_ids: b.item_id ? [b.item_id] : [], motivo: 'manual', accion, estado: 'pendiente',
    aviso_hash: await sha256(aviso), solicitado_por: usuario.user.id,
  }).select('id').single()
  if (e3) return responder({ ok: false, error: `No se pudo registrar la publicación: ${e3.message}` }, 500)

  // 3. Encargo a GitHub
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jd-crm-cms',
    },
    body: JSON.stringify({ ref: 'main', inputs: { publicacion_id: pub.id, aviso } }),
  }).catch((e) => new Response(String(e), { status: 599 }))

  if (r.status !== 204) {
    const detalle = `GitHub respondió ${r.status}: ${(await r.text()).slice(0, 300)}`
    await servicio.from('cms_publicaciones').update({ estado: 'fallo', detalle, aviso_hash: null, terminado_en: new Date().toISOString() }).eq('id', pub.id)
    if (anterior) await servicio.from('cms_items').update({ status: anterior.status }).eq('id', anterior.id)
    console.error('cms-publicar:', detalle)
    return responder({ ok: false, error: 'GitHub no aceptó la publicación. El artículo sigue como estaba.', detalle }, 502)
  }
  return responder({ ok: true, publicacion_id: pub.id })
})
