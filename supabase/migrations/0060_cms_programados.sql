-- =============================================================
-- 0060_cms_programados.sql — Los artículos programados se publican solos
-- (20-oct-2026).
--
-- POR QUÉ AQUÍ Y NO EN n8n
--
-- 1.8 §6.6 dejaba la programación a n8n. Se hace con pg_cron de Supabase
-- porque así no depende del servidor de casa (la regla de 1.8 §6.1): si la
-- casa está apagada a la hora programada, el artículo sale igual. Y no se
-- toca ningún workflow de n8n.
--
-- CÓMO
--
--   Cada 15 min, pg_cron mira si hay algún `programado` cuya hora pasó. Si no
--   hay ninguno, no hace nada (ni una llamada). Si lo hay, llama a la Edge
--   Function cms-publicar con la cabecera x-cms-cron; la función comprueba el
--   código con cms_cron_ok(), publica lo que toque y lanza la GitHub Action,
--   igual que el botón Publicar (cms_publicaciones.motivo = 'programado').
--
--   El código vive cifrado en Vault y nunca sale de la base: pg_cron lo lee
--   de Vault y la función lo valida aquí con cms_cron_ok(), que solo puede
--   ejecutar service_role.
--
-- APLICAR: pegar entero en el SQL Editor de Supabase.
-- =============================================================

create extension if not exists pg_net;

-- Código compartido entre pg_cron y la Edge Function, generado aquí.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cms_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'cms_cron_secret',
      'pg_cron → cms-publicar (0060)');
  end if;
end $$;

create or replace function public.cms_cron_ok(p text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(p, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'cms_cron_secret' and decrypted_secret = p)
$$;
revoke execute on function public.cms_cron_ok(text) from public, anon, authenticated;
grant execute on function public.cms_cron_ok(text) to service_role;

-- Cada 15 minutos; solo llama si de verdad hay algo que publicar.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cms-programados') then
    perform cron.unschedule('cms-programados');
  end if;
end $$;

select cron.schedule('cms-programados', '*/15 * * * *', $job$
  select net.http_post(
    url := 'https://octzlhcwqlvxzrjgaptk.supabase.co/functions/v1/cms-publicar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cms-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'cms_cron_secret')),
    body := '{"accion":"programados"}'::jsonb,
    timeout_milliseconds := 20000)
  where exists (select 1 from public.cms_items
                where status = 'programado' and programado_para <= now() and deleted_at is null)
$job$);
