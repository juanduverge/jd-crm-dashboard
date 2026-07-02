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
| WhatsApp — verificación de plantillas aprobadas (Meta Graph API) | 🟡 Bloqueado: el WABA ID del brief (`1851147816258889`) devuelve error de Graph API ("Object with ID ... does not exist / missing permissions"). El phone number ID real usado por el workflow activo es `1164621040071643`. El workflow **"Fase 4 - WhatsApp Seguimiento"** (`JM3bEVBWajjmcCvV`) ya está **activo**, pero la aprobación de las plantillas debe verificarse manualmente en Meta Business Suite o en el nodo de n8n — requiere que Juan confirme el WABA ID correcto. |
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

## Arquitectura lista para el roadmap
- Roles en `authStore` (admin/vendedor/viewer) listos para multi-usuario.
- `services/` aislado para sumar IMAP, Claude, Stripe, etc. sin refactor.
- Tipos del dominio centralizados en `src/types`.
