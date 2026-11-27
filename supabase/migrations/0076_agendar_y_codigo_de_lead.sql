-- =============================================================
-- 0076_agendar_y_codigo_de_lead.sql — Agendar con hora, código de lead y
-- aviso por Telegram (27-nov-2026).
--
-- 1. CÓDIGO DE LEAD:  DEN-UT-0042-R
--      DEN  = clave del nicho (nichos.codigo, editable en Ajustes → Nichos)
--      UT   = estado si es de EE. UU. (sale de la dirección «…, UT 84101»),
--             si no, el país (DO, ES, MX…); XX si no se sabe
--      0042 = leads.numero: único, nunca cambia, nunca se reutiliza
--      -R   = solo si llegó por un camino especial: R referido, W formulario
--             web, E evento. Los de Maps (la mayoría) no llevan letra.
--    Juan lo pidió así: que el código diga qué es el lead de un vistazo.
--    Las letras se recalculan solas si cambia el nicho, la dirección o el
--    origen; el número es la identidad (en Telegram basta con «42»).
--
-- 2. AGENDAR: eventos.accion / mensaje / aviso_min. Lo que se agenda desde la
--    ficha (llamada, WhatsApp, correo) es un evento con hora; el texto del
--    WhatsApp va preparado para enviarlo con un toque cuando llegue la hora.
--
-- 3. AVISO POR TELEGRAM: pg_cron cada minuto manda al bot lo que empieza en
--    los próximos `aviso_min` minutos. Va en Supabase y no en el servidor de
--    casa por lo mismo que la 0060: si la casa se apaga, el aviso llega igual.
--    El token del bot vive cifrado en Vault (telegram_bot_token,
--    telegram_chat_id); sin ellos la función no hace nada.
--
-- APLICAR: pegar entero en el SQL Editor de Supabase. Después, una sola vez,
-- guardar el bot en Vault (el token está en ~/jd-wa/.env del servidor, el
-- mismo bot @servidor_jd_bot que ya usa el vigilante):
--   select vault.create_secret('<TELEGRAM_TOKEN>',   'telegram_bot_token');
--   select vault.create_secret('<TELEGRAM_CHAT_ID>', 'telegram_chat_id');
--
-- ORDEN: primero esta migración y después publicar el CRM. El calendario de
-- esta versión pide las columnas nuevas de `eventos` y sin ellas falla.
-- =============================================================

begin;

create extension if not exists pg_net;

-- -------------------------------------------------------------
-- 1. Clave de cada nicho
-- -------------------------------------------------------------
alter table nichos add column if not exists codigo text;

update nichos n set codigo = v.c from (values
  ('arquitectura','ARQ'),('ingenieria','ING'),('construccion','CON'),('real-estate','INM'),
  ('interiorismo','INT'),('restaurantes','RES'),('hoteles','HOT'),('turismo','TUR'),
  ('clinicas','CLI'),('dentistas','DEN'),('medicos','MED'),('abogados','ABO'),
  ('contadores','CNT'),('consultores','CSL'),('agencias-marketing','MKT'),('estudios-creativos','CRE'),
  ('software','SOF'),('saas','SAS'),('ia','IA'),('educacion','EDU'),('universidades','UNI'),
  ('escuelas','ESC'),('ecommerce','ECO'),('retail','RET'),('manufactura','MAN'),
  ('industriales','IND'),('logistica','LOG'),('transporte','TRA'),('automotriz','AUT'),
  ('daycare','GUA'),('talleres','TAL'),('fitness','GYM'),('centros-deportivos','DEP'),
  ('barberias','BAR'),('salones-belleza','BEL'),('ong','ONG'),('iglesias','IGL'),
  ('apartment-rental-agency','ALQ'),('architecture-school','EAR'),('atm','ATM'),('bank','BAN'),
  ('bankruptcy-attorney','ABQ'),('bathroom-remodeler','REM'),('building-firm','CNS'),
  ('business-to-business-service','B2B'),('car-detailing-service','DET'),('car-wash','LAV'),
  ('corporate-office','OFC'),('credit-counseling-service','CRD'),('credit-union','COO'),
  ('criminal-justice-attorney','APE'),('divorce-lawyer','ADV'),('drafting-service','DIB'),
  ('estate-planning-attorney','AHE'),('family-law-attorney','AFA'),('federal-credit-union','CFE'),
  ('finance-broker','BRF'),('financial-audit','AUD'),('financial-consultant','FIN'),
  ('financial-institution','IFI'),('general-practice-attorney','AGE'),
  ('handyman-handywoman-handyperson','MNT'),('health-insurance-agency','SGS'),('health-spa','SPA'),
  ('housing-development','URB'),('immigration-naturalization-service','MIG'),
  ('immigration-attorney','AIN'),('insurance-agency','SEG'),('insurance-agent','AGS'),
  ('insurance-broker','CSG'),('landscape-architect','PAI'),('landscape-designer','JAR'),
  ('landscaping-supply-store','VJA'),('life-insurance-agency','SGV'),('loan-agency','PRE'),
  ('medical-spa','MSP'),('metal-fabricator','MET'),('movie-theater','CIN'),('notary-public','NOT'),
  ('office-refurbishment-service','ROF'),('paralegal-services-provider','PAR'),
  ('personal-injury-attorney','ALE'),('pilates-studio','PIL'),('real-estate-consultant','ICO'),
  ('real-estate-developer','PRO'),('solar-energy-company','SOL'),('structural-engineer','EST'),
  ('tax-collector-s-office','IMP'),('otros','OTR')
) as v(id, c)
where n.id = v.id and n.codigo is null;

