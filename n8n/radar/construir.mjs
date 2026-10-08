// Genera los workflows del Radar a partir del código de sus nodos.
//
//   node n8n/radar/construir.mjs        (desde la raíz del repo)
//
// Salen tres ficheros en n8n/:
//   radar-recolector.json   cada mañana: baja las empresas nuevas, las criba y las guarda
//   radar-leer-paginas.json cada 15 min: abre las webs de las que están en cola y decide
//   radar-investigar.json   búsqueda en Google con Gemini (necesita facturación en Google)
//
// El código de los nodos vive en ficheros sueltos para poder leerlo y
// revisarlo; meterlo a mano dentro del JSON, escapado en una sola línea, es
// como se cuelan los errores. El recolector, además, se empaqueta desde los
// mismos módulos de src/lib que usa la pantalla del CRM.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const aqui = dirname(fileURLToPath(import.meta.url))
const raiz = join(aqui, '..', '..')
const codigo = (f) => readFileSync(join(aqui, f), 'utf8')

const SB = 'https://octzlhcwqlvxzrjgaptk.supabase.co/rest/v1/'
const SUPABASE = { supabaseApi: { id: 'jdSupabaseSvcRole', name: 'Supabase - JDDeveloper' } }
const GEMINI = { googlePalmApi: { id: 'gbvMlss50rTZGA5i', name: 'Google Gemini(PaLM) Api account' } }
// El único modelo con cupo gratis que da para esto (500 peticiones al día).
const MODELO_GRATIS = 'gemini-3.5-flash-lite'

const une = (...destinos) => [destinos.map((node) => ({ node, type: 'main', index: 0 }))]

const webhook = (id, path, extra = {}) => ({
  id, name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 480], webhookId: path,
  parameters: { httpMethod: 'POST', path, responseMode: 'lastNode', options: {}, ...extra },
})

// Mismo candado que «CRM API - IA Lead»: no se atiende lo que entra por el
// dominio público de n8n, solo lo que viene del CRM o de dentro.
const candado = (id, position) => ({
  id, name: 'Solo desde el CRM', type: 'n8n-nodes-base.if', typeVersion: 2, position,
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions: [{
        id: 'g1',
        leftValue: "={{ !String(($json.headers || {}).host || '').startsWith('backoffice.') && !String(($json.headers || {})['x-forwarded-host'] || '').startsWith('backoffice.') }}",
        rightValue: true,
        operator: { type: 'boolean', operation: 'true', singleValue: true },
      }],
      combinator: 'and',
    },
    options: {},
  },
})

const supabase = (id, name, position, { method = 'POST', url, body, prefer, extra = {} }) => ({
  id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position, credentials: SUPABASE, ...extra,
  parameters: {
    method,
    url,
    authentication: 'predefinedCredentialType',
    nodeCredentialType: 'supabaseApi',
    ...(prefer ? { sendHeaders: true, headerParameters: { parameters: [{ name: 'Prefer', value: prefer }] } } : {}),
    ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
    options: { timeout: 60000 },
  },
})

