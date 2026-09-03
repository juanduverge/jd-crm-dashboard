-- =============================================================
-- 0035_verificacion_whatsapp.sql — Verificación de WhatsApp por número
--
-- CONTEXTO:
--
-- Hasta ahora el WhatsApp de un lead sólo se conocía si la empresa publicaba
-- un enlace `wa.me` en su web (0026, `whatsapp_source = 'wa_link_web'`). Eso
-- cubre una minoría de los leads y deja el resto en manos de una comprobación
-- MANUAL: abrir ficha por ficha y mirar si el número aparece en WhatsApp.
--
-- Esta migración crea el sitio donde guardar el resultado de esa comprobación
-- cuando la hace una máquina en vez de una persona, y la cola que decide a
-- quién le toca. El «cómo» vive fuera de la base de datos: un Android en el
-- servidor, con una cuenta desechable, que sincroniza los números como
-- contactos y lee cuáles marca WhatsApp como usuarios suyos.
--
-- QUÉ HACE:
--
--  1. `whatsapp_estado`, `whatsapp_numeros[]` y `whatsapp_verificado_en`.
--     Un lead puede tener varios teléfonos y varios con WhatsApp: por eso un
--     array, no un booleano.
--  2. `leads_para_verificar_wa()` — la cola. Sirve tanto para los leads que
--     llegan nuevos de Apify como para el repaso de todo lo que ya estaba en
--     el CRM sin verificar; es la misma cola, ordenada por antigüedad de
--     verificación.
--  3. `registrar_whatsapp()` — el punto de entrada único de la escritura,
--     hermano de `enriquecer_lead`. Misma regla: NUNCA pisa un dato existente.
--
-- REGLA DE SEGURIDAD MÁS IMPORTANTE DE ESTE FICHERO:
--
--   Un lote sin resultados NO marca a nadie como «no tiene WhatsApp».
--
-- Si la sesión de WhatsApp se cae, si el emulador se queda a medias o si la
-- lectura falla, lo que llega aquí es una lista vacía. Tratar eso como «he
-- comprobado los 60 y ninguno tiene WhatsApp» destruiría datos buenos en
-- silencio y sin forma de distinguirlo de una verificación real. Por eso un
-- lote vacío deja `whatsapp_estado = 'sin_verificar'`, NO toca
-- `whatsapp_verificado_en`, y el lead vuelve a salir en la cola.
--
-- `no_aparece` tampoco significa «no tiene WhatsApp». Significa «no apareció
-- en esta comprobación»: la privacidad del número puede ocultarlo. Es una
-- señal de prioridad, no un hecho.
-- =============================================================

begin;

-- --- 1. Dónde se guarda el resultado ---------------------------
alter table leads
  add column if not exists whatsapp_estado        text,
  add column if not exists whatsapp_numeros       text[],
  add column if not exists whatsapp_verificado_en timestamptz;

alter table leads drop constraint if exists leads_whatsapp_estado_check;
alter table leads add constraint leads_whatsapp_estado_check
  check (whatsapp_estado is null
         or whatsapp_estado in ('confirmado', 'no_aparece', 'sin_verificar'));

comment on column leads.whatsapp_estado is
  'confirmado = al menos un número apareció en WhatsApp. '
  'no_aparece = se comprobó y ninguno apareció (NO es «no tiene»: la privacidad '
  'del número puede ocultarlo). '
  'sin_verificar = se intentó y la comprobación falló; hay que reintentar. '
  'null = nunca se ha intentado.';

comment on column leads.whatsapp_numeros is
  'Todos los teléfonos del lead que tienen WhatsApp. `whatsapp` es el principal.';

comment on column leads.whatsapp_verificado_en is
  'Última verificación CON RESULTADO. Un intento fallido no la actualiza, '
  'para que el lead vuelva a entrar en la cola.';

-- El comentario de la 0026 no contemplaba la verificación por dispositivo.
comment on column leads.whatsapp_source is
  'Cómo se supo del WhatsApp: wa_link_web | apify_contacts | wa_probe | manual. '
  'Nunca inferido a partir del formato del teléfono.';

-- Para «dame los siguientes N que tocan»: los nunca verificados primero, que
-- es también el repaso del histórico del CRM.
create index if not exists idx_leads_verificar_wa
  on leads (whatsapp_verificado_en nulls first)
  where deleted_at is null;

-- --- 2. Comparar teléfonos por sus dígitos ---------------------
-- El mismo número llega como '+1 809-555-0000', '(809) 555 0000' o
-- '18095550000' según la fuente. WhatsApp lo devuelve en E.164 sin símbolos.
-- Sin normalizar, un número verificado no casaría con el que hay guardado y
-- el resultado se perdería en silencio.
create or replace function wa_digitos(p text)
returns text as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$ language sql immutable;

