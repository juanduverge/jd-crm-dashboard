-- 0027: importar_leads deja de reventar cuando reencuentra un lead borrado.
--
-- SINTOMA: cualquier busqueda repetida terminaba en
--   409 duplicate key value violates unique constraint "leads_google_maps_unique"
-- y el lote ENTERO se perdia (la funcion es atomica), aunque trajera leads
-- nuevos mezclados con los ya conocidos.
--
-- CAUSA: la busqueda de duplicado de 0026 filtraba por `l.deleted_at is null`,
-- pero el indice unico sobre google_maps no distingue borrados. Un lead
-- borrado en blando era invisible para la busqueda -> la funcion lo daba por
-- nuevo -> INSERT -> colision con el indice. Hoy hay 114 leads borrados de
-- 151, asi que el choque era casi seguro.
--
-- DECISION: un lead que borraste se queda borrado. Si vuelve a salir en una
-- busqueda NO se resucita ni se actualiza: se cuenta como descartado con
-- motivo 'borrado previamente'. Borrar es una decision del usuario y una
-- reimportacion no deberia deshacerla en silencio.
-- Si prefieres lo contrario (que reaparezca al reencontrarlo), el cambio esta
-- marcado abajo con RESUCITAR.

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
begin
  if p_lote is null or jsonb_typeof(p_lote) <> 'array' then
    raise exception 'importar_leads espera un array JSON (recibido: %)',
      coalesce(jsonb_typeof(p_lote), 'null');
  end if;

  for it in select * from jsonb_array_elements(p_lote) loop
    v_recibidos := v_recibidos + 1;

    v_empresa := apify_txt(it, 'title', 'name', 'empresa', 'businessName');
    if v_empresa is null then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object('motivo', 'sin nombre de empresa', 'item', it);
      continue;
    end if;

    v_place := apify_txt(it, 'placeId', 'place_id', 'placeID');
    v_maps  := apify_txt(it, 'url', 'googleMaps', 'google_maps', 'placeUrl', 'searchPageUrl');

    -- Con `scrapeContacts` estos llegan en plural; sin él, sólo el escalar.
    v_emails    := apify_lista(it, 'emails', 'email', 'emailContacto');
    v_telefonos := apify_lista(it, 'phones', 'phone', 'telefono', 'phoneUnformatted');

    v_ig := (apify_lista(it, 'instagrams', 'instagram', 'instagramUrl'))[1];
    v_fb := (apify_lista(it, 'facebooks', 'facebook', 'facebookUrl'))[1];
    v_li := (apify_lista(it, 'linkedIns', 'linkedIn', 'linkedin', 'linkedinUrl'))[1];
    v_yt := (apify_lista(it, 'youtubes', 'youtube', 'youtubeUrl'))[1];
    v_tt := (apify_lista(it, 'tiktoks', 'tiktok', 'tiktokUrl'))[1];
    v_tw := (apify_lista(it, 'twitters', 'twitter', 'twitterUrl', 'x'))[1];
    v_pi := (apify_lista(it, 'pinterests', 'pinterest'))[1];
    v_tiene_redes := coalesce(v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi) is not null;

    -- CAMBIO 0027: la busqueda ya NO filtra por deleted_at. Tiene que ver los
    -- borrados, porque el indice unico tambien los ve. Si hay un activo y un
    -- borrado con el mismo place_id, gana el activo (nulls first).
    select l.id, (l.deleted_at is not null)
      into v_id, v_borrado
      from leads l
     where ( (v_place is not null and l.place_id = v_place)
          or (v_maps  is not null and lower(trim(l.google_maps)) = lower(trim(v_maps)))
          or (v_place is null and v_maps is null
              and lower(l.empresa) = lower(v_empresa)
              and coalesce(lower(l.ciudad), '') = coalesce(lower(apify_txt(it, 'city', 'ciudad')), '')) )
     order by l.deleted_at nulls first, l.created_at asc
     limit 1;

    -- RESUCITAR: para que un lead borrado vuelva al reencontrarlo, sustituye
    -- este bloque por:  update leads set deleted_at = null where id = v_id;
    -- y deja que siga al UPDATE de abajo.
    if v_id is not null and v_borrado then
      v_descartados := v_descartados + 1;
      v_detalle := v_detalle || jsonb_build_object(
        'motivo', 'borrado previamente',
        'lead_id', v_id,
        'empresa', v_empresa);
      continue;
    end if;

    v_nueva := v_id is null;

    if v_nueva then
      insert into leads (
        empresa, place_id, google_maps, nicho, categoria, ciudad, pais, codigo_pais,
        direccion, telefono, telefono_2, telefonos, email, emails, web,
        instagram, facebook, linkedin, youtube, tiktok, twitter, pinterest,
        rating_google, num_resenas, latitud, longitud, horario, fuente,
        email_source, phone_source, social_source
      ) values (
        v_empresa, v_place, v_maps,
        apify_txt(it, 'nicho', 'categoryName', 'category'),
        apify_txt(it, 'categoryName', 'category'),
        apify_txt(it, 'city', 'ciudad'),
        apify_txt(it, 'country', 'pais', 'countryCode'),
        apify_txt(it, 'countryCode'),
        apify_txt(it, 'address', 'direccion', 'street'),
        coalesce(apify_txt(it, 'phone', 'telefono'), v_telefonos[1]),
        apify_txt(it, 'phoneUnformatted'),
        v_telefonos,
        v_emails[1],
        v_emails,
        apify_txt(it, 'website', 'web', 'url_website'),
        v_ig, v_fb, v_li, v_yt, v_tt, v_tw, v_pi,
        apify_num(it, 'totalScore', 'rating', 'ratingGoogle'),
        coalesce(apify_num(it, 'reviewsCount', 'numResenas', 'userRatingCount'), 0)::int,
        apify_num(it, 'lat', 'latitude'),
        apify_num(it, 'lng', 'longitude'),
        it -> 'openingHours',
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
        categoria     = coalesce(l.categoria, apify_txt(it, 'categoryName', 'category')),
        ciudad        = coalesce(l.ciudad, apify_txt(it, 'city', 'ciudad')),
        pais          = coalesce(l.pais, apify_txt(it, 'country', 'pais', 'countryCode')),
        codigo_pais   = coalesce(l.codigo_pais, apify_txt(it, 'countryCode')),
        direccion     = coalesce(l.direccion, apify_txt(it, 'address', 'direccion', 'street')),
        telefono      = coalesce(l.telefono, apify_txt(it, 'phone', 'telefono'), v_telefonos[1]),
        telefono_2    = coalesce(l.telefono_2, apify_txt(it, 'phoneUnformatted')),
        telefonos     = (select array_agg(distinct x) from unnest(coalesce(l.telefonos,'{}'::text[]) || coalesce(v_telefonos,'{}'::text[])) x),
        email         = coalesce(l.email, v_emails[1]),
        emails        = (select array_agg(distinct x) from unnest(coalesce(l.emails,'{}'::text[]) || coalesce(v_emails,'{}'::text[])) x),
        web           = coalesce(l.web, apify_txt(it, 'website', 'web')),
        instagram     = coalesce(l.instagram, v_ig),
        facebook      = coalesce(l.facebook, v_fb),
        linkedin      = coalesce(l.linkedin, v_li),
        youtube       = coalesce(l.youtube,   v_yt),
        tiktok        = coalesce(l.tiktok,    v_tt),
        twitter       = coalesce(l.twitter,   v_tw),
        pinterest     = coalesce(l.pinterest, v_pi),
        rating_google = coalesce(apify_num(it, 'totalScore', 'rating'), l.rating_google),
        num_resenas   = coalesce(apify_num(it, 'reviewsCount', 'userRatingCount')::int, l.num_resenas),
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
    end if;
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
