# CMS propio · plan de construcción

Diseño: `docs/PLAN_CMS_BLOG.md` (basado en 1.8 §6 y §6.9). Este documento dice **quién construye
qué, en qué orden, y cómo se revisa**.

## Decisiones ya tomadas por Juan (20-oct-2026)
- El CMS vive en el CRM propio. Los datos viven en **Supabase**.
- **Publicar = recompilar la web** (idea 1): Supabase se consulta solo al publicar, nunca en una
  visita. La vista previa se hace dentro del CRM con los estilos de la web. Sustituye las etapas
  2 y 3 de 1.8 (revalidación y vista previa en el sitio).
- Cada idioma es un artículo propio, unido por `translation_group_id` (localizar, no traducir).
- Entran también: borradores con Claude vía MCP, etapa «idea» + calendario, y atribución
  artículo → lead.
- **Sin subagentes.** Trabajan tres: Claude, ChatGPT (Codex) y, si se quiere, Antigravity.

---

## 1. Quién hace qué

| | Claude (Claude Code) | ChatGPT (Codex) | Antigravity (Gemini) |
|---|---|---|---|
| Papel | Arquitecto, revisor y quien toca producción | Quien escribe la mayor parte del código | Control de calidad visual (opcional) |
| Escribe | Migraciones SQL, seguridad (RLS), Edge Functions, GitHub Action, n8n, MCP | Pantallas del CRM, lógica de la web, scripts, pruebas | Nada en el código: solo informes |
| Puede | Aplicar migraciones, desplegar, fusionar ramas | Trabajar en su rama, compilar, probar en local | Abrir el CRM y la web en el navegador y comparar |
| No puede | Fusionar ni publicar sin el ok de Juan | Fusionar a `main`, desplegar, aplicar migraciones, tocar n8n o secretos | Escribir en las carpetas del proyecto ni ejecutar comandos de git o despliegue |

**Por qué este reparto.** Lo que puede romper producción (base de datos real, despliegue, n8n,
claves) pasa por una sola mano y siempre con revisión. Lo que es volumen de código (pantallas,
formularios, conversión) lo hace ChatGPT en una rama aparte, donde un error no llega a nadie.

**Sobre «ChatGPT no lo va a dañar».** Es buen programador, pero lo que de verdad protege el
proyecto no es el modelo, son las reglas: rama propia, sin despliegue, sin base de datos, y
revisión antes de fusionar. Con esas reglas, aunque se equivoque, no rompe nada. Aplican igual a
los tres.

## 2. Antigravity: ¿ayuda o puede dañar?

**Puede dañar si:**
- trabaja **a la vez** que ChatGPT en la misma carpeta (se pisan archivos y uno deshace al otro);
- ejecuta comandos de terminal **sin pedir permiso** (puede hacer `git reset`, borrar, desplegar);
- tiene acceso a Supabase o a Cloudflare (la base de datos es la de producción: no hay copia de pruebas);
- lee el `CLAUDE.md` desactualizado de la web y «corrige» el proyecto a Next 16.

**Se usa con seguridad si:**
- solo hace **control de calidad visual**: abre la vista previa del CRM y la página publicada,
  en escritorio y móvil, y escribe un informe de diferencias;
- en su configuración está activado **pedir aprobación antes de ejecutar comandos**;
- nunca tiene claves de Supabase, Cloudflare ni GitHub;
- si algún día escribe código, lo hace en una **copia aparte** (`git worktree`) y su rama pasa
  por la misma revisión que ChatGPT.

**Recomendación:** un solo programador (ChatGPT) y Antigravity como segundo par de ojos. Dos IA
escribiendo el mismo proyecto duplican el trabajo de revisión y los choques.

## 3. Cómo funciona el ciclo (el «robot»)

Cada tarea es un archivo en `docs/cms/tareas/`. Ese archivo es el canal entre los tres: nadie
tiene que copiar mensajes largos.

