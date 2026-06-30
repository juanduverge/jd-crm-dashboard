# Arquitectura — JDDeveloper CRM

## Visión general

SPA en **React 18 + Vite + TypeScript**, organizada por *features* (una carpeta por
tab del dashboard). El estado global vive en **Zustand** (con persistencia en
localStorage) y los datos remotos se gestionan con **TanStack Query** (caché +
refetch cada 30s). El estilo usa **Tailwind** con tokens de tema derivados de la
marca JDDeveloper.

## Árbol de carpetas

```
jd-crm-dashboard/
├── index.html                 # Entry HTML (favicon = logo JD, manifest PWA)
├── vite.config.ts             # Puerto 3000, alias @, proxy /n8n-api, base './'
├── tailwind.config.js         # Colores de marca + tokens semánticos
├── tsconfig.json              # Paths @/* , strict
├── .env / .env.example        # Variables de entorno
├── public/
│   ├── .htaccess              # Routing SPA para Hostinger
│   └── manifest.webmanifest   # PWA
├── docs/                      # Esta documentación
└── src/
    ├── main.tsx               # Bootstrap: Router + QueryClient + tema
    ├── App.tsx                # Definición de rutas + Toaster
    ├── vite-env.d.ts          # Tipos de import.meta.env
    │
    ├── features/              # UNA CARPETA POR TAB
    │   ├── auth/              # LoginPage
    │   ├── dashboard/         # DashboardPage, KpiCard  (🏠 Resumen)
    │   ├── leads/             # LeadsPage, LeadForm, LeadDrawer, leadSchema
    │   ├── campaigns/         # CampaignsPage          (Fase 2)
    │   ├── pipeline/          # PipelinePage           (Fase 2)
    │   ├── inbox/             # InboxPage              (Fase 3)
    │   ├── messages/          # MessagesPage           (Fase 3)
    │   ├── automations/       # AutomationsPage        (Fase 3)
    │   ├── analytics/         # AnalyticsPage          (Fase 4)
    │   └── settings/          # SettingsPage           (Fase 4)
    │
    ├── components/
    │   ├── ui/                # Button, Input, Card, Badge, Modal, Drawer, Skeleton, EmptyState
    │   └── layout/            # AppLayout, Sidebar, Topbar, CommandPalette, PageHeader, Placeholder, navItems
    │
    ├── hooks/
    │   └── useData.ts         # useLeads, useMessages, useWorkflows, useExecutions, useCampaigns, useActivity
    │
    ├── services/
    │   ├── n8nService.ts      # API n8n
    │   ├── sheetsService.ts   # Google Sheets (con fallback)
    │   └── mockData.ts        # Datos de ejemplo
    │
    ├── store/
    │   ├── authStore.ts       # Login, sesión, roles (persist)
    │   ├── uiStore.ts         # Tema, sidebar, densidad, idioma, Cmd+K (persist)
    │   └── leadsStore.ts      # Leads + selección + mutaciones optimistas
    │
    ├── lib/
    │   ├── config.ts          # Config central (env, pipeline stages, nichos)
    │   └── utils.ts           # cn, formatos, scoreColor, fuzzyMatch, CSV…
    │
    ├── types/
    │   └── index.ts           # Lead, Message, Campaign, WorkflowInfo, Kpi…
    │
    └── styles/
        ├── brand.js           # Paleta + tipografía extraída de la web
        └── index.css          # Tokens de tema (light/dark) + clases base
```

## Flujo de datos

```
Google Sheets / n8n
        │  (axios)
        ▼
   services/*          ← capa de acceso a datos, aislada
        │
        ▼
   hooks/useData       ← TanStack Query (caché, refetch 30s)
        │
        ▼
   store/ (Zustand)    ← estado UI + mutaciones optimistas
        │
        ▼
   features/*          ← componentes de cada tab
```

## Decisiones de diseño

- **Features-first**: cada tab es autónoma → escala a múltiples nichos/campañas sin
  acoplar. Agregar una integración nueva = nuevo archivo en `services/` + hook.
- **Servicios aislados con fallback**: la UI siempre es demostrable aunque falten
  credenciales (datos mock con el esquema real).
- **Tokens de tema** (`--bg`, `--surface`, `--fg`…) → claro/oscuro sin duplicar estilos.
- **Roles desde el día 1** (`authStore`: admin/vendedor/viewer) para multi-usuario futuro.
- **Tipos centralizados** mapeados a las columnas reales de las hojas.

## Tecnologías

| Capa | Librería |
|------|----------|
| UI | React 18, Tailwind, componentes propios estilo shadcn |
| Routing | React Router v6 |
| Estado | Zustand (+ persist) |
| Datos remotos | TanStack Query + Axios |
| Gráficos | Recharts |
| Animación | Framer Motion |
| Kanban (Fase 2) | dnd-kit |
| Formularios | React Hook Form + Zod |
| Iconos | Lucide React |
| Notificaciones | React Hot Toast |
| i18n (futuro) | i18next |
