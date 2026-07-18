# Renombrado y organización de workflows n8n (propuesta lista para aplicar)

> Fecha: 2026-07-18. **No aplicado en vivo**: el sistema bloquea la escritura a
> n8n en producción por seguridad. Esta tabla está lista para aplicar a mano en
> la UI de n8n (o por API con autorización). Renombrar el **título** de un
> workflow y editar su **descripción** es seguro: la app referencia por ID y los
> webhooks por ruta, no por nombre.
>
> ⚠️ **NO renombrar nodos internos**: en n8n los nodos se referencian por nombre
> en las expresiones (`$('Nombre')`); renombrarlos rompe la automatización.

## Convención

- `CRM API · …` → workflows que la app llama en vivo (webhooks / IMAP).
- `Pipeline · N · …` → motor de captación y outreach (ordenado por fase).
- Descripción corta que diga: disparador, qué hace, dónde guarda.

## Tabla (id → nombre nuevo → descripción)

### Grupo CRM API (críticos)

| ID | Nombre actual | Nombre nuevo | Descripción sugerida |
|----|---------------|--------------|----------------------|
| `Xq0CC1t5bXhrbVbM` | CRM API - Leer Sheets | **CRM API · Leer datos (Sheets)** | Webhook `crm-sheets-read`. Lee `search_log` (historial de búsquedas) y `config`. Último lector de Google Sheets. |
| `Hh7TjtJm32hVVk30` | CRM API - Escribir Sheets | **CRM API · Escritura + Scoring IA** | Webhook `crm-sheets-write`. La app solo usa `puntuar_lead`/`analizar_lead` (Claude). El resto de acciones de escritura a Sheets ya no se usan. |
| `Z32xbfaNeeuLYOSu` | CRM API - Generar con IA | **CRM API · Generar Email IA** | Webhook `crm-generate-ai`. Genera asunto y cuerpo de outreach con Claude. No guarda datos. |
| `RSCkhhLvpN1VNSkz` | CRM API - Enviar Respuesta | **CRM API · Enviar Respuesta Email** | Webhook `crm-send-reply`. Envía email SMTP (alias sales/info) y registra en Supabase. |
| `bQkDifygg7Jdzoht` | CRM API - Web Lead | **CRM API · Intake Formulario Web** | Webhook `crm-web-lead`. Recibe el formulario web público (dedup + anti-spam) → Supabase `web_leads`. |
| `UjBm8MgPlKWziI7C` | CRM API - Optout | **CRM API · Baja / Optout** | Webhook `crm-optout`. Procesa bajas (unsubscribe) de emails y las marca en Supabase. |
| `XILkBXfc2Y6ol4VL` | CRM API - Leer Inbox | **CRM API · Leer Inbox (IMAP)** | Trigger IMAP. Lee correos entrantes → Supabase `inbox_messages`. |
| `G3QwTpsOvI27hnwl` | CRM API - Tareas | **CRM API · Tareas (LEGACY, sin uso)** | Webhook `crm-tarea`. OBSOLETO: la app gestiona tareas en Supabase. Aún escribe en Google Sheets. Candidato a desactivar. |

### Grupo Pipeline (auxiliares)

| ID | Nombre actual | Nombre nuevo | Descripción sugerida |
|----|---------------|--------------|----------------------|
| `VL8oMOZoFcPofYjV` | Fase 1 - Captacion de Prospectos (Apify) | **Pipeline · 1 · Captación (Apify)** | Webhook `crm-buscar-leads` + manual. Busca prospectos con Apify, evalúa con Claude, guarda en Supabase. |
| `np9xJ5KJUurABOvO` | Fase 2 - Enriquecimiento de Contacto | **Pipeline · 2 · Enriquecimiento** | Manual. Enriquece contactos con Apify y actualiza Supabase. |
| `8kr7klnnEkXBRp71` | Fase 2.5 - Scoring de Diseno y Revision | **Pipeline · 2.5 · Scoring de Diseño** | Manual. Puntúa diseño/estado web con Claude + Apify. |
| `43ZEOxHQoudxEkwz` | Fase 3 - Generar Asunto y Cuerpo Email | **Pipeline · 3 · Generar Email** | Manual. Genera asunto y cuerpo del email con Claude. |
| `gN11MdvNeqP5Y6a8` | Fase 3 - Outreach y Notas IA Visual | **Pipeline · 3 · Outreach + Notas IA** | Manual. Prepara outreach y notas visuales con Claude. |
| `ITdsEWd94R8ptUlb` | Fase 3 - Envio de Emails | **Pipeline · 3 · Envío de Emails** | Manual (lo dispara la app al crear campaña). Envía por SMTP + registra en Supabase. |
| `ZMQkvDXtD2tdMuYN` | Fase 4 - Seguimiento Email | **Pipeline · 4 · Seguimiento Email (INACTIVO)** | Programado. DESACTIVADO a propósito por coste de tokens. La app ya no lo dispara. |
| `JM3bEVBWajjmcCvV` | Fase 4 - WhatsApp Seguimiento | **Pipeline · 4 · WhatsApp Seguimiento** | Manual. Seguimiento por WhatsApp (Meta) + registra en Supabase. |
| `3YCzZ0rcbhK4W4H2` | Seguimiento - Leer Respuestas Email | **Pipeline · Leer Respuestas Email (IMAP)** | Trigger IMAP. Detecta respuestas a outreach y actualiza el estado del lead en Supabase. |

## Cómo aplicarlo (3 opciones)

1. **A mano en n8n (recomendado, sin riesgo)**: abrí cada workflow → doble clic
   en el título para renombrar → pegá el nombre nuevo. Para la descripción, usá
   el panel de detalles del workflow. ~2 min cada uno.
2. **Yo lo aplico por API**: requiere que autorices la escritura a n8n (hoy el
   sistema la bloquea por seguridad). Lo haría de a uno, verificando que cada
   workflow siga **activo** después de cada cambio.
3. **Tags (organización extra, opcional)**: agrupar con etiquetas `crm-api`,
   `pipeline`, `legacy`, `inactivo` para filtrar en la UI.

## Pendiente aparte: quitar Google Sheets

"Sacar Sheets" implica 3 pasos, todos en workflows en vivo (cambio funcional,
hacer con prueba):
1. **`CRM API · Tareas`**: está huérfano → **desactivar** (no migrar; nadie lo usa).
2. **`CRM API · Escritura + Scoring IA`**: quitar el nodo que escribe el
   resultado IA en Sheets (el frontend ya lo guarda en Supabase → es redundante).
3. **`CRM API · Leer datos (Sheets)`**: migrar `search_log` a una tabla Supabase
   y apuntar ahí la lectura. Requiere crear la tabla + ajustar el frontend.

Recomendación: hacerlo en ese orden (1 es inmediato y seguro; 2 y 3 con prueba).
