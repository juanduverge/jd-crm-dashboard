---
name: redactar-articulo
description: Redacta un artículo del blog de jddeveloper.com y lo deja como borrador «En revisión» en el Blog CMS del CRM. Úsala cuando Juan pida escribir, redactar o preparar un artículo, una entrada del blog o la versión en otro idioma de uno existente. Nunca publica.
---

# Redactar un artículo para el Blog CMS

Claude escribe; **Juan lee, corrige y publica**. Esta habilidad nunca publica ni programa: deja el
artículo en `revision` y la base de datos impide cualquier otra cosa (trigger de la 0057).

## 1. Qué hace falta antes de escribir

Pregunta lo que falte, en un solo mensaje:

| Dato | Opciones | Si no lo dice |
|---|---|---|
| Tema | — | obligatorio |
| Alcance | Los dos idiomas / Solo inglés / Solo español | proponer según el público (1.8 §4.6) |
| Mercado de la palabra clave | en: us, ca, global_en · es: hispano, do, mx, es, latam | en → us, es → hispano |
| Palabra clave principal | una por idioma, investigada en ese mercado | proponer 2–3 y que elija |
| Tipo | comparativo / problema / metodo | mirar la proporción (abajo) |
| Servicio relacionado | uno de los nueve | el más cercano al tema |

Proporción (1.8 §5.1: al menos un tercio comparativos). Consultar antes de proponer el tipo:
```sql
select fields->>'article_type' tipo, count(*) from cms_items
where type = 'article' and status = 'publicado' and deleted_at is null group by 1;
```

## 2. Las reglas: leerlas, no recordarlas

En `../JD Developer/jd-developer-docs/docs/`:
- `2-2-manual-de-redaccion.md` §4 (H1, primer párrafo de 50 palabras, H2 como preguntas reales,
  FAQ, llamada a la acción, título SEO y meta), §5 (GEO: la marca nombrada en el texto),
  §6 (inglés escrito en inglés, sin calcos) y §7 (español: **tú**, glosario congelado).
- `1-7-*.md` §10 (cómo se escribe para que te citen) y §13 (lo que NO se hace).
- `1-8-estructura-del-blog.md` §4 (cada idioma es su propia pieza de SEO) y §5.2 (las comparaciones
  incluyen cuándo gana la otra opción).

Lo que nunca se negocia:
- **Ninguna cifra sin fuente enlazada.** Fuentes primarias (documentación oficial, el propio
  fabricante, organismos). Si no se encuentra la fuente, la cifra no va.
- **Ningún cliente inventado.** Los ejemplos son hipotéticos y lo dicen («un taller ficticio», «a
  hypothetical shop»). Nada de «ayudamos a X a crecer un 40 %».
- **Sin promesas** de posiciones en Google ni de resultados.
- **Localizar, no traducir:** la versión del otro idioma tiene su propia palabra clave, título,
  slug, encabezados y ejemplos de ese mercado. Comparten tesis, datos y fuentes.

## 3. Investigar

Busca en la web (WebSearch / WebFetch) y verifica cada dato en su fuente antes de usarlo. Anota
cada URL que respalde algo: van en `sources` y enlazadas en el texto.

## 4. Escribir

Sigue la forma de los artículos publicados (léelos con
`select body from cms_items where status = 'publicado'`):

1. **Primer párrafo = la respuesta**, en unas 50 palabras, con la palabra clave.
2. `## TL;DR` (en: TL;DR · es: TL;DR) con 3–5 viñetas.
3. Secciones `##` formuladas como **las preguntas que busca la gente** en ese idioma.
4. Las fuentes, como enlaces Markdown al final del párrafo que respaldan:
   `… según Google. [Guía de verificación](https://support.google.com/...)`.
5. `## FAQ` / `## Preguntas frecuentes` con 3 preguntas `###`.
6. Cierre: qué hacer ahora + enlace al servicio con la ruta exacta del idioma
   (`/services/local-seo` · `/es/servicios/seo-local`) + «We reply the same day» / «Respondemos el
   mismo día». Nombra a JD Developer en el texto (2-2 §5.2).
7. **Sin** `# Título` ni línea de firma en el cuerpo: el título y el autor van en sus campos.
8. Largo orientativo: 1 300–1 900 palabras.

SEO de cada versión:
- `title_h1`: la pregunta o la promesa, natural.
- `title_seo`: 30–60 caracteres, con la palabra clave.
- `meta_description`: 120–160 caracteres, una promesa concreta.
- `slug`: de la palabra clave, minúsculas y guiones, sin apóstrofos. Comprobar que no existe:
  `select 1 from cms_items where type='article' and lang='<lang>' and slug='<slug>' and deleted_at is null`.
- La palabra clave en título SEO, meta, slug, H1 y primer párrafo (el editor lo comprueba igual).

Rutas de servicio por idioma (las únicas válidas):

| en | es |
|---|---|
| /services/webflow-development | /es/servicios/desarrollo-webflow |
| /services/custom-web-development | /es/servicios/desarrollo-web-a-medida |
| /services/shopify-development | /es/servicios/tiendas-shopify |
| /services/workflow-automation | /es/servicios/automatizacion-de-procesos |
| /services/custom-crm | /es/servicios/crm-a-medida |
| /services/api-integrations | /es/servicios/integraciones-y-apis |
| /services/local-seo | /es/servicios/seo-local |
| /services/ai-chatbots | /es/servicios/chatbots-con-ia |
| /services/website-maintenance | /es/servicios/mantenimiento-web |

## 5. Guardar en el Blog CMS

Con el MCP de Supabase (`execute_sql`, proyecto `octzlhcwqlvxzrjgaptk`). El cuerpo va con
dollar-quoting para no escapar nada. **Siempre `status = 'revision'`.**

```sql
with g as (
  insert into cms_groups (type, alcance, intencion, notas)
  values ('article', '<universal|solo_en|solo_es>', '<qué quiere resolver quien busca>',
          'Borrador de Claude <fecha>. Revisar antes de publicar.')
  returning id
)
insert into cms_items (group_id, type, lang, status, slug, primary_keyword, mercado,
  title_h1, title_seo, meta_description, body, author, sources, fields, fecha)
select g.id, 'article', '<en|es>', 'revision', '<slug>', '<palabra clave>', '<mercado>',
  '<H1>', '<título SEO>', '<meta>', $cuerpo$<markdown>$cuerpo$,
  '<Juan Duvergé, founder | Juan Duvergé, fundador>',
  array['<url1>', '<url2>']::text[],
  '{"article_type":"<tipo>","related_service":"<ruta del idioma>"}'::jsonb,
  current_date
from g
returning id;
```

- Versión del otro idioma de una pieza que ya existe: el mismo `insert into cms_items` con el
  `group_id` existente (solo si `alcance = 'universal'` y esa versión no existe).
- La portada (`og_image`) la elige Juan; puedes sugerir una de Unsplash con el enlace.
- **No toques** artículos existentes salvo que Juan lo pida, y nunca cambies `status` a
  `programado` ni `publicado`.

## 6. Entregar

Devuelve a Juan, en pocas líneas:
- el enlace para revisarlo: `https://workspace.jddeveloper.com/contenido/item/<id>`;
- palabra clave, mercado y tipo elegidos, y por qué;
- lo que conviene que mire: datos que dependen de su experiencia, ejemplos, el tono;
- la lista de fuentes usadas.
