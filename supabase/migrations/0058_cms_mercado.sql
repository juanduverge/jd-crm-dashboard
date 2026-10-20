-- =============================================================
-- 0058_cms_mercado.sql — Mercado objetivo de cada versión de un contenido
-- (20-oct-2026).
--
-- POR QUÉ
--
-- El idioma no dice para qué país se escribe. La web manda al inglés a EE. UU.
-- y al resto del mundo, y al español a los 21 países hispanohablantes
-- (1.3, src/middleware.ts de la web). Para Google hay UNA sola versión `es`.
--
-- Pero la palabra clave se investiga en un país concreto (1.8 §4.3: Keyword
-- Planner «en el idioma y con la región objetivo») y los ejemplos también son
-- de un país. Este campo guarda esa decisión de redacción. NO cambia la URL ni
-- el hreflang: un artículo pensado para España sigue siendo «el artículo en
-- español».
--
-- Valores
--   en:  us (EE. UU.) · ca (Canadá) · global_en (inglés, sin país)
--   es:  hispano (todos los hispanohablantes) · do (RD) · mx (México)
--        · es (España) · latam (Latinoamérica)
--
-- APLICAR: pegar entero en el SQL Editor de Supabase. No toca nada existente
-- salvo rellenar el mercado de los 3 artículos importados en la 0057.
-- =============================================================

begin;

alter table cms_items
  add column if not exists mercado text;

alter table cms_items drop constraint if exists cms_items_mercado_check;
alter table cms_items add constraint cms_items_mercado_check check (
  mercado is null
  or (lang = 'en' and mercado in ('us', 'ca', 'global_en'))
  or (lang = 'es' and mercado in ('hispano', 'do', 'mx', 'es', 'latam'))
);

-- Los 3 artículos de la 0057: dos escritos para EE. UU. y uno para RD.
update cms_items set mercado = 'us'
 where slug in ('shop-not-showing-google-maps', 'webflow-vs-wordpress-service-business') and lang = 'en' and mercado is null;
update cms_items set mercado = 'do'
 where slug = 'automatizar-whatsapp-negocio-dominicano' and lang = 'es' and mercado is null;

commit;
