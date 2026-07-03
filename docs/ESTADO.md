# Estado del proyecto — JDDeveloper CRM

## ✅ Datos reales — COMPLETADO (sin mock, sin fallback)

| Pieza | Estado |
|-------|--------|
| Workflow n8n **"CRM API - Leer Sheets"** (webhook GET, routea por `sheet`: prospects/outreach/pipeline/messages/config) | ✅ Activo, verificado con datos reales |
| Workflow n8n **"CRM API - Escribir Sheets"** (webhook POST, routea por `action`: pipeline_update/lead_create/lead_update/outreach_update) | ✅ Activo, verificado con datos reales |
| `src/services/crmApi.ts` / `src/services/sheetsService.ts` reescritos para hablar solo con los webhooks reales | ✅ Sin try/catch que oculte errores (excepto `movePipeline`/`ping`, best-effort por diseño) |
| `src/services/mockData.ts` y todo dato de ejemplo/inventado (KPIs con `change`/sparkline falsos, gráfico de actividad con `Math.random()`, mensaje "datos de ejemplo") | ✅ Eliminado por completo |
| Tabs Resumen/Leads/Pipeline muestran estado de error explícito (banner + botón reintentar) si el webhook no responde, en vez de datos inventados | ✅ |

### Notas
- Si n8n no está corriendo o el webhook falla, la UI muestra un estado de error/vacío — nunca datos falsos.
- Los templates de campañas (`STARTER_TEMPLATES` en `src/lib/campaigns.ts`) son contenido editable de arranque, no datos de negocio inventados.

## ✅ Fase 1 — COMPLETADA (funcional)

| Pieza | Estado |
|-------|--------|
| Extracción de colores/tipografía de la web | ✅ `src/styles/brand.js` |
| Setup proyecto + dependencias | ✅ |
| Tema claro/oscuro con tokens de marca + persistencia | ✅ |
| Login (contraseña `JDDeveloper2026`, sesión en localStorage, logout) | ✅ Funcional |
| Layout: sidebar colapsable + topbar + routing animado | ✅ Funcional |
| Búsqueda global Cmd/Ctrl+K (leads + páginas) | ✅ Funcional |
| **Tab Resumen**: 6 KPIs con sparkline, embudo, líneas 30 días, dona por nicho, feed actividad, estado workflows n8n, leads que necesitan atención | ✅ Funcional (KPIs y gráficos calculados de datos reales) |
| **Tab Leads**: tabla, búsqueda fuzzy, filtros (estado/nicho/score), orden por columna, selección múltiple, badges de score, acciones inline (email/WhatsApp/ver), export CSV, agregar/editar (modal + validación Zod), drawer de detalle con tabs y "mover a etapa" | ✅ Funcional |
| Datos: lectura Google Sheets (con fallback a datos de ejemplo) | ✅ |
| Conexión n8n (listar workflows, estado en vivo) | ✅ |

### Notas Fase 1
- **Sin `VITE_GOOGLE_API_KEY`**, los leads vienen de datos de ejemplo realistas
  (mismo esquema que las hojas `prospects`/`pipeline`). Al configurar la API key,
  pasa a datos en vivo automáticamente.
- Las **mutaciones de leads** (agregar/editar/eliminar/mover etapa) son optimistas en
  el store local. La escritura a Sheets vía n8n se conecta en Fase 2.
- El estado de **workflows n8n** es en vivo si n8n corre en `localhost:5678`.

## ✅ Fase 2 — COMPLETADA (funcional)

