# T04 · La compilación de la web lee los artículos de Supabase

**Para:** ChatGPT (Codex) · **Repo:** `JD Developer/jd-developer-site` · **Rama:** `cms/T04` (desde `main` con T03 ya fusionada)
**Depende de:** T03 (HECHA) · **Estado:** HECHA (fusionada `75c0d1d`)

## Objetivo
Al compilar, la web saca los artículos publicados de Supabase en vez de `content/blog/*.md`.
**Las 3 páginas actuales tienen que salir idénticas.** Además se añade el hreflang entre idiomas.

## Contexto
- Lee `AGENTS.md` y `CLAUDE.md`. Next **15.5**; no actualices nada. No despliegues.
- Este archivo está en el repo del CRM: escribe aquí tu informe, pero **no hagas commit en el repo del CRM**.
- Los 3 artículos ya están en Supabase (tablas `cms_groups` / `cms_items`, migración
  `../../jd-crm-dashboard/supabase/migrations/0057_cms.sql`). Su `body` es **idéntico byte a byte** al
  cuerpo de cada `.md` (comprobado con md5).
- La web lee la vista **`cms_publicado`** por la API REST con la **clave publicable** (es pública por
  diseño: solo ve lo publicado y solo columnas visibles):
  - URL: `https://octzlhcwqlvxzrjgaptk.supabase.co/rest/v1/cms_publicado?type=eq.article&select=*`
  - Cabecera: `apikey: <SUPABASE_PUBLISHABLE_KEY>`
  - Variables de entorno: `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`. Pídeselas a Juan para probar;
    **no las escribas en el código ni las subas**.
- Columnas de la vista: `id, group_id, type, lang, slug, primary_keyword, title_h1, title_seo,
  meta_description, body, excerpt, author, og_image, sources, fields, fecha, published_at, updated_at,
  alcance, gemela_lang, gemela_slug`. `fields` trae `article_type` y `related_service`.

## Archivos que puedes tocar
- `scripts/blog-nav.mjs` (o `.cjs`)
- `src/cms/render.mjs` (solo si hace falta para recibir `og_image` / gemela)
- `src/monova/blog.ts` (añadir `gemela` al tipo `Post`)
- `src/app/[lang]/blog/[slug]/page.tsx` (solo `generateMetadata`, para el hreflang)
- `.env.example` (nuevo o existente: solo los nombres de las variables, sin valores)

## No toques
- Plantillas visuales, `src/monova/BlogPages*`, `wrangler.jsonc`, `next.config.ts`, dependencias.
- `content/blog/` no se borra: queda como respaldo para trabajar sin conexión.

## Qué hay que hacer
1. En `blog-nav`: si existen `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`, pedir la vista; si no, leer
   los `.md` como hasta ahora (y decirlo en consola: «blog: leyendo .md locales»).
   **Si las variables existen pero Supabase falla o devuelve 0 artículos, la compilación tiene que
   FALLAR** con un mensaje claro. Nunca publicar un blog vacío.
2. Mapear cada fila a `datos` de `renderArticulo`: `article_type` y `related_service` desde `fields`,
   `cover` desde `og_image`, `fecha` tal cual.
3. Quitar la lista `COVER` del script (la portada ya viene de `og_image`); mantenerla solo para el
   camino `.md`.
4. Añadir al `Post` el campo `gemela: { lang, slug } | null` desde `gemela_lang`/`gemela_slug`.
5. Hreflang en `generateMetadata` (1.8 §4.5):
   - con gemela: `alternates.languages` = `{ en: <url en>, es: <url es>, "x-default": <url en> }`;
   - sin gemela: solo su propia URL y `x-default` a ella misma;
   - URLs absolutas con `SITE_URL`; canónica siempre a sí misma (ya lo hace).
   - Rutas: inglés `/blog/<slug>`, español `/es/blog/<slug>`.

## Criterios de aceptación
- [ ] Con las variables puestas: `node scripts/check-render.mjs` (de T03) da idéntico contra la referencia
      (salvo el campo nuevo `gemela`, que hoy es `null` en los 3).
