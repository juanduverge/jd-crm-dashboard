# Auditoría Técnica Integral — JD Developer CRM

> Fecha: 2026-07-10 · Alcance: arquitectura, seguridad, despliegue, escalabilidad y readiness de producción.
> Basado en revisión directa del código (`src/`), workflows n8n, docs y la infraestructura Oracle+Cloudflare documentada en `ESTADO.md`. Sin suposiciones: cada hallazgo cita el archivo real.

---

## 0. Resumen ejecutivo (TL;DR)

El CRM es **un producto funcional impresionante para un solo operador (Juan)**, con un frontend React muy pulido y una automatización end-to-end real (Apify → Sheets → outreach → seguimiento) orquestada en n8n. **Como MVP interno, funciona.**

**Como SaaS multi-cliente listo para producción, NO lo está todavía.** Hay tres bloqueadores de seguridad *críticos* que deben resolverse antes de exponerlo a cualquier usuario que no seas tú, y una decisión arquitectónica de fondo (Google Sheets como base de datos + ausencia de backend propio) que limita el crecimiento.

**Veredicto:** listo para uso interno hoy; **6–10 semanas de trabajo** para ser un SaaS defendible.

| Área | Estado |
|------|--------|
| Frontend / UX | 🟢 Muy bueno |
| Automatización (n8n) | 🟢 Sólida y real |
| Autenticación | 🔴 Crítico — sin seguridad real |
| Protección de APIs / secretos | 🔴 Crítico — claves en el bundle |
| Backend / datos | 🟠 Sheets no escala como DB |
| CI/CD | 🟠 Manual |
| Observabilidad / backups | 🟠 Incompleto |

---

## 1. Auditoría de arquitectura

### 1.1 Estado actual (mapa real)

```
Navegador (SPA React/Vite)
   │  workspace.jddeveloper.com  (nginx en Docker, Oracle Cloud)
   │
   ├── /n8n-api  ──► n8n REST API   (X-N8N-API-KEY en el bundle) ⚠️
   └── /n8n-hook ──► n8n Webhooks    (token X-CRM-TOKEN opcional) ⚠️
                          │
                          ├── Google Sheets  (la "base de datos")
                          ├── SMTP/IMAP Hostinger (emails)
                          ├── WhatsApp Cloud API
                          ├── Anthropic Claude (generación IA)
                          └── Apify (scraping de leads)
```

- **Frontend**: React 18 + Vite 6 + TypeScript + Zustand + React Query + Tailwind. Organización **feature-first** (`src/features/*`), servicios aislados en `src/services/`, tipos centralizados en `src/types`. Esto está **bien hecho** y es mantenible.
- **"Backend"**: no existe un backend propio. n8n hace de capa de integración y Google Sheets hace de base de datos. Toda la lógica de negocio de escritura vive en workflows n8n.

### 1.2 Fortalezas

- ✅ Separación de responsabilidades clara en el frontend (features / services / store / lib / types).
- ✅ Code splitting por ruta (`lazy()` + `Suspense`) — confirmado en Fase 6.
- ✅ Validación de formularios con Zod + react-hook-form.
- ✅ React Query para estado de servidor (cache, refetch, polling) — buena elección.
- ✅ Sin datos mock ocultos: la UI muestra error explícito si n8n cae (buena honestidad de datos).

### 1.3 Debilidades arquitectónicas

| # | Problema | Impacto | Recomendación |
|---|----------|---------|---------------|
| A1 | **No hay backend propio.** El navegador habla directo con n8n. | El cliente es la frontera de seguridad → imposible proteger secretos o autorizar de verdad. | Introducir un backend delgado (ver 1.4). |
| A2 | **Google Sheets como base de datos.** | Sheets no tiene transacciones, tipos, índices, ni control de concurrencia. `append` con múltiples usuarios = condiciones de carrera y filas duplicadas. Límite ~10M celdas y cuotas de API. | Migrar a Postgres (ya tienes `postgres:16` corriendo en Oracle para n8n). |
| A3 | **Lógica de negocio dispersa en workflows n8n** (JSON), difícil de versionar/testear. Los `n8n/*.json` del repo están **desincronizados** con producción (documentado en Fase 4/7). | Sin fuente de verdad; cambios no auditables en Git; no hay tests. | Exportar workflows a Git como parte del deploy; o mover lógica crítica al backend. |
| A4 | Acoplamiento del frontend a IDs de workflow hardcodeados (`config.workflows.*`). | Frágil ante recreación de workflows. | Resolver por nombre/tag, o servir desde config del backend. |

