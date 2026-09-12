-- =============================================================
-- 0045_cola_wa_no_barre_el_crm_entero.sql — deja registrado el indice
-- `leads_cola_wa_idx`, que ya existia en produccion pero no en el repo.
--
-- POR QUE ESTA MIGRACION NO ARREGLA EL 504. Se escribio pensando que
-- `leads_para_verificar_wa` barria el CRM entero y por eso Supabase devolvia
-- 504 de madrugada. Medido: la tabla tiene ~400 leads vivos (2,6 MB) y la
-- funcion tarda 8 ms. Nunca fue el problema. Los 504 vienen de fuera de la
-- base — un hipo del proxy de Supabase o del enlace de casa — y lo que los
-- convertia en un WhatsApp a las cinco de la manana era que el vigilante
-- avisaba al primer fallo. Eso se arregla en `vigilante.py`, no aqui.
--
-- QUE HACE ENTONCES. El indice esta creado en la base pero no lo puso ninguna
-- migracion, asi que una base reconstruida desde cero no lo tendria. Queda
-- aqui para que el repo describa lo que hay de verdad. Es `if not exists`:
-- contra produccion no cambia nada.
--
-- NOTA: `idx_leads_verificar_wa` (0035) es ahora redundante — este indice
-- empieza por la misma columna y sirve para lo mismo. Borrarlo es seguro,
-- pero se deja para no tocar produccion en una migracion que solo documenta.
-- =============================================================

begin;

create index if not exists leads_cola_wa_idx
  on leads (whatsapp_verificado_en asc nulls first, created_at desc)
  where deleted_at is null;

commit;
