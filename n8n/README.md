# Workflows n8n del CRM

n8n es la **capa de integración** del CRM: cubre lo que Supabase no hace por sí
solo (email SMTP/IMAP, IA de Claude, búsqueda de prospectos y el intake del
formulario web público). **No es la base de datos**: el CRUD del negocio vive en
Supabase (ver `docs/ARQUITECTURA.md`). El cliente los consume vía
`src/services/crmApi.ts`.

## Convención de nombres

- **Archivo** = nombre del webhook que respalda (`<webhook>.json`). El path del
  webhook es el contrato estable con el frontend, así que el nombre del archivo
  es auto-documentado y no cambia aunque se refactorice el interior.
- **Nombre del workflow dentro de n8n**: `CRM API · <Propósito>` (legible).

> ⚠️ **Estos JSON pueden estar desfasados respecto al n8n en vivo.** Son exports
> de la etapa Google Sheets. Antes de confiar en ellos, verifica el estado real
> con el checklist de abajo.

## Inventario

| Archivo | Webhook | Nombre en n8n | Estado |
|---------|---------|---------------|--------|
| `crm-sheets-read.json` | `GET /webhook/crm-sheets-read` | CRM API · Lectura (search_log) | ✅ Vivo. Lee la hoja `search_log` y `config` (ping). |
| `crm-sheets-write.json` | `POST /webhook/crm-sheets-write` | CRM API · Escritura + Scoring IA | 🟠 Vivo **parcial**. 87 nodos; solo la rama `puntuar_lead`/`analizar_lead` (Claude) se usa. El resto (pipeline/lead/campaign/config/contacto/nota CRUD a Sheets) está sin consumidores. |
| `crm-web-lead.json` | `POST /webhook/crm-web-lead` | CRM API · Intake Formulario Web | ✅ Vivo (intake). ⚠️ En este export guarda en **Google Sheets**; verificar si en vivo ya escribe a Supabase (`web_leads`). |
| `crm-tarea.json` | `POST /webhook/crm-tarea` | CRM API · Tareas (LEGACY) | 🔴 Huérfano. El dashboard usa `tasksService`/Supabase; nada llama a `/crm-tarea`. |

### Workflows vivos SIN backup en el repo (exportar)

El frontend los llama pero no están versionados. Expórtalos desde n8n a esta
carpeta con el mismo criterio de nombres:

| Webhook | Archivo objetivo | Propósito |
|---------|------------------|-----------|
| `POST /webhook/crm-generate-ai` | `crm-generate-ai.json` | Genera outreach con Claude. |
| `POST /webhook/crm-send-reply` | `crm-send-reply.json` | Envía email (SMTP). |
| `POST /webhook/crm-buscar-leads` | `crm-buscar-leads.json` | Captación (Apify). |

---

## Checklist: verificar el estado real en el n8n en vivo

Para cada workflow, ábrelo en la UI de n8n (`backoffice.jddeveloper.com`) y anota:

1. **¿Dónde persiste?** Busca el nodo de guardado:
   - Nodo tipo **Google Sheets** o **HTTP Request** a `sheets.googleapis.com`
     → todavía escribe a **Sheets** (desfase con la app).
   - Nodo **Supabase** / **Postgres** / **HTTP Request** a `*.supabase.co`
     → ya migrado (correcto).
2. **¿Está activo?** (toggle Active arriba a la derecha).
3. **¿Nombre?** Renómbralo a la columna "Nombre en n8n" de la tabla.
4. **Exporta** (⋯ → Download) y reemplaza el `.json` de esta carpeta.

Rellena esta tabla al verificar:

| Workflow | Persiste en | ¿Activo? | ¿Renombrado? | ¿Re-exportado? |
|----------|-------------|----------|--------------|----------------|
| crm-sheets-read | | | | |
| crm-sheets-write | | | | |
| crm-web-lead | | | | |
| crm-tarea | | | | |

---

## Qué hacer con lo que no se usa

- **`crm-tarea` (huérfano)**: una vez confirmes que ninguna otra automatización
  lo dispara, **desactívalo** en n8n (no lo borres de golpe). Déjalo inactivo un
  tiempo; si nada se rompe, elimínalo y borra `crm-tarea.json`.
- **Ramas muertas de `crm-sheets-write`**: el 85 % de sus 87 nodos (CRUD a
  Sheets) ya no se llama. En lugar de podar ese monstruo, la vía limpia es
  **extraer la rama de Scoring IA a su propio workflow** (`crm-scoring-ia`) y
  retirar `crm-sheets-write` cuando `search_log` deje de leerse. Proyecto aparte.
- **`crm-sheets-read`**: seguirá vivo mientras el historial de búsquedas viva en
  Sheets. Cuando `search_log` migre a Supabase, se retira.

## Importar / configurar

1. En n8n: **Workflows → Import from File**.
2. Revisa credenciales (Google Sheets / Supabase / SMTP) en cada nodo.
3. Activa los workflows vivos.

En desarrollo el frontend llega a los webhooks vía el proxy de Vite
(`/n8n-hook` → `http://localhost:5678/webhook`), evitando CORS.

## Token opcional

Para proteger los webhooks, valida el header `X-CRM-TOKEN` en un nodo Code al
inicio y define `VITE_N8N_HOOK_TOKEN` en el `.env` del frontend con el mismo valor.