### 1.4 Arquitectura objetivo recomendada (SaaS)

Introducir un **backend delgado** (BFF — Backend For Frontend) entre el navegador y n8n/datos:

```
Navegador ──► API propia (Node/Fastify o similar)  ──► Postgres
                     │                               └─► n8n (server-to-server, API key SÓLO aquí)
                     └─ JWT/sesión, RBAC, rate limit, validación
```

Ventajas: los secretos (API key n8n, tokens) dejan de estar en el navegador; la autenticación y los permisos se vuelven reales; puedes cachear, auditar y limitar. n8n queda **detrás** del backend, nunca expuesto al cliente. Postgres ya está desplegado, sólo hay que usarlo para el CRM (no sólo para n8n).

> Alternativa de menor esfuerzo si no quieres mantener un backend: **Supabase** (Postgres + Auth + RLS + Edge Functions gestionados). Cubre auth, base de datos y API de una sola vez, y tienes el conector MCP ya disponible. Es probablemente el mejor coste/beneficio para tu caso.

---

## 2. Mapa de conexiones e integraciones

| Integración | Cómo se conecta hoy | Punto débil |
|-------------|--------------------|-------------|
| **n8n (API REST)** | Navegador → `/n8n-api` con `X-N8N-API-KEY` **en el bundle** | 🔴 API key expuesta a cualquiera que abra la app |
| **n8n (webhooks CRM)** | Navegador → `/n8n-hook`, header `X-CRM-TOKEN` **opcional** (vacío por defecto) | 🔴 Escritura/envío/scraping sin auth si el token no está forzado |
| **Google Sheets** | n8n con credencial `googleSheetsOAuth2Api` (server-side) | 🟢 Bien (server-side). 🟠 Escala/concurrencia |
| **SMTP/IMAP Hostinger** | n8n (envío + lectura inbox) | 🟠 Deliverability: DMARC incompleto (`p=none`, sin `rua`) |
| **WhatsApp Cloud API** | n8n (Graph API) | 🟢 Credencial server-side |
| **Anthropic Claude** | n8n `httpRequest` + credencial Anthropic | 🟢 Server-side |
| **Apify** | n8n → actor `compass~crawler-google-places` / `apify~google-search-scraper` | 🟠 Coste: cada búsqueda quema créditos; webhook sin auth = abuso posible |
| **Cloudflare** | Túnel saliente `jd-prod`, ingress dual (backoffice/workspace) | 🟢 Buen patrón (nada expuesto en la VCN) |
| **Oracle Cloud** | VM Ampere, Docker Compose (postgres, n8n, dashboard, cloudflared) | 🟠 Crédito de prueba **1 mes** — planificar coste post-trial |
| **GitHub** | Repo de código; deploy manual | 🟠 Sin CI/CD |
| Make / HubSpot / Webflow | Mencionados pero **no integrados en el código** | — (no hay deuda; sólo aclarar alcance) |

**Dependencias innecesarias / a vigilar:** Make y HubSpot aparecen en el brief pero no en el código — no dupliques con n8n salvo necesidad clara. Google Sheets API directa (`VITE_GOOGLE_API_KEY`) es un camino redundante ahora que todo va por n8n; conviene eliminarlo para reducir superficie.

---

## 3. GitHub y flujo de desarrollo (cómo llega el código a producción HOY)

**Realidad actual (manual):**

```
Código local ──► git commit ──► git push a GitHub
                                      │
                                (paso manual)
                                      ▼
              SSH al servidor Oracle (129.159.191.41)
                                      │
                    git pull + docker compose build + up
                                      ▼
              nginx sirve el nuevo bundle en workspace.jddeveloper.com
```

