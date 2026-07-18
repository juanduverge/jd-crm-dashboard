# Arquitectura — JD Developer CRM

> Documento autoritativo de arquitectura. Fecha: 2026-07-18.
> Sustituye a los docs históricos dispersos (`ESTADO.md`, `EXPLICACION_PROYECTO.md`,
> `DEPLOY.md`, `ESTRUCTURA.md`…), varios de ellos desactualizados. Ver
> [Plan de limpieza](./PLAN_LIMPIEZA.md) para el detalle de qué docs se archivan.

---

## 1. Visión general

CRM interno de una agencia de desarrollo web / IA / automatización. SPA de React
que gestiona el ciclo completo de captación: leads → pipeline → outreach por
email → mensajería → tareas, con puntuación por IA y un formulario web público
que inyecta leads entrantes.

**No es un SaaS multi-tenant.** Es una herramienta de equipo interno, protegida
por Cloudflare Access (Zero-Trust) en el borde y Supabase Auth en la aplicación.

### Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript 5.7, Vite 6 |
| Estado servidor | TanStack Query 5 |
| Estado cliente | Zustand 5 (auth, ui, leads) |
| Formularios | React Hook Form + Zod |
| Estilos | Tailwind 3 + `clsx`/`tailwind-merge` (helper `cn()`) |
| Gráficos | Recharts 2 |
| Drag & drop | `@dnd-kit` (Kanban del pipeline) |
| Backend datos | **Supabase** (Postgres + Auth + RLS) |
| Automatización / email / IA | **n8n** (webhooks + workflows) |
| Deploy | Docker + nginx en Oracle Cloud, expuesto por Cloudflare |

---

## 2. Flujo del sistema

```
Formulario web público ──POST webhook──> n8n ──insert──> Supabase (web_leads)
                                                              │
Navegador (SPA, tras Cloudflare Access) ──Supabase JS──────> Supabase (Postgres + RLS)
        │                                                     ▲
        │  acciones de integración (no-datos):                │ service_role
        └──/n8n-hook (webhooks)──> n8n ──SMTP/IMAP/Claude──────┘
           · sendReply (email saliente)
           · generateWithAI / puntuarLead (IA)
           · buscarLeads (scraping/búsqueda)
```

Regla mental clave: **los datos viven en Supabase; n8n es la capa de integración**
(enviar/recibir email, llamar a la IA, buscar leads). Nada de negocio se almacena
ya en Google Sheets.

---

## 3. Estructura de carpetas

```
src/
  app/ (App.tsx)      Composición de rutas, RequireAuth, layout raíz
  components/
    charts/           Tema y componentes Recharts (chartTheme, ConversionFunnel…)
    layout/           AppLayout, Topbar, CommandPalette, NotificationBell, PageHeader
    ui/               Primitivas: Button, Input, Select, Modal, Badge, Skeleton…
  features/           Un módulo por dominio (co-locación de vista + lógica)
    analytics/  auth/  campaigns/  dashboard/  inbox/  leads/
    messages/  pipeline/  settings/  tareas/  trash/  webleads/
  hooks/
    useData.ts        Hub de hooks de TanStack Query (useLeads, useMessages…)
  lib/
    config.ts         Configuración central desde env (VITE_*)
    supabaseClient.ts Cliente Supabase único
    utils.ts          Helpers puros (cn, formatCurrency, initials, stringToColor…)
    automations.ts    campaigns.ts  pipeline.ts  (lógica de dominio pura)
  services/           Capa de acceso a datos (una fachada por dominio)
  store/              Zustand: authStore, uiStore, leadsStore
  types/index.ts      Tipos de dominio (Lead, Message, Campaign, Tarea…)
  styles/             Estilos globales / marca
```

**Convención de módulos `features/`**: cada carpeta agrupa su página (`XxxPage.tsx`),
sus componentes locales y su esquema Zod. La lógica reutilizable sube a `lib/`;
el acceso a datos siempre pasa por `services/`.

---

## 4. Capa de datos (servicios)

Toda lectura/escritura de datos pasa por un servicio en `src/services/`. Los
componentes **no** hablan con Supabase directamente; consumen hooks de
`hooks/useData.ts`, que a su vez llaman a los servicios.

| Servicio | Respaldo | Responsabilidad |
|----------|----------|-----------------|
| `leadsService` | Supabase | CRUD de leads, contactos, notas, papelera |
| `pipelineService` | Supabase | Etapas (denormalizadas en `leads`) + `pipeline_events` |
| `campaignsService` | Supabase | Campañas de outreach |
| `messagesService` | Supabase | Hilos = `outreach_messages` + `inbox_messages` |
| `inboxService` | Supabase | Bandeja de entrada IMAP |
| `settingsService` | Supabase | Configuración (`settings`) |
| `tasksService` | Supabase | Módulo de tareas |
| `webLeadsService` | Supabase | Leads del formulario web |
| `n8nService` | n8n API | Estado de workflows (vía proxy nginx `/n8n-api`) |
| `crmApi` | n8n webhooks | **Solo integración**: `sendReply`, `generateWithAI`, `buscarLeads`, `ping` |
| `sheetsService` | Google Sheets (vía `crmApi`) | ⚠️ **LEGADO — código muerto**, ver §8 |

### 4.1 Estado del legado Google Sheets

La migración de datos a Supabase está **completa**. `sheetsService` y
`crmApi.readSheet` ya no tienen consumidores reales (el único método vivo es
`sheetsService.isLive()`, usado para un texto cosmético en el dashboard). Están
marcados para eliminación en el [Plan de limpieza](./PLAN_LIMPIEZA.md).

---

## 5. Base de datos (Supabase)

Migraciones versionadas en `supabase/migrations/` (aplicar en orden):

