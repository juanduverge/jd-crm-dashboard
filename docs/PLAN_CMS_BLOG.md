# Plan: CMS propio en el CRM

> **20-oct-2026, decidido por Juan:** publicar = recompilar la web (antes «plan B»). Las etapas 2 y 3
> (revalidación y vista previa en el sitio) se sustituyen por la recompilación y la vista previa en el
> CRM. Construcción, reparto y orden: `docs/cms/PLAN_CONSTRUCCION.md`.

Base: **documento 1.8 §6 y §6.9** (`jd-developer-docs/docs/1-8-estructura-del-blog.md`), ya aprobado.
Este plan no cambia esas decisiones: las aterriza en el código que existe hoy y ordena el trabajo.

## Lo que decidió 1.8 (resumen)

- **El CRM es el CMS**: ahí se escribe y se aprueba. **Supabase** guarda el contenido.
  **Cloudflare Workers** lo sirve. **n8n** solo automatiza (programar, verificar, redes).
- **Regla de oro (§6.1):** el sitio nunca depende del servidor de casa para mostrar contenido.
- **Genérico desde el principio (§6.9.1):** un solo circuito; cada tipo de contenido es configuración
  encima. Tipos: `article` (ahora), `review` (recomendado ahora), `project` (diseñado, apagado),
  `service` (todavía no).
- **Una fila por idioma**, unidas por `translation_group_id` → el hreflang sale solo (§6.3).
- **Estados:** borrador → revisión → programado / publicado. **`publicado` solo lo pone una persona**,
  o un trabajo programado sobre algo ya aprobado. La IA nunca publica sola (§6.6).
- **Recorrido (§6.4):** escribir en el CRM → guardar en Supabase → vista previa privada con token
  y `noindex` → aprobar → Supabase avisa al Worker → el Worker regenera la página → n8n reparte.

## Dónde estamos de verdad

1.8 preveía que las etapas 0–3 (tablas, lectura desde Supabase, revalidación, vista previa) se
hicieran con el bloque 1 de la web. **No se hicieron.** La web nueva (`jd-developer-site`) salió con
un atajo:

- Los artículos son Markdown en `content/blog/` (3 artículos).
- `scripts/blog-nav.cjs` los convierte a JSON **al compilar**; las páginas leen ese JSON.
- La portada está fija en el script (`COVER`); el campo `status` no filtra borradores.
- No hay hreflang entre versiones ni `translation_group_id`.
- Publicar = editar el archivo y desplegar a mano.

Lo aprovechable: la plantilla de artículo, los índices, el sitemap y la conversión de Markdown ya
funcionan. Solo cambia **de dónde salen los datos**.

## Plan por etapas (numeración de 1.8 §6.7)

### Etapa 0 — Tablas comunes del CMS en Supabase (1 día)
- `cms_types`: definición de cada tipo (`article`, `review`, `project`) y sus campos.
- `cms_items`: los campos comunes de §6.3 (`translation_group_id`, `lang`, `slug`, `title_h1`,
  `title_seo`, `meta_description`, `body` md, `excerpt`, `status`, `published_at`, `updated_at`,
  `author`, `og_image`, `sources[]`) + `type` + `fields jsonb` para lo propio de cada tipo
  (`article_type`, `category`, `related_service`; en `review`: nombre, país, fecha, proyecto…).
- `cms_media`: imágenes en Supabase Storage (bucket público `cms`).
- Vista `cms_publicado` (solo lo publicado): es lo único que el sitio puede leer con la clave pública.
- RLS: el equipo escribe; `anon` no ve borradores. Slug único por tipo + idioma.
- Importar los 3 artículos actuales (con su portada) y, si se confirma, las 13 reseñas.
- Ojo: las migraciones se aplican a mano. Aplicar y verificar en la base.

### Etapa 1 — La web lee de Supabase (1 día)
- `src/monova/blog.ts` deja de leer el JSON y pide `cms_publicado` a Supabase. La conversión de
  `blog-nav.cjs` (Markdown → HTML, fuentes, minutos, extracto) pasa a una función compartida.
- Hreflang desde `translation_group_id` (si existe la gemela publicada, se anota; si no, no).
- Esquema `Article` + `author`.
- Verificar que las 3 páginas salen iguales que hoy antes de seguir.