- **GitHub** hoy = sólo repositorio/backup del código. No dispara nada.
- **Servidor Oracle** = hace `build` del dashboard (Vite→nginx) y corre n8n+Postgres vía Docker Compose.
- ⚠️ **Nota:** `docs/DEPLOY.md` está **obsoleto** — describe subir `/dist` a Hostinger por FTP, pero la infra real ya es Oracle+Cloudflare (ver `ESTADO.md`). **Actualizar o borrar `DEPLOY.md`** para evitar confusión.
- ⚠️ Los `VITE_*` se **hornean en el build**; cambiar un secreto exige rebuild+redeploy.

---

## 4. Despliegue automático (CI/CD) — propuesta

**Sí, se puede y se debe.** Recomendación con **GitHub Actions** (el repo ya está en GitHub):

**Pipeline propuesto:**
1. `on: push a main` → job de CI: `npm ci`, `tsc -b --noEmit`, `npm run lint`, `npm run build`. Bloquea si falla.
2. Job de CD: SSH al servidor Oracle (o `docker context`) → `git pull` + `docker compose up -d --build dashboard`.
3. Secretos (`VITE_*`, host SSH, clave) en **GitHub Actions Secrets**, nunca en el repo.

**Ventajas:** cero pasos manuales, build reproducible, historial de despliegues, rollback (redeploy de un commit anterior).

**Riesgos y mitigación:**
- Clave SSH en GitHub → usar una clave dedicada de deploy con permisos mínimos; o GitHub OIDC.
- Deploy roto en producción → añadir healthcheck post-deploy y mantener la imagen anterior para rollback.
- Con el backend/Postgres futuro → añadir paso de **migraciones** al pipeline.

**Config mínima necesaria:** `.github/workflows/deploy.yml`, secrets (`SSH_HOST`, `SSH_KEY`, `VITE_*`), y `docker compose` idempotente en el servidor (ya lo tienes).

---

## 5. Seguridad — revisión completa

| Aspecto | Estado | Nota |
|--------|--------|------|
| **Autenticación** | 🔴 | Contraseña única `JDDeveloper2026` comparada **en el cliente** (`config.ts:4`, `authStore.ts:30`). Está en el bundle → cualquiera la extrae. |
| **Autorización / roles** | 🔴 | Roles (`admin/vendedor/viewer`) existen en el tipo pero **no se aplican**; el usuario siempre entra como `admin`. Cosméticos. |
| **Gestión de sesiones** | 🔴 | `isAuthenticated` en localStorage sin firma → poner `true` a mano salta el login. Sin expiración. |
| **Protección de APIs** | 🔴 | `X-N8N-API-KEY` en el bundle (`n8nService.ts:8`) = control total de workflows. Webhooks con token **opcional** vacío (`crmApi.ts:23`, `n8n/README.md:42`). |
| **Variables de entorno / secretos** | 🔴 | El propio `DEPLOY.md:26` advierte que los `VITE_*` son públicos… y aun así se meten `VITE_APP_PASSWORD` y `VITE_N8N_API_KEY`. |
| **HTTPS** | 🟢 | Cloudflare fuerza HTTPS en ambos hostnames. |
| **CORS** | 🟠 | Mitigado por proxy en dev; en prod revisar que n8n no acepte orígenes arbitrarios. |
| **Rate limiting** | 🔴 | Ninguno. Webhooks públicos → abuso de envío de email / créditos Apify. |
| **Validación de datos** | 🟡 | Buena en frontend (Zod), pero **la validación de frontend no es seguridad**: los webhooks aceptan payloads directos. |
| **XSS** | 🟡 | React escapa por defecto; verificar que no haya `dangerouslySetInnerHTML` y sanear el HTML del opt-out. |
| **CSRF** | 🟠 | Menos relevante sin cookies de sesión; se vuelve relevante al añadir auth con cookies. |
| **SQL Injection** | 🟢 (hoy) | No hay SQL. Aplicará al migrar a Postgres → usar queries parametrizadas/ORM. |
| **Fuerza bruta** | 🔴 | Sin límite de intentos de login (además el login es trivialmente saltable). |
| **Auditoría de dependencias** | 🟠 | Sin `npm audit`/Dependabot en CI. |
| **Backups** | 🔴 | No documentados para Postgres de n8n ni para Sheets. Un borrado accidental = pérdida total. |
| **Logs** | 🟠 | Sólo `search_log`/`messages` en Sheets. Sin logs de acceso/errores centralizados. |
| **Monitoreo / alertas** | 🔴 | Sin uptime monitoring ni alertas si n8n/servidor caen. |

