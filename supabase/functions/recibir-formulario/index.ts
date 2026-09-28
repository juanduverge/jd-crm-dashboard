// Recibe el formulario de contacto de jddeveloper.com y lo guarda en Supabase.
//
// Por que existe (plan de arquitectura, fase 1): antes el formulario enviaba a
// n8n, en el servidor de casa. Si la casa estaba apagada, el contacto se
// perdia. Esta funcion vive en la nube de Supabase: guarda el contacto y deja
// en la cola `tareas` el aviso a info@, que n8n envia cuando puede.
//
// Publica (verify_jwt = false): la llama un visitante sin sesion. Su
// proteccion: origenes permitidos, campo trampa (honeypot), validacion en
// recibir_formulario_web() y, si existe el secreto TURNSTILE_SECRET, la
// comprobacion de Cloudflare Turnstile.
import { createClient } from 'npm:@supabase/supabase-js@2'

const ORIGENES = [
  'https://jddeveloper.com',
  'https://www.jddeveloper.com',
  'https://workspace.jddeveloper.com',
]

const CAMPOS = [
  'nombre', 'email', 'telefono', 'mensaje', 'detalle', 'empresa', 'asunto',
  'pagina', 'url', 'referrer', 'utm_source', 'utm_medium', 'utm_campaign',
  'fuente', 'formulario',
] as const

function cabeceras(origen: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  }
}

async function leerCuerpo(req: Request): Promise<Record<string, unknown>> {
  const tipo = req.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) return await req.json()
  const form = await req.formData()
  return Object.fromEntries(form.entries())
}

async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secreto = Deno.env.get('TURNSTILE_SECRET')
  if (!secreto) return true // sin secreto configurado: igual que antes, solo honeypot
  if (!token) return false
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: secreto, response: token, remoteip: ip }),
  })
  const j = await r.json().catch(() => ({ success: false }))
  return j.success === true
}

Deno.serve(async (req) => {
  const origen = req.headers.get('origin') ?? ''
  const h = cabeceras(origen)
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: h })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
  if (req.method !== 'POST') return responder({ ok: false, error: 'metodo no permitido' }, 405)
  if (origen && !ORIGENES.includes(origen)) return responder({ ok: false, error: 'origen no permitido' }, 403)

  let b: Record<string, unknown>
  try {
    b = await leerCuerpo(req)
  } catch {
    return responder({ ok: false, error: 'cuerpo ilegible' }, 400)
  }

  // Campo trampa: un bot lo rellena. Se responde "ok" para no darle pistas.
  if (b.hp_confirm_jd || b.website) return responder({ ok: true })

  const ip = (req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
  if (!(await turnstileOk(String(b.turnstile_token ?? b['cf-turnstile-response'] ?? ''), ip))) {
    return responder({ ok: false, error: 'verificacion anti-spam fallida' }, 400)
  }

  const p: Record<string, string> = {}
  for (const c of CAMPOS) {
    const v = b[c]
    if (v !== undefined && v !== null && String(v).trim() !== '') p[c] = String(v)
  }
  if (!p.url && b.url_origen) p.url = String(b.url_origen)
  p.ip = ip
  p.user_agent = req.headers.get('user-agent') ?? ''

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data, error } = await sb.rpc('recibir_formulario_web', { p })
  if (error) {
    if (error.message.includes('formulario incompleto')) {
      return responder({ ok: false, error: 'Faltan el nombre o un email valido.' }, 400)
    }
    console.error('recibir_formulario_web:', error.message)
    return responder({ ok: false, error: 'no se pudo guardar' }, 500)
  }
  return responder({ ok: true, nuevo: (data as { nuevo?: boolean })?.nuevo ?? true })
})