- [ ] Sin variables: sigue funcionando con los `.md`.
- [ ] Con variables y una clave inválida: la compilación falla con mensaje claro.
- [ ] Hoy ninguno de los 3 tiene gemela: cada página declara solo su propia URL en hreflang.
- [ ] `npx tsc --noEmit`, `npx eslint src`, `npm run build` sin errores.

## Cómo comprobarlo
```
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... node scripts/check-render.mjs
SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=mal npm run build   # debe fallar
npm run build                                                 # sin variables: .md
```

---

## Informe del agente
**ChatGPT (Codex), 20-oct-2026. Implementada; pendiente de revisión de Claude.**

**Rama / commit:** `cms/T04`, creada desde `main` con T03 fusionada (`7df483c`), coincidente con la referencia local `origin/main`. Commit **`ff7730d`** — `feat(cms): leer artículos publicados de Supabase (T04)`.

**Cambios:**

- `scripts/blog-nav.mjs` consulta únicamente la vista pública `cms_publicado`, filtrada por `type=eq.article`, mediante `fetch` y cabecera `apikey`. Mapea `fields.article_type`, `fields.related_service`, `og_image`, `fecha` y la gemela. Incluye orden explícito para desempates, paginación y límite de 30 segundos por petición.
- Sin ambas variables, muestra `blog: leyendo .md locales` y conserva el respaldo Markdown. La lista `COVER` queda exclusivamente dentro de ese camino. Si solo se configura una variable, falla con instrucciones para completar ambas o quitar las dos; así una configuración incompleta no publica accidentalmente el respaldo local.
- Con variables configuradas, cualquier error HTTP, de red, JSON inválido, paginación incompleta o lista vacía detiene la compilación con código 1. No recurre a los Markdown ni sobrescribe los JSON anteriores en esos casos.
- El módulo ESM común añade `gemela` al final del objeto (`null` por defecto); sigue importando solo `marked`. El tipo `Post` incluye `{ lang, slug } | null`.
- En la página del artículo solo cambió `generateMetadata`: canónica absoluta propia y hreflang absoluto para las versiones publicadas. Con pareja, EN/ES y `x-default` a EN; sin pareja, idioma propio y `x-default` a sí mismo.
- `.env.example` contiene solo los dos nombres con valores vacíos. Se añadió explícitamente a Git porque la regla existente `.env*` lo ignora. No se guardaron la URL ni la clave de prueba en archivos de código o configuración.
- El JSON generado versionado solo incorpora `gemela: null` a los tres artículos; `blog-nav.json` queda sin cambios. No cambió `scripts/check-render.mjs`.

**Pruebas y resultados:**