| Archivo | Contenido |
|---------|-----------|
| `0001_schema.sql` | Esquema base (leads, mensajes, inbox…) |
| `0002_rls.sql` | Row-Level Security |
| `0003_functions.sql` | Funciones/RPC |
| `0004_auth.sql` | Integración con Supabase Auth |
| `0005/0006_hardening` | Endurecimiento de permisos |
| `0007_leads_module.sql` | Módulo Leads (contactos, notas) |
| `0008_pipeline_module.sql` | Pipeline denormalizado + `pipeline_events` |
| `0009_web_leads_module.sql` | Leads del formulario web |
| `0010_tasks_module.sql` | Tareas |
| `0012_messages_inbox_module.sql` | Outreach + inbox |

> **Nota**: no existe `0011`. Verificar si fue un número saltado
> intencionalmente o una migración perdida (ver Plan de limpieza).

RLS activo en todas las tablas. La `service_role` la usan solo n8n / Edge
Functions para insertar inbox entrante; nunca el navegador.

---

## 6. Autenticación

Dos capas complementarias:

1. **Cloudflare Access (borde)**: nadie carga la SPA ni el bundle sin pasar
   Google Sign-In de Access. Cierra el acceso a nivel de red. Es la frontera de
   seguridad real.
2. **Supabase Auth (aplicación)**: sesión de usuario dentro de la app
   (`store/authStore.ts` + `RequireAuth`). Sustituyó al login por contraseña en
   cliente (falsificable) que existía antes de la auditoría.

`VITE_APP_PASSWORD` es **legacy** y está en retirada; no debe usarse.

---

## 7. Integraciones externas

| Integración | Uso | Dónde |
|-------------|-----|-------|
| **Supabase** | DB + Auth + RLS | `lib/supabaseClient.ts`, todos los `*Service` |
| **n8n** | Email (SMTP/IMAP), IA (Claude), búsqueda | `crmApi`, `n8nService`, workflows |
| **Claude (Anthropic)** | Puntuación y redacción IA — **vía n8n**, nunca directo | `crmApi.generateWithAI/puntuarLead` |
| **Cloudflare** | Access (auth borde) + túnel a Oracle | Infra, no en código |
| **Oracle Cloud** | Host del contenedor Docker | Infra (ver `deploy/`) |
| **Formulario web** | Captación pública → webhook n8n → `web_leads` | `deploy/web-form-snippet.html` |

### 7.1 Proxy de la API de n8n (seguridad)

La API key de n8n **nunca** está en el bundle. El cliente llama a `/n8n-api`
(mismo origen) y nginx inyecta `X-N8N-API-KEY` server-side
(`deploy/nginx.conf.template`). En desarrollo lo proxia Vite.

---

## 8. Variables de entorno

Todas las `VITE_*` se **hornean en el bundle** y son públicas (no son secretos).
La protección real es Cloudflare Access. Plantilla completa en `.env.example`.

| Variable | Estado | Notas |
|----------|--------|-------|
| `VITE_SUPABASE_URL` | ✅ activa | URL del proyecto |
| `VITE_SUPABASE_ANON_KEY` | ✅ activa | Llave publicable (segura en cliente) |
| `VITE_N8N_URL` | ✅ activa | Base de backoffice n8n |
| `VITE_WF_*` | ✅ activas | IDs de workflows |
| `VITE_BUSINESS_*` | ✅ activas | Datos de negocio (email, WhatsApp, booking) |
| `VITE_CLAUDE_VIA_N8N` | ✅ activa | Flag: IA solo vía n8n |
| `VITE_N8N_HOOK_TOKEN` | 🟡 opcional | Token `X-CRM-TOKEN` de webhooks |
| `VITE_APP_PASSWORD` | 🔴 legacy | Login viejo, en retirada |
| `VITE_GOOGLE_SHEETS_ID` | 🔴 legacy | Sheets ya no es la DB |
| `VITE_GOOGLE_API_KEY` | 🔴 legacy | Lectura directa de Sheets, sin uso |

Secretos que **NUNCA** van en `VITE_*` ni en el repo: `SUPABASE_SECRET_KEY`
(service_role) y la API key de n8n. Viven solo en n8n / nginx del servidor.

---

## 9. Build y deploy

```bash
npm run dev      # Vite dev server (proxy /n8n-api y /n8n-hook)
npm run build    # tsc -b && vite build → dist/
npm run preview  # sirve dist/ localmente
npm run lint     # ESLint
```

**Producción** (ver memoria del proyecto y `deploy/`):
- Imagen Docker multi-stage (`deploy/Dockerfile`) sirve `dist/` con nginx.
- nginx (`deploy/nginx.conf.template`) proxia `/n8n-api` (inyecta la API key) y
  aplica CSP con Supabase permitido.
- Host: Oracle Cloud (`129.159.191.41`), directorio `/home/ubuntu/jd-prod`.
- Dominios vía Cloudflare: CRM = `workspace.jddeveloper.com` (tras Access),
  n8n = `backoffice.jddeveloper.com`.
- Redeploy: `git pull` en el repo del server → `docker compose build crm-dashboard`
  → `docker compose up -d crm-dashboard`.

---

## 10. Mapa del código (grafo)

Grafo de conocimiento navegable del código en `graphify-out/`:
- `graph.html` — grafo interactivo (abrir en navegador).
- `GRAPH_REPORT.md` — nodos-dios, comunidades, conexiones.

Abstracciones centrales (nodos-dios): `cn()`, `formatCurrency()`, el tipo `Lead`,
`Button`, `useLeads()`. Sin ciclos de importación. El cliente `supabase` es el
puente entre las 7 comunidades de servicios (confirma Supabase como eje de datos).
