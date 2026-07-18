# Revisión del análisis con IA (Claude)

> Revisión profunda del flujo de puntuación/análisis de leads con IA.
> Fecha: 2026-07-18. Fuente: `src/services/leadsService.ts`,
> `src/features/leads/LeadDrawer.tsx`, `n8n/crm-sheets-write.json`.

---

## 1. Flujo actual (acción `analizar_lead`)

```
LeadDrawer "Analizar con IA"
  → leadsService.analizarLead()
  → crmApi.analizarLead()  POST /crm-sheets-write { action: "analizar_lead", ... }
  → n8n (workflow crm-sheets-write):
       Validate → Route(analizar_lead)
       → Find Prospects Row Analizar   (LEE la hoja Sheets "prospects" para ubicar la fila)
       → Build Analizar Prompt         (arma el prompt de Claude)
       → Call Claude Analizar          (POST https://api.anthropic.com/v1/messages)
       → Parse Analizar Response       (parsea el JSON de Claude)
       → Build Analizar Fields         (mapea a columnas AK–AO)
       → Write Analizar Result         (ESCRIBE en Sheets "prospects!AK–AO")
       → Respond { scoreIA, observaciones, recomendaciones, oportunidades, errores }
  → leadsService ESCRIBE en Supabase: leads.score, score_reasoning (JSON), scored_at
```

El prompt es sólido: rol de consultor de ventas B2B, datos del lead
(PageSpeed, SSL, rating, notas), y exige respuesta **solo JSON** con
`scoreIA` + observaciones/recomendaciones/oportunidades/errores.

---

## 2. Problemas encontrados (revisar en el n8n en vivo)

### 🔴 P1 — La acción `puntuar_lead` no tiene ruta
El botón **"Puntuación IA manual"** (`LeadDrawer.tsx:80`) llama
`crmApi.puntuarLead` → `POST /crm-sheets-write { action: "puntuar_lead" }`.
Pero el nodo **Route** de este workflow enruta 23 acciones y **`puntuar_lead`
NO está entre ellas** (solo `analizar_lead`).

**Consecuencia:** con este workflow, la puntuación manual cae sin ruta →
falla o no hace nada. **Verificar en vivo**: o el workflow real tiene esa rama
(y este export está viejo), o el botón está roto en producción.

### 🟠 P2 — Doble escritura del resultado IA
El resultado se escribe **dos veces**: n8n lo mete en Sheets (`prospects!AK–AO`)
y el frontend lo mete en Supabase (`leads.score`, `score_reasoning`). La
escritura a Sheets es **legado redundante**: la app lee de Supabase, no de Sheets.

### 🟠 P3 — El análisis IA está acoplado a la hoja Sheets (fragilidad)
La rama hace `Find Prospects Row Analizar` para localizar la fila del lead en la
hoja **prospects**. Si el lead **no está en esa hoja** (p. ej. creado tras la
migración a Supabase), `Build Analizar Prompt` lanza `Lead no encontrado` y
**todo el análisis falla** — aunque Supabase tenga el dato.

**Consecuencia probable:** los leads nuevos (post-migración) no se pueden
analizar con IA. Es el bug de mayor impacto funcional de esta revisión.

### 🟡 P4 — Modelo de Claude posiblemente inválido/desactualizado
El nodo construye el body con `model: "claude-sonnet-4-6"`, que **no coincide
con los IDs vigentes de Anthropic**. IDs válidos actuales: `claude-sonnet-5`,
`claude-opus-4-8`, `claude-haiku-4-5`. Si el ID es inválido, la API responde
error y el análisis falla.

**Recomendación:** actualizar a `claude-sonnet-5` (buen balance) o
`claude-opus-4-8` (análisis más profundo). Header `anthropic-version: 2023-06-01`
está OK.

---

## 3. Recomendación de rediseño (proyecto aparte)

Extraer un workflow limpio **`crm-scoring-ia`** que reemplace la rama IA de
`crm-sheets-write`:

- **Recibe los datos del lead en el body** (el frontend ya los envía) → **no lee
  la hoja Sheets** (elimina P3).
- Dos ramas: `puntuar` (solo `scoreIA`) y `analizar` (score + reasoning) →
  arregla P1.
- **No escribe en Sheets** (elimina P2); el frontend persiste en Supabase.
- Modelo Claude vigente (arregla P4).

Con esto el análisis IA queda desacoplado del legado Sheets, funciona para
cualquier lead de Supabase, y `crm-sheets-write` puede retirarse.

---

## 4. Acción inmediata sugerida

1. Abrir `crm-sheets-write` en el n8n en vivo y confirmar P1 (¿existe la rama
   `puntuar_lead`?) y P4 (¿qué modelo usa realmente?).
2. Probar "Analizar con IA" sobre un lead **creado después** de la migración a
   Supabase para confirmar P3.
3. Re-exportar el workflow real a `n8n/crm-sheets-write.json` (este export puede
   estar desfasado).
