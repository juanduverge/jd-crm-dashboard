// Genera n8n/radar-investigar.json a partir del código de los nodos.
//
//   node n8n/radar/construir.mjs
//
// El código de los nodos vive en ficheros .js sueltos para poder leerlo y
// revisarlo; meterlo a mano dentro del JSON (escapado en una sola línea) es
// como se cuelan los errores.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const codigo = (f) => readFileSync(join(aqui, f), 'utf8')

const GEMINI = { googlePalmApi: { id: 'gbvMlss50rTZGA5i', name: 'Google Gemini(PaLM) Api account' } }

const nodos = [
  {
    id: 'r1', name: 'Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 300],
    webhookId: 'radar-investigar',
    parameters: { httpMethod: 'POST', path: 'radar-investigar', responseMode: 'responseNode', options: {} },
  },
  {
    // Mismo candado que «CRM API - IA Lead»: no se atiende lo que entra por el
    // dominio público de n8n, solo lo que viene del CRM o de dentro.
    id: 'r2', name: 'Solo desde el CRM', type: 'n8n-nodes-base.if', typeVersion: 2, position: [220, 300],
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
  },
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
    // Si Gemini falla se sigue adelante: «Leer respuesta» lo convierte en un
    // error con mensaje, en vez de dejar el webhook sin contestar.
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
]

const une = (...destinos) => [destinos.map((node) => ({ node, type: 'main', index: 0 }))]

const workflow = {
  name: 'Radar - Investigar empresa',
  nodes: nodos,
  connections: {
    Webhook: { main: une('Solo desde el CRM') },
    'Solo desde el CRM': { main: [...une('Armar consulta'), ...une('Rechazar acceso directo')] },
    'Armar consulta': { main: une('Preguntar a Gemini') },
    'Preguntar a Gemini': { main: une('Leer respuesta') },
    'Leer respuesta': { main: une('Responder') },
  },
  settings: { executionOrder: 'v1' },
}

writeFileSync(join(aqui, '..', 'radar-investigar.json'), JSON.stringify(workflow, null, 2) + '\n')
console.log('n8n/radar-investigar.json:', nodos.length, 'nodos')
