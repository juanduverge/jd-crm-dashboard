-- =============================================================
-- 0059_cms_publicar.sql — Botón Publicar del Blog CMS (20-oct-2026).
--
-- CÓMO FUNCIONA
--
--   CRM → Edge Function cms-publicar (solo admin)
--       → cambia el estado del artículo si hace falta
--       → crea una fila en cms_publicaciones con un código de un solo uso
--       → pide a GitHub que compile y despliegue la web
--   GitHub Action → avisa a cms-publicacion-estado con ese código:
--       compilando → ok / fallo (con el enlace a la ejecución)
--
-- El código viaja a GitHub una vez y aquí solo se guarda su huella (sha256):
-- quien lo viera solo podría cambiar el estado de ESA publicación, y deja de
-- valer en cuanto termina. Así no hace falta otra clave fija compartida.
--
-- APLICAR: pegar entero en el SQL Editor de Supabase. No toca filas existentes.
-- =============================================================

begin;

alter table cms_publicaciones
  add column if not exists aviso_hash text,
  add column if not exists accion     text not null default 'reconstruir'
    check (accion in ('publicar', 'despublicar', 'reconstruir')),
  add column if not exists iniciado_en timestamptz;

-- El CRM pinta «Publicando…» al momento: que vea los cambios de esta tabla.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'cms_publicaciones') then
    alter publication supabase_realtime add table cms_publicaciones;
  end if;
end $$;

commit;
