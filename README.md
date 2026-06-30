# JDDeveloper CRM

Dashboard CRM central de **JDDeveloper** — agencia de desarrollo web, AI y automatización.
Escalable para múltiples nichos (real estate, restaurantes, clínicas, abogados…) y campañas simultáneas.

Construido con la paleta y tipografía extraídas de [juanduverge.webflow.io](https://juanduverge.webflow.io/)
para que se sienta como una extensión natural de la marca.

## Stack

React 18 · Vite · TypeScript · Tailwind CSS · React Router v6 · Zustand · TanStack Query ·
Axios · Recharts · Framer Motion · dnd-kit · React Hook Form + Zod · Lucide · React Hot Toast.

## Paleta de marca (extraída del CSS de Webflow)

| Token            | Hex       | Uso                       |
|------------------|-----------|---------------------------|
| Crema            | `#fdf5ef` | Fondo principal (light)   |
| Crema soft       | `#fef6f0` | Superficies               |
| Dark grey        | `#161616` | Texto principal           |
| Coral            | `#ff7448` | Acento / CTA              |
| Quemado          | `#ef6820` | Hover / activo            |
| Mandarina        | `#f38744` | Acento cálido             |
| Violeta          | `#6248ff` | Acento secundario         |

Fuente: **Relative** (fallback Inter). Ver `src/styles/brand.js`.

## Instalación

```bash
npm install
cp .env.example .env   # completa las variables
npm run dev            # http://localhost:3000
```

## Variables de entorno

Ver `.env.example`. Las más importantes:

- `VITE_APP_PASSWORD` — contraseña de acceso (default `JDDeveloper2026`).
- `VITE_N8N_URL` / `VITE_N8N_API_KEY` — conexión a n8n (header `X-N8N-API-KEY`), usada por
  el tab Automatizaciones (listar/activar/ejecutar workflows, ver ejecuciones).
- `VITE_N8N_HOOK_TOKEN` — token opcional que validan los webhooks proxy de Sheets
  (ver `n8n/README.md`). Déjalo vacío si tus webhooks no validan token.
- `VITE_GOOGLE_SHEETS_ID` / `VITE_GOOGLE_API_KEY` — lectura directa de Google Sheets
  (fallback si los webhooks de n8n no están disponibles).
  - Cadena de datos: **webhooks n8n → Sheets API directa → datos de ejemplo**, en ese orden.
  - Para datos en vivo sin n8n: crea una API key en Google Cloud (Sheets API v4) y comparte
    el Sheet como "cualquiera con el enlace puede ver".

> En desarrollo, las llamadas a n8n pasan por el proxy de Vite (`/n8n-api` para la API REST,
> `/n8n-hook` para los webhooks de Sheets) para evitar CORS.

## Conexión real a Google Sheets (proxy n8n)

Los workflows importables están en `n8n/` (`CRM_API_Leer_Sheets.json`,
`CRM_API_Escribir_Sheets.json`). Impórtalos en tu instancia de n8n, actívalos, y el
frontend leerá/escribirá en el Sheet sin necesitar una API key de Google en el cliente.
Detalle de endpoints en [`n8n/README.md`](n8n/README.md).

## Scripts

```bash
npm run dev       # servidor de desarrollo (puerto 3000)
npm run build     # build de producción -> /dist
npm run preview   # previsualiza el build
```

## Deploy a Hostinger (jddeveloper.com/crm)

1. `npm run build` genera `/dist` (rutas relativas, `base: './'`).
2. Sube el contenido de `/dist` a `public_html/crm/` en Hostinger (File Manager o FTP).
3. Crea `public_html/crm/.htaccess` para el routing SPA:

   ```apache
   <IfModule mod_rewrite.c>
     RewriteEngine On
     RewriteBase /crm/
     RewriteRule ^index\.html$ - [L]
     RewriteCond %{REQUEST_FILENAME} !-f
     RewriteCond %{REQUEST_FILENAME} !-d
     RewriteRule . /crm/index.html [L]
   </IfModule>
   ```
4. Configura las variables en build (n8n debe ser accesible públicamente por HTTPS,
   no `localhost`, en producción).

## Estructura

```
src/
  features/       una carpeta por tab (dashboard, leads, pipeline, campaigns, automations, …)
  components/ui   componentes reutilizables (Button, Modal, Card…)
  components/layout  Sidebar, Topbar, CommandPalette, AppLayout
  lib/            utils, config, pipeline, campaigns, automations (helpers de cada feature)
  hooks/          useData (React Query)
  services/       n8nService, sheetsService, crmApi (proxy Sheets), mockData
  store/          Zustand (auth, ui, leads, campaigns)
  styles/         brand.js + index.css (tokens de tema)
  types/          tipos del dominio (mapeados a las hojas)
n8n/              workflows importables del proxy de Sheets + README de setup
```

## Estado por fases

Ver [`docs/ESTADO.md`](docs/ESTADO.md) para el detalle de qué está 100% funcional
y qué es estructura visual pendiente.