- API real, con las variables públicas proporcionadas por Juan solo en el entorno de los procesos: **HTTP 200, 3 artículos publicados y ninguna gemela**. No hubo escrituras ni migraciones en Supabase.
- `node scripts/check-render.mjs`, con variables y sin ellas: **código 0, ambos JSON idénticos byte a byte** a la referencia T04. Para admitir exclusivamente el campo previsto, guardé las referencias T03 intactas en `work/T04/T03-blog-posts.json` y `T03-blog-nav.json` de este chat y añadí solo `gemela: null` a la referencia local ignorada de artículos. Además comparé por separado contra los JSON **versionados en `main`**: al retirar ese campo nuevo, `blog-posts.json` es idéntico byte a byte; la navegación también es idéntica, sin normalización.
- Clave inválida contra la API real: **`npm run build` falla en `prebuild` con HTTP 401 y `Compilación detenida`**, antes de iniciar Next y sin cambiar ninguno de los dos JSON.
- Pruebas locales con respuestas simuladas: 0 artículos, objeto/null/JSON inválido, HTTP 503, error de conexión, timeout, paginación incompleta y una sola variable configurada: **código 1 y JSON previos intactos**. Una pareja EN/ES servida en dos páginas verifica paginación y mapeo de campos, portada, fecha y gemelas: **OK**. Los JSON reales se restauraron al terminar.
- Prueba de la función real `generateMetadata` aislada mediante el compilador TypeScript: los tres artículos sin gemela, una pareja EN/ES recíproca, canónicas propias, `x-default` y artículo/idioma inexistente: **OK**, sin modificar datos de producción.
- `npx tsc --noEmit` en el repo original: **código 0**.
- `npx eslint src`: **falla antes de analizar el código**, por el mismo problema previo de `main` confirmado antes de editar: `ERR_MODULE_NOT_FOUND` al importar `eslint-config-next/core-web-vitals` desde `eslint.config.mjs`. La revisión de T03 ya lo registra como T03b. No se tocó esa configuración. Lint adicional de `render.mjs` y `blog-nav.mjs`, sin la configuración rota, con reglas `no-unused-vars`/`no-undef` y globales de Node declarados: **código 0**; no sustituye al lint completo.
- **Compilaciones completas:** `npm run build` con Supabase real y `npm run build` sin variables dieron **código 0 y 84 páginas** en una copia temporal de validación dentro de `work/T04/build` de este chat. Se copiaron los archivos actuales y las dependencias ya instaladas, sin `.git`, cachés ni archivos privados de entorno; se comprobó que los seis archivos de T04 son exactamente iguales a los del commit. No se instalaron ni actualizaron dependencias. Next sigue en **15.5.28**. Ambas compilaciones muestran el error previo de ESLint y los avisos previos de opciones de Next, aunque terminan con código 0.
- **Limitación del entorno original:** los intentos de `npm run build` en la carpeta del sitio se interrumpieron con `EPERM` al crear distintas carpetas de `.next`. Ocurrió también con permiso explícito para `.next` y con otro runtime local. La revisión automática rechazó el intento de limpiar esa caché porque requería una aprobación de sandbox no habilitada; no se ejecutó la limpieza. Se usó la copia temporal para completar las pruebas sin modificar la configuración del proyecto. No se presenta el build en la carpeta original como aprobado.
- En el HTML de las dos compilaciones correctas se comprobó que cada uno de los tres artículos declara exactamente su idioma propio y `x-default`, con canónica propia y URLs absolutas correctas. El bloque `<main>…</main>` de cada artículo es **idéntico byte a byte al HTML anterior a T04**, conservado antes de compilar. El sitemap generado contiene los mismos tres artículos.
- `node --check`, ausencia de imports Node/`require` en el módulo común, `git diff --check`, revisión de los archivos cambiados y comprobación de que el diff no contiene la URL ni la clave de prueba: **OK**. Árbol de trabajo del sitio limpio tras el commit y la última regeneración real.

**Alcance y pendientes:** seis archivos versionados (los cinco de implementación y el JSON generado que exige el nuevo campo). Sin cambios visuales, dependencias, contenido Markdown, configuración de despliegue ni datos de producción; sin despliegue, push o fusión. En el CRM solo se escribe este informe, sin commit. Pendientes: revisión de Claude, corrección separada del lint previo y repetir la compilación en la carpeta original cuando su entorno permita crear las carpetas temporales de Next.

## Revisión (Claude)
**APROBADA y fusionada · 20-oct-2026 · `75c0d1d`**

Comprobado en la carpeta real del sitio (donde el agente no pudo compilar por permisos de su entorno):
- `npm run build` con Supabase → 0, «leyendo artículos publicados de Supabase», 84 páginas.
- Contenido idéntico a `main` quitando el campo nuevo `gemela` (los 3 con `gemela: null`).
- HTML generado: canónica absoluta propia + hreflang `en` y `x-default` a sí misma. Correcto para un
  artículo sin gemela (1.8 §4.5).
- Fallos (clave inválida, 0 artículos, una sola variable) detienen la compilación. Bien.

Cambio añadido por Claude antes de fusionar (`3476e29`):
- **Con `SITE_ENV=production` y sin variables, ahora falla.** Antes caía en silencio a los `.md`, y un
  despliegue manual sin variables habría borrado de la web lo publicado desde el CRM.
  `DEPLOY-NOTAS.md` actualizado con las variables.