### Los 3 bloqueadores críticos (repetidos por importancia)
1. **Login sin seguridad real** (contraseña en cliente, sesión falsificable).
2. **API key de n8n en el bundle** → cualquiera controla los 15 workflows.
3. **Webhooks de escritura/envío sin auth obligatoria** → escribir datos, enviar emails desde tu dominio (riesgo legal/reputacional) y quemar créditos.

Los tres tienen la **misma raíz**: no hay backend, así que todo secreto acaba en el navegador. Se resuelven juntos con la arquitectura de la sección 1.4.

---

## 6. Sistema de autenticación profesional — plan

**Recomendación: adoptar Supabase Auth** (o Auth.js/Clerk) en lugar de construir auth a mano.

Arquitectura objetivo:
- **Registro / login** con email+contraseña (hash bcrypt/argon2 en servidor — nunca en cliente).
- **Sesiones** con JWT de vida corta + refresh token en cookie `HttpOnly`, `Secure`, `SameSite`.
- **Verificación de email**, **recuperación** y **cambio de contraseña** por token de un solo uso.
- **Google Sign-In** (OAuth) — Supabase/Auth.js lo traen listo.
- **MFA/2FA TOTP** — soportado nativamente por Supabase.
- **RBAC real**: `admin` / `vendedor` / `cliente`, aplicado en el backend (RLS en Postgres si usas Supabase) — no en el frontend.
- **Cierre de sesión** = invalidar refresh token en servidor. **Recordar sesión** = duración del refresh token.
- **Rate limit / lockout** en el endpoint de login.

Mientras llega eso, **mitigación inmediata de bajo esfuerzo** (no es solución final): poner **Cloudflare Access** delante de `workspace.jddeveloper.com` — autenticación Zero-Trust por email antes de servir siquiera la SPA. Te protege hoy mismo sin tocar código.

---

## 7. Formularios

- ✅ Validación con Zod + react-hook-form; edición pre-carga datos (Fase 9). Buen nivel en frontend.
- 🔴 **Protección anti-spam / anti-abuso**: nula en los webhooks que reciben datos. El buscador de leads dispara Apify (coste real) sin límite server-side.
- 🟠 **Validación server-side**: hoy vive en los nodos de n8n; conviene endurecerla (rechazar payloads mal formados, limitar `max` de Apify, validar emails de destino).
- 🟠 **Gestión de errores**: buena en UI (toasts, estados de error). Falta feedback de rate-limit/cuota.
- **Recomendación**: añadir throttling + validación estricta en el backend/n8n para cada webhook de escritura, y un cap duro al `max` de búsquedas Apify.

---

## 8. Rendimiento

- 🟢 **Frontend**: code splitting hecho, React Query cachea, bundle razonable. Bien.
- 🟠 **Datos (Sheets)**: leer una hoja entera en cada tab escala mal cuando `prospects` crezca (miles de filas = payloads grandes y lentos, cálculos client-side de KPIs). Con Postgres + agregaciones en servidor esto desaparece.
- 🟠 **Polling**: `useInbox`/`useSearchLog` pollean cada 30s contra Sheets vía n8n — multiplica llamadas y cuota de Sheets API con varios usuarios. Con backend, mover a websockets/eventos o cache.
- 🟠 **Cálculos client-side** (Analíticas, forecast) sobre todos los leads → mover a queries agregadas cuando haya volumen.
- **Cuellos de botella futuros**: cuota de Google Sheets API, límite de ejecuciones concurrentes de n8n, créditos Apify.

---

## 9. Experiencia de usuario

