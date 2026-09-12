-- =============================================================
-- 0044_web_leads_sin_duplicados.sql — Un doble clic en "Enviar" del
-- formulario de jddeveloper.com creaba dos solicitudes iguales.
--
-- n8n ya calculaba un id determinista (WL-hash de email+mensaje+dia) pero no
-- lo guardaba. Se guarda aqui como `dedup_key` y la restriccion UNIQUE deja
-- que el workflow inserte con on_conflict=dedup_key + ignore-duplicates: el
-- segundo envio no crea fila ni manda otro aviso. Las filas antiguas quedan
-- con NULL (UNIQUE permite varios NULL).
-- =============================================================

alter table web_leads add column if not exists dedup_key text;
alter table web_leads add constraint web_leads_dedup_key_key unique (dedup_key);
