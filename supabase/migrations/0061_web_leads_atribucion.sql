-- =============================================================
-- 0061_web_leads_atribucion.sql — De qué artículo viene cada lead
-- (20-oct-2026).
--
-- La web recuerda durante la visita (sessionStorage, sin datos personales):
--   landing   la primera página por la que entró
--   articulo  el último artículo del blog que leyó (/blog/… o /es/blog/…)
-- y los manda con el formulario. Aquí se guardan, y el Blog CMS cuenta los
-- leads de cada artículo (1.8 §6.8: «el cruce que nadie más tiene»).
--
-- Mismo cuerpo que recibir_formulario_web de la 0050 + las dos columnas.
-- APLICAR: pegar entero en el SQL Editor de Supabase.
-- =============================================================

begin;

alter table web_leads
  add column if not exists landing  text,
  add column if not exists articulo text;

create index if not exists idx_web_leads_articulo on web_leads (articulo) where articulo is not null;

create or replace function public.recibir_formulario_web(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_email   text := lower(btrim(coalesce(p->>'email', '')));
  v_nombre  text := btrim(coalesce(p->>'nombre', ''));
  v_mensaje text := btrim(coalesce(p->>'mensaje', p->>'detalle', ''));
  v_clave   text;
  v_id      uuid;
  -- Solo rutas internas: «/blog/x». Cualquier otra cosa se descarta.
  -- (Postgres no admite repeticiones {n,m} de más de 255: el largo va aparte.)
  v_landing  text := case when length(p->>'landing') <= 300 and p->>'landing' ~ '^/[A-Za-z0-9/_.-]*$' then p->>'landing' end;
  v_articulo text := case when p->>'articulo' ~ '^(/es)?/blog/[a-z0-9-]{1,200}$' then p->>'articulo' end;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_nombre = '' then
    raise exception 'formulario incompleto: hacen falta nombre y email valido';
  end if;

  v_clave := 'WL-' || md5(v_email || '|' || v_mensaje || '|' || dia_crm(now())::text);

  insert into web_leads (
    nombre, email, telefono, mensaje, empresa, asunto, pagina, url, referrer,
    utm_source, utm_medium, utm_campaign, ip, user_agent, fuente, formulario,
    estado, prioridad, etiquetas, dedup_key, landing, articulo
  ) values (
    left(v_nombre, 200), left(v_email, 320),
    nullif(left(btrim(coalesce(p->>'telefono', '')), 60), ''),
    left(v_mensaje, 5000),
    nullif(left(btrim(coalesce(p->>'empresa', '')), 200), ''),
    nullif(left(btrim(coalesce(p->>'asunto', '')), 300), ''),
    nullif(left(p->>'pagina', 500), ''), nullif(left(p->>'url', 1000), ''),
    nullif(left(p->>'referrer', 1000), ''),
    nullif(left(p->>'utm_source', 200), ''), nullif(left(p->>'utm_medium', 200), ''),
    nullif(left(p->>'utm_campaign', 200), ''),
    nullif(left(p->>'ip', 100), ''), nullif(left(p->>'user_agent', 500), ''),
    coalesce(nullif(p->>'fuente', ''), 'web'), nullif(left(p->>'formulario', 200), ''),
    'nuevo', 'media', '{}', v_clave, v_landing, v_articulo
  )
  on conflict (dedup_key) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('ok', true, 'nuevo', false);
  end if;

  perform tareas_encolar('avisar_formulario', jsonb_build_object('web_lead_id', v_id));
  return jsonb_build_object('ok', true, 'nuevo', true, 'id', v_id);
end $function$;

commit;
