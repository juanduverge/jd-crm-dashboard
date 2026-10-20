-- =============================================================
-- 0057_cms.sql — CMS propio: contenido de jddeveloper.com escrito en el CRM
-- (20-oct-2026). Diseño: docs/PLAN_CMS_BLOG.md y 1.8 §6 / §6.9.
--
-- QUÉ RESUELVE
--
-- Hoy los artículos del blog son archivos Markdown dentro del repo de la web
-- y publicar exige editar el archivo y desplegar a mano. Con esto viven en
-- Supabase, se escriben en el CRM y la web los lee AL COMPILAR (nunca en una
-- visita): si Supabase cae, la web sigue arriba.
--
-- GENÉRICO A PROPÓSITO (1.8 §6.9.1): un solo circuito y cada tipo de
-- contenido es una fila de `cms_types`. Los campos comunes son columnas; lo
-- propio de cada tipo va en `fields` (jsonb), descrito en cms_types.campos.
--
-- UNA FILA POR IDIOMA (1.8 §4): la versión inglesa y la española son dos
-- artículos con su propio slug, títulos, meta y cuerpo, unidos por el mismo
-- `group_id`. El hreflang sale de ahí, nunca se escribe a mano.
--
-- ESTADOS
--   idea        ficha de tema: palabra clave e intención, sin texto aún
--   borrador    en escritura
--   revision    listo para que Juan lo lea
--   programado  aprobado, sale en `programado_para` (n8n lo publica)
--   publicado   en la web
--   archivado   retirado de la web; no se borra
--
-- `programado` y `publicado` solo los pone un admin (Juan) o el servidor
-- (service_role: la Edge Function cms-publicar y n8n). Ninguna IA puede
-- publicar: lo impide el trigger, no la buena voluntad del código.
--
-- APLICAR: pegar entero en el SQL Editor de Supabase. No toca nada existente.
-- Después: importar los 3 artículos actuales (script aparte, tarea T02b).
-- =============================================================

begin;

