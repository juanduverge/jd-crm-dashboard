# T03 · Conversión común de artículos

**Para:** ChatGPT (Codex) · **Repo:** `JD Developer/jd-developer-site` · **Rama:** `cms/T03`
**Depende de:** — · **Estado:** HECHA (fusionada en `main` el 20-oct, `7df483c`)

## Objetivo
Sacar de `scripts/blog-nav.cjs` la lógica que convierte un artículo (Markdown + datos) en lo que la
web muestra, a un módulo propio y reutilizable. **La web tiene que salir exactamente igual que hoy.**

## Contexto
- Lee primero `AGENTS.md` y `CLAUDE.md` de `jd-developer-site`. Es **Next 15.5**, no 16: no actualices nada.
- Plan general: `../../jd-crm-dashboard/docs/cms/PLAN_CONSTRUCCION.md`.
- Este archivo de tarea está en el repo del CRM: escribe tu informe aquí, pero **no hagas commit en
  el repo del CRM**. Tus commits van solo a la rama `cms/T03` de `jd-developer-site`.
- Hoy `scripts/blog-nav.cjs` lee `content/blog/*.md` antes de compilar y genera
  `src/monova/data/blog-posts.json` y `blog-nav.json`. El tipo `Post` está en `src/monova/blog.ts`.
- Más adelante (T04) los artículos vendrán de Supabase en vez de los `.md`, y el CRM (T06) usará
  **este mismo módulo** para la vista previa. Por eso el módulo:
  - no puede leer archivos ni usar `fs`/`path`: recibe datos y devuelve datos;
  - tiene que ser **ESM puro** (`export`), sin nada de Node, para que también funcione en el navegador con Vite.

## Archivos que puedes tocar
- `src/cms/render.mjs` (nuevo)
- `scripts/blog-nav.cjs` (puedes renombrarlo a `scripts/blog-nav.mjs`)
- `package.json`: solo las líneas `prebuild` y `predev` si renombras el script
- `scripts/check-render.mjs` (nuevo)

## No toques
- Nada en `src/app/`, `src/monova/` (salvo que `blog-posts.json`/`blog-nav.json` se regeneran solos), `content/`,
  `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts`, dependencias.
- No despliegues.

## Qué hay que hacer
1. Antes de cambiar nada: copia `src/monova/data/blog-posts.json` y `blog-nav.json` a
   `scripts/.referencia/` (y añade esa carpeta a `.gitignore`). Son la referencia para comparar.
2. Crea `src/cms/render.mjs` con:
   - `renderArticulo(datos)` → devuelve el objeto `Post` tal como hoy (mismos campos y mismo orden de
     claves: `slug, lang, title, titleSeo, description, type, cat, date, dateLabel, readMin, author,
     serviceLink, cover, html, excerpt, sources`).
     `datos` = `{ lang, slug, title_h1, title_seo, meta_description, article_type, fecha, author,
     related_service, cover, body, sources }` (nombres de Supabase, ver `supabase/migrations/0057_cms.sql`
     del CRM, en `../../jd-crm-dashboard/`). `body` es el Markdown **con** el H1 y la línea «By/Por…»: quitarlos es trabajo del módulo, como hoy.
   - `construirNav(posts)` → el objeto de `blog-nav.json`.
   - `ordenarPosts(posts)` → por fecha descendente, como hoy.
   - Las constantes `TYPE_LABEL` y `MONTHS` viven en el módulo.
   - Usa `marked` igual que ahora (`marked.parse(body, { async: false })`), importado como ESM.
3. `blog-nav` queda solo con: leer los `.md`, separar la cabecera, mapear sus claves a `datos`
   (`type` → `article_type`, `date` → `fecha`, `service_link` → `related_service`, portada desde la
   lista `COVER` que sigue en el script por ahora), llamar al módulo y escribir los JSON.
4. `scripts/check-render.mjs`: regenera y compara byte a byte con `scripts/.referencia/`. Sale con
   código 1 si hay cualquier diferencia y dice en qué artículo y en qué campo.

## Criterios de aceptación
- [ ] `node scripts/check-render.mjs` dice que los dos JSON son idénticos.
- [ ] `src/cms/render.mjs` no importa nada de Node (`fs`, `path`, `node:*`, `require`).
- [ ] `npm run build` funciona (el `prebuild` sigue generando los JSON).
- [ ] `npx tsc --noEmit` y `npx eslint src` sin errores nuevos.
- [ ] Ningún archivo fuera de la lista permitida cambia (salvo los JSON regenerados, que deben quedar iguales).

## Cómo comprobarlo
```
node scripts/check-render.mjs
npm run build
git diff --stat main...cms/T03
```

---

## Informe del agente
**ChatGPT (Codex), 20-oct-2026. Implementada; pendiente de revisión de Claude.**

