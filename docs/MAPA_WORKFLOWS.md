# MAPA_WORKFLOWS.md — Mapa de workflows n8n del CRM JDDeveloper

n8n corre en `localhost:5678`. Spreadsheet: `CRM_LeadGen_JDDeveloper` (id `1N8bL-ujDDg9hF9gqV0mQrD94AZeh_QItJ-Aft2Xd7NE`).
Última actualización: 2026-07-02.

## Flujo completo de punta a punta

```
[Apify Google Maps]
        │
        ▼
  Fase 1 - Captación  ──►  hoja "prospects"  (con PageSpeed, SSL, diagnóstico IA y score inicial)
        │
        ▼
  Fase 2 - Enriquecimiento de Contacto  ──►  completa email/teléfono/redes en "prospects"
        │
        ▼
  Fase 2.5 - Scoring de Diseño (IA Visual)  ──►  score de diseño vía screenshot + Claude Vision
        │
        ▼
  Fase 3 - Outreach y Notas IA Visual  ──►  exporta aprobados a hoja "outreach"
        │
        ▼
  Fase 3 - Generar Asunto y Cuerpo Email  ──►  redacta email personalizado con IA
        │
        ▼
  Fase 3 - Envío de Emails  ──►  envía (respeta opt-out + límite diario + footer legal) ──► "pipeline" + "messages"
        │
        ├──►  Fase 4 - Seguimiento Email  (cron 9am, respeta opt-out + límite diario + footer)
        └──►  Fase 4 - WhatsApp Seguimiento
        │
        ▼
  Seguimiento - Leer Respuestas Email (IMAP)  ──►  detecta respuestas y actualiza estado
```

## Workflows por categoría

### Pipeline de captación → envío (Fases)

| Workflow | ID | Trigger | Activo | Qué hace |
|----------|----|---------|--------|----------|
| **Fase 1 - Captación de Prospectos (Apify)** | `VL8oMOZoFcPofYjV` | Manual | Sí* | Punto de partida. Corre el actor Apify `compass~crawler-google-places` (Google Maps Scraper) buscando `"real estate agency"` en `"Miami, FL, USA"` (máx 20 por búsqueda). Por cada lead: mide PageSpeed móvil+desktop (Google PageSpeed API), detecta SSL, genera un diagnóstico con Claude (`claude-sonnet-4-6`) y un score inicial, y hace `appendOrUpdate` en la hoja **`prospects`**. |
| Fase 2 - Enriquecimiento de Contacto | `np9xJ5KJUurABOvO` | Manual | Sí | Completa email/teléfono/redes de los prospects (scraping web + Apify crawl de respaldo). |
| Fase 2.5 - Scoring de Diseño y Revisión | `8kr7klnnEkXBRp71` | Manual | Sí | Screenshot del sitio (Apify) → Claude Vision → score de diseño en `prospects`. |
| Fase 3 - Outreach y Notas IA Visual | `gN11MdvNeqP5Y6a8` | Manual | Sí | Exporta prospects aprobados a la hoja **`outreach`** + nota visual con IA. |
| Fase 3 - Generar Asunto y Cuerpo Email | `43ZEOxHQoudxEkwz` | Manual | Sí | Redacta asunto y cuerpo de email personalizado con IA. |
| Fase 3 - Envío de Emails | `ITdsEWd94R8ptUlb` | Manual | Sí | Envía los emails aprobados. Respeta opt-out, límite diario (`limite_diario_emails`), y añade footer legal bilingüe. Registra en `pipeline` y `messages`. |
| Fase 4 - Seguimiento Email | `ZMQkvDXtD2tdMuYN` | Cron 9am | Sí | Seguimiento automático a leads sin respuesta (≥4 días). Mismas reglas de opt-out/límite/footer. |
| Fase 4 - WhatsApp Seguimiento | `JM3bEVBWajjmcCvV` | Manual | Sí | Seguimiento por WhatsApp. |

\* *Está "activo" pero tiene trigger manual, así que solo corre cuando Juan lo dispara — no consume créditos de Apify por sí solo.*

### API interna del dashboard (webhooks CRM API)

| Workflow | ID | Endpoint |
|----------|----|----------|
| CRM API - Leer Sheets | `Xq0CC1t5bXhrbVbM` | GET `crm-sheets-read?sheet=...` |
| CRM API - Escribir Sheets | `Hh7TjtJm32hVVk30` | POST `crm-sheets-write` |
| CRM API - Leer Inbox | `XILkBXfc2Y6ol4VL` | IMAP → hoja `inbox` |
| CRM API - Generar con IA | `Z32xbfaNeeuLYOSu` | POST (genera contenido con Claude) |
| CRM API - Enviar Respuesta | `RSCkhhLvpN1VNSkz` | POST (responde desde la Bandeja) |
| CRM API - Optout | `UjBm8MgPlKWziI7C` | GET `crm-optout?email=...` (público, baja legal) |

### Otros

| Workflow | ID | Qué hace |
|----------|----|----------|
| Seguimiento - Leer Respuestas Email | `3YCzZ0rcbhK4W4H2` | IMAP: detecta respuestas de leads y actualiza su estado. |

## Notas

- **"My workflow" resuelto**: era el workflow de captación Apify que faltaba documentar. Confirmado por sus nodos (actor Apify Google Places + escritura en `prospects`) y renombrado a `Fase 1 - Captación de Prospectos (Apify)` el 2026-07-02. No tenía ejecuciones registradas en el historial de n8n (probablemente fueron purgadas o corrió pocas veces manualmente).
- La API pública de n8n rechaza propiedades extra en `settings` al hacer PUT — al actualizar workflows por API hay que enviar `settings` solo con claves permitidas (`executionOrder`, `saveManualExecutions`, etc.), no `binaryMode`/`availableInMCP`.