| Pieza | Estado |
|-------|--------|
| **Conexión real a Google Sheets vía n8n** (`src/services/crmApi.ts` + workflows `n8n/CRM_API_Leer_Sheets.json` / `n8n/CRM_API_Escribir_Sheets.json`) | ✅ Funcional si los webhooks están importados/activos en n8n |
| **Tab Pipeline**: Kanban 8 columnas con drag-and-drop (dnd-kit), cards con avatar/score/prioridad/canal/días en columna, alertas de leads estancados (7+ días, borde rojo pulsante), totales $ y conteo por columna, forecast mensual ponderado por probabilidad de etapa, filtros (nicho/valor/prioridad/responsable), vista lista, botón "+" por columna, drawer de lead reutilizado, sync a Sheets en cada movimiento | ✅ Funcional |
| **Tab Automatizaciones**: lista real de workflows n8n, toggle activo/inactivo, "Ejecutar ahora", link "Abrir en n8n", stats de ejecuciones (total/% éxito), panel lateral con últimas 20 ejecuciones + gráfico de 14 días, sección de integraciones (Sheets/Gmail/IMAP/WhatsApp/Claude/Apify/Calendar conectadas, Instagram/LinkedIn/Stripe próximamente) | ✅ Funcional (requiere n8n corriendo en `localhost:5678` con API key) |
| **Tab Campañas**: grid de campañas con métricas, wizard de 3 pasos (info → selección de leads con filtros y "seleccionar todos" → template/horario), vista detalle, pausar-reanudar/duplicar/enviar seguimiento, librería de templates editable | ✅ Funcional (persistencia real en Sheets desde Fase 4, ver abajo) |

### Notas Fase 2
- El proxy de Sheets vía n8n (`crmApi`) es la fuente preferida; si los webhooks no están
  importados/activos, el sistema cae automáticamente a lectura directa de Sheets API y
  luego a datos de ejemplo — sin romper la UI.
- Las campañas dejaron de vivir solo en el store local en Fase 4: ahora se persisten en la
  hoja `campaigns` vía n8n (ver Fase 4). Los templates de outreach siguen siendo contenido
  editable local (Zustand), no datos de negocio.

## ✅ Fase 3 — COMPLETADA (funcional)

| Pieza | Estado |
|-------|--------|
| Workflow n8n **"CRM API - Leer Inbox"** (`Email Trigger (IMAP)` en modo `postProcessAction: nothing` → cruza contra `prospects` → hace append a la hoja `inbox`) | ✅ Activo, no marca los correos como leídos en el servidor, sin duplicados (dedup vía `staticData.lastMessageUid` de n8n) |
| Nueva hoja **`inbox`** en el spreadsheet (`ID Msg, Fecha, De Email, De Nombre, Asunto, Cuerpo, ID Lead, Leido`) | ✅ Creada con autorización explícita del usuario |
| `sheetsService.getInbox()` + `useInbox()` + tipo `InboxMessage` | ✅ Sin fallback, mismo patrón que el resto de tabs |
| **Tab Bandeja**: vista split-pane (lista + detalle) de la bandeja IMAP en vivo, búsqueda, filtro "solo no leídos" (estado leído es local vía `localStorage`, la hoja `Leido` no se escribe todavía), cruce automático con leads conocidos por email, botón "Responder" con envío real (ver Fase 4) | ✅ Funcional |
| **Tab Mensajes**: vista unificada de conversaciones agrupadas por lead a partir de la hoja `messages` (envíos + respuestas), lista ordenada por actividad reciente + hilo cronológico por canal | ✅ Funcional |

### Notas Fase 3
- Bandeja (correos IMAP crudos) y Mensajes (log de outreach/respuestas por lead) se mantienen
  como fuentes separadas a propósito para esta iteración, evitando duplicar la misma respuesta
  recibida en dos vistas distintas.

## ✅ Fase 4 — COMPLETADA (funcional)