- 🟢 Se siente profesional: temas claro/oscuro, transiciones, skeletons, empty states, Cmd+K, gráficos de marca. Muy por encima del promedio de CRMs internos.
- 🟠 **Login** es el punto más flojo de UX *y* seguridad — un registro/onboarding real elevaría la percepción de producto.
- 🟠 Sin verificación visual real documentada (Fases 5/6 se validaron sólo por build/tipos) — conviene una pasada QA manual en 1024–1280px y móvil.
- **Recomendación**: manejo de errores global (error boundary + página 500 amistosa), y estados de carga consistentes en las mutaciones.

---

## 10. Readiness de producción

**✅ Listo hoy:**
- Frontend funcional y pulido, automatización n8n end-to-end real, infra desplegada (Oracle+Cloudflare+HTTPS), datos reales sin mocks, blindaje de deliverability parcial (SPF/DKIM ok).

**🔴 Falta antes del lanzamiento (bloqueante):**
- Autenticación real + sesiones seguras + RBAC aplicado.
- Sacar la API key de n8n del bundle; forzar auth en todos los webhooks.
- Rate limiting en webhooks de envío/scraping.
- Backups automatizados (Postgres n8n + export de Sheets).
- Completar DMARC (`rua`), `direccion_fisica` real y `n8n_public_url` (pendientes de Fase 7/migración).

**🟠 Mejorar pronto (no bloquea pero urge):**
- CI/CD (GitHub Actions).
- Monitoreo/alertas (uptime, healthchecks).
- Migrar Sheets → Postgres para la data del CRM.
- Actualizar/eliminar `DEPLOY.md` obsoleto; sincronizar `n8n/*.json` con producción.
- Plan de coste post-trial de Oracle (el crédito gratis vence en ~1 mes).

**🟢 Puede esperar (futuras versiones):**
- Multi-tenant real, facturación (Stripe), integraciones LinkedIn/Instagram, i18n completo, app móvil.

---

## 11. Roadmap priorizado

### 🔴 Crítico (semana 1–2 — bloquea producción)
1. **Cloudflare Access** delante de `workspace.jddeveloper.com` (mitigación inmediata mientras se construye auth real).
2. **Sacar `VITE_N8N_API_KEY` del frontend** — proxiar la API de n8n por un backend/función, o al menos por nginx con la key inyectada server-side.
3. **Forzar `X-CRM-TOKEN` en TODOS los webhooks** de escritura/envío/scraping (rechazar sin token) + validar server-side.
4. **Backups automáticos** del Postgres de n8n (dump diario) y export periódico de Sheets.

### 🟠 Alta (semana 3–6)
5. **Backend delgado + Auth real** (recomendado: Supabase — Postgres+Auth+RLS de una) con login/registro/reset/2FA/Google y RBAC aplicado.
6. **CI/CD con GitHub Actions** (CI en cada push + CD al servidor).
7. **Rate limiting** en webhooks (n8n o backend) y cap al `max` de Apify.
8. **Monitoreo + alertas** (UptimeRobot/Healthchecks.io + logs centralizados).
9. Completar **DMARC**, `direccion_fisica`, `n8n_public_url`.

### 🟡 Media (semana 6–10)
10. **Migrar datos del CRM de Sheets → Postgres** (mantener Sheets sólo como export/integración si se quiere).
11. **Sincronizar `n8n/*.json` con producción** en Git; versionar workflows en el deploy.
12. Auditoría de dependencias en CI (`npm audit` + Dependabot).
13. Error boundary global + página de error amistosa; QA visual manual.
14. Eliminar `VITE_GOOGLE_API_KEY` (camino redundante) y actualizar/borrar `DEPLOY.md`.

### 🟢 Baja (backlog / futuras versiones)
15. Multi-tenant + facturación (Stripe).
16. Integraciones LinkedIn/Instagram/Facebook (respetando ToS).
17. i18n completo, app móvil, notificaciones push del navegador.

---

## Nota final
No se hizo ningún cambio de código en esta auditoría (sólo lectura + este documento). Las mitigaciones críticas (Cloudflare Access, forzar token en webhooks, sacar la API key del bundle) tienen **alto impacto y bajo esfuerzo** — recomiendo empezar por ahí antes de cualquier feature nueva. Ninguna de las recomendaciones exige un cambio destructivo; la migración a backend/Postgres puede hacerse de forma incremental sin apagar lo que ya funciona.
</content>
</invoke>