// ---------------------------------------------------------------------------
// 1. Recolector diario
// ---------------------------------------------------------------------------
async function recolector() {
  const r = await build({
    entryPoints: [join(aqui, 'recolector.ts')],
    bundle: true, write: false, format: 'iife', target: 'es2020', logLevel: 'error',
    // n8n no trae fetch: cada llamada del paquete va a la función que
    // `recolectar` monta sobre this.helpers.httpRequest.
    define: { fetch: '__radarFetch', 'import.meta.env': '{}' },
    plugins: [{
      name: 'alias',
      setup(b) {
        // El recolector no toca Supabase: guarda el nodo siguiente, con su credencial.
        b.onResolve({ filter: /^@\/lib\/supabaseClient$/ }, () => ({ path: join(aqui, 'sin-supabase.ts') }))
        b.onResolve({ filter: /^@\// }, (a) => b.resolve('./src/' + a.path.slice(2), { resolveDir: raiz, kind: a.kind }))
      },
    }],
  })
  const paquete = r.outputFiles[0].text
  const js = [
    '// GENERADO por n8n/radar/construir.mjs desde n8n/radar/recolector.ts y src/lib. No editar aqui.',
    'let __radarFetch;',
    'const __radarSalida = {};',
    paquete,
    "const o = (($('Webhook').isExecuted ? $('Webhook').first().json : {}) || {}).body || {};",
    "const conocidas = $('Ya guardadas').all().map((i) => i.json.id).filter(Boolean);",
    'const r = await __radarSalida.recolectar(this.helpers, { dias: o.dias, comprobar: o.comprobar, conocidas });',
    'return [{ json: r }];',
  ].join('\n')

  return {
    name: 'Radar - Recolector diario',
    nodes: [
      {
        id: 'c1', name: 'Cada manana', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [220, 120],
        parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 7 * * *' }] } },
      },
      webhook('c2', 'radar-recolectar'),
      candado('c3', [220, 480]),
      // Lo que ya está en la tabla de las últimas dos semanas, para no repetirlo.
      supabase('c7', 'Ya guardadas', [460, 300], {
        method: 'GET',
        url: "={{ '" + SB + "radar_empresas?select=id&limit=20000&fecha_registro=gte.' + $now.minus({ days: 14 }).toFormat('yyyy-MM-dd') }}",
        extra: { alwaysOutputData: true },
      }),
      {
        id: 'c4', name: 'Recolectar', type: 'n8n-nodes-base.code', typeVersion: 2, position: [680, 300],
        parameters: { jsCode: js },
      },
      // ignore-duplicates: una empresa que ya está no se toca, así que volver
      // a verla mañana no le pisa la investigación ni la saca de Leads.
      supabase('c5', 'Guardar candidatas', [900, 300], {
        url: SB + 'radar_empresas',
        body: '={{ JSON.stringify($json.filas) }}',
        prefer: 'resolution=ignore-duplicates,return=minimal',
        extra: { alwaysOutputData: true },
      }),
      {
        id: 'c6', name: 'Resumen', type: 'n8n-nodes-base.code', typeVersion: 2, position: [1120, 300],
        parameters: { jsCode: "return [{ json: { ok: true, ...$('Recolectar').first().json.resumen } }];" },
      },
    ],
    connections: {
      'Cada manana': { main: une('Ya guardadas') },
      'Ya guardadas': { main: une('Recolectar') },
      Webhook: { main: une('Solo desde el CRM') },
      'Solo desde el CRM': { main: une('Ya guardadas') },
      Recolectar: { main: une('Guardar candidatas') },
      'Guardar candidatas': { main: une('Resumen') },
    },
    settings: { executionOrder: 'v1' },
  }
}

// ---------------------------------------------------------------------------
// 2. Leer las páginas de las que están en cola
// ---------------------------------------------------------------------------
function leerPaginas() {
  const decidir = (id, name, position) => ({
    id, name, type: 'n8n-nodes-base.code', typeVersion: 2, position,
    parameters: { mode: 'runOnceForEachItem', jsCode: codigo('decidir.js') },
  })
  return {
    name: 'Radar - Leer paginas',
    nodes: [
      {
        id: 'p1', name: 'Cada 15 minutos', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [220, 120],
        // Despacio a proposito: el 8-oct dos cortes del tunel de Cloudflare
        // coincidieron con corridas de este workflow cuando iba cada 5 minutos.
        parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 15 }] } },
      },
      webhook('p2', 'radar-cola'),
      candado('p3', [220, 480]),
      supabase('p4', 'Recuperar colgadas', [460, 300], {
        url: SB + 'rpc/radar_recuperar_colgadas', body: '={{ JSON.stringify({}) }}', extra: { alwaysOutputData: true },
      }),
      // El tope diario lo impone esta función, en la base.
      supabase('p5', 'Tomar de la cola', [680, 300], {
        url: SB + 'rpc/radar_tomar_para_investigar', body: '={{ JSON.stringify({ p_limite: 3 }) }}',
      }),
      {
        id: 'p6', name: 'Abrir sus paginas', type: 'n8n-nodes-base.code', typeVersion: 2, position: [900, 300],
        parameters: { jsCode: codigo('abrir-paginas.js') },
      },
      {
        id: 'p7', name: 'Hay pagina que leer', type: 'n8n-nodes-base.if', typeVersion: 2, position: [1120, 300],
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
            conditions: [{
              id: 'h1', leftValue: '={{ !!$json.cuerpo }}', rightValue: true,
              operator: { type: 'boolean', operation: 'true', singleValue: true },
            }],
            combinator: 'and',
          },
          options: {},
        },
      },
      {
        id: 'p8', name: 'Preguntar a Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1340, 200],
        credentials: GEMINI,
        // «Modelo con mucha demanda» es frecuente en el plan gratis: se
        // reintenta, y si aun así falla «Decidir con IA» devuelve la empresa a la cola.
        retryOnFail: true, maxTries: 3, waitBetweenTries: 5000,
        onError: 'continueRegularOutput',
        parameters: {
          method: 'POST',
          url: 'https://generativelanguage.googleapis.com/v1beta/models/' + MODELO_GRATIS + ':generateContent',
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'googlePalmApi',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
          // De una en una y con pausa: el plan gratis admite 15 por minuto.
          options: { timeout: 90000, batching: { batch: { batchSize: 1, batchInterval: 4500 } } },
        },
      },
      decidir('p9', 'Decidir con IA', [1560, 200]),
      decidir('p10', 'Decidir sin IA', [1560, 420]),
      supabase('p11', 'Guardar resultado', [1780, 300], {
        method: 'PATCH',
        url: "={{ '" + SB + "radar_empresas?id=eq.' + encodeURIComponent($json.id) }}",
        body: '={{ JSON.stringify($json.cambios) }}',
        prefer: 'return=minimal',
        extra: { alwaysOutputData: true },
      }),
    ],
    connections: {
      'Cada 15 minutos': { main: une('Recuperar colgadas') },
      Webhook: { main: une('Solo desde el CRM') },
      'Solo desde el CRM': { main: une('Recuperar colgadas') },
      'Recuperar colgadas': { main: une('Tomar de la cola') },
      'Tomar de la cola': { main: une('Abrir sus paginas') },
      'Abrir sus paginas': { main: une('Hay pagina que leer') },
      'Hay pagina que leer': { main: [...une('Preguntar a Gemini'), ...une('Decidir sin IA')] },
      'Preguntar a Gemini': { main: une('Decidir con IA') },
      'Decidir con IA': { main: une('Guardar resultado') },
      'Decidir sin IA': { main: une('Guardar resultado') },
    },
    settings: { executionOrder: 'v1' },
  }
}