| Pieza | Estado |
|-------|--------|
| Hoja **`campaigns`** nueva en el spreadsheet (`id, nombre, nicho, idioma, estado, tipo_mensaje, template, leads_ids, fecha_creacion, fecha_inicio, fecha_fin, total_leads, enviados, respondidos, notas`) | ✅ Creada |
| Workflow **"CRM API - Leer Sheets"**: agregado `campaigns` a la whitelist de tabs | ✅ |
| Workflow **"CRM API - Escribir Sheets"**: nuevas acciones `campaign_create`, `campaign_update`, `campaign_delete` (soft-delete, `estado=eliminada`) y `config_update` (upsert clave/valor en `config`) | ✅ |
| Nuevo workflow **"CRM API - Generar con IA"** (`POST /crm-generate-ai`, Claude `claude-sonnet-4-6` vía `httpRequest` + credencial Anthropic ya existente en n8n) | ✅ Activo, probado end-to-end |
| Nuevo workflow **"CRM API - Enviar Respuesta"** (`POST /crm-send-reply`, SMTP vía `emailSend` + credencial ya existente, agrega firma desde `config.firma_email`, registra la respuesta en `messages`) | ✅ Activo (no se probó con un envío real para no mandar un email de prueba a un tercero — recomendado que Juan lo pruebe manualmente una vez) |
| `crmApi.ts`: `createCampaign`, `updateCampaign`, `deleteCampaign`, `updateConfig`, `generateWithAI`, `sendReply` | ✅ |
| `sheetsService.getCampaigns()` | ✅ |
| **Tab Campañas**: `useCampaigns()` migrado de Zustand a `useQuery` sobre la hoja `campaigns` (persistencia real, sobrevive refresh); nuevos hooks `useCreateCampaign`/`useUpdateCampaign`/`useDeleteCampaign`; lanzar/pausar/reanudar/duplicar campaña ahora escriben en Sheets. Los templates de outreach siguen locales (Zustand) por ser contenido editable, no datos de negocio | ✅ |
| Wizard de campañas: botón **"Generar con IA"** conectado a `crmApi.generateWithAI()` (Claude real), con loading spinner y toast de error si falla | ✅ |
| Tab Bandeja: botón **"Enviar"** conectado a `crmApi.sendReply()` (SMTP real), con loading, toast de éxito/error y refetch del inbox tras enviar | ✅ |
| WhatsApp — Phone Number ID corregido en el workflow | ✅ El nodo "Enviar WhatsApp" del workflow **"Fase 4 - WhatsApp Seguimiento"** (`JM3bEVBWajjmcCvV`) usaba un Phone Number ID incorrecto (`1164621040071643`). Corregido a `1095910083615710` vía la API de n8n (`PUT /api/v1/workflows/JM3bEVBWajjmcCvV`), verificado con una relectura del workflow tras el cambio. El workflow sigue **activo**. El WABA ID `1851147816258889` no aparece referenciado en ningún nodo del workflow (solo el Phone Number ID se usa para construir la URL de la Graph API) — no requería cambio. No se encontraron referencias hardcodeadas al ID antiguo en el código del dashboard, solo en este archivo (ya corregido). |
| **Tab Analíticas**: KPIs (leads, mensajes enviados, tasa de respuesta, clientes cerrados, ticket promedio, valor generado), embudo de conversión, mensajes por canal (donut), actividad 30 días (línea), leads por nicho (barras), tabla top-10 leads por score — todo calculado client-side desde `useLeads`/`useMessages`/`useCampaigns`, sin endpoints nuevos | ✅ |
| **Tab Configuración**: perfil de agencia (lee/escribe hoja `config`: nombre, emails, whatsapp, link de agendamiento), editor de firma de email (`firma_email`), estado de integraciones (ping n8n, ping CRM API, estado de los 3 workflows clave), accesos rápidos a cada workflow de n8n | ✅ |

### Notas Fase 4
- Quedaron dos filas de prueba inofensivas en Sheets de esta sesión (`C-TEST1` en `campaigns`
  con `estado=eliminada`, y `test_key`/`test_value` en `config`) que el agente no pudo borrar
  programáticamente por la política de seguridad contra eliminaciones masivas en datos de
  producción — Juan puede borrarlas manualmente desde Google Sheets si quiere.
- Los archivos `n8n/CRM_API_Leer_Sheets.json` y `n8n/CRM_API_Escribir_Sheets.json` del repo
  quedaron desactualizados respecto a los workflows reales en n8n (que ya usan `httpRequest` +
  credencial `googleSheetsOAuth2Api` en vez de los nodos dedicados de Sheets). No se sincronizaron
  en esta sesión — pendiente si se quiere tener el repo como fuente de verdad exportable.

## ✅ Fase 5 — Pulido visual y corrección de estilos — COMPLETADA