comment on function wa_digitos(text) is
  'Deja sólo los dígitos de un teléfono, para poder compararlos entre formatos.';

-- --- 3. La cola ------------------------------------------------
-- Igual que `leads_para_enriquecer`: la política de reintentos vive aquí, en
-- un solo sitio, y no repartida en condiciones de un IF del workflow.
create or replace function leads_para_verificar_wa(
  p_limite    int default 60,
  p_reintento interval default '180 days'
) returns table (id uuid, empresa text, telefonos text[]) as $$
  select
    l.id,
    l.empresa,
    -- Todos los teléfonos conocidos del lead, deduplicados. Un lead puede
    -- tener el fijo en `telefono` y el móvil en `telefonos[]`: hay que
    -- comprobar los dos, que es justo lo que hoy se hace a mano.
    (select array_agg(distinct t)
       from unnest(
              coalesce(l.telefonos, '{}'::text[])
              || array_remove(array[l.telefono, l.telefono_2], null)
            ) t
      where wa_digitos(t) is not null
        and length(wa_digitos(t)) between 7 and 15
    ) as telefonos
  from leads l
 where l.deleted_at is null
   -- Sin teléfono no hay nada que comprobar.
   and (l.telefono is not null
        or l.telefono_2 is not null
        or coalesce(array_length(l.telefonos, 1), 0) > 0)
   -- Nunca verificado (esto incluye todo el histórico del CRM), o toca
   -- repasar. Un `sin_verificar` no sella fecha, así que vuelve a entrar solo.
   and (l.whatsapp_verificado_en is null
        or l.whatsapp_verificado_en < now() - p_reintento)
 order by l.whatsapp_verificado_en asc nulls first, l.created_at desc
 limit greatest(1, least(p_limite, 500));
$$ language sql stable security definer set search_path = public, pg_temp;

revoke all on function leads_para_verificar_wa(int, interval) from public, anon;
grant execute on function leads_para_verificar_wa(int, interval) to authenticated, service_role;

comment on function leads_para_verificar_wa(int, interval) is
  'Siguiente lote a comprobar. Los nunca verificados primero: eso cubre tanto '
  'los leads nuevos de Apify como el repaso del histórico.';

-- --- 4. Escribir el resultado ----------------------------------
-- p_resultados: [{"numero":"+18095550000","tiene":true}, …]
-- Sólo cuentan los que traen `tiene` explícito. Un número ausente de la lista
-- no es un «no»: es un número del que no se sabe nada.
create or replace function registrar_whatsapp(
  p_id         uuid,
  p_resultados jsonb default '[]'::jsonb,
  p_fuente     text default 'wa_probe'
) returns jsonb as $$
declare
  l             leads%rowtype;
  v_con_wa      text[] := '{}';
  v_comprobados int := 0;
  v_estado      text;
  v_relleno     boolean := false;
begin
  select * into l from leads where id = p_id and deleted_at is null;
  if not found then
    raise exception 'registrar_whatsapp: lead % no existe o está en la papelera', p_id;
  end if;

  -- Los que la comprobación dice que SÍ tienen WhatsApp, y cuántos números
  -- traían veredicto (los que no lo traen no cuentan como comprobados).
  select
    coalesce(array_agg(distinct btrim(r ->> 'numero'))
             filter (where (r ->> 'tiene')::boolean is true), '{}'),
    count(*) filter (where (r ->> 'tiene') is not null)
    into v_con_wa, v_comprobados
    from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) r
   where jsonb_typeof(r) = 'object'
     and nullif(btrim(coalesce(r ->> 'numero', '')), '') is not null;

  -- ---- El caso que protege los datos --------------------------
  -- Cero números con veredicto = la comprobación no llegó a hacerse. No se
  -- concluye nada, no se sella la fecha, y el lead vuelve a la cola.
  if v_comprobados = 0 then
    update leads x
       set whatsapp_estado = 'sin_verificar',
           updated_at = now()
     where x.id = p_id
       -- Un fallo no degrada un 'confirmado' anterior.
       and coalesce(x.whatsapp_estado, '') <> 'confirmado';

    return jsonb_build_object(
      'lead_id', p_id,
      'estado', 'sin_verificar',
      'comprobados', 0,
      'nota', 'lote sin resultados: no se concluye nada y se reintentará');
  end if;

  v_estado := case when cardinality(v_con_wa) > 0 then 'confirmado' else 'no_aparece' end;

  -- ¿Vamos a rellenar un `whatsapp` que estaba vacío? Sólo entonces se toca
  -- `whatsapp_source`: un WhatsApp publicado por la empresa en su web o
  -- puesto a mano manda sobre lo que diga la comprobación.
  v_relleno := (l.whatsapp is null or btrim(l.whatsapp) = '')
               and cardinality(v_con_wa) > 0;

  update leads x set
    whatsapp = coalesce(nullif(btrim(coalesce(x.whatsapp, '')), ''), v_con_wa[1]),
    -- Unión con lo que ya hubiera: dos pasadas parciales suman, no se pisan.
    whatsapp_numeros = (
      select array_agg(distinct n)
        from unnest(coalesce(x.whatsapp_numeros, '{}'::text[]) || v_con_wa) n
    ),
    whatsapp_source        = case when v_relleno then p_fuente else x.whatsapp_source end,
    whatsapp_estado        = v_estado,
    whatsapp_verificado_en = now(),
    updated_at             = now()
  where x.id = p_id;

  return jsonb_build_object(
    'lead_id',          p_id,
    'estado',           v_estado,
    'comprobados',      v_comprobados,
    'con_whatsapp',     to_jsonb(v_con_wa),
    'relleno_whatsapp', v_relleno);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function registrar_whatsapp(uuid, jsonb, text) from public, anon;
