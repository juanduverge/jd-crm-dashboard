-- =============================================================
-- 0045_cola_wa_no_barre_el_crm_entero.sql — `leads_para_verificar_wa`
-- recorria y ordenaba TODOS los leads vivos en cada llamada, y por eso de vez
-- en cuando Supabase devolvia 504 y el vigilante mandaba un WhatsApp de
-- madrugada por un problema que no existia.
--
-- POR QUE ERA CARO. La funcion calcula los telefonos utilizables de cada lead
-- con un `cross join lateral` (unnest + wa_digitos) y luego ordena por
-- `whatsapp_verificado_en`. Sin indice, Postgres tenia que materializar ese
-- lateral para cada lead vivo y ordenar el conjunto entero ANTES de aplicar el
-- `limit`. Daba igual pedir 1 fila o 60: el trabajo era el mismo.
--
-- QUE ARREGLA ESTO. Un indice que ya viene en el orden que la funcion pide
-- (`whatsapp_verificado_en asc nulls first, created_at desc`) y que solo
-- contiene los leads vivos. Postgres puede recorrerlo en orden, parar al
-- llegar al limite y calcular el lateral unicamente para las filas que se
-- lleva. Deja de leerse el CRM entero.
--
-- El indice es parcial (`where deleted_at is null`) porque es exactamente el
-- filtro de la funcion: asi ocupa menos y no guarda lo que nunca se consulta.
-- =============================================================

begin;

create index if not exists leads_cola_wa_idx
  on leads (whatsapp_verificado_en asc nulls first, created_at desc)
  where deleted_at is null;

commit;
