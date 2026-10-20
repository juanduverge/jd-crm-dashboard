// Aviso de la GitHub Action «Publicar la web» al CRM: compilando, ok o fallo.
//
// Pública (verify_jwt = false) porque la llama GitHub, sin sesión. Su
// protección es el código de un solo uso que cms-publicar le dio a esa
// ejecución: aquí solo se guarda su huella, y deja de valer al terminar.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ESTADOS = ['compilando', 'ok', 'fallo']

async function sha256(texto: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })
  if (req.method !== 'POST') return responder({ ok: false }, 405)

  let b: { publicacion_id?: string; aviso?: string; estado?: string; run_url?: string; detalle?: string }
  try { b = await req.json() } catch { return responder({ ok: false }, 400) }
  if (!b.publicacion_id || !b.aviso || !ESTADOS.includes(b.estado ?? '')) return responder({ ok: false }, 400)

  const servicio = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const final = b.estado !== 'compilando'
  const ahora = new Date().toISOString()
  const run = typeof b.run_url === 'string' && b.run_url.startsWith('https://github.com/') ? b.run_url : null
  const { data } = await servicio.from('cms_publicaciones')
    .update({
      estado: b.estado,
      run_url: run,
      ...(final ? { terminado_en: ahora, aviso_hash: null } : { iniciado_en: ahora }),
      ...(b.estado === 'fallo' ? { detalle: (b.detalle ?? 'La compilación o el despliegue falló. Mira la ejecución en GitHub.').slice(0, 500) } : {}),
    })
    .eq('id', b.publicacion_id)
    .eq('aviso_hash', await sha256(b.aviso))
    .in('estado', ['pendiente', 'compilando'])
    .select('id')
  if (!data?.length) return responder({ ok: false }, 404)
  return responder({ ok: true })
})