-- 1 ------------------------------------------------------------
-- Tipos de contenido
create table if not exists cms_types (
  id          text primary key,              -- 'article', 'review', 'project'
  nombre      text not null,
  activo      boolean not null default false,
  -- Campos propios del tipo: [{clave, etiqueta, tipo, obligatorio, opciones}]
  -- El editor del CRM dibuja el formulario a partir de aquí.
  campos      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

insert into cms_types (id, nombre, activo, campos) values
  ('article', 'Artículo', true, '[
    {"clave":"article_type","etiqueta":"Tipo de artículo","tipo":"opcion","obligatorio":true,
     "opciones":["comparativo","problema","metodo"]},
    {"clave":"category","etiqueta":"Categoría","tipo":"texto","obligatorio":false},
    {"clave":"related_service","etiqueta":"Servicio relacionado","tipo":"texto","obligatorio":true}
  ]'::jsonb),
  -- Pendiente de decisión de Juan (1.8 §6.9.4): se crea apagado.
  ('review', 'Reseña', false, '[
    {"clave":"cliente","etiqueta":"Nombre","tipo":"texto","obligatorio":true},
    {"clave":"pais","etiqueta":"País","tipo":"texto","obligatorio":true},
    {"clave":"fecha_resena","etiqueta":"Fecha de la reseña","tipo":"fecha","obligatorio":true},
    {"clave":"proyecto","etiqueta":"Proyecto","tipo":"texto","obligatorio":false},
    {"clave":"servicio","etiqueta":"Línea de servicio","tipo":"texto","obligatorio":false}
  ]'::jsonb),
  -- Diseñado, apagado hasta que las URL actuales estén indexadas (1.4).
  ('project', 'Proyecto', false, '[
    {"clave":"cliente","etiqueta":"Cliente","tipo":"texto","obligatorio":true},
    {"clave":"industria","etiqueta":"Industria","tipo":"texto","obligatorio":false},
    {"clave":"pais","etiqueta":"País","tipo":"texto","obligatorio":false},
    {"clave":"anio","etiqueta":"Año","tipo":"numero","obligatorio":false},
    {"clave":"servicios","etiqueta":"Servicios aplicados","tipo":"lista","obligatorio":false},
    {"clave":"tecnologias","etiqueta":"Tecnologías","tipo":"lista","obligatorio":false},
    {"clave":"resultado","etiqueta":"Resultado (cualitativo)","tipo":"texto_largo","obligatorio":false},
    {"clave":"galeria","etiqueta":"Galería","tipo":"imagenes","obligatorio":false},
    {"clave":"enlace","etiqueta":"Enlace en vivo","tipo":"url","obligatorio":false}
  ]'::jsonb)
on conflict (id) do nothing;

-- 2 ------------------------------------------------------------
-- Grupos de traducción: una pieza, sus versiones de idioma
create table if not exists cms_groups (
  id          uuid primary key default gen_random_uuid(),
  type        text not null references cms_types(id),
  -- universal: en los dos idiomas · solo_en: mercado EE. UU. · solo_es: RD/hispano
  alcance     text not null default 'universal'
              check (alcance in ('universal', 'solo_en', 'solo_es')),
  -- Etapa «idea»: lo que se investigó antes de escribir (1.8 §4.3 paso 1)
  intencion   text,
  notas       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 3 ------------------------------------------------------------
-- El contenido: una fila por idioma
create table if not exists cms_items (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references cms_groups(id),
  type              text not null references cms_types(id),
  lang              text not null check (lang in ('en', 'es')),
  status            text not null default 'borrador'
                    check (status in ('idea', 'borrador', 'revision', 'programado', 'publicado', 'archivado')),
  slug              text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  primary_keyword   text,
  title_h1          text not null default '',
  title_seo         text not null default '',
  meta_description  text not null default '',
  body              text not null default '',   -- Markdown
  excerpt           text,                       -- si va vacío, la web usa el primer párrafo
  author            text not null default 'Juan Duvergé, founder',
  og_image          text,                       -- URL pública (bucket cms)
  sources           text[] not null default '{}',
  fields            jsonb not null default '{}'::jsonb,
  fecha             date,                       -- la que se muestra en el artículo
  programado_para   timestamptz,
  published_at      timestamptz,                -- primera publicación
  created_by        uuid references auth.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  -- Programado exige fecha
  constraint cms_items_programado_con_fecha
    check (status <> 'programado' or programado_para is not null)
);

-- Slug único por tipo e idioma; una sola versión por idioma en cada grupo.
create unique index if not exists uq_cms_items_slug
  on cms_items (type, lang, slug) where deleted_at is null;
create unique index if not exists uq_cms_items_grupo_lang
  on cms_items (group_id, lang) where deleted_at is null;
create index if not exists idx_cms_items_status on cms_items (type, status) where deleted_at is null;
create index if not exists idx_cms_items_programado
  on cms_items (programado_para) where status = 'programado' and deleted_at is null;

-- El tipo del item tiene que ser el de su grupo.
create or replace function cms_items_mismo_tipo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- security definer: la comprobación no puede depender de qué grupos ve quien escribe.
  if new.type is distinct from (select type from cms_groups where id = new.group_id) then
    raise exception 'cms: el tipo del contenido no coincide con el de su grupo';
  end if;
  return new;
end $$;

drop trigger if exists trg_cms_items_mismo_tipo on cms_items;
create trigger trg_cms_items_mismo_tipo
  before insert or update of type, group_id on cms_items
  for each row execute function cms_items_mismo_tipo();

-- Solo un admin o el servidor publican o programan. Además fija published_at
-- la primera vez que algo se publica.
create or replace function cms_items_guardia_publicar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('programado', 'publicado')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and coalesce(auth.role(), '') <> 'service_role'
     and auth_role() is distinct from 'admin'::user_role then
    raise exception 'cms: solo un administrador puede programar o publicar';
  end if;
  if new.status = 'publicado' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end $$;

-- Es función de trigger: nadie tiene que poder llamarla por /rest/v1/rpc.
revoke execute on function cms_items_guardia_publicar() from public, anon, authenticated;
revoke execute on function cms_items_mismo_tipo() from public, anon, authenticated;

drop trigger if exists trg_cms_items_guardia on cms_items;
create trigger trg_cms_items_guardia
  before insert or update of status on cms_items
  for each row execute function cms_items_guardia_publicar();

drop trigger if exists trg_cms_items_updated on cms_items;
create trigger trg_cms_items_updated before update on cms_items
  for each row execute function set_updated_at();
drop trigger if exists trg_cms_groups_updated on cms_groups;
create trigger trg_cms_groups_updated before update on cms_groups
  for each row execute function set_updated_at();

-- 4 ------------------------------------------------------------
-- Imágenes subidas desde el CRM (bucket público `cms`)
create table if not exists cms_media (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique,             -- ruta dentro del bucket
  url         text not null,
  alt         text,
  ancho       int,
  alto        int,
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now()
);

insert into storage.buckets (id, name, public)
values ('cms', 'cms', true)
on conflict (id) do nothing;

-- 5 ------------------------------------------------------------
-- Historial de publicaciones (cada vez que se recompila la web)
create table if not exists cms_publicaciones (
  id             uuid primary key default gen_random_uuid(),
  item_ids       uuid[] not null default '{}',   -- lo que motivó la publicación
  motivo         text not null default 'manual'  -- manual · programado · reintento
                 check (motivo in ('manual', 'programado', 'reintento')),
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'compilando', 'ok', 'fallo')),
  detalle        text,                           -- motivo del fallo, si lo hay
  run_url        text,                           -- enlace a la ejecución en GitHub
  solicitado_por uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  terminado_en   timestamptz
);
create index if not exists idx_cms_publicaciones_reciente on cms_publicaciones (created_at desc);