| Pieza | Estado |
|-------|--------|
| Auditoría completa tab por tab (Resumen, Leads, Pipeline, Automatizaciones, Campañas, Bandeja, Mensajes, Analíticas, Configuración) + componentes compartidos (Topbar, Sidebar, PageHeader, CommandPalette, Modal/Drawer, Placeholder) | ✅ |
| **Bug de truncado en flex rows**: varios textos (`truncate`) dentro de contenedores `flex` no se recortaban porque a ese elemento le faltaba `min-w-0` (los flex items tienen `min-width: auto` por defecto, lo que impide que se encojan por debajo del ancho de su contenido). Corregido añadiendo `min-w-0 flex-1` al elemento truncado y `shrink-0` a badges/íconos vecinos, en ~10 archivos (Topbar, PipelinePage, DashboardPage, SettingsPage, LeadDrawer, InboxPage, MessagesPage, CommandPalette, LeadsPage, AutomationsPage, CampaignsPage, CampaignWizard, Modal) | ✅ |
| **Badges sin variante dark**: varios badges de estado/valor usaban clases de color solo para modo claro (`bg-green-100 text-green-600`, `bg-red-100 text-red-600`, `bg-primary-50 text-primary-600`) sin `dark:`, quedando desteñidos/inconsistentes en modo oscuro. Corregido con el patrón estándar del proyecto (`dark:bg-green-500/15 dark:text-green-400`, `dark:bg-red-500/15 dark:text-red-400`, `dark:bg-primary-400/15 dark:text-primary-300`) en DashboardPage, SettingsPage, LeadDrawer, CampaignsPage, CampaignWizard, Placeholder | ✅ |
| Columnas de tablas (Leads, Pipeline, Analíticas) con ancho variable y texto largo (empresa/ciudad/contacto) | ✅ Se les agregó `max-w-[Npx] truncate` para evitar que rompan el layout de la tabla |
| Routing, dev server y proxy de Vite (`/n8n-hook`, `/n8n-api`) | ✅ Verificados correctos, sin cambios necesarios |
| `tsc -b --noEmit` y `npm run build` | ✅ Limpios tras los cambios |

### Notas Fase 5
- No se realizaron pruebas visuales en navegador real dentro de este entorno (sin acceso a
  UI gráfica); los cambios se verificaron por revisión de código y por tipado/build limpios.
  Se recomienda una revisión visual rápida de Juan en `localhost:3000` antes de mostrarlo a
  clientes, especialmente en el rango ~1024–1280px y en modo oscuro.
- No se agregaron features nuevas ni se tocó lógica de negocio — solo clases de Tailwind/CSS.

## ✅ Fase 6 — Fix bugs visuales Pipeline + code splitting + seguridad git — COMPLETADA

| Pieza | Estado |
|-------|--------|
| **Bug Kanban Pipeline (prioritario)**: las cards de `KanbanCard.tsx` desbordaban texto (nombre de empresa, ciudad, próximo seguimiento) fuera de la card. Corregido con `w-full overflow-hidden` en la card, `min-w-0 truncate` + `title` en cada texto dinámico, y `shrink-0` en badges de prioridad/valor | ✅ |
| `KanbanColumn.tsx`: header de columna reestructurado (`min-w-0 flex-1` en el label + `shrink-0` en punto de color/badge de conteo/botón "+"), zona de drop con `overflow-hidden` añadido | ✅ |
| **Segunda pasada global** ("regla de oro": todo texto dinámico en contenedor flex necesita `min-w-0`/`truncate`/`shrink-0` en vecinos + `title` como tooltip nativo) aplicada en las 9 páginas (Resumen, Leads, Pipeline, Campañas, Automatizaciones, Bandeja, Mensajes, Analíticas, Configuración) y componentes compartidos (Topbar, Modal, LeadDrawer) | ✅ |
| **Bug real corregido de paso**: `StatusRow` en `SettingsPage.tsx` no tenía ninguna protección de truncado en su label (`text-sm text-fg` a secas); ahora es `min-w-0 flex-1 truncate` | ✅ |
| **Code splitting**: las 9 páginas de rutas pasaron a `lazy()` + `<Suspense fallback={<RouteFallback />}>` por ruta en `App.tsx` (antes iban todas en el bundle principal) | ✅ Verificado en `npm run build`: cada página ahora es su propio chunk (5–57 kB) en vez de ir en el bundle de 1.1 MB |
| **Seguridad de token git**: se detectó que el token PAT estaba embebido directamente en la URL del remoto (`https://TOKEN@github.com/...`), lo que evita por completo `credential.helper`. Se limpió la URL del remoto (`git remote set-url origin https://github.com/...`, sin token) y se configuró `credential.helper manager` (Windows Credential Manager) a nivel global, eliminando además un override local (`store --file=...`) que lo tapaba | ✅ |
| **UX (auditoría, sin cambios de código)**: favicon/título de pestaña, skeletons por página, empty states con CTA y transiciones de página con `framer-motion` ya estaban implementados desde la Fase 5 — confirmado, no se requirió trabajo adicional | ✅ Ya cumplido |
| `tsc -b --noEmit` y `npm run build` | ✅ Limpios |

