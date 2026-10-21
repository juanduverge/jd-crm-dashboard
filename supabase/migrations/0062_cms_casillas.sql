-- =============================================================
-- 0062_cms_casillas.sql — El artículo por casillas, como en Webflow (21-oct-2026).
--
-- Hasta ahora todo iba en `body` (Markdown) y la web reconocía el resumen,
-- las preguntas y el cierre por sus títulos (`## TL;DR`, `### …`). Al editar a
-- mano era fácil romperlo. Ahora cada parte tiene su casilla:
--   tldr    text[]  puntos del resumen
--   faqs    jsonb   [{ "q": "…", "a": "…" }]
--   cierre  jsonb   { "titulo": "…", "texto": "…" }   (texto en Markdown)
-- `body` queda solo para el contenido. Ver docs/cms/PLAN_CASILLAS.md.
--
-- APLICAR: pegar entero en el SQL Editor de Supabase.
-- =============================================================

begin;

alter table cms_items
  add column if not exists tldr   text[] not null default '{}',
  add column if not exists faqs   jsonb  not null default '[]'::jsonb,
  add column if not exists cierre jsonb;

grant select (tldr, faqs, cierre) on cms_items to anon;

-- La vista que lee la web, con las casillas nuevas.
create or replace view cms_publicado
with (security_invoker = true) as
select
  i.id, i.group_id, i.type, i.lang, i.slug, i.primary_keyword,
  i.title_h1, i.title_seo, i.meta_description, i.body, i.excerpt,
  i.author, i.og_image, i.sources, i.fields,
  coalesce(i.fecha, i.published_at::date) as fecha,
  i.published_at, i.updated_at,
  g.alcance,
  gemela.lang as gemela_lang,
  gemela.slug as gemela_slug,
  i.tldr, i.faqs, i.cierre
from cms_items i
join cms_groups g on g.id = i.group_id and g.deleted_at is null
join cms_types  t on t.id = i.type and t.activo
left join cms_items gemela
  on gemela.group_id = i.group_id
 and gemela.lang <> i.lang
 and gemela.status = 'publicado'
 and gemela.deleted_at is null
where i.status = 'publicado' and i.deleted_at is null;

grant select on cms_publicado to anon, authenticated;

commit;