-- 6 ------------------------------------------------------------
-- Lo que la web lee al compilar: solo lo publicado, con su gemela para el hreflang.
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
  gemela.slug as gemela_slug
from cms_items i
join cms_groups g on g.id = i.group_id and g.deleted_at is null
join cms_types  t on t.id = i.type and t.activo
left join cms_items gemela
  on gemela.group_id = i.group_id
 and gemela.lang <> i.lang
 and gemela.status = 'publicado'
 and gemela.deleted_at is null
where i.status = 'publicado' and i.deleted_at is null;

-- 7 ------------------------------------------------------------
-- Permisos. Mismo criterio que el resto del CRM (auth_role()).
alter table cms_types         enable row level security;
alter table cms_groups        enable row level security;
alter table cms_items         enable row level security;
alter table cms_media         enable row level security;
alter table cms_publicaciones enable row level security;

-- Equipo: todos leen; admin y vendedor escriben; solo admin borra.
do $$
declare t text;
begin
  foreach t in array array['cms_groups', 'cms_items', 'cms_media'] loop
    execute format('drop policy if exists %1$s_select on %1$s', t);
    execute format($p$create policy %1$s_select on %1$s for select
      using (auth_role() = any (array['admin','vendedor','viewer']::user_role[]))$p$, t);
    execute format('drop policy if exists %1$s_insert on %1$s', t);
    execute format($p$create policy %1$s_insert on %1$s for insert
      with check (auth_role() = any (array['admin','vendedor']::user_role[]))$p$, t);
    execute format('drop policy if exists %1$s_update on %1$s', t);
    execute format($p$create policy %1$s_update on %1$s for update
      using (auth_role() = any (array['admin','vendedor']::user_role[]))$p$, t);
    execute format('drop policy if exists %1$s_delete on %1$s', t);
    execute format($p$create policy %1$s_delete on %1$s for delete
      using (auth_role() = 'admin'::user_role)$p$, t);
  end loop;
end $$;

drop policy if exists cms_types_select on cms_types;
create policy cms_types_select on cms_types for select using (true);
drop policy if exists cms_types_admin on cms_types;
create policy cms_types_admin on cms_types for all
  using (auth_role() = 'admin'::user_role) with check (auth_role() = 'admin'::user_role);

-- El historial lo escribe solo el servidor; el equipo lo lee.
drop policy if exists cms_publicaciones_select on cms_publicaciones;
create policy cms_publicaciones_select on cms_publicaciones for select
  using (auth_role() = any (array['admin','vendedor','viewer']::user_role[]));

-- Visitantes (anon), es decir, la compilación de la web: solo lo publicado, y
-- solo las columnas que la web muestra. Notas, intención, autoría interna y
-- fechas de programación no salen con la clave pública.
revoke all on cms_items, cms_groups, cms_media, cms_publicaciones from anon;
revoke insert, update, delete on cms_types from anon;

grant select (id, group_id, type, lang, status, slug, primary_keyword, title_h1, title_seo,
              meta_description, body, excerpt, author, og_image, sources, fields, fecha,
              published_at, updated_at, deleted_at)
  on cms_items to anon;
grant select (id, alcance, deleted_at) on cms_groups to anon;

drop policy if exists cms_items_anon_publicado on cms_items;
create policy cms_items_anon_publicado on cms_items for select to anon
  using (status = 'publicado' and deleted_at is null);
drop policy if exists cms_groups_anon on cms_groups;
create policy cms_groups_anon on cms_groups for select to anon
  using (deleted_at is null and exists (
    select 1 from cms_items i
    where i.group_id = cms_groups.id and i.status = 'publicado' and i.deleted_at is null));

grant select on cms_publicado to anon, authenticated;

-- Storage: el equipo sube y cambia imágenes; leerlas es público (bucket público).
drop policy if exists cms_storage_insert on storage.objects;
create policy cms_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'cms' and auth_role() = any (array['admin','vendedor']::user_role[]));
drop policy if exists cms_storage_update on storage.objects;
create policy cms_storage_update on storage.objects for update to authenticated
  using (bucket_id = 'cms' and auth_role() = any (array['admin','vendedor']::user_role[]));
drop policy if exists cms_storage_delete on storage.objects;
create policy cms_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'cms' and auth_role() = 'admin'::user_role);

commit;