### Notas Fase 6
- Igual que en Fase 5, no hubo verificación visual en navegador real dentro de este entorno;
  los cambios se verificaron por revisión de código y build/tipado limpios.
- El push de esta ronda se hizo pasando el token de forma transitoria (no persistida en el
  remoto), para no reintroducir el problema de seguridad corregido en esta misma fase.

## ✅ Fase 7 — Blindaje (Legal + Deliverability) — COMPLETADA

| Pieza | Estado |
|-------|--------|
| **Hoja "optout"** en Google Sheets (columnas: email, fecha, motivo) | ✅ Creada |
| **Workflow n8n "CRM API - Optout"** (webhook GET público `crm-optout`, sin autenticación, valida email, lo agrega a la hoja `optout`, devuelve página de confirmación HTML bilingüe ES/EN) | ✅ Activo, probado end-to-end (email válido → 200 + confirmación; email inválido → 400) |
| `optout` agregado al whitelist del workflow **"CRM API - Leer Sheets"** | ✅ Verificado leyendo la hoja vía el webhook |
| **Fase 3 - Envío de Emails**: antes de enviar, ahora lee `optout` y `messages` (nodos "Leer optout" / "Leer messages hoy"); el código "Filtrar Aprobados Envio" excluye emails dados de baja, limita la tanda al cupo diario restante (`limite_diario_emails` config − enviados hoy) y arma un footer bilingüe (dirección física + link de baja) por cada lead; "Enviar Email" ahora concatena cuerpo + firma + footer | ✅ Activo |
| **Fase 4 - Seguimiento Email**: se agregó nodo "Leer config" (no existía) + "Leer optout" + "Leer messages hoy"; "Filtrar Seguimiento" aplica la misma lógica de exclusión por opt-out, cupo diario compartido con Fase 3, y footer por lead; "Procesar Respuesta Claude" ahora anexa el footer al cuerpo generado por IA | ✅ Activo |
| **Límite diario de envíos** (domain warm-up) | ✅ Config `limite_diario_emails=25` en la hoja `config` (ajustable por Juan sin tocar código). Rampa recomendada (no forzada en código): semana 1 → 20/día, semana 2 → 30/día, semana 3+ → 40-50/día, ajustar según tasa de rebote/spam |
| **Dirección física en footer** | ⚠️ Config `direccion_fisica` creada con placeholder `[Direccion fisica de JDDeveloper]` — **Juan debe reemplazarlo** con la dirección real vía el tab Configuración del dashboard (action `config_update`) o directamente en la hoja `config` |
| **URL pública de n8n** (necesaria para que el link de "dar de baja" en los emails sea clickeable por destinatarios reales, ya que n8n corre solo en `localhost:5678`) | ⚠️ Config `n8n_public_url` creada vacía (confirmado con Juan). Mientras esté vacía, el link de baja en los emails cae a un `mailto:info@jddeveloper.com` como fallback funcional. **Pendiente**: cuando Juan tenga un túnel/subdominio público para n8n, actualizar `n8n_public_url` en la hoja `config` para que el link apunte al webhook real |
| **Email de prueba real** | ✅ Enviado a `juanmanuelduverge@gmail.com` vía un workflow temporal desechable (creado, disparado una vez, eliminado) que replica el footer exacto (dirección + link de baja) que usarán Fase 3 y Fase 4. Juan debe confirmar que lo recibió correctamente antes de dar por completada la Tarea 1 al 100% |
| **SPF** (`jddeveloper.com`) | ✅ Ya estaba correctamente configurado (`v=spf1 include:_spf.mail.hostinger.com include:_spf.reach.hostinger.com ~all`) — verificado por DNS, sin acción requerida |
| **DKIM** (`jddeveloper.com`) | ✅ Ya estaba activo (selector `hostingermail1._domainkey`) — verificado por DNS, sin acción requerida |
| **DMARC** (`jddeveloper.com`) | ⚠️ Existe pero incompleto (`v=DMARC1; p=none`, sin `rua`). Guía exacta de qué cambiar en `docs/DNS_EMAIL_SETUP.md` — **Juan debe editarlo manualmente en el panel de Hostinger** (~2 min), Claude no tiene credenciales de Hostinger |
| `docs/DNS_EMAIL_SETUP.md` | ✅ Creado con guía copiar-pegar para Juan |

