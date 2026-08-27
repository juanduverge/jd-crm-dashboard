-- =============================================================
-- 0034_importador_normaliza_nicho.sql
--
-- La 0033 dejo el catalogo y `normalizar_nicho()`. Aqui se enchufan:
--   1. El importador normaliza el nicho al entrar, usando como pista lo que
--      escribiste en la busqueda (que ya viajaba en `p_consulta` y se tiraba).
--   2. Los leads que ya estan dentro se rellenan con lo que se sabe de ellos,
--      incluida la consulta con la que se capturaron (esta en `lead_imports`).
--
-- La funcion se reescribe entera, que es como se ha venido haciendo desde la
-- 0025: es la 0031 intacta salvo las cuatro lineas del nicho.
-- =============================================================

-- --- 1. El importador -----------------------------------------
create or replace function importar_leads(
  p_lote     jsonb,
  p_fuente   text default 'google_maps',
  p_consulta text default null
) returns jsonb as $$
declare
  it            jsonb;
  v_recibidos   int := 0;
  v_insertados  int := 0;
  v_actualizados int := 0;
  v_descartados int := 0;
  v_detalle     jsonb := '[]'::jsonb;
  v_import_id   uuid;
  v_empresa     text;
  v_place       text;
  v_maps        text;
  v_perfil      text;
  v_huella      text;
  v_visto       captacion_vistos%rowtype;
  v_emails      text[];
  v_telefonos   text[];
  v_ig          text;
  v_fb          text;
  v_li          text;
  v_yt          text;
  v_tt          text;
  v_tw          text;
  v_pi          text;
  v_tiene_redes boolean;
  v_id          uuid;
  v_borrado     boolean;
  v_nueva       boolean;
  v_pista       text;