// ---------------------------------------------------------------------------
// 3. Búsqueda en Google con Gemini (de pago: el plan gratis no la incluye)
// ---------------------------------------------------------------------------
function investigar() {
  return {
    name: 'Radar - Investigar empresa',
    nodes: [
      { ...webhook('r1', 'radar-investigar', { responseMode: 'responseNode' }), position: [0, 300] },
      candado('r2', [220, 300]),
      {
        id: 'r3', name: 'Rechazar acceso directo', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 480],
        parameters: {
          respondWith: 'json',
          responseBody: "={{ JSON.stringify({ ok: false, error: 'acceso directo no permitido' }) }}",
          options: { responseCode: 403 },
        },
      },
      {
        id: 'r4', name: 'Armar consulta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 200],
        parameters: { jsCode: codigo('armar-consulta.js') },
      },
      {
        id: 'r5', name: 'Preguntar a Gemini', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 200],
        credentials: GEMINI,
        onError: 'continueRegularOutput',
        parameters: {
          method: 'POST',
          url: "={{ 'https://generativelanguage.googleapis.com/v1beta/models/' + $json.modelo + ':generateContent' }}",
          authentication: 'predefinedCredentialType',
          nodeCredentialType: 'googlePalmApi',
          sendBody: true,
          specifyBody: 'json',
          jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
          options: { timeout: 120000 },
        },
      },
      {
        id: 'r6', name: 'Leer respuesta', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 200],
        parameters: { jsCode: codigo('leer-respuesta.js') },
      },
      {
        id: 'r7', name: 'Responder', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [1100, 200],
        parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: {} },
      },
    ],
    connections: {
      Webhook: { main: une('Solo desde el CRM') },
      'Solo desde el CRM': { main: [...une('Armar consulta'), ...une('Rechazar acceso directo')] },
      'Armar consulta': { main: une('Preguntar a Gemini') },
      'Preguntar a Gemini': { main: une('Leer respuesta') },
      'Leer respuesta': { main: une('Responder') },
    },
    settings: { executionOrder: 'v1' },
  }
}

for (const [fichero, wf] of [
  ['radar-recolector.json', await recolector()],
  ['radar-leer-paginas.json', leerPaginas()],
  ['radar-investigar.json', investigar()],
]) {
  writeFileSync(join(aqui, '..', fichero), JSON.stringify(wf, null, 2) + '\n')
  console.log('n8n/' + fichero + ':', wf.nodes.length, 'nodos')
}