### Notas Fase 7
- Todo el texto de opt-out (página de confirmación, footer de emails) está en español e inglés.
- El límite diario se cuenta de forma combinada entre Fase 3 y Fase 4 (ambas leen `messages` con `Canal=Email` del día actual antes de decidir cuántos enviar).
- No se tocó código del dashboard (`src/`) — todo el trabajo de esta fase fue directamente contra la API REST de n8n y Google Sheets. Los archivos `n8n/*.json` en el repo ya estaban desincronizados con los workflows reales desde antes de esta fase (nota heredada de fases previas) — no se corrigió ese desfase por no ser parte de este brief.
- **Acciones pendientes de Juan** (resumen): completar `direccion_fisica` real en la hoja `config`, configurar `n8n_public_url` cuando tenga un endpoint público para n8n, editar el registro DMARC en Hostinger según `docs/DNS_EMAIL_SETUP.md`, y confirmar que el email de prueba llegó correctamente.

## ✅ Fase 8 — Rescate de captación Apify + Rediseño visual — COMPLETADA

### Parte 1 — "My workflow" rescatado
- Se confirmó que el workflow n8n llamado **"My workflow"** era la pieza de captación que faltaba documentar: corre el actor Apify `compass~crawler-google-places` (Google Maps Scraper, busca `"real estate agency"` en Miami), mide PageSpeed/SSL, genera diagnóstico IA + score y escribe en la hoja **`prospects`**.
- Renombrado a **`Fase 1 - Captación de Prospectos (Apify)`** (id `VL8oMOZoFcPofYjV`). Está activo pero con **trigger manual**, así que no consume créditos de Apify por sí solo — solo corre cuando Juan lo dispara.
- No tenía ejecuciones en el historial de n8n (purgadas o pocas corridas manuales).
- Los 15 workflows quedaron con nombres consistentes (`Fase N - …`, `CRM API - …`, `Seguimiento - …`).
- Nuevo doc **`docs/MAPA_WORKFLOWS.md`**: mapa completo del pipeline de punta a punta (Apify → prospects → enriquecimiento → scoring → outreach → envío → seguimiento).

### Parte 2 — Rediseño visual e interactividad
- **Módulo de gráficos de marca** (`src/components/charts/chartTheme.tsx`): paleta categórica fija validada colorblind-safe, tooltip de marca (superficie oscura, punto de color por serie), defs de gradientes coral/violeta, props de ejes/grid coherentes.
- **Embudo de conversión propio** (`ConversionFunnel.tsx`): barras decrecientes con % de conversión entre etapas y animación de entrada — reemplaza el `FunnelChart` genérico de Recharts (mucho más intuitivo para ventas).
- **Gráficos rediseñados** en Resumen y Analíticas: línea → **área con gradiente**, dona con **total al centro**, barras con gradiente coral, todos con tooltip de marca, ejes con fuente Relative, y animaciones de entrada.
- **KPI cards con más carácter**: ícono en chip coral, indicador de tendencia (flecha ↑/↓ con color), jerarquía número/label más clara, sparkline con gradiente, elevación en hover con acento coral lateral.
- **Interactividad**: hover con elevación en cards/KPIs/Kanban, botones con `active:scale` + glow coral, inputs con foco coral, skeletons con shimmer, filas de listas con hover, transición **suave entre tema claro/oscuro**.
- **Kanban**: tarjeta arrastrada con rotación + sombra pronunciada + ring coral; columna destino resaltada con glow al soltar.
- **Jerarquía**: `PageHeader` con acento coral vertical consistente en las 9 pestañas.
- Verificado: `tsc -b --noEmit` limpio, `npm run build` limpio, dev server sirve sin errores.

