# T04 · La compilación de la web lee los artículos de Supabase

**Para:** ChatGPT (Codex) · **Repo:** `JD Developer/jd-developer-site` · **Rama:** `cms/T04` (desde `main` con T03 ya fusionada)
**Depende de:** T03 (HECHA) · **Estado:** PENDIENTE — se puede empezar

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
_(lo rellena ChatGPT al terminar)_

## Revisión (Claude)
_(veredicto)_
