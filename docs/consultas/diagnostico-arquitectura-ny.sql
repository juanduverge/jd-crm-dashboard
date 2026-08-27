-- Diagnóstico: la búsqueda "arquitectura / New york" (ejecución n8n 6491,
-- 2026-08-27) devolvió 20 negocios de Apify y sólo insertó 1: los otros 19
-- se contaron como "actualizados", es decir, importar_leads los dio por ya
-- existentes.
--
-- Ya está comprobado en n8n que NO venían de una búsqueda anterior del CRM:
-- las 8 ejecuciones que existen son abogados/USA, firmas de inmigración/usa
-- (x2), abogados/New york, abogado de inmigración/New York, arquitectura/Miami
-- (x2, fallidas antes de importar) y ésta. Los 93 placeId de todas las
-- anteriores no comparten NI UNO con los 20 de hoy.
--
-- Falta saber CON QUÉ filas casaron esos 19. Ejecuta esto en el SQL editor de
-- Supabase (necesita permisos que la clave anon no tiene).

-- 1) El lote crudo de esa importación, con lo que decidió la función.
select recibidos, insertados, actualizados, descartados, fuente, consulta, created_at
  from lead_imports
 where consulta ilike '%arquitectura%New%'
 order by created_at desc
 limit 5;

-- 2) ¿Existen realmente esos negocios por place_id?  (0 = el emparejamiento
--    fue un falso positivo y hay que arreglar importar_leads)
with lote as (
  select jsonb_array_elements(payload) as it
    from lead_imports
   where consulta ilike '%arquitectura%New%'
   order by created_at desc
   limit 1
)
select count(*) filter (where l.id is not null) as encontrados_por_place_id,
       count(*)                                as items_del_lote
  from lote
  left join leads l on l.place_id = lote.it ->> 'placeId';

-- 3) Si el punto 2 da 0: ¿con qué casaron entonces?  Reproduce el mismo OR que
--    usa importar_leads y enseña la fila culpable de cada item.
with lote as (
  select jsonb_array_elements(payload) as it
    from lead_imports
   where consulta ilike '%arquitectura%New%'
   order by created_at desc
   limit 1
)
select lote.it ->> 'title'   as empresa_apify,
       lote.it ->> 'placeId' as place_id_apify,
       l.id, l.empresa, l.ciudad, l.place_id, l.google_maps,
       l.created_at, l.deleted_at,
       case when l.place_id   = lote.it ->> 'placeId' then 'place_id'
            when lower(trim(l.google_maps)) = lower(trim(lote.it ->> 'url')) then 'google_maps'
            else 'empresa+ciudad' end as caso_por
  from lote
  left join leads l
    on (l.place_id = lote.it ->> 'placeId')
    or (lower(trim(l.google_maps)) = lower(trim(lote.it ->> 'url')))
    or (lower(l.empresa) = lower(lote.it ->> 'title')
        and coalesce(lower(l.ciudad),'') = coalesce(lower(lote.it ->> 'city'),''))
 order by 1;