## ✅ Fase 9 — Correcciones post-rediseño + marca + 2 features — COMPLETADA

### Parte 0 — Nombre de marca
- Se unificó el nombre visible a **"JD Developer"** (con espacio) en todo `src/`, `index.html`, manifest, login, sidebar, dashboard, config y textos de la UI.
- Excepción intencional: el dominio `jddeveloper.com` y los correos `@jddeveloper.com` se dejaron igual (son técnicos, no el nombre de marca).

### Parte 1 — 6 correcciones de UI
- **1.1** Más aire entre el título de cada card y su gráfico (`CardHeader` `mb-3` → `mb-5`).
- **1.2** Embudo de conversión **simplificado** a barras horizontales decrecientes claras (nombre a la izquierda, valor + % a la derecha), priorizando claridad sobre efecto visual.
- **1.3** El botón **Editar lead** ahora **pre-carga los datos** del lead (react-hook-form `reset()` en `useEffect` al abrir).
- **1.4** El **Kanban permite mover tarjetas en cualquier dirección** (detección de colisión `pointerWithin` + fallback `rectIntersection`, ya no solo hacia adelante).
- **1.5** El **Kanban tiene scroll horizontal** con flechas ‹ › y degradados en los bordes cuando hay columnas ocultas (`HScrollBoard`).
- **1.6** **Padding** añadido en Bandeja y Mensajes para que el texto no toque el borde del contenedor.

### Parte 2 — 2 features nuevas
- **2.1 Composer en Mensajes**: se puede escribir y enviar un mensaje nuevo dentro de cada hilo, reutilizando el workflow **"CRM API - Enviar Respuesta"** (mismo patrón que el reply de Bandeja, sin duplicar lógica). Respeta el **footer legal de Fase 7** (dirección + link de baja) porque ese workflow fue actualizado para incluirlo. Atajo a **WhatsApp** (`wa.me`) cuando el lead no tiene email.
- **2.2 Búsqueda de leads nuevos (Apify)**: nueva pestaña/botón **"Buscar nuevos leads"** en Leads con un formulario (tipo de negocio + ciudad + cantidad). El workflow **`Fase 1 - Captación (Apify)`** tenía el nicho y la ciudad **hardcodeados**; se modificó para aceptar esos valores como **parámetros dinámicos** vía un webhook nuevo (`crm-buscar-leads`): Webhook → Respuesta Iniciada → Preparar Búsqueda → Log Búsqueda → Apify. Los resultados se agregan solos a la hoja `prospects`. Cada búsqueda queda registrada en la hoja **`search_log`**. El form avisa que cada búsqueda **consume créditos de Apify**.
- Probado con un caso real chico (`coffee shop` en Boca Raton, max 2) → webhook respondió `{ok:true}` HTTP 200.
- Verificado: `tsc -b --noEmit` limpio, `npm run build` limpio.

## ✅ Fase 10 — Multi-fuente búsqueda + composer libre + adjuntos + Kanban clickable + notificaciones — COMPLETADA

