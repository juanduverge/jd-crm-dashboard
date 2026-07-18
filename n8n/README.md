# Workflows n8n del CRM

n8n es la **capa de integración** del CRM: cubre lo que Supabase no hace por sí
solo (email SMTP/IMAP, IA de Claude, búsqueda de prospectos y el intake del
formulario web público). **No es la base de datos**: el CRUD del negocio vive en
Supabase (ver `docs/ARQUITECTURA.md`). El cliente los consume vía
`src/services/crmApi.ts`.

> Tras la migración a Supabase, los webhooks de escritura a Google Sheets
> (crear/editar leads, campañas, contactos, notas, pipeline) quedaron sin
> consumidores en el frontend. Lo que sigue vivo se detalla abajo.

## Inventario (workflows versionados en esta carpeta)

| Archivo | Webhook | Estado | Uso actual |
|---------|---------|--------|-----------|
| `CRM_API_Leer_Sheets.json` | `GET /webhook/crm-sheets-read?sheet=:tab` | ✅ Vivo | Lee la hoja `search_log` (historial de búsquedas) y `config` (ping). El resto de hojas ya no se leen. |
| `CRM_API_Escribir_Sheets.json` | `POST /webhook/crm-sheets-write` | ✅ Vivo (parcial) | Solo las acciones de IA: `puntuar_lead` y `analizar_lead` (Claude puntúa/analiza; el resultado se persiste en Supabase). Las demás acciones de escritura a Sheets están sin uso. |
| `CRM_API_Web_Lead.json` | `POST /webhook/crm-web-lead` | ✅ Vivo | Intake del **formulario web público** (`deploy/web-form-snippet.html`): dedup + anti-spam (Turnstile) → inserta en `web_leads` (Supabase). La *gestión* de web leads en el dashboard ya usa Supabase directo, no este webhook. |
| `CRM_API_Tareas.json` | `POST /webhook/crm-tarea` | 🟡 Huérfano | El dashboard ya **no** llama a `/crm-tarea` (el módulo Tareas usa `tasksService`/Supabase). Candidato a desactivar en n8n **si** ninguna otra automatización lo dispara. Confirmar antes de eliminar. |

## Workflows vivos NO versionados aquí (⚠️ falta backup)

El frontend llama a estos webhooks, pero sus workflows no están exportados en el
repo. **Recomendación: exportarlos a esta carpeta** para tener backup versionado.

| Webhook | Uso |
|---------|-----|
| `POST /webhook/crm-generate-ai` | Genera asunto+cuerpo de outreach con Claude. |
| `POST /webhook/crm-send-reply` | Envía respuesta de email (SMTP), con adjunto opcional. |
| `POST /webhook/crm-buscar-leads` | Dispara captación de prospectos (Apify). |

Además, la bandeja de entrada (`inbox_messages`) la alimenta un workflow de IMAP
que inserta en Supabase con `service_role` (fuera de `crmApi`).

## Importar / configurar

1. En n8n: **Workflows → Import from File**.
2. En los nodos de Google Sheets, confirma la credencial "Google Sheets account"
   (el JSON referencia `id: 86m52fKwvUB07q9D`; reasígnala si difiere).
3. `documentId` del Sheet residual (solo `search_log`):
   `1N8bL-ujDDg9hF9gqV0mQrD94AZeh_QItJ-Aft2Xd7NE`.
4. **Activa** los workflows vivos.

En desarrollo el frontend llega a los webhooks vía el proxy de Vite
(`/n8n-hook` → `http://localhost:5678/webhook`), evitando CORS.

## Formato de respuesta de lectura

```json
{ "rows": [ { "ID Msg": "…", "Fecha": "…", "Ciudad": "…" }, … ] }
```

`crmApi.readSheet` también acepta un array de objetos directo.

## Token opcional

Para proteger los webhooks, valida el header `X-CRM-TOKEN` en un nodo Code al
inicio y define `VITE_N8N_HOOK_TOKEN` en el `.env` del frontend con el mismo valor.