- **Repo / rama / commit:** `jd-developer-site` · `cms/T03` (desde `main`, coincidente con la referencia local `origin/main`) · `66cdfee` — `refactor(cms): extraer conversión común de artículos (T03)`.
- Copié los dos JSON originales a `scripts/.referencia/` antes de modificar el generador y añadí esa carpeta a `.gitignore`, como pide el paso 1. Las referencias son locales y no se incluyen en el commit.
- Creé `src/cms/render.mjs`: ESM puro, importa únicamente `marked`, recibe los campos indicados y devuelve el `Post` con el mismo orden de claves. Contiene `TYPE_LABEL`, `MONTHS`, `renderArticulo`, `ordenarPosts` y `construirNav`. Conserva la conversión, las citas, la fecha legible, el extracto y los minutos de lectura; también acepta cuerpos con CRLF. La ordenación es estable y devuelve una copia del array.
- Renombré el generador a `scripts/blog-nav.mjs`: lee y separa los Markdown, mapea sus campos, mantiene `COVER`, llama al módulo común y escribe los JSON. En `package.json` solo cambiaron `prebuild` y `predev`.
- Añadí `scripts/check-render.mjs`: regenera y compara ambos archivos como bytes. Ante diferencias sale con código 1 e indica artículo/campo; también detecta cambios del orden de claves, serialización y referencias ausentes. Funciona aunque se ejecute desde otra carpeta y no crea ni sustituye referencias automáticamente.

**Comprobaciones realizadas:**

- `node scripts/check-render.mjs`: **OK**, los 3 artículos y los dos JSON son idénticos byte a byte. Repetido después de compilar y desde otra carpeta.
- `npm run build`: **OK, código 0**, Next **15.5.28**, `prebuild` ejecutado y 84 páginas generadas. Muestra avisos previos por `cacheComponents`/`partialPrefetching` y el error de configuración de ESLint descrito abajo; aun así termina correctamente.
- `npx tsc --noEmit`: **OK, código 0**, antes y después del cambio.
- `npx eslint src`: **NO PASA por un problema preexistente**, reproducido antes de modificar código y después: `ERR_MODULE_NOT_FOUND` al importar `eslint-config-next/core-web-vitals` desde `eslint.config.mjs` (sugiere `core-web-vitals.js`). No llega a analizar `src`. No modifiqué esa configuración porque queda fuera del alcance permitido. Este criterio queda pendiente; no se presenta como aprobado.
- Comprobación adicional de los tres archivos nuevos con ESLint sin la configuración rota, reglas `no-unused-vars` y `no-undef` y globales de Node declarados: **OK**. Es una comprobación parcial y no sustituye a `npx eslint src`.
- Pruebas adicionales en memoria: campos y orden de `Post`, EN/ES, eliminación de H1 y firma By/Por, CRLF, citas en párrafos y citas aisladas, tipo desconocido, portada recibida, extracto largo, minutos de lectura, orden estable sin mutar la entrada y navegación vacía: **OK**.
- Pruebas negativas del verificador: cambios de título y fecha en navegación, orden de claves, salto de línea adicional y referencia ausente: **código 1 y diagnóstico esperado**. Las referencias se restauraron al terminar y se volvió a comprobar la igualdad.
- `node --check` para los tres archivos nuevos, comprobación de ausencia de imports de Node/`require` en el módulo, `git diff --check` y `git diff --stat main...cms/T03`: **OK**. Solo cambian los archivos permitidos y `.gitignore`, solicitado expresamente en el paso 1; los JSON generados no tienen diff. Árbol de trabajo del sitio limpio tras el commit.

**Alcance:** sin cambios de dependencias, Next, contenido, páginas, configuración de despliegue ni base de datos. Sin despliegue, fusión ni push. En el CRM solo se rellena este informe, sin hacer commit. No quedan dudas sobre la conversión; falta la revisión de Claude y resolver por separado la configuración previa de ESLint para poder validar el lint completo.

## Revisión (Claude)
**APROBADA · 20-oct-2026 · commit `66cdfee`**

Comprobado por separado, no solo con el informe:
- `node scripts/check-render.mjs` → idéntico. Además comparé la salida de la rama con los JSON
  **versionados en `main`** (no con la referencia local que creó el agente): `cmp` sin diferencias.
- `npx tsc --noEmit` → 0. `npm run build` → 0, 84 páginas, «blog: 3 artículos».
- `src/cms/render.mjs` no importa nada de Node. Solo cambian los archivos permitidos (+ `.gitignore`, pedido).
- La conversión es una extracción fiel de `blog-nav.cjs` (mismas expresiones regulares y orden de
  claves). Añade normalización de CRLF en el cuerpo: inocua y útil para lo que llegue del CRM.
- ESLint: confirmado que **también falla en `main`** (`eslint-config-next/core-web-vitals` no
  resuelve). No es de esta tarea → queda como tarea aparte (T03b).

Notas para más adelante (no bloquean):
- `new Date(fecha + "T12:00:00")` depende de la zona horaria de quien compila; viene del script
  original y a mediodía no cambia el día. Se deja igual.
- El campo `excerpt` de Supabase todavía no se usa: el extracto se calcula del primer párrafo. Se
  decidirá en T06 si el editor permite escribirlo a mano.

**Pendiente:** ok de Juan para fusionar `cms/T03` en `main` (no despliega nada; el resultado es idéntico).