### Etapa 2 — Revalidación (1–2 días; el punto delicado)
- Configurar la caché de OpenNext: la cola en `open-next.config.ts`, el Durable Object
  `NEXT_CACHE_DO_QUEUE` y el enlace `WORKER_SELF_REFERENCE` en `wrangler.jsonc` (§6.5.1).
- Ruta `/api/revalidate` protegida por secreto: regenera el artículo, su índice y el sitemap.
- Supabase (webhook de base de datos al cambiar `status`) la llama.
- **Verificar contando ejecuciones en los registros del Worker, no con cabeceras** (§6.5.1).
- Plan B si la revalidación da guerra: al publicar, disparar una recompilación y despliegue
  (GitHub Action, ≈3 min). Cumple igual la regla de §6.1; solo es más lento.

### Etapa 3 — Vista previa (½ día)
- `/preview/<token>`: lee el borrador, `noindex` en la cabecera, bloqueada en robots.txt,
  el token nunca escrito en ningún sitio público (§6.5.2).

### Etapa 4 — El editor en el CRM (3–4 días)
- Menú **Contenido** con pestañas por tipo (Blog, Reseñas).
- Lista por idioma y estado. **Vista de grupo de traducción:** EN y ES lado a lado, y cuál falta.
- Editor: campos comunes + los del tipo (sale de `cms_types`, no se programa un formulario por tipo),
  Markdown con vista previa, subida de imágenes.
- Comprobaciones antes de aprobar: slug libre, título SEO ≤ 60, meta ≤ 160, al menos una fuente,
  servicio relacionado válido, imagen puesta.
- Botones: Guardar borrador · Pedir revisión (abre la vista previa real) · Publicar · Programar.
- **Panel de proporción** (§6.8): cuántos comparativos, de problema y de método frente al objetivo.
- Usable desde el móvil.

#### Cómo trabaja el redactor un artículo en dos idiomas (1.8 §4)
Cada idioma es **su propio artículo** (su propia fila), con su slug, título SEO, H1, meta, palabra
clave, encabezados, ejemplos y cuerpo. Lo único que los une es el `translation_group_id`.
- Al crear un artículo se elige el alcance: **Universal** (los dos idiomas), **Solo EE. UU.** (solo
  inglés) o **Solo RD/hispano** (solo español). Solo los universales piden la gemela.
- La ficha del grupo muestra **dos columnas, EN y ES**, cada una con su estado. La que falta aparece
  como «Crear versión en español/inglés».
- **Crear la versión gemela no copia el texto.** Copia solo lo que debe ser idéntico (autor, fecha,
  fuentes, servicio relacionado, tipo, imagen) y deja vacíos slug, títulos, meta, palabra clave y
  cuerpo. El texto del otro idioma se ve al lado como referencia, solo lectura.
- Opcional (etapa 7): «Preparar borrador de localización» con IA. Sale como **borrador**, nunca
  publicado, y marcado para que el redactor rehaga título, slug y ejemplos.
- Avisos del editor: palabra clave igual a la traducción literal de la otra; slug o título idénticos
  a la otra versión; fuentes distintas entre las dos (un dato no cambia por idioma).
- Cada versión se aprueba y publica **por separado**; el hreflang solo se anota cuando las dos
  están publicadas. Canónica siempre a sí misma.

### Etapa 5 — n8n: programación y verificación (1 día)
- Cada 15 min: lo `programado` cuya fecha llegó pasa a `publicado` y dispara la revalidación.
- Una vez al día: compara lo publicado en Supabase con el sitemap y avisa de diferencias (§6.5.3).
- Recordatorio: los workflows se publican, no basta con guardar el borrador.

### Etapas 6–7 — Después
- Distribución a redes desde `excerpt` + `og_image`.
- Borrador de la versión en el otro idioma (borrador, nunca publicación) y aviso de contenido de
  más de 12 meses.
- Activar `project` cuando las URL actuales estén indexadas (1.4); A-1 Collision como primera ficha.

## Estimación
Etapas 0–4 (escribir, previsualizar y publicar desde el CRM): **≈ 8–10 días** de trabajo.
Etapa 5: 1 día más.

## Decisiones pendientes de Juan
1. ¿Entra `review` en la etapa 0 junto con `article`? (1.8 lo recomienda.)
2. ¿Quién puede publicar: solo Juan o cualquiera del equipo?
3. Si la revalidación (etapa 2) se complica, ¿vale el plan B de recompilar al publicar?