begin
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' then
    raise exception 'importar_leads espera un array JSON (recibido: %)',
      coalesce(jsonb_typeof(p_lote), 'null');
  end if;

  -- Lo que escribiste en el modal de busqueda. n8n arma `p_consulta` como
  -- "dentistas / Miami" (nodo "Preparar Busqueda"), asi que el nicho es lo que
  -- va antes de la barra. Es la mejor pista que hay: tu sabes que buscabas,
  -- Google solo sabe como clasifica el negocio que encontro.
  v_pista := nullif(trim(split_part(coalesce(p_consulta, ''), '/', 1)), '');

  for it in select * from jsonb_array_elements(p_lote) loop
    v_recibidos := v_recibidos + 1;

    v_empresa := apify_txt(it, 'title', 'name', 'empresa', 'businessName',
                               'fullName', 'companyName', 'username');
    if v_empresa is null then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object(
        'resultado', 'descartado',
        'motivo', 'sin nombre de empresa',
        'item', it);
      continue;
    end if;

    v_place  := apify_txt(it, 'placeId', 'place_id', 'placeID');
    -- 0031: fuera `searchPageUrl`. Es la página de resultados, la misma para
    -- todo el lote: usarla como clave fusionaba 20 negocios en uno.
    v_maps   := apify_txt(it, 'googleMaps', 'google_maps', 'placeUrl');
    v_perfil := apify_txt(it, 'profileUrl', 'perfil_url', 'pageUrl', 'profile_url');

    if coalesce(p_fuente, 'google_maps') = 'google_maps' then
      -- `url` PRIMERO, como en la 0027: es la ficha del negocio concreto.
      v_maps := coalesce(apify_txt(it, 'url'), v_maps);
    else
      v_perfil := coalesce(v_perfil, apify_txt(it, 'url'));
    end if;

    v_huella := huella_captacion(it, p_fuente);

    v_emails    := apify_lista(it, 'emails', 'email', 'emailContacto', 'businessEmail');
    v_telefonos := apify_lista(it, 'phones', 'phone', 'telefono', 'phoneUnformatted', 'businessPhoneNumber');

    v_ig := (apify_lista(it, 'instagrams', 'instagram', 'instagramUrl'))[1];
    v_fb := (apify_lista(it, 'facebooks', 'facebook', 'facebookUrl'))[1];
    v_li := (apify_lista(it, 'linkedIns', 'linkedIn', 'linkedin', 'linkedinUrl'))[1];
    v_yt := (apify_lista(it, 'youtubes', 'youtube', 'youtubeUrl'))[1];
    v_tt := (apify_lista(it, 'tiktoks', 'tiktok', 'tiktokUrl'))[1];
    v_tw := (apify_lista(it, 'twitters', 'twitter', 'twitterUrl', 'x'))[1];
    v_pi := (apify_lista(it, 'pinterests', 'pinterest'))[1];
    v_tiene_redes := coalesce(v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi) is not null;

    select l.id, (l.deleted_at is not null)
      into v_id, v_borrado
      from leads l
     where ( (v_place  is not null and l.place_id = v_place)
          or (v_perfil is not null and lower(trim(l.perfil_url)) = lower(trim(v_perfil)))
          or (v_maps   is not null and lower(trim(l.google_maps)) = lower(trim(v_maps)))
          or (v_place is null and v_perfil is null and v_maps is null
              and lower(l.empresa) = lower(v_empresa)
              and coalesce(lower(l.ciudad), '') = coalesce(lower(apify_txt(it, 'city', 'ciudad')), '')) )
     order by l.deleted_at nulls first, l.created_at asc
     limit 1;

    if v_id is not null and v_borrado then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object(
        'resultado', 'descartado',
        'motivo', 'borrado previamente',
        'lead_id', v_id,
        'empresa', v_empresa);
      perform anotar_visto(v_huella, v_empresa, p_fuente, p_consulta, null);
      continue;
    end if;

    if v_id is null and v_huella is not null then
      select * into v_visto from captacion_vistos where huella = v_huella;
      if found and v_visto.omitir then
        v_descartados := v_descartados + 1;
        v_detalle := v_detalle || jsonb_build_object(
          'resultado', 'descartado',
          'motivo', 'ya lo capturaste el ' || to_char(v_visto.primera_vez, 'DD/MM/YYYY') ||
                    coalesce(' (búsqueda: ' || v_visto.consulta || ')', ''),
          'empresa', v_empresa);
        perform anotar_visto(v_huella, v_empresa, p_fuente, p_consulta, null);
        continue;
      end if;
    end if;

    v_nueva := v_id is null;

    if v_nueva then
      insert into leads (
        empresa, place_id, google_maps, perfil_url, nicho, categoria, ciudad, pais, codigo_pais,
        direccion, telefono, telefono_2, telefonos, email, emails, web,
        instagram, facebook, linkedin, youtube, tiktok, twitter, pinterest,
        rating_google, num_resenas, latitud, longitud, horario, seguidores, bio, fuente,
        email_source, phone_source, social_source
      ) values (
        v_empresa, v_place, v_maps, v_perfil,
        -- `nicho` es un ID de catalogo, no texto libre: normalizar aqui es lo
        -- que hace que la columna Nicho deje de salir "-" en el CRM.
        normalizar_nicho(apify_txt(it, 'nicho', 'categoryName', 'category', 'industry'), v_pista),
        -- `categoria` guarda el texto crudo de Apify, intacto. Normalizar no
        -- puede costar el original: es la prueba de que la traduccion fue
        -- correcta, y de donde salen los alias que falten.
        apify_txt(it, 'categoryName', 'category', 'industry'),
        apify_txt(it, 'city', 'ciudad', 'locality'),
        apify_txt(it, 'country', 'pais', 'countryCode'),
        apify_txt(it, 'countryCode'),
        apify_txt(it, 'address', 'direccion', 'street', 'location'),
        coalesce(apify_txt(it, 'phone', 'telefono', 'businessPhoneNumber'), v_telefonos[1]),
        apify_txt(it, 'phoneUnformatted'),
        v_telefonos,
        v_emails[1],
        v_emails,
        apify_txt(it, 'website', 'web', 'url_website', 'externalUrl', 'websiteUrl'),
        v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi,
        apify_num(it, 'totalScore', 'rating', 'ratingGoogle'),
        coalesce(apify_num(it, 'reviewsCount', 'numResenas', 'userRatingCount'), 0)::int,
        apify_num(it, 'lat', 'latitude'),
        apify_num(it, 'lng', 'longitude'),
        it -> 'openingHours',
        apify_num(it, 'followersCount', 'followers', 'seguidores')::int,
        apify_txt(it, 'biography', 'bio', 'description', 'descripcion'),
        coalesce(p_fuente, 'google_maps'),
        case when v_emails[1] is not null then 'apify_contacts' end,
        case when v_telefonos[1] is not null then 'apify_places' end,
        case when v_tiene_redes then 'apify_contacts' end
      )
      returning id into v_id;
      v_insertados := v_insertados + 1;
    else
      update leads l set
        place_id      = coalesce(l.place_id, v_place),
        google_maps   = coalesce(l.google_maps, v_maps),
        perfil_url    = coalesce(l.perfil_url, v_perfil),
        categoria     = coalesce(l.categoria, apify_txt(it, 'categoryName', 'category', 'industry')),
        -- Un `coalesce(l.nicho, ...)` a secas no serviria: los leads viejos SI
        -- tienen nicho, lo que pasa es que es basura ("Roofing contractor").
        -- Por eso se reescribe tambien cuando lo que hay no esta en el catalogo.
        nicho         = case
                          when l.nicho is null
                            or not exists (select 1 from nichos n where n.id = l.nicho)
                          then normalizar_nicho(
                                 coalesce(apify_txt(it, 'nicho', 'categoryName', 'category', 'industry'),
                                          l.categoria, l.nicho),
                                 v_pista)
                          else l.nicho
                        end,
        ciudad        = coalesce(l.ciudad, apify_txt(it, 'city', 'ciudad', 'locality')),
        pais          = coalesce(l.pais, apify_txt(it, 'country', 'pais', 'countryCode')),
        codigo_pais   = coalesce(l.codigo_pais, apify_txt(it, 'countryCode')),
        direccion     = coalesce(l.direccion, apify_txt(it, 'address', 'direccion', 'street', 'location')),
        telefono      = coalesce(l.telefono, apify_txt(it, 'phone', 'telefono', 'businessPhoneNumber'), v_telefonos[1]),
        telefono_2    = coalesce(l.telefono_2, apify_txt(it, 'phoneUnformatted')),
        telefonos     = (select array_agg(distinct x) from unnest(coalesce(l.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) x),
        email         = coalesce(l.email, v_emails[1]),
        emails        = (select array_agg(distinct x) from unnest(coalesce(l.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) x),
        web           = coalesce(l.web, apify_txt(it, 'website', 'web', 'externalUrl', 'websiteUrl')),
        instagram     = coalesce(l.instagram, v_ig),
        facebook      = coalesce(l.facebook, v_fb),
        linkedin      = coalesce(l.linkedin, v_li),
        youtube       = coalesce(l.youtube,   v_yt),
        tiktok        = coalesce(l.tiktok,    v_tt),
        twitter       = coalesce(l.twitter,   v_tw),
        pinterest     = coalesce(l.pinterest, v_pi),
        bio           = coalesce(l.bio, apify_txt(it, 'biography', 'bio', 'description', 'descripcion')),
        rating_google = coalesce(apify_num(it, 'totalScore', 'rating'), l.rating_google),
        num_resenas   = coalesce(apify_num(it, 'reviewsCount', 'userRatingCount')::int, l.num_resenas),
        seguidores    = coalesce(apify_num(it, 'followersCount', 'followers')::int, l.seguidores),
        latitud       = coalesce(l.latitud, apify_num(it, 'lat', 'latitude')),
        longitud      = coalesce(l.longitud, apify_num(it, 'lng', 'longitude')),
        horario       = coalesce(l.horario, it -> 'openingHours'),
        email_source  = case when l.email is null and l.email_contacto is null and v_emails[1] is not null
                             then 'apify_contacts' else l.email_source end,
        phone_source  = case when l.telefono is null and v_telefonos[1] is not null
                             then 'apify_places' else l.phone_source end,
        social_source = case when coalesce(l.instagram, l.facebook, l.linkedin) is null and v_tiene_redes
                             then 'apify_contacts' else l.social_source end,
        updated_at    = now()
      where l.id = v_id;
      v_actualizados := v_actualizados + 1;

      v_detalle := v_detalle || jsonb_build_object(
        'resultado', 'actualizado',
        'motivo', 'ya estaba en tu lista',
        'lead_id', v_id,
        'empresa', v_empresa);
    end if;

    perform anotar_visto(v_huella, v_empresa, p_fuente, p_consulta, v_id);
  end loop;

  insert into lead_imports (fuente, consulta, recibidos, insertados, actualizados, descartados, detalle, payload)
  values (p_fuente, p_consulta, v_recibidos, v_insertados, v_actualizados, v_descartados, v_detalle, p_lote)
  returning id into v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'recibidos', v_recibidos,
    'insertados', v_insertados,
    'actualizados', v_actualizados,
    'descartados', v_descartados,
    'detalle', v_detalle
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function importar_leads(jsonb, text, text) from public, anon;
grant execute on function importar_leads(jsonb, text, text) to authenticated, service_role;

-- --- 2. Los leads que ya estan dentro -------------------------
-- Nada de esto inventa: se usa lo que el propio lead ya tiene guardado.
--
-- `categoria` es el texto crudo de Apify y es la mejor fuente. Cuando falta,
-- se usa el `nicho` actual, que aunque no sirva como id sigue siendo el texto
-- que Google devolvio. Y como pista, la consulta del lote que lo trajo.
--
-- Solo se tocan los que estan rotos: si `nicho` ya es un id del catalogo, el
-- lead se queda como esta. Un backfill que reescribe lo que ya funcionaba es
-- un backfill que pierde el trabajo hecho a mano.

-- La consulta con la que entro cada lead. `lead_imports.detalle` guarda el
-- `lead_id` de cada item del lote (desde la 0030), asi que se puede recuperar
-- sin volver a tocar Apify.
create temporary table _pista_lead on commit drop as
select distinct on (d.lead_id)
       (d.lead_id)::uuid as lead_id,
       nullif(trim(split_part(coalesce(li.consulta, ''), '/', 1)), '') as pista
  from lead_imports li
 cross join lateral jsonb_array_elements(coalesce(li.detalle, '[]'::jsonb)) x
 cross join lateral (select x ->> 'lead_id' as lead_id) d
 where d.lead_id is not null
 order by d.lead_id, li.created_at desc;

update leads l
   set nicho = normalizar_nicho(coalesce(l.categoria, l.nicho), p.pista),
       updated_at = l.updated_at   -- no cuenta como actividad del lead
  from (select l2.id, pl.pista
          from leads l2
          left join _pista_lead pl on pl.lead_id = l2.id) p
 where p.id = l.id
   and (l.nicho is null or not exists (select 1 from nichos n where n.id = l.nicho))
   and coalesce(l.categoria, l.nicho) is not null;

-- Los que se quedaron sin nada que normalizar (ni categoria ni nicho) van a
-- "Otros" explicitamente: es mejor un cajon de sastre honesto que un null que
-- la interfaz pinta igual que un error.
update leads
   set nicho = 'otros'
 where nicho is null or not exists (select 1 from nichos n where n.id = leads.nicho);
