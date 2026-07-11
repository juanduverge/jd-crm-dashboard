# Formulario Web → CRM — IMPLEMENTADO (2026-07-10/11)

## Causa raíz del "no llegaban los formularios" (2026-07-11)
Diagnóstico end-to-end: las ejecuciones de n8n mostraron **solo pruebas internas**, cero
del navegador del usuario. El JS en vivo era correcto y CORS funcionaba. **Causa: caché
del navegador.** `netlify.toml` cacheaba `/js/*` durante **7 días** (`max-age=604800`),
así que el navegador servía el `contact-form.js` viejo (placeholder que mostraba "gracias"
sin enviar nada). **Fix:** `/js/*` y `/css/*` ahora usan `max-age=0, must-revalidate`
(cada deploy se ve al instante). El backend nunca estuvo roto.

## Rediseño a "Inbox de Leads" (2026-07-11)
El módulo pasó de una tabla simple a un **inbox estilo HubSpot/Pipedrive**:
- **Stat tiles** (total, nuevas, prioritarias, cerradas).
- **Tabs por estado** + búsqueda en vivo.
- **Lista rica**: avatar con iniciales/color, snippet del mensaje, badges de estado y
  prioridad, etiquetas, tiempo relativo, punto "sin abrir", responsable.
- **Drawer de detalle** (`WebLeadDrawer.tsx`) con tabs Detalles/Gestión/Actividad:
  cambio de estado y prioridad inline, asignar responsable, etiquetas add/remove,
  notas internas, **timeline de actividad**, y botonera de **acciones futuras**
  (convertir a lead/cliente, programar seguimiento, IA, adjuntar, WhatsApp) ya
  maquetada como arquitectura preparada.
- **Modelo ampliado**: columnas `prioridad` + `etiquetas` en la hoja `web_leads`.

Archivos: `src/features/webleads/{WebLeadsPage,WebLeadDrawer,webLeadMeta}.tsx/.ts`.

---
# (Historial) Implementación original

> El formulario de contacto de `jddeveloper.com` alimenta el CRM. Módulo nuevo
> **"Solicitudes Web"** en el dashboard. Este doc reemplaza la spec anterior.

## Hallazgo raíz
El formulario de la web era un **placeholder**: mostraba "gracias" pero no enviaba
los datos a ningún lado (el propio comentario del código lo decía). Todos los
mensajes de contacto se estaban **perdiendo**.

## Arquitectura implementada
```
contacto.html (web estática en Netlify)
   │ POST JSON (fetch, honeypot anti-bot, UTM/URL/referrer)
   ▼
n8n webhook  /webhook/crm-web-lead   (workflow "CRM API - Web Lead")
   │ valida + filtra bots + id determinista (email+mensaje+día → dedup doble-submit)
   ▼
Google Sheets hoja "web_leads"  (appendOrUpdate por id)
   ▼
Dashboard → pestaña "Solicitudes Web" (lista, detalle, estados, notas internas)
```

### Decisión de almacenamiento (justificada)
**Hoja `web_leads` en el mismo spreadsheet**, no Supabase/Firebase/Postgres aparte:
- Todo el CRM lee por `crm-sheets-read`; una segunda base de datos solo para
  formularios crearía **dos fuentes de verdad** y duplicaría auth/lectura.
- El esquema (abajo) está diseñado columna-a-columna para migrar 1:1 a Postgres
  cuando se ejecute la migración ya planificada en el roadmap (AUDITORIA_TECNICA §1.3-A2).
- Volumen de un formulario de contacto (decenas/mes) no justifica infra nueva hoy.

### Esquema hoja `web_leads` (fila 1, exacta)
```
id	fecha_hora	nombre	email	empresa	telefono	asunto	mensaje	pagina	url	referrer	utm_source	utm_medium	utm_campaign	ip	user_agent	fuente	formulario	estado	responsable	notas_internas	actualizado
```
Estados: `nuevo | en_proceso | respondido | cerrado`.

## Qué se cambió y por qué
| Archivo | Cambio |
|---|---|
| `n8n/CRM_API_Web_Lead.json` | **Nuevo workflow** (importable): Webhook POST `crm-web-lead` → Code (valida, honeypot, id determinista, soporta `action:update` para gestión desde el CRM) → IF → Google Sheets appendOrUpdate (match `id`) → Respond. CORS restringido a jddeveloper.com |
| Web: `public/js/modules/contact-form.js` | El submit ahora hace POST al webhook con nombre/email/empresa/tema/detalle + metadatos (página, URL, referrer, UTM) + honeypot inyectado por JS. La UX original (panel de éxito + calendario) se conserva intacta; el envío no bloquea al visitante |
| CRM: `src/types/index.ts` | Tipos `WebLead` / `WebLeadStatus` |
| CRM: `src/services/crmApi.ts` | `web_leads` en `SheetTab` + `updateWebLead()` |
| CRM: `src/hooks/useData.ts` | `useWebLeads()` (polling 30s) + `useUpdateWebLead()` |
| CRM: `src/features/webleads/WebLeadsPage.tsx` | **Página nueva**: lista+detalle, filtro por estado, cambio de estado, responsable/notas internas, botón Responder (mailto) |
| CRM: `navItems.ts` / `App.tsx` | Nav "Solicitudes Web" + ruta lazy `/web-leads` |

## ⚠️ Pasos manuales de Juan (sin esto no fluye)
1. **Crear la hoja `web_leads`** en el spreadsheet del CRM y pegar la fila de
   cabeceras de arriba (tal cual, 22 columnas).
2. **Importar el workflow**: backoffice.jddeveloper.com → Workflows → Import from file
   → `n8n/CRM_API_Web_Lead.json` → en el nodo "Guardar Solicitud" seleccionar la
   credencial **Google Sheets account** → **Activar**.
3. **Añadir `web_leads` al whitelist** del workflow "CRM API - Leer Sheets" (igual
   que se hizo con `campaigns`/`optout`) para que el dashboard pueda leer la hoja.
4. Probar: enviar el formulario de la web → debe aparecer en Solicitudes Web.

## Mantenimiento / futuro
- **Seguridad**: el webhook es público (necesario para la web). Protecciones actuales:
  honeypot + CORS + dedup. Siguientes: Cloudflare Turnstile y rate limiting (roadmap).
- La ruta `/webhook` tiene bypass de Access (autorizado por Juan 2026-07-10); el
  editor y `/api/v1` de n8n siguen tras login Access.
- Cuando se migre a Postgres, la hoja `web_leads` se convierte en tabla homónima y
  el workflow cambia el nodo Sheets por un nodo Postgres — el resto no se toca.
- Automatizaciones futuras ya habilitadas por este diseño: auto-respuesta al lead,
  notificación push/email al equipo, promoción automática a `prospects` con scoring IA.
