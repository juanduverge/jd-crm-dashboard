# T06 · Pantallas de Contenido en el CRM

**Para:** ChatGPT (Codex) · **Repo:** `jd-crm-dashboard` (este) · **Rama:** `cms/T06`
**Depende de:** T02 (tablas, HECHA) y T03 (módulo de conversión, HECHA) · **Estado:** PENDIENTE — se puede empezar

## Objetivo
Una sección **Contenido** en el CRM donde se crean y editan artículos del blog en inglés y en
español, con vista previa igual a la web. En esta tarea **no** se publica: solo se escribe y se guarda.
Los botones de estado y publicación son la T07.

## Contexto (léelo antes de empezar)
- `AGENTS.md` de este repo: **la base de datos es producción**. Reglas de pruebas abajo.
- Diseño: `docs/PLAN_CMS_BLOG.md`, sobre todo «Cómo trabaja el redactor un artículo en dos idiomas».
- Tablas: `supabase/migrations/0057_cms.sql` (`cms_types`, `cms_groups`, `cms_items`, `cms_media`,
  bucket `cms`). Los permisos ya están en la base (RLS): el cliente normal de
  `src/lib/supabaseClient.ts` con la sesión del usuario basta. **Publicar/programar lo bloquea la
  base para quien no es admin; en esta tarea no hace falta tocar `status` salvo `idea`↔`borrador`.**
- Conversión Markdown → HTML: `../JD Developer/jd-developer-site/src/cms/render.mjs` (ESM puro,
  función `renderArticulo`). La vista previa tiene que usar **ese mismo código**.
- Estilos del artículo en la web: `../JD Developer/jd-developer-site/src/monova/markup/BlogSingle.tsx`
  y `src/monova/monova.css` (clases del cuerpo y `.jd-cite`).
- Patrones del CRM: páginas en `src/features/<módulo>/`, servicios en `src/services/`, TanStack Query,
  componentes en `src/components/ui`. Mira `src/features/correos/` y `src/features/webleads/` como ejemplo.
- El CRM se usa mucho **desde el móvil**.

## Archivos que puedes tocar
- `src/features/contenido/**` (nuevo)
- `src/services/cmsService.ts` (nuevo)
- `src/lib/cms-render.mjs` (nuevo: **copia exacta** de `render.mjs` de la web, con una línea de
  comentario arriba que diga de dónde sale) y `src/lib/cms-render.d.ts` si hace falta para TypeScript
- `scripts/check-cms-render.mjs` (nuevo): compara la copia con el original de la web y falla si difieren
- `src/App.tsx`: solo las rutas nuevas
- `src/components/layout/navItems.ts`: solo la entrada de menú nueva
- `src/types/` si necesitas tipos nuevos
- `package.json` / `package-lock.json`: solo para añadir `marked` en la **misma versión** que la web (`^15.0.12`)

## No toques
- Nada de `supabase/`, `n8n/`, `verificador-whatsapp/`, `deploy/`, `.env*`.
- No crees migraciones. Si crees que falta algo en la base, para y escríbelo en el informe.
- No cambies `status` a `revision`, `programado`, `publicado` ni `archivado` (es T07).

## Qué hay que hacer

### 1. Menú y rutas
- Entrada **Contenido** en el menú (icono `FileText` o similar), ruta `/contenido`.
- Rutas: `/contenido` (lista), `/contenido/grupo/:groupId` (ficha del grupo),
  `/contenido/item/:itemId` (editor). Cargadas con `lazy` como las demás.

### 2. Lista `/contenido`
- Solo tipos activos (hoy: `article`). Una fila por **grupo**: título (del idioma que exista), alcance
  (Universal / Solo EE. UU. / Solo RD), y por idioma una etiqueta de estado (EN: publicado · ES: falta).
- Filtros: idioma, estado. Buscador por título o slug.
- Botón **Nuevo artículo**: pide alcance e idioma de origen, crea el grupo y el primer item en
  `borrador` (o `idea` si se elige «Solo la idea») y abre el editor.

### 3. Ficha del grupo `/contenido/grupo/:groupId`
- Dos columnas **EN | ES** (en el móvil, una debajo de otra). Cada una: título, slug, estado, fecha,
  botón Editar.
- Si el alcance es `universal` y falta un idioma: botón **Crear versión en español/inglés**. Copia solo
  lo común: `author`, `fecha`, `sources`, `og_image`, `fields`. Deja **vacíos** `slug` (se pide),
  `title_h1`, `title_seo`, `meta_description`, `primary_keyword`, `body`.
- Si el alcance es de un solo idioma, no se ofrece la otra versión.
- Campos del grupo editables: alcance, intención de búsqueda, notas.

### 4. Editor `/contenido/item/:itemId`
- Campos comunes: `title_h1`, `title_seo` (contador, aviso > 60), `meta_description` (contador, aviso > 160),
  `slug` (se propone desde el título, editable, formato `a-z0-9-`, se comprueba que no exista en ese
  idioma), `primary_keyword`, `author`, `fecha`, `sources` (lista de URLs, añadir/quitar), portada.
- Campos del tipo: se dibujan **a partir de `cms_types.campos`** (tipos `opcion`, `texto`,
  `texto_largo`, `fecha`, `numero`, `url`, `lista`). No hagas un formulario fijo para artículos.
  Se guardan en `fields`.
- Cuerpo en Markdown (área de texto grande). **Vista previa** con `renderArticulo` de la copia y los
  estilos de la web: en escritorio al lado, en el móvil con pestañas Escribir / Vista previa.
- Si el grupo tiene la otra versión, botón «Ver la otra versión» que la muestra **solo lectura** al lado.
- Portada: subir imagen al bucket `cms` (ruta `articulos/<itemId>/<nombre>`), registrar en `cms_media`,
  y poner la URL pública en `og_image`. También permitir pegar una URL.
- Guardar: botón Guardar + aviso si hay cambios sin guardar al salir. Error de slug duplicado con
  mensaje claro (índice `uq_cms_items_slug`).
- Avisos de localización (no bloquean el guardado): slug o `title_h1` iguales a la otra versión;
  `sources` distintas de la otra versión.
- Un item `publicado` se puede editar; mostrar un aviso: «Los cambios se verán en la web cuando se vuelva a publicar».

## Reglas para probar (la base es producción)
- Si puedes abrir el CRM en local (`npm run dev`) con una sesión, prueba creando **solo** datos de prueba:
  títulos que empiecen por `PRUEBA T06` y slugs `prueba-t06-...`. Al terminar, márcalos con
  `deleted_at` desde la propia pantalla o dime en el informe sus ids para que los borre.
- **No edites ni guardes** los 3 artículos publicados (Google Maps, Webflow vs WordPress, WhatsApp).
  Abrirlos para mirar sí.
- Si no puedes iniciar sesión, dilo en el informe; Claude y Juan lo probarán.

## Criterios de aceptación
- [ ] `node scripts/check-cms-render.mjs` confirma que la copia es idéntica a la de la web.
- [ ] La vista previa de uno de los 3 artículos produce el mismo HTML de cuerpo que la web.
- [ ] El formulario del tipo sale de `cms_types.campos`.
- [ ] Crear la versión gemela no copia texto propio de idioma.
- [ ] Funciona a 375 px de ancho sin desplazamiento horizontal.
- [ ] Ningún cambio de `status` fuera de `idea`/`borrador`.
- [ ] `npx tsc -b`, `npm run lint`, `npm run build` sin errores.

---

## Informe del agente
_(lo rellena ChatGPT al terminar)_

## Revisión (Claude)
_(veredicto)_