```
1. Claude escribe la tarea        docs/cms/tareas/T05-editor.md
                                  (objetivo, archivos permitidos, prohibidos,
                                   criterios de aceptación, cómo comprobarlo)
2. Juan abre Codex en el repo     «Haz la tarea docs/cms/tareas/T05-editor.md»
3. ChatGPT trabaja                rama cms/T05 · commits · al final del archivo
                                  escribe su informe: qué hizo, qué no, dudas
4. Juan le dice a Claude          «revisa T05»
5. Claude revisa                  diff de la rama, compila, prueba, comprueba cada criterio
                                  y escribe el veredicto en el mismo archivo:
                                  APROBADO  o  CAMBIOS (lista concreta)
6. Si hay cambios                 vuelta al paso 2 con el mismo archivo
7. Juan aprueba                   «ok, súbelo»
8. Claude fusiona y, si toca,     aplica la migración / despliega / verifica en producción
                                  y marca la tarea como HECHA
```

Juan solo hace tres cosas: pasar la tarea a ChatGPT, avisar a Claude y aprobar.

**Puntos donde Juan decide** (marcados ⛳ abajo): el modelo de datos, cómo se ve el editor, la
primera publicación real, los workflows de n8n.

---

## 4. Las tareas, en orden

### Preparación

**T00 · Reglas para las IA** — Claude · ½ día
- `AGENTS.md` en el CRM (lo lee ChatGPT y Antigravity): la base es producción, las migraciones
  las aplica Claude, n8n no se toca, no se tocan archivos ajenos sin commit (`n8n/`,
  `verificador-whatsapp/`), rama por tarea, comprobar antes de entregar (`tsc`, `lint`, `build`).
- Corregir el `CLAUDE.md` de `jd-developer-site` (dice Next 16 y `proxy.ts`; es Next 15.5 con
  `middleware.ts`) y añadirle su `AGENTS.md` con las mismas reglas.
- Plantilla de tarea en `docs/cms/tareas/_plantilla.md`.
- Pendiente de Juan: qué hacer con los 4 archivos modificados sin commit del CRM (n8n y
  verificador), para que nadie los arrastre por error.

**T01 · Subir la web a GitHub** — Claude · ½ día
- Subir `jd-developer-site` (hay commits sin subir). Rama `main` protegida.
- Sin esto no hay publicación automática.

### Etapa 0 · Datos

**T02 · Tablas del CMS** — Claude · 1 día · ⛳
- Migración `0057_cms`: `cms_types`, `cms_items` (campos comunes + `fields jsonb`),
  `cms_media`, `cms_publicaciones` (historial de cada publicación y su resultado).
- Estados: `idea` → `borrador` → `revision` → `programado` → `publicado` → `archivado`.
- Alcance del grupo: `universal` / `solo_en` / `solo_es`.
- RLS: el equipo lee y escribe; solo quien Juan decida puede pasar a `publicado`; `anon` no ve nada.
- Vista `cms_publicado`. Bucket `cms` en Storage.
- Importar los 3 artículos actuales y sus portadas.
- ⛳ Juan revisa el modelo antes de aplicarlo.

### Etapa 1 · La web lee de Supabase

**T03 · Conversión común de artículos** — ChatGPT · 1 día
- Sacar de `scripts/blog-nav.cjs` la conversión (Markdown → HTML, bloque de fuentes, minutos de
  lectura, extracto, fecha legible) a un módulo propio `src/cms/render.mjs` en la web.
- El CRM usará una copia exacta de ese módulo para la vista previa. Un script compara que las
  dos copias sean idénticas.
- Criterio: con los 3 artículos, el resultado es **byte a byte igual** al `blog-posts.json` actual.

**T04 · La compilación lee de Supabase** — ChatGPT · 1 día
- `blog-nav.cjs` pide `cms_publicado` a Supabase; si no hay credenciales (local), lee los `.md`.
- Portada desde el campo; fuera la lista `COVER`. Solo entra lo publicado.
- Hreflang desde `translation_group_id`; `x-default` según 1.8 §4.5; canónica a sí misma.
- Criterio: las 3 páginas salen iguales que hoy; el sitemap no cambia.

### Publicación automática

**T05 · Botón Publicar de punta a punta** — Claude · 1–2 días
- GitHub Action: compilar con `CF_BUILD=1 SITE_ENV=production` y desplegar con wrangler.
  Secretos en GitHub (Cloudflare y la clave de lectura de Supabase).