grant execute on function registrar_whatsapp(uuid, jsonb, text) to authenticated, service_role;

comment on function registrar_whatsapp(uuid, jsonb, text) is
  'Guarda el resultado de comprobar los teléfonos de un lead en WhatsApp. '
  'Sólo rellena huecos. Un lote vacío deja «sin_verificar» y NO sella fecha.';

-- --- 5. `enriquecer_lead` aprende `whatsapp_numeros` ----------
-- El extractor de la Fase 2 pasa a devolver TODOS los enlaces de WhatsApp
-- que publica la web, no sólo el primero. Sin esta recreación la clave
-- llegaría a la función y se descartaría sin ruido — exactamente el fallo
-- que ya documentó la auditoría (un dato que existe y nadie recoge).
-- El resto del cuerpo es idéntico al de la 0026.
create or replace function enriquecer_lead(
  p_id     uuid,
  p_datos  jsonb default '{}'::jsonb,
  p_fuente text default 'web_scrape'
) returns jsonb as $$
declare
  l           leads%rowtype;
  v_emails    text[];
  v_telefonos text[];
  v_wa        text;
  v_wa_src    text;
  v_ig text; v_fb text; v_li text; v_yt text; v_tt text; v_tw text; v_pi text;
  v_relleno   text[] := '{}';
