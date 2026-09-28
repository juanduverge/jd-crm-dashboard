-- =============================================================
-- 0047_enriquecer_lead_guardaba_nada.sql — el enriquecimiento fallaba
-- justo cuando encontraba algo.
--
-- QUE PASABA. `enriquecer_lead` apunta en `v_relleno text[]` que campos
-- rellena con `v_relleno := v_relleno || 'email'`. Postgres no sabe si
-- 'email' es un texto o un array, elige array, y revienta con
-- «malformed array literal: "email"». La transaccion se deshace entera:
-- no se guarda el dato ni se sella `last_enriched_at`, asi que n8n vuelve a
-- pedir el mismo lead en la pasada siguiente.
--
-- Solo sobrevivian las llamadas sin nada nuevo (`sin_datos`, `error`). Medido
-- el 28-sep-2026: 1191 llamadas fallidas en 24 h y ni un lead con
-- `enrichment_status = 'ok'` en toda la base. El fallo venia de la 0026 y la
-- 0035 lo copio.
--
-- QUE CAMBIA. Solo esas diez lineas pasan a `array_append`, que no tiene
-- ambiguedad. El resto es la funcion de la 0035 tal cual (comprobado contra
-- produccion antes de escribir esto).
-- =============================================================

begin;

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
  if l.email is null and l.email_contacto is null and v_emails[1] is not null then v_relleno := array_append(v_relleno, 'email'); end if;
  if l.telefono is null and v_telefonos[1] is not null then v_relleno := array_append(v_relleno, 'telefono'); end if;
  if l.whatsapp  is null and v_wa is not null then v_relleno := array_append(v_relleno, 'whatsapp'); end if;
  if l.instagram is null and v_ig is not null then v_relleno := array_append(v_relleno, 'instagram'); end if;
  if l.facebook  is null and v_fb is not null then v_relleno := array_append(v_relleno, 'facebook');  end if;
  if l.linkedin  is null and v_li is not null then v_relleno := array_append(v_relleno, 'linkedin');  end if;
  if l.youtube   is null and v_yt is not null then v_relleno := array_append(v_relleno, 'youtube');   end if;
  if l.tiktok    is null and v_tt is not null then v_relleno := array_append(v_relleno, 'tiktok');    end if;
  if l.twitter   is null and v_tw is not null then v_relleno := array_append(v_relleno, 'twitter');   end if;
  if l.pinterest is null and v_pi is not null then v_relleno := array_append(v_relleno, 'pinterest'); end if;

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

commit;
