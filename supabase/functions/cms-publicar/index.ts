// Botón Publicar del Blog CMS, y publicación de lo programado.
//
// Dos formas de llamarla:
//
//   · Desde el CRM, con la sesión del usuario. Solo un admin (la base ya
//     impide a cualquier otro poner `publicado`; aquí se comprueba antes para
//     dar un error claro). Acciones: publicar / despublicar / reconstruir.
//   · Desde pg_cron (0060), con la cabecera x-cms-cron. Acción: programados:
//     publica todo lo `programado` cuya hora ya pasó.
//
// En los dos casos: cambia el estado (con la clave de servicio, que es lo que
// el trigger de la 0057 deja pasar), apunta la publicación en
// cms_publicaciones con un código de un solo uso y pide a GitHub que compile y
// despliegue la web (workflow publicar.yml). La Action avisa del resultado a
// cms-publicacion-estado con ese código.
//
// Si GitHub no acepta el encargo, los artículos vuelven a su estado anterior:
// no pueden quedar «publicados» en el CRM y ausentes en la web.
//
// Secreto: GITHUB_TOKEN_PUBLICAR (token de GitHub con permiso Actions sobre
// juanduverge/jd-developer-site).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const REPO = 'juanduverge/jd-developer-site'
const WORKFLOW = 'publicar.yml'
const ORIGENES = ['https://workspace.jddeveloper.com', 'http://localhost:3000']

type Accion = 'publicar' | 'despublicar' | 'reconstruir' | 'programados'
type Cambio = { id: string; status: string }

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

/**
 * Apunta la publicación y se la encarga a GitHub. Si GitHub no la acepta,
 * deshace los cambios de estado de `anteriores` y devuelve el error.
 */
async function encargar(servicio: SupabaseClient, o: {
  accion: Exclude<Accion, 'programados'>; motivo: 'manual' | 'programado'
  itemIds: string[]; anteriores: Cambio[]; usuario: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string; detalle?: string }> {
  const token = Deno.env.get('GITHUB_TOKEN_PUBLICAR')
  const deshacer = async () => {
    for (const a of o.anteriores) await servicio.from('cms_items').update({ status: a.status }).eq('id', a.id)
  }
  if (!token) { await deshacer(); return { ok: false, error: 'Falta configurar el token de GitHub (GITHUB_TOKEN_PUBLICAR).' } }

  const aviso = `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, '')
  const { data: pub, error } = await servicio.from('cms_publicaciones').insert({
    item_ids: o.itemIds, motivo: o.motivo, accion: o.accion, estado: 'pendiente',
    aviso_hash: await sha256(aviso), solicitado_por: o.usuario,
  }).select('id').single()
  if (error) { await deshacer(); return { ok: false, error: `No se pudo registrar la publicación: ${error.message}` } }

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
    await deshacer()
    console.error('cms-publicar:', detalle)
    return { ok: false, error: 'GitHub no aceptó la publicación. El artículo sigue como estaba.', detalle }
  }
  return { ok: true, id: pub.id }
}

Deno.serve(async (req) => {
  const h = cabeceras(req.headers.get('origin') ?? '')
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: h })
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'POST') return responder({ ok: false, error: 'método no permitido' }, 405)

  const servicio = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  let b: { accion?: Accion; item_id?: string }
  try { b = await req.json() } catch { return responder({ ok: false, error: 'cuerpo ilegible' }, 400) }

  // --- pg_cron: publicar lo programado ---
  const cron = req.headers.get('x-cms-cron')
  if (cron !== null) {
    const { data: valido } = await servicio.rpc('cms_cron_ok', { p: cron })
    if (valido !== true) return responder({ ok: false }, 401)
    if (b.accion !== 'programados') return responder({ ok: false, error: 'Acción desconocida.' }, 400)
    const { data: tocan } = await servicio.from('cms_items').select('id, status')
      .eq('status', 'programado').lte('programado_para', new Date().toISOString()).is('deleted_at', null)
    if (!tocan?.length) return responder({ ok: true, publicados: 0 })
    const ids = tocan.map(t => t.id)
    const { error } = await servicio.from('cms_items').update({ status: 'publicado' }).in('id', ids)
    if (error) return responder({ ok: false, error: error.message }, 500)
    const r = await encargar(servicio, { accion: 'publicar', motivo: 'programado', itemIds: ids, anteriores: tocan, usuario: null })
    return r.ok ? responder({ ok: true, publicados: ids.length, publicacion_id: r.id }) : responder(r, 502)
  }

  // --- CRM: la sesión del usuario ---
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: usuario } = await servicio.auth.getUser(jwt)
  if (!usuario?.user) return responder({ ok: false, error: 'Inicia sesión de nuevo.' }, 401)
  const { data: perfil } = await servicio.from('profiles').select('role').eq('id', usuario.user.id).maybeSingle()
  if (perfil?.role !== 'admin') return responder({ ok: false, error: 'Solo un administrador puede publicar.' }, 403)

  const accion = b.accion
  if (accion !== 'publicar' && accion !== 'despublicar' && accion !== 'reconstruir') {
    return responder({ ok: false, error: 'Acción desconocida.' }, 400)
  }

  const anteriores: Cambio[] = []
  if (accion !== 'reconstruir') {
    if (!b.item_id) return responder({ ok: false, error: 'Falta el artículo.' }, 400)
    const { data: item, error } = await servicio.from('cms_items')
      .select('id, status, title_h1, body, meta_description, deleted_at').eq('id', b.item_id).maybeSingle()
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
      anteriores.push({ id: item.id, status: item.status })
      const { error: e2 } = await servicio.from('cms_items').update({ status: nuevo }).eq('id', item.id)
      if (e2) return responder({ ok: false, error: `No se pudo cambiar el estado: ${e2.message}` }, 500)
    }
  }

  const r = await encargar(servicio, {
    accion, motivo: 'manual', itemIds: b.item_id ? [b.item_id] : [], anteriores, usuario: usuario.user.id,
  })
  return r.ok ? responder({ ok: true, publicacion_id: r.id }) : responder(r, 502)
})
