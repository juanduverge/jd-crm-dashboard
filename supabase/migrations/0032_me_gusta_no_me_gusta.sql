-- 0032: "Me gusta" / "No me gusta" para leads.
--
-- Ojo: NO es lo mismo que `favorito` (0001). El favorito es una marca de
-- trabajo — "esto lo quiero a mano, vuelvo a el" — y por eso conserva su
-- estrella, su pestaña y su clave de busqueda `favorito:si`. El me gusta /
-- no me gusta es un juicio sobre el lead en si: si interesa o si sobra.
-- Un lead puede estar en favoritos porque hay que gestionarlo aunque no
-- guste, y gustar sin estar en favoritos. Por eso son dos columnas.
--
-- `descartado` tampoco es un borrado: el lead sigue vivo, visible y buscable;
-- solo se ordena el ultimo. Para sacarlo de en medio esta `deleted_at`.
alter table leads add column if not exists me_gusta boolean not null default false;
alter table leads add column if not exists descartado boolean not null default false;

-- Los descartados son minoria: un indice parcial hace barato hundirlos al
-- final y filtrarlos, sin cargar con una fila de indice por cada lead normal.
create index if not exists idx_leads_descartado on leads (descartado) where descartado;
