# CRM API — Workflows n8n (proxy de Google Sheets)

Estos dos workflows exponen Google Sheets como una API REST vía webhooks de n8n,
para que el dashboard lea/escriba sin necesitar una Google API key en el frontend.
n8n usa su credencial **"Google Sheets account"** (OAuth2).

## Importar

1. En n8n: **Workflows → Import from File**.
2. Importa `CRM_API_Leer_Sheets.json` y `CRM_API_Escribir_Sheets.json`.
3. En cada nodo de Google Sheets, confirma que la credencial seleccionada es la
   tuya (el JSON referencia `id: 86m52fKwvUB07q9D` / "Google Sheets account";
   si tu credencial tiene otro id, reasígnala).
4. Verifica el `documentId` (Sheet): `1N8bL-ujDDg9hF9gqV0mQrD94AZeh_QItJ-Aft2Xd7NE`.
5. **Activa** ambos workflows.

## Endpoints resultantes

| Método | Ruta (webhook)                     | Uso desde el CRM                         |
|--------|------------------------------------|------------------------------------------|
| GET    | `/webhook/crm/sheets/:tab`         | Leer una hoja (`prospects`, `outreach`, `pipeline`, `messages`, `config`) |
| POST   | `/webhook/crm/sheets/pipeline-update` | Mover lead de etapa / actualizar pipeline |
| POST   | `/webhook/crm/sheets/lead-create`  | Crear lead nuevo                          |
| POST   | `/webhook/crm/sheets/lead-update`  | Editar lead                               |

> En desarrollo el frontend llega a estos webhooks vía el proxy de Vite
> (`/n8n-hook` → `http://localhost:5678/webhook`), evitando CORS.

## Formato de respuesta de lectura

El nodo final empaqueta las filas así:

```json
{ "rows": [ { "ID Lead": "L-1001", "Nombre empresa": "…", "Estado": "nuevo" }, … ] }
```

El cliente (`src/services/crmApi.ts`) también acepta `{ values: [[...]] }` o un
array de objetos directo, por si adaptas los workflows.

## Token opcional

Si quieres proteger los webhooks, valida un header `X-CRM-TOKEN` en un nodo Code
al inicio y define `VITE_N8N_HOOK_TOKEN` en el `.env` del frontend con el mismo valor.

## Fallback

Si estos workflows no están activos, el CRM cae automáticamente a:
1. Lectura directa con `VITE_GOOGLE_API_KEY` (si está configurada), o
2. Datos de ejemplo (`src/services/mockData.ts`).

Las escrituras (mover etapa, crear/editar lead) siempre son optimistas en el
store local; si el webhook responde, además quedan persistidas en Sheets.