- Edge Function `cms-publicar`: comprueba permiso, dispara el Action, registra en `cms_publicaciones`.
- Al terminar, el Action avisa a Supabase: publicado o falló (con el motivo).
- Prueba real con un artículo de prueba, que después se despublica.

### Etapa 4 · El editor en el CRM

**T06 · Pantallas de contenido** — ChatGPT · 3 días · ⛳
- Menú **Contenido**: lista por tipo, idioma y estado.
- Ficha del grupo con dos columnas EN / ES; «Crear versión en español/inglés» que copia solo lo
  común y deja vacío lo propio de cada idioma; la otra versión al lado, solo lectura.
- Formulario generado desde `cms_types` (no uno por tipo).
- Markdown con vista previa usando la copia de `render.mjs` y los estilos de la web.
- Subida de imágenes a `cms`.
- Funciona en el móvil.
- ⛳ Juan lo prueba y da su visto bueno al aspecto.

**T07 · Estados, avisos y publicación** — ChatGPT · 1–2 días
- Botones: Guardar · Pedir revisión · Programar · Publicar · Archivar.
- Comprobaciones antes de aprobar: slug libre, título SEO ≤ 60, meta ≤ 160, fuentes, imagen,
  servicio válido.
- Avisos de localización: slug o título iguales a la otra versión, fuentes distintas entre idiomas.
- Estado de la publicación visible: Publicando… / Publicado hace X / Falló (motivo).
- Panel de proporción: comparativos, problema y método frente al objetivo de 1.8 §5.1.

**T08 · Revisión de seguridad y primera publicación real** — Claude · ½ día · ⛳
- Comprobar permisos con un usuario sin rol de publicar.
- ⛳ Juan publica el primer artículo real desde el CRM.

**T09 · Control visual** — Antigravity (opcional) · ½ día
- Comparar vista previa del CRM con la página publicada, escritorio y móvil. Solo informe.
- Si no se usa Antigravity, lo hace Claude con el navegador.

### Etapa 5 · n8n

**T10 · Programados y verificación diaria** — Claude · 1 día · ⛳
- Cada 15 min: lo `programado` cuya hora llegó → publicar (usa la misma `cms-publicar`).
- Cada día: comparar lo publicado en Supabase con el sitemap y avisar si falta algo.
- Workflows nuevos, sin tocar los existentes. ⛳ Juan los aprueba; se **publican** en n8n.

### Ideas añadidas

**T11 · Borradores con Claude (MCP)** — ChatGPT escribe, Claude revisa · 1 día
- En el conector propio del CRM: `crear_borrador_articulo` (tema, idioma, palabra clave, fuentes).
  Deja la ficha en `revision`. No puede publicar: el permiso no existe en el conector.

**T12 · Etapa «idea» y calendario** — ChatGPT · 1–2 días
- Ficha de tema: palabra clave de cada idioma, intención de búsqueda, tipo de artículo, alcance.
- Calendario con el ritmo de 2 artículos al mes y aviso si se va atrasado.

**T13 · Qué artículo trae clientes** — Claude (base de datos) + ChatGPT (web y CRM) · 1 día
- La web guarda la primera página de la visita y la manda con el formulario.
- Columna nueva en `web_leads`; la función `recibir_formulario_web` la guarda.
- En el CRM: leads por artículo.

---

## 5. Calendario aproximado

| Bloque | Tareas | Días |
|---|---|---|
| Preparación | T00–T01 | 1 |
| Datos y lectura | T02–T04 | 3 |
| Publicación automática | T05 | 1–2 |
| Editor | T06–T09 | 5–6 |
| n8n | T10 | 1 |
| Ideas | T11–T13 | 3–4 |
| **Total** | | **≈ 14–17 días** de trabajo |

Las tareas de ChatGPT y las de Claude pueden ir en paralelo cuando no dependen una de otra
(por ejemplo, T03 mientras Claude hace T05).

## 6. Lo que falta decidir
1. ¿Quién puede publicar: solo Juan o cualquiera del equipo?
2. ¿Entran las reseñas (`review`) como segundo tipo desde el principio?
3. ¿Se usa Antigravity para el control visual, o lo hace Claude?
4. ¿Qué se hace con los 4 archivos modificados sin commit del CRM?
