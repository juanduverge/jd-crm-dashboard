-- =============================================================
-- 0049_usuario_respaldo.sql — usuario de solo lectura para la copia diaria.
--
-- El plan gratis de Supabase NO hace copias de seguridad. La copia la hace
-- cada noche el servidor de casa (deploy/respaldo/respaldo-supabase.sh) con
-- este usuario, no con la contrasena principal de la base.
--
-- BYPASSRLS: pg_dump tiene que ver todas las filas; con RLS activo y sin este
-- permiso se niega a volcar las tablas. Solo tiene SELECT: no puede escribir.
--
-- Nace SIN contrasena (no puede entrar). La pone Juan con la linea que
-- imprime deploy/respaldo/crear-clave.sh; la contrasena en claro solo vive en
-- el servidor de casa.
-- =============================================================

begin;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'respaldo') then
    create role respaldo login bypassrls;
  end if;
end $$;

grant usage on schema public to respaldo;
grant select on all tables in schema public to respaldo;
grant select on all sequences in schema public to respaldo;
-- Las tablas que creen migraciones futuras tambien entran en la copia.
alter default privileges for role postgres in schema public grant select on tables to respaldo;
alter default privileges for role postgres in schema public grant select on sequences to respaldo;

commit;
