# API y Servicios — JDDeveloper CRM

Documentación de la capa de servicios (`src/services/`), endpoints externos y credenciales.

## Resumen

| Servicio | Archivo | Backend | Estado |
|----------|---------|---------|--------|
| n8n | `src/services/n8nService.ts` | n8n REST API v1 | ✅ Conectado |
| Google Sheets | `src/services/sheetsService.ts` | Sheets API v4 | ✅ Lectura (fallback mock) |
| Datos de ejemplo | `src/services/mockData.ts` | local | ✅ |
| Claude (Anthropic) | vía n8n | — | 🔜 Fase 3 |
| IMAP / SMTP | vía n8n | Hostinger | 🔜 Fase 3 |
| WhatsApp Business | vía n8n | — | 🔜 Fase 3 |

---

## 1. n8n — `n8nService.ts`

- **Base URL:** `http://localhost:5678/api/v1/` (en dev vía proxy Vite `/n8n-api`).
- **Auth:** header `X-N8N-API-KEY: <VITE_N8N_API_KEY>`.

| Método | Endpoint | Uso |
|--------|----------|-----|
| `listWorkflows()` | `GET /workflows?limit=100` | Lista workflows |
| `getWorkflow(id)` | `GET /workflows/:id` | Detalle |
| `setActive(id, active)` | `POST /workflows/:id/activate \| /deactivate` | Activar/desactivar |
| `run(id)` | `POST /workflows/:id/run` | Ejecutar manual |
| `listExecutions(wfId?, limit)` | `GET /executions` | Historial de ejecuciones |
| `ping()` | `GET /workflows?limit=1` | Test de conexión |

### Workflows existentes

| Workflow | ID |
|----------|-----|
| Fase 3 - Envío de Emails | `ITdsEWd94R8ptUlb` |
| Fase 4 - Seguimiento Email | `ZMQkvDXtD2tdMuYN` |
| Fase 4 - WhatsApp Seguimiento | `JM3bEVBWajjmcCvV` |

### Credenciales en n8n (no en el frontend)
- `Google Sheets account` — lectura/escritura del Sheet.
- `Anthropic - JDDeveloper` — Claude API.
- `WhatsApp API - JDDeveloper` — WhatsApp Business.
- `Email SMTP - JDDeveloper` — envío SMTP (Hostinger).

---

## 2. Google Sheets — `sheetsService.ts`

- **Endpoint:** `https://sheets.googleapis.com/v4/spreadsheets/:id/values/:tab?key=API_KEY`
- **Sheet ID:** `1N8bL-ujDDg9hF9gqV0mQrD94AZeh_QItJ-Aft2Xd7NE`
- **Auth:** API key (`VITE_GOOGLE_API_KEY`). El Sheet debe ser visible con enlace.
- **Fallback:** si no hay API key o falla, devuelve `mockData`.

| Método | Lee | Devuelve |
|--------|-----|----------|
| `getLeads()` | `prospects` + `pipeline` | `Lead[]` |
| `getMessages()` | `messages` | `Message[]` |
| `getConfig()` | `config` | `Record<string,string>` |
| `isLive()` | — | `boolean` (hay API key) |

### Hojas y columnas

**prospects** — `ID Lead, Fecha captura, Nombre empresa, Categoria / nicho, Ciudad, Pais, Direccion, Telefono, Email, Sitio web, Email Contacto, WhatsApp, Instagram, Facebook, LinkedIn, Google Maps URL, Rating Google, N. resenas, PageSpeed movil, PageSpeed desktop, Tiene SSL, Diagnostico IA, Score lead (0-100), Fuente Apify, Notas, Screenshot URL, Score Diseno IA, Score IA Promedio, Tu Calificacion (1-10), Score Final Combinado, Aprobado`

**outreach** — `ID Lead, Nombre empresa, Sitio web, Email Contacto, WhatsApp, Instagram, PageSpeed Movil, PageSpeed Desktop, Tiene SSL, Score Tecnico, Tu Calificacion (1-10), Score Diseno IA, Score Final Combinado, Screenshot URL, Diagnostico IA original, Nota IA Visual, Tu Nota, Asunto Email, Cuerpo Email, Estado, Fecha Envio`

**pipeline** — `ID Lead, Nombre empresa, Estado, Prioridad, Canal principal, Fecha primer contacto, Fecha ultimo contacto, Proximo seguimiento, Valor estimado (USD), Responsable, Notas`

**messages** — `ID Lead, Fecha, Canal, Tipo de mensaje, Mensaje generado, Estado envio, Respuesta recibida`

**config** — `Clave, Valor`

### Escritura
En v1 las mutaciones (agregar/editar/mover/eliminar lead) son **optimistas en el
store local** (`leadsStore`). La sincronización a Sheets se hará vía **webhook de n8n**
(usando la credencial `Google Sheets account`) en Fase 2.

---

## 3. Variables de entorno

Ver [`../.env.example`](../.env.example) para la lista completa.

| Categoría | Variables |
|-----------|-----------|
| Auth | `VITE_APP_PASSWORD` |
| n8n | `VITE_N8N_URL`, `VITE_N8N_API_KEY` |
| Sheets | `VITE_GOOGLE_SHEETS_ID`, `VITE_GOOGLE_API_KEY` |
| Workflows | `VITE_WF_ENVIO_EMAILS`, `VITE_WF_SEGUIMIENTO_EMAIL`, `VITE_WF_WHATSAPP_SEGUIMIENTO` |
| Negocio | `VITE_BUSINESS_EMAIL_MAIN`, `VITE_BUSINESS_EMAIL_OUTREACH`, `VITE_BUSINESS_WHATSAPP`, `VITE_BUSINESS_BOOKING` |

> 🔒 **Seguridad:** `.env` está en `.gitignore` y nunca se sube al repo.
> Las variables `VITE_*` quedan embebidas en el bundle del cliente — no pongas
> secretos de servidor; usa n8n como backend para Claude, SMTP, IMAP y WhatsApp.

---

## 4. Datos de negocio

| Dato | Valor |
|------|-------|
| Email principal | info@jddeveloper.com |
| Email outreach | sales@jddeveloper.com |
| WhatsApp | +1 849 576 4367 |
| Booking | https://calendar.app.google/QQ17ujMKjNXePb1a8 |
| Instagram | @jddeveloper_ |
| Web | https://jddeveloper.com |
| IMAP (Fase 3) | imap.hostinger.com:993 |
