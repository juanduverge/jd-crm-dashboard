# Informe — Fase Final (refactorización, limpieza y documentación)

> Fecha: 2026-07-18 · Rama: `main` · Commits: `a935694` … `6373f08` (7)
> Objetivo: dejar el proyecto con calidad Enterprise, sin agregar
> funcionalidades. Auditoría antes de cualquier cambio.

---

## 1. Resumen ejecutivo

Se auditó el proyecto completo con un grafo de conocimiento (`graphify-out/`) y
análisis de dependencias. Hallazgo central: **la migración de datos a Supabase
está completa**; Google Sheets ya no es la base de datos. A partir de eso se
eliminó el código muerto del legado Sheets, se depuraron dependencias y
variables de entorno, se consolidó la documentación y se documentó la capa n8n.

Cero cambios de lógica de negocio. Build verificado (`tsc -b` + `vite build`) tras
cada bloque.

---

## 2. Archivos eliminados

| Archivo | Motivo |
|---------|--------|
| `src/services/sheetsService.ts` | Servicio de Google Sheets sin consumidores (único método vivo, `isLive()`, reemplazado por `crmApi.enabled()`). |
| `src/graphify-out/` | Caché de graphify colada dentro de `src/` (basura física). |
| Dep `i18next` | 0 imports en `src/`. |
| Dep `react-i18next` | 0 imports en `src/`. |

## 3. Código podado (sin eliminar el archivo)

| Archivo | Qué se quitó |
|---------|--------------|
| `src/services/crmApi.ts` | 442 → 165 líneas. ~30 métodos de escritura a Sheets (createLead, updateLead, createCampaign, deletePipeline, createNote, updateTarea…) y sus 6 tipos de payload, todos sin consumidores. **Conservado**: readSheet, IA (generateWithAI/puntuarLead/analizarLead), sendReply, buscarLeads, ping, enabled. |
| `src/lib/config.ts` | Bloque `config.sheets` (id/apiKey/tabs), sin usos. |
| `src/vite-env.d.ts` | 4 vars legacy (VITE_APP_PASSWORD, VITE_GOOGLE_SHEETS_ID, VITE_GOOGLE_API_KEY, VITE_CLAUDE_VIA_N8N); se añadieron las de Supabase que faltaban. |
| `.env.example` | Reescrito solo con variables vigentes. |
| `src/store/leadsStore.ts` | Comentario obsoleto (referencia a Sheets → Supabase). |

## 4. Archivos movidos / renombrados

| De | A | Motivo |
|----|---|--------|
| `docs/DEPLOY.md` | `docs/historico/` | Describe Hostinger estático (obsoleto). |
| `docs/ESTADO.md` | `docs/historico/` | Snapshot pre-Supabase. |
| `docs/EXPLICACION_PROYECTO.md` | `docs/historico/` | Superado por ARQUITECTURA. |
| `docs/ESTRUCTURA.md` | `docs/historico/` | Estructura anterior. |
| `docs/DOCUMENTACION_COMPLETA.html/.pdf` | `docs/historico/` | Export pre-Supabase. |
| `tsconfig.tsbuildinfo` | (desversionado) | Artefacto de build; añadido a `.gitignore`. |

## 5. Documentación creada

| Documento | Contenido |
|-----------|-----------|
| `docs/ARQUITECTURA.md` | **Fuente de verdad**: stack, flujo, estructura, capa de datos, auth, integraciones, env, deploy, grafo. |
| `docs/PLAN_LIMPIEZA.md` | Auditoría priorizada por riesgo. |
| `docs/historico/README.md` | Explica qué se archivó y por qué. |
| `n8n/README.md` (reescrito) | Inventario real de workflows post-Supabase. |
| `docs/INFORME_FASE_FINAL.md` | Este informe. |

## 6. Mejoras implementadas

- Frontera de datos clarificada: Supabase = datos; n8n = integración (email/IA/búsqueda).
- `crmApi` reducido a su superficie viva → 62% menos líneas, más legible.
- Tipos de entorno (`vite-env.d.ts`) exactos respecto a lo que el código usa.
- Documentación reducida de 17 archivos dispersos a 1 fuente de verdad + histórico.
- `.gitignore` endurecido (artefactos de build).
- 7 commits atómicos y descriptivos, cada uno con build verde.

---

## 7. Auditoría n8n (resumen)

| Workflow | Estado |
|----------|--------|
| `crm-sheets-read` | ✅ Vivo (search_log, ping) |
| `crm-sheets-write` | ✅ Vivo (solo acciones IA puntuar/analizar) |
| `crm-web-lead` | ✅ Vivo (intake formulario web → Supabase) |
| `crm-tarea` | 🟡 Huérfano (Tareas migró a Supabase) |
| `crm-generate-ai`, `crm-send-reply`, `crm-buscar-leads` | ⚠️ Vivos, sin backup en el repo |

---

## 8. Recomendaciones para la siguiente fase

### Requieren decisión de Juan (no ejecutadas)
1. **`n8n-migracion/`**: contiene secretos en texto plano (`encryption-key.txt`,
   `credentials.json`, `cf-service-token.json`, `.env`) en el árbol de trabajo.
   Mover fuera del proyecto a almacenamiento cifrado. Gitignorado, no filtrado.
2. **Exportar** `crm-generate-ai`, `crm-send-reply`, `crm-buscar-leads` desde n8n
   a `n8n/` para tener backup versionado.
3. **`crm-tarea`**: desactivar en n8n si ninguna otra automatización lo dispara.
4. **Migración `0011`**: falta en `supabase/migrations/` (salto 0010→0012).
   Confirmar si fue un número saltado o una migración perdida. No renumerar.

### Deuda técnica opcional (del grafo)
5. Comunidades de baja cohesión (`Charts y primitivas UI` 0.09, `Formularios y
   Auth UI` 0.08): subdividir en módulos más enfocados solo si se toca esa zona.
6. 81 nodos débilmente conectados: revisar exports huérfanos uno a uno.
7. Code-splitting: el bundle principal supera 500 kB; considerar `manualChunks`.

### DevOps (evaluación, punto 11 del brief)
8. **¿Docker seguirá siendo necesario tras completar Supabase?** Sí. El deploy
   sirve la SPA estática con nginx, que además proxia `/n8n-api` (inyección
   server-side de la API key) y aplica CSP. Esa función de proxy seguro no la
   cubre Supabase; Docker+nginx permanece como capa de borde de la app.

### Seguridad (punto 9 — pendiente heredado)
9. Los webhooks de escritura/envío aún aceptan `X-CRM-TOKEN` como opcional. Con
   Cloudflare Access delante el riesgo es bajo, pero conviene hacerlo obligatorio
   en los workflows que envían email o buscan leads.
