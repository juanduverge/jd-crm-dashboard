# Auditoría de n8n — JD Developer CRM

> Fecha: 2026-07-18 · **Solo lectura**: no se modificó ningún workflow, nodo,
> conexión ni credencial. Fuente: API en vivo de n8n (`backoffice.jddeveloper.com`).
> 17 workflows · 8 credenciales.

---

## 0. Resumen en lenguaje simple

Tu n8n tiene **17 automatizaciones** divididas en dos grupos:

1. **"CRM API" (8)** — las que tu página llama en tiempo real (guardar, leer,
   enviar email, IA). Son **críticas**: si se caen, la app deja de funcionar.
2. **"Fase" y "Seguimiento" (9)** — el motor de captación y outreach (buscar
   prospectos, enriquecer, puntuar, escribir y enviar emails, seguimiento). Son
   **auxiliares**: corren por detrás, casi todas a mano o programadas.

**Buenas noticias:** los nombres ya son bastante ordenados, y la mayoría está
bien construida. **Cosas a mirar:** una automatización de seguimiento está
apagada pero la app la invoca, un workflow viejo de Tareas sigue escribiendo en
Google Sheets, y hay una credencial y un par de cosas que parecen sin uso. Nada
urgente; nada que yo haya tocado.

---

## 1. Estructura actual

### Grupo A — CRM API (críticos: sirven a la app en vivo)

| Workflow | Webhook / Trigger | Guarda en | Lo llama | Estado |
|----------|-------------------|-----------|----------|--------|
| **CRM API - Leer Sheets** | `crm-sheets-read` | Google Sheets | Dashboard (historial `search_log`, ping) | ✅ activo |
| **CRM API - Escribir Sheets** | `crm-sheets-write` | Google Sheets (+Claude) | Dashboard (**solo** scoring IA: `puntuar_lead`/`analizar_lead`) | ✅ activo · 94 nodos |
| **CRM API - Generar con IA** | `crm-generate-ai` | — (solo responde) | Dashboard (redacción de outreach con IA) | ✅ activo |
| **CRM API - Enviar Respuesta** | `crm-send-reply` | Supabase | Dashboard (responder emails desde inbox) | ✅ activo |
| **CRM API - Web Lead** | `crm-web-lead` | **Supabase** | Formulario web público | ✅ activo |
| **CRM API - Optout** | `crm-optout` | Supabase | Enlaces "darse de baja" en emails | ✅ activo |
| **CRM API - Leer Inbox** | IMAP (poll email) | Supabase | — (mete correos entrantes) | ✅ activo |
| **CRM API - Tareas** | `crm-tarea` | **Google Sheets** | **Nadie** (la app usa Supabase) | 🟡 activo pero huérfano |

### Grupo B — Pipeline de outreach (auxiliares)

| Workflow | Trigger | Servicios | Estado |
|----------|---------|-----------|--------|
| **Fase 1 - Captación de Prospectos (Apify)** | `crm-buscar-leads` + manual | Apify, Claude, Supabase | ✅ activo · lo llama el dashboard (buscar leads) |
| **Fase 2 - Enriquecimiento de Contacto** | manual | Apify, Supabase | ✅ activo |
| **Fase 2.5 - Scoring de Diseño y Revisión** | manual | Claude, Apify, Supabase | ✅ activo |
| **Fase 3 - Generar Asunto y Cuerpo Email** | manual | Claude, Supabase | ✅ activo |
| **Fase 3 - Outreach y Notas IA Visual** | manual | Claude, Supabase | ✅ activo |
| **Fase 3 - Envío de Emails** | manual (lo corre la app por API) | Supabase, SMTP | ✅ activo · lo dispara CampaignsPage |
| **Fase 4 - Seguimiento Email** | programado (schedule) | Claude, SMTP, Supabase | 🔴 **INACTIVO** (pero la app lo invoca) |
| **Fase 4 - WhatsApp Seguimiento** | manual | WhatsApp (Meta), Supabase | ✅ activo |
| **Seguimiento - Leer Respuestas Email** | IMAP (poll email) | Supabase | ✅ activo |

### Credenciales (8)

| Credencial | Tipo | ¿Usada? |
|------------|------|---------|
| Google Sheets account | googleSheetsOAuth2 | ✅ (Leer/Escribir Sheets, Tareas) |
| Anthropic - JDDeveloper | anthropicApi | ✅ (7 workflows de IA) |
| Apify - JDDeveloper | httpHeaderAuth | ✅ (Fase 1, 2, 2.5) |
| Email SMTP - JDDeveloper | smtp | ✅ (envío/respuesta) |
| Email SMTP - Info | smtp | ✅ (Enviar Respuesta, alias Info) |
| Email IMAP - JDDeveloper | imap | ✅ (Leer Inbox, Leer Respuestas) |
| WhatsApp API - JDDeveloper | whatsAppApi | ✅ (Fase 4 WhatsApp) |
| **Google Calendar account** | googleCalendarOAuth2 | 🟡 **Ningún workflow la usa** |

---

## 2. Relaciones entre workflows

- **No hay nodos "Execute Workflow"**: los workflows **no se llaman entre sí**
  dentro de n8n. El pipeline de "Fases" se ejecuta **manualmente** o lo dispara
  la app por ID a través de la API de n8n (`n8nService.run`).
- **La app dispara por ID** (desde `CampaignsPage`, al crear campaña):
  - `Fase 3 - Envío de Emails` (`ITdsEWd94R8ptUlb`) ✅
  - `Fase 4 - Seguimiento Email` (`ZMQkvDXtD2tdMuYN`) ⚠️ **está inactivo**
