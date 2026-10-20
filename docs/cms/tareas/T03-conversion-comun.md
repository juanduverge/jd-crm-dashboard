# T03 · Conversión común de artículos

**Para:** ChatGPT (Codex) · **Repo:** `JD Developer/jd-developer-site` · **Rama:** `cms/T03`
**Depende de:** — · **Estado:** PENDIENTE

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
_(lo rellena ChatGPT al terminar: qué hizo, qué no, dudas, cómo lo probó)_

## Revisión (Claude)
_(veredicto: APROBADA o CAMBIOS, con la lista concreta)_