-- Clave automática para los nichos que no están en la lista (los que cree el
-- importador o el usuario): iniciales si son 3+ palabras, si no las 3
-- primeras letras; si ya existe, la última letra pasa a ser un dígito.
create or replace function nicho_codigo_auto(p_nombre text, p_excluir text default null)
returns text language plpgsql stable set search_path = public, pg_temp as $fn$
declare
  v_limpio text;
  v_palabras text[];
  v_base text;
  v_cand text;
  i int;
begin
  v_limpio := upper(translate(coalesce(p_nombre, ''), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'));
  v_palabras := array_remove(regexp_split_to_array(regexp_replace(v_limpio, '[^A-Z0-9 ]', ' ', 'g'), '\s+'), '');
  if coalesce(array_length(v_palabras, 1), 0) = 0 then
    v_base := 'NIC';
  elsif array_length(v_palabras, 1) >= 3 then
    v_base := left(v_palabras[1], 1) || left(v_palabras[2], 1) || left(v_palabras[3], 1);
  else
    v_base := rpad(left(array_to_string(v_palabras, ''), 3), 3, 'X');
  end if;

  v_cand := v_base;
  i := 1;
  while exists (select 1 from nichos where codigo = v_cand and id is distinct from p_excluir) loop
    i := i + 1;
    exit when i > 99;
    v_cand := left(v_base, 3 - length(i::text)) || i::text;
  end loop;
  return v_cand;
end
$fn$;

update nichos set codigo = nicho_codigo_auto(nombre, id) where codigo is null;

alter table nichos alter column codigo set not null;
alter table nichos drop constraint if exists nichos_codigo_formato;
alter table nichos add constraint nichos_codigo_formato check (codigo ~ '^[A-Z0-9]{2,4}$');
create unique index if not exists uq_nichos_codigo on nichos (codigo);

comment on column nichos.codigo is
  'Clave corta del nicho (2–4 letras) con la que empieza el código de cada lead: DEN-UT-0042.';

create or replace function nicho_codigo_por_defecto() returns trigger
language plpgsql set search_path = public, pg_temp as $fn$
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    new.codigo := nicho_codigo_auto(new.nombre, new.id);
  else
    new.codigo := upper(btrim(new.codigo));
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_nichos_codigo on nichos;
create trigger trg_nichos_codigo before insert or update of codigo on nichos
  for each row execute function nicho_codigo_por_defecto();

-- -------------------------------------------------------------
-- 2. Número y código de cada lead
-- -------------------------------------------------------------
create or replace function lead_zona(p_pais text, p_codigo_pais text, p_direccion text)
returns text language plpgsql immutable as $fn$
declare
  v_pais text := upper(nullif(btrim(p_codigo_pais), ''));
  v_estado text;
begin
  if v_pais is null then
    v_pais := case
      when p_pais ~* '^\s*[a-z]{2}\s*$'                 then upper(btrim(p_pais))
      when p_pais ~* 'dominicana|domicana|(^|\W)rd\s*$' then 'DO'
      when p_pais ~* 'estados unidos|usa|united states' then 'US'
      when p_pais ~* 'espa(ñ|n)a|spain'                  then 'ES'
      when p_pais ~* 'm(é|e)xico'                        then 'MX'
      when p_pais ~* 'colombia'                          then 'CO'
      when p_pais ~* 'argentina'                         then 'AR'
      when p_pais ~* 'canad'                             then 'CA'
      else null
    end;
  end if;
  -- En EE. UU. el país dice poco: lo útil es el estado («Houston, TX 77031»).
  if v_pais is null or v_pais = 'US' then
    v_estado := substring(coalesce(p_direccion, '') from ',\s*([A-Z]{2})\s+\d{5}');
    if v_estado is not null then return v_estado; end if;
  end if;
  return coalesce(v_pais, 'XX');
end
$fn$;

create or replace function lead_codigo(
  p_numero bigint, p_nicho text, p_pais text, p_codigo_pais text, p_direccion text,
  p_origen text, p_referido text
) returns text language sql stable set search_path = public, pg_temp as $fn$
  select coalesce((select codigo from nichos where id = p_nicho), 'OTR')
      || '-' || lead_zona(p_pais, p_codigo_pais, p_direccion)
      || '-' || lpad(p_numero::text, 4, '0')
      || case
           when p_origen = 'recomendacion' or nullif(btrim(p_referido), '') is not null then '-R'
           when p_origen = 'formulario_web' then '-W'
           when p_origen = 'evento'         then '-E'
           else ''
         end
$fn$;

alter table leads add column if not exists numero bigint;
alter table leads add column if not exists codigo text;
create sequence if not exists leads_numero_seq owned by leads.numero;

-- El relleno no debe contar como «lead actualizado» ni disparar las reglas de
-- etapa: se apagan los triggers del usuario solo durante este update.
alter table leads disable trigger user;

-- Por orden de llegada, también los borrados: así un número nunca se repite.
with orden as (
  select id, row_number() over (order by created_at, id) as n from leads where numero is null
)
update leads l set numero = o.n + coalesce((select max(numero) from leads), 0)
  from orden o where l.id = o.id;

update leads set codigo = lead_codigo(numero, nicho, pais, codigo_pais, direccion, origen, referido_por);

alter table leads enable trigger user;

select setval('leads_numero_seq', greatest(coalesce((select max(numero) from leads), 0), 1),
              (select max(numero) from leads) is not null);
alter table leads alter column numero set default nextval('leads_numero_seq');
alter table leads alter column numero set not null;
create unique index if not exists uq_leads_numero on leads (numero);
create index if not exists idx_leads_codigo on leads (codigo);

comment on column leads.numero is 'Número del lead: único, fijo, nunca se reutiliza. Es la parte 0042 del código.';
comment on column leads.codigo is 'DEN-UT-0042-R: nicho, zona, número y (si es especial) origen. Lo mantiene la BD.';

create or replace function lead_poner_codigo() returns trigger
language plpgsql set search_path = public, pg_temp as $fn$
begin
  if new.numero is null then new.numero := nextval('leads_numero_seq'); end if;
  new.codigo := lead_codigo(new.numero, new.nicho, new.pais, new.codigo_pais, new.direccion,
                            new.origen, new.referido_por);
  return new;
end
$fn$;

drop trigger if exists trg_leads_codigo on leads;
create trigger trg_leads_codigo
  before insert or update of numero, nicho, pais, codigo_pais, direccion, origen, referido_por on leads
  for each row execute function lead_poner_codigo();

-- Cambiar la clave de un nicho en Ajustes rehace el código de sus leads.
create or replace function nicho_propagar_codigo() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $fn$
begin
  update leads
     set codigo = lead_codigo(numero, nicho, pais, codigo_pais, direccion, origen, referido_por)
   where nicho = new.id;
  return null;
end
$fn$;

drop trigger if exists trg_nichos_propagar_codigo on nichos;
create trigger trg_nichos_propagar_codigo after update of codigo on nichos
  for each row when (old.codigo is distinct from new.codigo)
  execute function nicho_propagar_codigo();

-- -------------------------------------------------------------
-- 3. Agendar: qué hay que hacer y con qué mensaje
-- -------------------------------------------------------------
alter table eventos add column if not exists accion text;
alter table eventos add column if not exists mensaje text;
alter table eventos add column if not exists aviso_min int not null default 10;
alter table eventos add column if not exists avisado_telegram_en timestamptz;

alter table eventos drop constraint if exists eventos_accion_check;
alter table eventos add constraint eventos_accion_check
  check (accion is null or accion in ('llamada', 'whatsapp', 'correo', 'otro'));
alter table eventos drop constraint if exists eventos_aviso_min_check;
alter table eventos add constraint eventos_aviso_min_check check (aviso_min between 0 and 1440);

comment on column eventos.accion is 'Lo agendado desde la ficha del lead: llamada, whatsapp, correo u otro.';
comment on column eventos.mensaje is 'Texto preparado (WhatsApp o correo) para mandarlo con un toque a la hora.';
comment on column eventos.aviso_min is 'Minutos de antelación del aviso por Telegram.';

-- Si se mueve la hora (posponer, arrastrar en el calendario), el aviso vuelve
-- a salir a la hora nueva.
create or replace function evento_reavisar() returns trigger
language plpgsql set search_path = public, pg_temp as $fn$
begin
  if new.inicio is distinct from old.inicio or new.aviso_min is distinct from old.aviso_min then
    new.avisado_telegram_en := null;
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_eventos_reavisar on eventos;
create trigger trg_eventos_reavisar before update of inicio, aviso_min on eventos
  for each row execute function evento_reavisar();

create index if not exists idx_eventos_por_avisar on eventos (inicio)
  where avisado_telegram_en is null and deleted_at is null;

-- -------------------------------------------------------------
-- 4. Aviso por Telegram
-- -------------------------------------------------------------
create or replace function avisar_agenda_telegram() returns int
language plpgsql security definer set search_path = public, extensions, pg_temp as $fn$
declare
  v_token text;
  v_chat  text;
  r       record;
  v_min   int;
  v_txt   text;
  v_icono text;
  v_n     int := 0;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat  from vault.decrypted_secrets where name = 'telegram_chat_id';
  if coalesce(v_token, '') = '' or coalesce(v_chat, '') = '' then return 0; end if;

  for r in
    select e.id, e.titulo, e.descripcion, e.inicio, e.accion, e.mensaje, e.tipo, e.lead_id, e.enlace,
           l.empresa, l.codigo, coalesce(nullif(l.whatsapp, ''), l.telefono) as telefono
      from eventos e
      left join leads l on l.id = e.lead_id
     where e.deleted_at is null
       and not e.todo_el_dia
       and e.estado in ('pendiente', 'confirmado')
       and e.avisado_telegram_en is null
       and e.inicio - make_interval(mins => e.aviso_min) <= now()
       -- Lo que ya pasó hace rato no se avisa: evita una ráfaga al conectar el bot.
       and e.inicio > now() - interval '15 minutes'
     order by e.inicio
     limit 20
     for update of e skip locked
  loop
    v_min := round(extract(epoch from (r.inicio - now())) / 60);
    v_icono := case r.accion
                 when 'llamada'  then '📞'
                 when 'whatsapp' then '💬'
                 when 'correo'   then '✉️'
                 else case when r.tipo = 'reunion' then '🤝' else '📌' end
               end;

    v_txt := case when v_min >= 1 then '⏰ En ' || v_min || ' min' else '⏰ Ahora' end
          || ' · ' || to_char(r.inicio at time zone zona_crm(), 'HH24:MI') || E'\n'
          || v_icono || ' ' || r.titulo
          || coalesce(E'\n🆔 ' || r.codigo, '')
          || coalesce(E'\n📱 ' || nullif(r.telefono, ''), '')
          || coalesce(E'\n📝 ' || left(nullif(btrim(r.descripcion), ''), 300), '')
          || coalesce(E'\n\n💬 Mensaje preparado:\n' || left(nullif(btrim(r.mensaje), ''), 600), '')
          || coalesce(E'\n🎥 ' || nullif(r.enlace, ''), '')
          || E'\n\n👉 ' || case
               when r.lead_id is not null then 'https://workspace.jddeveloper.com/leads?lead=' || r.lead_id
               else 'https://workspace.jddeveloper.com/productividad/calendario'
             end;

    perform net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object('chat_id', v_chat, 'text', v_txt, 'disable_web_page_preview', true),
      headers := '{"Content-Type":"application/json"}'::jsonb,
      timeout_milliseconds := 10000);

    update eventos set avisado_telegram_en = now() where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end
$fn$;

revoke execute on function avisar_agenda_telegram() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'agenda-telegram') then
    perform cron.unschedule('agenda-telegram');
  end if;
end $$;

select cron.schedule('agenda-telegram', '* * * * *', $job$ select public.avisar_agenda_telegram() $job$);

commit;