- **Los dos lectores de email IMAP** (`CRM API - Leer Inbox` y `Seguimiento -
  Leer Respuestas Email`) usan la misma credencial IMAP y leen el mismo buzón.
  Probablemente hacen cosas distintas (uno llena la bandeja, otro detecta
  respuestas de outreach), pero **conviene verificar que no se pisen**.

---

## 3. Elementos "posiblemente sin uso" (NO eliminados)

| Elemento | Por qué parece sin uso |
|----------|------------------------|
| **CRM API - Tareas** (`crm-tarea`) | El dashboard gestiona tareas contra Supabase (`tasksService`); nada llama a `/crm-tarea`. Además sigue escribiendo en **Google Sheets**, inconsistente con el resto ya migrado. |
| **Credencial "Google Calendar account"** | No aparece referenciada por ningún nodo de los 17 workflows. Puede ser de una integración planeada o retirada. |
| **`config.workflows.whatsappSeguimiento`** (frontend) | El ID `JM3bEVBWajjmcCvV` está en `config.ts` pero el frontend **no lo dispara** en ningún lado. El workflow existe y está activo; la referencia en la app es la que sobra. |
| **Ramas muertas en `CRM API - Escribir Sheets`** | De sus 94 nodos, el dashboard solo usa las acciones `puntuar_lead`/`analizar_lead`. Las ~22 acciones restantes (CRUD a Sheets de lead/campaign/contacto/nota/pipeline/config) ya no las llama nadie. |

> Verificación pendiente (solo tú, en la UI): confirmar que ninguna otra
> automatización o disparador externo use `crm-tarea` ni la credencial de
> Calendar antes de considerarlos para retiro.

---

## 4. Riesgos encontrados

1. 🔴 **`Fase 4 - Seguimiento Email` está INACTIVA pero la app la invoca.** Al
   crear una campaña, `CampaignsPage` dispara ese workflow por API; si está
   apagado, **el seguimiento automático por email no corre**. O se reactiva, o
   se quita la invocación de la app. (Decisión tuya.)
2. 🟠 **`crm-tarea` escribe en Google Sheets** mientras el resto del sistema usa
   Supabase → dato de tareas potencialmente desincronizado.
3. 🟡 **Modelo de IA `claude-sonnet-4-6`** usado en los 7 workflows de IA (bien:
   es consistente). Confirmar que es el ID de modelo vigente que querés usar; si
   Anthropic lo retira, los 7 fallan a la vez.
4. 🟡 **Dos lectores IMAP** sobre el mismo buzón: verificar que no dupliquen
   trabajo ni marquen correos dos veces.
5. 🟡 **Pipeline dependiente de ejecución manual**: la mayoría de las "Fases" son
   trigger manual, sin encadenarse entre sí. Funciona, pero es frágil y depende
   de que alguien las corra en orden. Conviene documentar la secuencia.

---

## 5. Qué renombré y por qué

**No renombré nada.** Motivo técnico importante:

- En n8n, **los nodos se referencian por su nombre** dentro de las expresiones
  (ej. `$('Build Analizar Prompt').item.json`). **Renombrar un nodo rompe esas
  referencias** y la automatización deja de funcionar. Por eso **renombrar nodos
  en vivo NO es seguro** y no lo hice.
- Los **nombres de workflows y credenciales ya son buenos y consistentes**
  (`CRM API - <x>`, `Fase N - <x>`, `<Servicio> - JDDeveloper`). No requieren
  cambios.

### Propuesta de organización (segura, para cuando la apruebes)

En lugar de renombrar, usar **tags de n8n** (etiquetas), que son puramente
organizativas y **no afectan la lógica**:

| Tag propuesto | Workflows |
|---------------|-----------|
| `crm-api` | Los 8 "CRM API -" |
| `pipeline` | Las 9 "Fase" / "Seguimiento" |
| `legacy` | `CRM API - Tareas` (huérfano) |
| `inactivo` | `Fase 4 - Seguimiento Email` |

Los tags se aplican en la UI (o por API) y permiten filtrar sin tocar nada.

---

## 6. Recomendaciones para una futura limpieza (NO ejecutar ahora)

1. **Resolver `Fase 4 - Seguimiento Email`**: reactivar o quitar su invocación
   en `CampaignsPage`. Es el único riesgo funcional real.
2. **`CRM API - Tareas`**: una vez confirmes que nada lo usa, desactivarlo (no
   borrar). Si en semanas nada se rompe, eliminarlo.
3. **`CRM API - Escribir Sheets`**: extraer la rama de scoring IA a un workflow
   propio y limpio (sin dependencia de Sheets), y retirar las ramas de escritura
   muertas. Proyecto aparte (ver `docs/REVISION_IA.md`).
4. **Credencial Google Calendar**: confirmar si hay integración planeada; si no,
   eliminarla.
5. **`config.workflows.whatsappSeguimiento`**: si no se va a disparar desde la
   app, quitar la referencia del frontend.
6. **Backups**: exportar los 17 workflows a `n8n/` para tener respaldo versionado
   (hoy el repo solo tiene 4, y desactualizados). Guardar los secretos fuera del
   repo.
7. **Documentar la secuencia** de ejecución del pipeline de "Fases".

---

## 7. Nota de seguridad

Para esta auditoría se usó, con tu autorización, el **token de servicio de
Cloudflare** guardado en `n8n-migracion/cf-service-token.json` y una **API key de
n8n** que compartiste. Recomendación: **revocá esa API key** en n8n cuando
quieras (Settings → n8n API), ya que su función (esta auditoría) terminó.