begin
  select * into l from leads where id = p_id and deleted_at is null;
  if not found then
    raise exception 'enriquecer_lead: lead % no existe o está en la papelera', p_id;
  end if;

  v_emails    := apify_lista(p_datos, 'emails', 'email');
  v_telefonos := apify_lista(p_datos, 'telefonos', 'phones', 'telefono', 'phone');
  v_ig := (apify_lista(p_datos, 'instagrams', 'instagram'))[1];
  v_fb := (apify_lista(p_datos, 'facebooks',  'facebook'))[1];
  v_li := (apify_lista(p_datos, 'linkedIns',  'linkedin', 'linkedIn'))[1];
  v_yt := (apify_lista(p_datos, 'youtubes',   'youtube'))[1];
  v_tt := (apify_lista(p_datos, 'tiktoks',    'tiktok'))[1];
  v_tw := (apify_lista(p_datos, 'twitters',   'twitter', 'x'))[1];
  v_pi := (apify_lista(p_datos, 'pinterests', 'pinterest'))[1];

  -- WhatsApp: sólo el que la empresa publica. Si no viene fuente explícita se
  -- asume el enlace en la web, que es el único método que usamos.
  v_wa     := apify_txt(p_datos, 'whatsapp', 'whatsappNumber');
  v_wa_src := coalesce(apify_txt(p_datos, 'whatsapp_source'), 'wa_link_web');

  -- Registro de qué se rellenó (sólo cuenta si el campo estaba vacío).
  if l.email is null and l.email_contacto is null and v_emails[1] is not null then v_relleno := v_relleno || 'email'; end if;
  if l.telefono is null and v_telefonos[1] is not null then v_relleno := v_relleno || 'telefono'; end if;
  if l.whatsapp  is null and v_wa is not null then v_relleno := v_relleno || 'whatsapp'; end if;
  if l.instagram is null and v_ig is not null then v_relleno := v_relleno || 'instagram'; end if;
  if l.facebook  is null and v_fb is not null then v_relleno := v_relleno || 'facebook';  end if;
  if l.linkedin  is null and v_li is not null then v_relleno := v_relleno || 'linkedin';  end if;
  if l.youtube   is null and v_yt is not null then v_relleno := v_relleno || 'youtube';   end if;
  if l.tiktok    is null and v_tt is not null then v_relleno := v_relleno || 'tiktok';    end if;
  if l.twitter   is null and v_tw is not null then v_relleno := v_relleno || 'twitter';   end if;
  if l.pinterest is null and v_pi is not null then v_relleno := v_relleno || 'pinterest'; end if;

  update leads x set
    email     = coalesce(x.email, v_emails[1]),
    emails    = (select array_agg(distinct e) from unnest(coalesce(x.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) e),
    telefono  = coalesce(x.telefono, v_telefonos[1]),
    telefonos = (select array_agg(distinct t) from unnest(coalesce(x.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) t),
    whatsapp  = coalesce(x.whatsapp,  v_wa),
    -- Una web puede publicar varios WhatsApp (ventas, soporte). Se unen con
    -- los que ya hubiera: los del verificador y los publicados se suman.
    whatsapp_numeros = (
      select array_agg(distinct n)
        from unnest(coalesce(x.whatsapp_numeros, '{}'::text[])
                    || apify_lista(p_datos, 'whatsapp_numeros')) n
    ),
    instagram = coalesce(x.instagram, v_ig),
    facebook  = coalesce(x.facebook,  v_fb),
    linkedin  = coalesce(x.linkedin,  v_li),
    youtube   = coalesce(x.youtube,   v_yt),
    tiktok    = coalesce(x.tiktok,    v_tt),
    twitter   = coalesce(x.twitter,   v_tw),
    pinterest = coalesce(x.pinterest, v_pi),
    redes_extra     = coalesce(x.redes_extra, p_datos -> 'redes_extra'),
    email_source    = case when 'email'    = any(v_relleno) then p_fuente else x.email_source end,
    phone_source    = case when 'telefono' = any(v_relleno) then p_fuente else x.phone_source end,
    whatsapp_source = case when 'whatsapp' = any(v_relleno) then v_wa_src else x.whatsapp_source end,
    social_source   = case when v_relleno && array['instagram','facebook','linkedin','youtube','tiktok','twitter','pinterest']
                           then p_fuente else x.social_source end,
    last_enriched_at  = now(),
    -- `sin_datos` distingue «se buscó y no había» de «no se ha intentado».
    enrichment_status = coalesce(apify_txt(p_datos, 'status'),
                                 case when cardinality(v_relleno) > 0 then 'ok' else 'sin_datos' end),
    updated_at = now()
  where x.id = p_id;

  return jsonb_build_object('lead_id', p_id, 'relleno', to_jsonb(v_relleno), 'fuente', p_fuente);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function enriquecer_lead(uuid, jsonb, text) from public, anon;
grant execute on function enriquecer_lead(uuid, jsonb, text) to authenticated, service_role;

commit;

-- =============================================================
-- VERIFICACIÓN (ejecutar a mano tras aplicar; no forma parte de la migración)
--
--   -- 1. Un lead con dos teléfonos, uno con WhatsApp.
--   select registrar_whatsapp(
--     '<uuid>',
--     '[{"numero":"+18095550000","tiene":true},
--       {"numero":"+18095551111","tiene":false}]'::jsonb);
--   -- estado='confirmado', whatsapp_numeros={+18095550000}, whatsapp relleno.
--
--   -- 2. Ninguno aparece.
--   select registrar_whatsapp('<uuid>', '[{"numero":"+18095551111","tiene":false}]'::jsonb);
--   -- estado='no_aparece', whatsapp intacto, whatsapp_verificado_en sellado.
--
--   -- 3. EL CASO IMPORTANTE: lote vacío (la lectura falló).
--   select registrar_whatsapp('<uuid>', '[]'::jsonb);
--   -- estado='sin_verificar', whatsapp_verificado_en SIN tocar,
--   -- y el lead vuelve a salir en leads_para_verificar_wa().
--
--   -- 4. Un WhatsApp puesto a mano NO se pisa.
--   update leads set whatsapp='+18099999999', whatsapp_source='manual' where id='<uuid>';
--   select registrar_whatsapp('<uuid>', '[{"numero":"+18095550000","tiene":true}]'::jsonb);
--   -- whatsapp sigue siendo +18099999999 y whatsapp_source sigue 'manual';
--   -- +18095550000 se suma a whatsapp_numeros.
--
--   -- 5. La cola incluye el histórico.
--   select count(*) from leads_para_verificar_wa(500);
-- =============================================================
