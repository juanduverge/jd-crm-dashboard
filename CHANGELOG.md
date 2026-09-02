# Changelog

Registro de cambios relevantes del CRM y de su infraestructura (n8n, Docker,
servidor). Formato: qué cambió, por qué, qué toca, qué impacto tiene y cómo se
revierte.

## 2026-09-02 — Salida de Google Sheets

**Qué cambió.** El CRM ya no habla con Google Sheets. Tres frentes:

1. **Campana de notificaciones.** `NotificationBell` leía las últimas búsquedas
   con `useSearchLog` → `crmApi.readSheet('search_log')` → webhook
   `/crm-sheets-read`. Ahora usa `useUltimasBusquedas` →
   `leadsService.getUltimasBusquedas()`, que lee la tabla `lead_imports` de
   Supabase.
2. **Ping de integraciones.** `crmApi.ping()` sondeaba Sheets para saber si el
   CRM API respondía. Ahora llama al workflow dedicado `CRM API - Ping`
   (`/crm-ping`), que solo devuelve `{ ok: true }` y no tiene efectos
   secundarios. En Ajustes la fila pasó de «CRM API (webhooks Sheets)» a
   «CRM API (webhooks)».
3. **Puntuar / Analizar con IA.** Ambas acciones iban al workflow
   `CRM API - Escribir Sheets` (94 nodos), que buscaba la fila del lead en la
   hoja `prospects` solo para escribir el resultado de vuelta. Esa escritura era
   duplicada: `leadsService.puntuarLead` / `analizarLead` ya persisten `score`,
   `scored_at` y `score_reasoning` en Supabase desde el cliente. Se creó el
   workflow **`CRM API - IA Lead`** (`/crm-lead-ia`, id `IHYkAgzbj8ClDzm4`, 11
   nodos), que reutiliza literalmente los nodos ya probados
   (`Build * Prompt`, `Call Claude *`, `Parse * Response`, `Respond *`) sin los
   dos nodos de Sheets ni el cálculo de `row`.

**Por qué.** `CRM API - Leer Sheets` acumulaba 656 ejecuciones con 655 errores
(«The credential "Google Sheets account" needs to be reconnected»): la campana lo
sondeaba cada 30 s con la credencial OAuth caducada desde hacía meses. Era el
~99 % de los errores de n8n. Los datos ya viven al 100 % en Supabase, así que
Sheets no aportaba nada.

**Qué toca.**
- `src/services/crmApi.ts` — fuera `readSheet()`, el tipo `SheetTab` y el helper
  `rowsFromResponse()`; `ping()` reescrito; `puntuarLead` / `analizarLead`
  apuntan a `/crm-lead-ia`.
- `src/services/leadsService.ts` — nuevo `getUltimasBusquedas()` y su tipo
  `UltimaBusqueda` (no deduplica, a diferencia de `getHistorialBusquedas`).
- `src/hooks/useData.ts` — `useSearchLog` → `useUltimasBusquedas`.
- `src/components/layout/NotificationBell.tsx`, `src/features/settings/SettingsPage.tsx`.
- n8n: alta de `CRM API - IA Lead`; `CRM API - Leer Sheets` y
  `CRM API - Escribir Sheets` quedan **desactivados, no borrados**.

**Impacto.** Ninguno visible: mismo diseño, mismas funciones, misma forma de
respuesta (`{ ok, leadId, scoreIA, ... }`), verificada con llamadas reales a los
dos endpoints. Desaparece la fuente principal de errores de n8n y el sondeo cada
30 s contra una API externa.

**Cómo revertir.**
- Código: `git revert` de este commit.
- n8n: reactivar `CRM API - Leer Sheets` y `CRM API - Escribir Sheets` desde la
  UI, o `POST /api/v1/workflows/<id>/activate` (ids `Xq0CC1t5bXhrbVbM` y
  `Hh7TjtJm32hVVk30`). Los 20 workflows están exportados tal como estaban antes
  de tocar nada en `~/backups/workflows-20260902/` del servidor.
- Ojo: reactivar Sheets no basta para que funcione — la credencial OAuth de
  Google sigue caducada.
