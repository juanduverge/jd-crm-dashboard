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
**ChatGPT (Codex), 20-oct-2026. Implementada en `cms/T06`, desde `main` (`87c5c3f`, coincidente con la referencia local `origin/main`). Pendiente de revisión de Claude.**

### Implementación

- Menú **Contenido** y las tres rutas con carga `lazy`: lista, ficha del grupo y editor. La lista consulta solo tipos activos, muestra una fila por grupo y combina idioma/estado/búsqueda sobre la misma versión.
- Creación con alcance, idioma, título de trabajo, slug propuesto y opción **Solo la idea**. Se pide un slug válido desde el primer paso porque la base no permite guardarlo vacío. Se comprueba su disponibilidad y se interpreta claramente el error del índice único. Si falla la creación del item, se intenta retirar el grupo vacío mediante `deleted_at`.
- Ficha EN/ES con columnas que se apilan en móvil; edición de alcance, intención y notas. No permite excluir del alcance un idioma que ya tiene versión. La gemela se crea solo en grupos universales, pide un slug nuevo y copia exclusivamente `author`, `fecha`, `sources`, `og_image` y `fields`: los títulos, meta, palabra clave y cuerpo comienzan vacíos.
- Editor con contadores SEO, comprobación de slug con espera breve, campos comunes, fuentes, portada y cuerpo Markdown. Los campos del tipo salen de `cms_types.campos` e implementan los siete tipos pedidos; también preservan valores desconocidos. Las ideas pueden guardarse incompletas. Los avisos SEO y de localización no impiden guardar.
- Guardar mantiene el estado existente salvo cambios explícitos `idea`↔`borrador`. El servicio usa una lista de campos permitidos y comprueba `updated_at`/estado para evitar sobrescribir cambios de otra sesión; ante un conflicto conserva el texto del formulario. Los publicados muestran el aviso solicitado. Los usuarios `viewer` tienen controles de solo lectura.
- Portada por URL o subida JPG/PNG/WebP/AVIF/GIF (hasta 10 MB), ruta `articulos/<itemId>/<nombre único>`, registro en `cms_media` y asociación a `og_image` al guardar el artículo. Los fallos al registrar un archivo ya subido indican su ruta para revisión, sin intentar borrar archivos de Storage.
- Vista previa con la **copia exacta** del conversor de la web, salvo el comentario inicial de procedencia. `scripts/check-cms-render.mjs` compara los bytes del módulo, admite LF/CRLF únicamente en ese comentario y falla si el código se separa del original. Se copiaron las fuentes locales y las reglas `.jd-prose`/`.jd-cite`; la vista previa incluye autor, fecha, lectura, portada, servicio y fuentes.
- El HTML se presenta en un iframe sin permisos de ejecución y con política de contenido restrictiva, para aislar el Markdown/HTML de la sesión del CRM. En móvil hay pestañas Escribir / Vista previa; la otra versión aparece solo lectura. Diálogo propio para conservar o descartar cambios al navegar, más protección `beforeunload` al cerrar/recargar.
- Única dependencia añadida: **`marked@^15.0.12`**, instalada en **15.0.12**, igual que la web. No se cambiaron versiones de las otras dependencias ni scripts de `package.json`.

### Validación