### 1. Búsqueda de leads: multi-fuente
- Selector de fuente en el modal "Buscar nuevos leads": **Google Maps** (default, ya existía) y **Google (búsqueda web)** ambos **100% funcionales**. LinkedIn, Instagram y Facebook quedan como opciones **"Experimental — próximamente"**, deshabilitadas con candado (no conectadas a Apify: scrapearlas viola ToS de esas plataformas y no había actor estable disponible en la cuenta de Apify de Juan).
- Workflow `Fase 1 - Captación de Prospectos (Apify)`: se agregó un webhook branch que ramifica por `fuente` (`Es Google Maps?` / `Es Google Web?`) → Google Maps sigue usando el actor `compass~crawler-google-places`; Google Web usa el actor `apify~google-search-scraper` (mismo credential `Apify - JDDeveloper`, ya tenía permisos). Si la fuente no está disponible, el workflow no gasta créditos (nodo No-Op).
- Bug encontrado y corregido durante la implementación: los nodos posteriores a "Log Búsqueda" leían `$json` del **response del log en Sheets** (sin los campos originales) en vez de los datos de "Preparar Búsqueda" — se corrigió referenciando `$('Preparar Busqueda').item.json.*` explícitamente en los 2 HTTP Request y los 2 If de ruteo.
- `search_log` ahora registra también la columna `fuente` (columna E).
- **Probado en real**: `google_web` con "coffee shop" en Boca Raton → el actor de Apify corrió con `statusCode 200` y la query correcta. `google_maps` se re-probó con el fix aplicado y quedó corriendo en background (normal, el scraping real tarda varios minutos).

### 2. Composer libre en Mensajes
- Botón **"Nuevo mensaje"** en la pestaña Mensajes abre un composer en blanco (Para / Asunto / Cuerpo), con autocompletado si el email coincide con un lead existente — sin crear leads fantasma.
- Usa el mismo workflow `CRM API - Enviar Respuesta` (mismo footer legal Fase 7).
- Los mensajes sin lead asociado se registran con el **email como identificador** en la columna `ID Lead` (en vez de dejarla vacía), así el hilo se agrupa correctamente en Mensajes si se le vuelve a escribir a esa misma dirección.

### 2.1 Adjuntos en los 3 composers
- Se agregó `AttachmentPicker` (componente reutilizable, límite 12MB) en: reply de Bandeja, reply de hilo en Mensajes, y el composer libre nuevo.
- El workflow `CRM API - Enviar Respuesta` se extendió: nuevo nodo "Preparar Adjunto" convierte el base64 recibido a binario (`prepareBinaryData`) y el nodo `Enviar Email` (SMTP) lo adjunta condicionalmente. El nombre del adjunto queda registrado en `messages` (columna H).
- **Probado en real**: envío de un `.txt` de prueba → SMTP devolvió `messageId` real y el binario se generó correctamente en la ejecución.

### 3. Kanban: tarjetas no abrían el detalle
- Causa: solo el nombre de la empresa (texto) tenía `onClick`; el resto de la tarjeta no hacía nada — de ahí la sensación de "a veces no pasa nada".
- Los datos del lead ya eran completos y consistentes con Leads (mismo `useLeadsStore`), no había un bug de datos incompletos.
- Fix: toda la tarjeta ahora es clickable (`onClick` en el contenedor), sin interferir con el drag (dnd-kit ya usaba `activationConstraint: { distance: 6 }`, así que un clic corto nunca se interpreta como arrastre).

### 4. Notificaciones
- Estado encontrado: el ícono de campana en el Topbar **existía pero no hacía nada** — sin `onClick`, con un punto rojo fijo hardcodeado.
- Se implementó una campana funcional con dropdown: combina mensajes nuevos sin leer de la Bandeja (`useInbox`, ya pollea cada 30s) y búsquedas de leads recién iniciadas (`useSearchLog`, hoja `search_log`, nuevo hook con el mismo polling). Contador de no vistos, clic navega a Bandeja o Leads según el evento.
- Es notificación **dentro del Dashboard únicamente** (sin push del navegador), tal como se pidió para esta sesión.

### Cierre
- `tsc -b --noEmit` limpio, `npm run build` limpio (14.25s).

## Arquitectura lista para el roadmap
- Roles en `authStore` (admin/vendedor/viewer) listos para multi-usuario.
- `services/` aislado para sumar IMAP, Claude, Stripe, etc. sin refactor.
- Tipos del dominio centralizados en `src/types`.
