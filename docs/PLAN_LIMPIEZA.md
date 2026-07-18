# Plan de limpieza y refactorización — Fase Final

> Fecha: 2026-07-18. Auditoría previa a cualquier borrado.
> Cada ítem está **verificado** (grep de consumidores + grafo `graphify-out/`).
> Orden: de menor a mayor riesgo. Nada se elimina sin que compile `tsc` después.

---

## A. Código muerto — eliminación segura (riesgo bajo)

| # | Qué | Evidencia | Acción |
|---|-----|-----------|--------|
| A1 | `src/graphify-out/` (caché colada dentro de `src/`) | Salida de una corrida previa de graphify sobre `src/`; no es código | Borrar carpeta + añadir `graphify-out/` a `.gitignore` |
| A2 | Deps `i18next`, `react-i18next` | 0 imports en `src/` (`grep` sin resultados) | Quitar de `package.json` + `npm install` |
| A3 | CRUD de `sheetsService.ts` | Único método vivo: `isLive()`. `rowToLead`, `parseReasoning`, `ESTADO_MAP`, etc. sin consumidores | Borrar el cuerpo muerto; sustituir `isLive()` por chequeo directo o quitar el label del dashboard |
| A4 | `crmApi.readSheet` + tipo `SheetTab` (parte lectura) | Único consumidor = `sheetsService` (que muere en A3) | Borrar método y podar el tipo |
| A5 | Comentario obsoleto en `store/leadsStore.ts` | `// Se hidrata desde React Query (sheetsService)` — ya no ocurre | Actualizar el comentario a la realidad (Supabase) |
| A6 | `config.sheets` (id, apiKey, tabs) en `lib/config.ts` | Sheets ya no es la DB | Eliminar el bloque tras A3/A4 |

## B. Variables de entorno legacy (riesgo bajo, coordinar con `.env` del server)

| # | Variable | Acción |
|---|----------|--------|
| B1 | `VITE_GOOGLE_SHEETS_ID`, `VITE_GOOGLE_API_KEY` | Quitar de `.env.example` y `config.ts` tras A6 |
| B2 | `VITE_APP_PASSWORD` | Confirmar que ningún flujo la lee; luego eliminar |
| B3 | `VITE_N8N_HOOK_TOKEN` | Mantener (webhooks aún la aceptan como opcional) |

## C. Documentación a consolidar (riesgo bajo)

`docs/` tiene 17 archivos, varios desactualizados o solapados. Nueva fuente de
verdad: **`docs/ARQUITECTURA.md`**. Propuesta:

| Doc | Destino |
|-----|---------|
| `ARQUITECTURA.md` (nuevo) | ✅ Fuente autoritativa |
| `DEPLOY.md` | 🔴 Obsoleto (describe Hostinger estático, no Docker/Oracle) → archivar o reescribir |
| `ESTADO.md`, `EXPLICACION_PROYECTO.md`, `ESTRUCTURA.md` | 🟡 Solapan con ARQUITECTURA → mover a `docs/historico/` |
| `DOCUMENTACION_COMPLETA.pdf/.html` | 🟡 Snapshot viejo (pre-Supabase) → archivar |
| `AUDITORIA_TECNICA.md`, `SEGURIDAD_FASE2.md` | ✅ Conservar (contexto de decisiones) |
| `API.md`, `MAPA_WORKFLOWS.md`, `FORMULARIO_WEB.md`, `MODULO_TAREAS.md`, `DNS_EMAIL_SETUP.md`, `CI_CD.md`, `ELIMINACION_REGISTROS.md`, `INSTALACION.md`, `ROADMAP.md` | ✅ Conservar (referencia puntual) |

## D. Base de datos (riesgo medio — requiere confirmación)

| # | Hallazgo | Acción |
|---|----------|--------|
| D1 | Falta migración `0011` (salto `0010`→`0012`) | Confirmar si fue número saltado a propósito o migración perdida. **No renumerar** migraciones ya aplicadas |

## E. Oportunidades de refactor (riesgo medio — post-limpieza, opcional)

Del `GRAPH_REPORT.md`:
- Comunidades de baja cohesión (`Charts y primitivas UI` 0.09, `Formularios y Auth UI` 0.08): candidatas a subdividir en módulos más enfocados. **No urgente**; solo si se toca esa zona.
- 81 nodos débilmente conectados: revisar exports sin consumir (posibles componentes huérfanos) uno a uno antes de borrar.

---

## Orden de ejecución propuesto

1. **Bloque A** completo (código muerto) → `npm run build` (tsc) debe pasar.
2. **Bloque B** (env) → coordinar con el `.env` de producción antes de borrar variables.
3. **Bloque C** (docs) → mover a `docs/historico/`, no borrar (histórico de decisiones).
4. **D y E** requieren tu confirmación explícita.

Cada bloque = un commit atómico con mensaje descriptivo. Nada se toca en
producción hasta verificar el build.