- `node scripts/check-cms-render.mjs`: **OK**, identidad del conversor.
- `npx tsc -b`: **código 0**. `npm run build` (incluye `tsc -b`): **código 0**, genera las tres pantallas en chunks independientes. Conserva el aviso existente de chunks grandes del CRM.
- `npm run lint`: **código 0, 0 errores y los mismos 21 avisos previos**, comprobados antes de editar. Lint de los archivos nuevos de T06: sin errores ni avisos.
- Pruebas del servicio y del modelo con Supabase simulado: slugs, filtros combinados, validación desde el esquema, creación y retirada del grupo tras un fallo, gemela sin textos propios y sin compartir arrays mutables, errores de unicidad, estados restringidos, exclusión de campos de publicación, conflictos entre sesiones y subida/registro de portada: **OK**.
- Comparación con los Markdown y los JSON actuales de la web: el conversor del CRM produce **exactamente el mismo HTML de cuerpo de los tres artículos**. No fue necesario consultar ni editar esos registros en producción.
- Pruebas de navegador con las pantallas y el servicio reales, sustituyendo únicamente Supabase y la sesión por simulaciones locales: lista/filtros, ficha bilingüe, creación de gemela, creación de idea con idioma según alcance y slug propuesto, guardado de borrador con avisos SEO, vista previa, referencia del otro idioma y perfil solo lectura: **OK**. Se comprobó el diálogo de salida, cancelar sin perder el texto y descartar para volver al grupo.
- A **375 px**, lista, ficha, editor, pestañas y otra versión sin desplazamiento horizontal (se midieron `scrollWidth` y `clientWidth`); también se revisó escritorio a 1280 px. Las comprobaciones visuales se hicieron con datos simulados que empiezan por `PRUEBA T06`. Una prueba de HTML con script no alteró el CRM; el iframe permanece sin permisos de scripts.
- Pruebas auxiliares y servidor simulado conservados en `C:\Users\juanm\Documents\Codex\2026-10-20\abre-codex-en-jd-developer-jd\work\T06\`, fuera del repositorio. Captura de la revisión en `outputs/T06-editor-prueba.png` del mismo chat.
- Revisión del diff y `git diff --check`: solo se incluyen los archivos de T06 y este informe. Los cambios ajenos que ya existían en n8n, WhatsApp, `.claude/` y `docs/PROYECTO_CAPTACION_PROPIA.md` se conservan fuera del commit.

### Límites de la prueba y pendientes

El CRM local abrió la pantalla de acceso y **no había una sesión disponible**. Por tanto, no se probó el CRUD ni Storage con una sesión real: Claude y Juan deben comprobarlo al revisar. No se crearon datos de prueba en producción, no hay IDs reales que borrar y no se guardaron ni editaron los tres artículos publicados. La revisión móvil se hizo sobre las pantallas reales en el servidor de pruebas, sin la sesión ni el resto del contenedor autenticado del CRM.

Sin SQL, migraciones, claves, cambios de `.env`, n8n, WhatsApp o despliegue. No hay botones de publicación ni cambios de estado fuera de Idea/Borrador; quedan para T07. No se fusionó ni se hizo push. No se detectaron campos o tablas que requieran migraciones.

## Revisión (Claude)
**Lógica APROBADA; pantallas REHECHAS por Claude a petición de Juan · 20-oct-2026**

Se conserva lo de ChatGPT que estaba bien: `cmsService` (lista de campos permitidos, control de
conflictos por `updated_at`, limpieza del grupo vacío), `hooks` (aviso de cambios sin guardar),
la copia del conversor con su comprobación y la vista previa aislada en iframe.

Se rehízo la interfaz porque era un formulario, no un sitio para escribir:
- Menú y título: **Blog CMS** (pedido por Juan).
- Lista: pestañas por estado con contador, miniatura de portada, píldoras EN/ES con el color del
  estado; la píldora punteada crea la versión que falta.
- Editor tipo documento: portada, título grande y texto que crecen solos (una sola barra de
  desplazamiento), barra de formato Markdown, Ctrl+S. Cambio de idioma EN | ES arriba.
- Panel lateral (hoja en el móvil): SEO con vista de Google y comprobaciones de la palabra clave,
  mercado objetivo, artículo, fuentes, estado, «La pieza» y la otra versión.
- Vista previa a pantalla completa, escritorio / móvil. La ficha de grupo redirige al editor.
- Alcance con nombres correctos: Los dos idiomas / Solo inglés / Solo español (no «Solo RD»).
- Servicio relacionado: desplegable con la ruta exacta de cada idioma (antes texto libre).
- Migración **0058** (campo `mercado`), aplicada.

Arreglos encontrados al revisar:
- La web quitaba **cualquier** línea que empezara por «By »/«Por » como si fuera la firma: un
  párrafo «Por eso…» habría desaparecido. Ahora solo quita la firma exacta del autor
  (`jd-developer-site` `fix/firma`, fusionado; copia del CRM actualizada).
- El cuerpo de los 3 artículos ya no repite el «# título» ni la firma (el título va aparte). La web
  genera exactamente el mismo resultado (comparado byte a byte).

**Pendiente:** prueba de Juan con su sesión (crear, guardar, subir portada, versión gemela, móvil).
