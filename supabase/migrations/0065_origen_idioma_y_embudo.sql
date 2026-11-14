-- =============================================================
-- 0065 — Origen del cliente, idioma del lead, llamada por WhatsApp
--        y el embudo por canal / origen / contrato
--
-- QUÉ AÑADE
--
-- 1. `follow_up_tipo` gana 'llamada_whatsapp'. Hasta ahora una llamada por
--    WhatsApp se apuntaba como «llamada» o como «whatsapp» y no había forma
--    de saber cuál de las dos convierte.
-- 2. `leads.canal_principal` acepta 'llamada' y 'llamada_whatsapp'. El canal
--    del Pipeline y el medio del seguimiento son la misma elección vista
--    desde dos sitios (ver OpportunityForm); sin esto el Pipeline no podía
--    decir «a este se le llama».
-- 3. `leads.origen` + `leads.referido_por`: por dónde llegó el cliente.
--    `fuente` NO sirve para esto: dice cómo se importó la fila (google_maps),
--    no si el cliente vino recomendado o escribió él.
-- 4. `leads.idioma`: en qué idioma habla probablemente el lead. Lo pone Juan
--    a mano; nada lo deduce.
-- 5. `metricas_embudo(desde, hasta)`: el embudo completo por canal, por
--    origen, y las cifras de contratos. Una sola definición en SQL, como el
--    resto del motor de métricas (0028/0038).
--
-- CÓMO APLICARLA: SQL Editor de Supabase, entera. El editor lo corre todo en
-- UNA transacción, así que nada de este script puede usar 'llamada_whatsapp'
-- en algo que se valide al crearse (ver tipo_desde_canal).
-- =============================================================

alter type follow_up_tipo add value if not exists 'llamada_whatsapp';

begin;

-- -------------------------------------------------------------
-- 1. Canal del Pipeline: también llamada y llamada por WhatsApp
-- -------------------------------------------------------------
alter table leads drop constraint if exists leads_canal_principal_check;
alter table leads add constraint leads_canal_principal_check
  check (canal_principal in ('email','whatsapp','instagram','linkedin','llamada','llamada_whatsapp'));

-- Una sola traducción canal -> medio del toque. Antes estaba copiada en cada
-- trigger, y cada copia mandaba instagram/linkedin a 'llamada'.
--
-- plpgsql y no sql A PROPÓSITO: el SQL Editor de Supabase ejecuta el script
-- entero en una sola transacción, así que 'llamada_whatsapp' aún no está
-- confirmado aquí. Una función `language sql` valida el literal al crearse y
-- falla (55P04); plpgsql solo lo evalúa al ejecutarse, cuando ya existe.
create or replace function tipo_desde_canal(p_canal text) returns follow_up_tipo as $fn$
begin
  return (case p_canal
            when 'email'            then 'email'
            when 'whatsapp'         then 'whatsapp'
            when 'llamada_whatsapp' then 'llamada_whatsapp'
            when 'instagram'        then 'instagram'
            when 'linkedin'         then 'linkedin'
            else 'llamada'
          end)::follow_up_tipo;
end;
$fn$ language plpgsql immutable set search_path = public, pg_temp;

-- Mismo cuerpo que la 0013; solo cambia la línea del tipo.
create or replace function programar_follow_up_desde_lead() returns trigger as $$
declare
  v_pendiente_id    uuid;
  v_pendiente_fecha date;
  v_orden           int;
begin
  if new.estado in ('ganado','perdido') or new.deleted_at is not null then
    return null;
  end if;

  select id, fecha_programada into v_pendiente_id, v_pendiente_fecha
    from follow_ups
   where lead_id = new.id and estado = 'pendiente' and deleted_at is null
   limit 1;

  if new.proximo_seguimiento is not distinct from v_pendiente_fecha then
    return null;
  end if;

  if new.proximo_seguimiento is null then
    update follow_ups set estado = 'cancelado' where id = v_pendiente_id;
    return null;
  end if;

  if v_pendiente_id is not null then
    update follow_ups
       set fecha_programada = new.proximo_seguimiento
     where id = v_pendiente_id;
    return null;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = new.id and deleted_at is null;

  insert into follow_ups (lead_id, fecha_programada, tipo, orden, responsable)
  values (new.id, new.proximo_seguimiento, tipo_desde_canal(new.canal_principal), v_orden, new.responsable);

  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Mismo cuerpo que la 0063; solo cambia la línea del tipo.
create or replace function registrar_toque_por_etapa() returns trigger as $fn$
declare
  v_tipo   follow_up_tipo;
  v_orden  int;
  v_ultimo uuid;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.deleted_at is not null then
    return null;
  end if;

  v_tipo := tipo_desde_canal(new.canal_principal);

  if new.estado in ('respondio', 'reunion', 'propuesta', 'negociacion', 'ganado') then
    if new.estado <> 'respondio' and exists (
      select 1 from follow_ups
       where lead_id = new.id and estado = 'completado' and deleted_at is null
         and resultado in ('positivo', 'negativo')
    ) then
      return null;
    end if;

    select id into v_ultimo
      from follow_ups
     where lead_id = new.id and estado = 'completado' and deleted_at is null
     order by completed_at desc
     limit 1;

    if v_ultimo is not null then
      update follow_ups
         set resultado     = case when resultado = 'sin_respuesta'
                                  then 'positivo'::follow_up_resultado
                                  else resultado end,
             respondido_en = coalesce(respondido_en, now())
       where id = v_ultimo;
      return null;
    end if;

    select coalesce(max(orden), 0) + 1 into v_orden
      from follow_ups where lead_id = new.id and deleted_at is null;

    insert into follow_ups (
      lead_id, fecha_programada, tipo, estado, resultado, orden,
      responsable, completed_at, respondido_en, nota
    ) values (
      new.id, dia_crm(now()), v_tipo, 'completado', 'positivo', v_orden,
      new.responsable, now(), now(),
      'Registrado al mover el lead a ' || new.estado::text || ' (sin toque previo: contestó él)'
    );

    return null;
  end if;

  if new.estado not in ('contactado', 'seguimiento') then
    return null;
  end if;

  if exists (
    select 1 from follow_ups
     where lead_id = new.id and estado = 'completado' and deleted_at is null
       and dia_crm(completed_at) = dia_crm(now())
  ) then
    return null;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = new.id and deleted_at is null;

  insert into follow_ups (
    lead_id, fecha_programada, tipo, estado, resultado, orden,
    responsable, completed_at, nota
  ) values (
    new.id, dia_crm(now()), v_tipo, 'completado', 'sin_respuesta', v_orden,
    new.responsable, now(),
    'Registrado al mover el lead a ' || new.estado::text
  );

  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 2. Origen, referido e idioma
-- -------------------------------------------------------------
alter table leads add column if not exists origen       text;
alter table leads add column if not exists referido_por text;
alter table leads add column if not exists idioma       text;

alter table leads drop constraint if exists leads_origen_check;
alter table leads add constraint leads_origen_check check (origen is null or origen in (
  'apify', 'recomendacion', 'instagram', 'facebook', 'google',
  'contacto_directo', 'formulario_web', 'evento', 'otro'
));

alter table leads drop constraint if exists leads_idioma_check;
alter table leads add constraint leads_idioma_check check (idioma is null or idioma in (
  'es', 'en', 'pt', 'fr', 'it', 'de', 'otro'
));

comment on column leads.origen is
  'Por dónde llegó el cliente (apify, recomendacion, instagram…). Distinto de `fuente`, que dice cómo se importó la fila.';
comment on column leads.idioma is
  'Idioma probable del lead. Lo marca una persona; nada lo deduce.';

-- Lo que entra por el importador de Apify trae place_id o fuente de scraping:
-- ese origen sí se sabe sin preguntar. Lo demás queda sin dato.
update leads set origen = 'apify'
 where origen is null
   and (place_id is not null
        or fuente in ('google_maps','apify','instagram_scraper','yelp','yellow_pages'));

update leads set origen = 'formulario_web'
 where origen is null and fuente in ('web', 'formulario', 'formulario_web');

create or replace function origen_por_defecto() returns trigger as $fn$
begin
  if new.origen is null and (new.place_id is not null or new.fuente in ('google_maps','apify')) then
    new.origen := 'apify';
  end if;
  return new;
end;
$fn$ language plpgsql set search_path = public, pg_temp;

drop trigger if exists trg_leads_origen_por_defecto on leads;
create trigger trg_leads_origen_por_defecto
  before insert on leads
  for each row execute function origen_por_defecto();

revoke execute on function origen_por_defecto() from anon, authenticated;

create index if not exists leads_origen_idx on leads (origen) where deleted_at is null;

-- -------------------------------------------------------------
-- 3. metricas_embudo: canal, origen y contratos
-- -------------------------------------------------------------
-- CANAL. Dos lecturas distintas, y las dos hacen falta:
--   · Actividad (fecha del toque en el periodo): toques enviados y cuántos
--     obtuvieron respuesta. Igual que `respuestas_whatsapp` de la 0038.
--   · Resultado: a cada lead se le atribuye el canal del PRIMER toque que
--     obtuvo respuesta. Ese canal es el que «abrió» la conversación, y a él
--     se le cuentan las reuniones, las ventas y el dinero de ese lead.
--     Se cuentan los leads cuya respuesta cayó en el periodo.
--
-- ORIGEN. Cohorte por fecha de alta: de los leads que entraron en el periodo
-- por cada origen, cuántos se contactaron, respondieron, llegaron a reunión
-- y se ganaron.
--
-- CONTRATOS. Los ganados en el periodo. El precio es el del proyecto (0064)
-- si existe y tiene precio; si no, el valor estimado del lead.
create or replace function metricas_embudo(p_desde date, p_hasta date)
returns jsonb as $fn$
with
toques as (
  select f.lead_id, f.tipo::text as canal, f.resultado, f.completed_at,
         row_number() over (partition by f.lead_id order by f.completed_at, f.id) as n
    from follow_ups f
    join leads l on l.id = f.lead_id and l.deleted_at is null
   where f.estado = 'completado' and f.deleted_at is null
),
primera_respuesta as (
  select distinct on (lead_id) lead_id, canal, completed_at
    from toques
   where resultado in ('positivo','negativo')
   order by lead_id, completed_at
),
avanzados as (
  select l.id,
         (l.estado in ('reunion','propuesta','negociacion','ganado')
          or exists (select 1 from pipeline_events e
                      where e.lead_id = l.id and e.etapa in ('reunion','propuesta','negociacion','ganado'))) as llego_reunion,
         l.estado = 'ganado' as ganado
    from leads l
   where l.deleted_at is null
),
precio as (
  select l.id,
         coalesce(nullif((select p.precio from proyectos p
                           where p.lead_id = l.id and p.deleted_at is null
                           order by p.created_at desc limit 1), 0),
                  l.valor_estimado, 0) as valor
    from leads l
   where l.deleted_at is null and l.estado = 'ganado'
),
actividad as (
  select canal,
         count(*)                                                as toques,
         count(distinct lead_id)                                 as leads,
         count(*) filter (where resultado in ('positivo','negativo')) as respuestas,
         count(*) filter (where resultado = 'positivo')          as positivas
    from toques
   where dia_crm(completed_at) between p_desde and p_hasta
   group by canal
),
resultado_canal as (
  select r.canal,
         count(*)                               as abrieron,
         count(*) filter (where a.llego_reunion) as reuniones,
         count(*) filter (where a.ganado)        as ganados,
         coalesce(sum(pr.valor) filter (where a.ganado), 0) as valor
    from primera_respuesta r
    join avanzados a on a.id = r.lead_id
    left join precio pr on pr.id = r.lead_id
   where dia_crm(r.completed_at) between p_desde and p_hasta
   group by r.canal
),
por_canal as (
  select coalesce(a.canal, r.canal) as canal,
         coalesce(a.toques, 0) as toques, coalesce(a.leads, 0) as leads,
         coalesce(a.respuestas, 0) as respuestas, coalesce(a.positivas, 0) as positivas,
         coalesce(r.abrieron, 0) as abrieron, coalesce(r.reuniones, 0) as reuniones,
         coalesce(r.ganados, 0) as ganados, coalesce(r.valor, 0) as valor
    from actividad a
    full join resultado_canal r on r.canal = a.canal
),
por_origen as (
  select coalesce(l.origen, 'sin_dato') as origen,
         count(*)                                         as leads,
         count(*) filter (where l.touch_actual > 0)       as contactados,
         count(*) filter (where l.respondio_en is not null) as respondieron,
         count(*) filter (where a.llego_reunion)          as reuniones,
         count(*) filter (where a.ganado)                 as ganados,
         coalesce(sum(pr.valor) filter (where a.ganado), 0) as valor
    from leads l
    join avanzados a on a.id = l.id
    left join precio pr on pr.id = l.id
   where l.deleted_at is null
     and dia_crm(l.created_at) between p_desde and p_hasta
   group by 1
),
ganados as (
  select l.id, pr.valor,
         extract(epoch from (l.cerrado_en - coalesce(l.primer_contacto_en, l.created_at))) / 86400 as dias
    from leads l
    join precio pr on pr.id = l.id
   where dia_crm(l.cerrado_en) between p_desde and p_hasta
),
pagos as (
  select coalesce(sum(g.monto) filter (where g.cobrado_en is not null), 0) as cobrado,
         coalesce(sum(g.monto) filter (where g.cobrado_en is null), 0)     as pendiente
    from proyecto_pagos g
    join proyectos p on p.id = g.proyecto_id and p.deleted_at is null
    join ganados x on x.id = p.lead_id
),
perdidos as (
  select coalesce(nullif(trim(motivo_cierre), ''), 'Sin motivo') as motivo, count(*) as n
    from leads
   where deleted_at is null and estado = 'perdido'
     and dia_crm(cerrado_en) between p_desde and p_hasta
   group by 1
)
select jsonb_build_object(
  'desde', p_desde,
  'hasta', p_hasta,
  'por_canal',  coalesce((select jsonb_agg(to_jsonb(c) order by c.toques desc, c.abrieron desc) from por_canal c), '[]'::jsonb),
  'por_origen', coalesce((select jsonb_agg(to_jsonb(o) order by o.leads desc) from por_origen o), '[]'::jsonb),
  'contratos', jsonb_build_object(
    'ganados',        (select count(*) from ganados),
    'valor_total',    (select coalesce(sum(valor), 0) from ganados),
    'ticket_medio',   (select coalesce(round(avg(nullif(valor, 0))::numeric, 2), 0) from ganados),
    'dias_ciclo',     (select coalesce(round(avg(dias)::numeric, 1), 0) from ganados where dias >= 0),
    'cobrado',        (select cobrado from pagos),
    'pendiente',      (select pendiente from pagos),
    'perdidos',       (select coalesce(sum(n), 0) from perdidos),
    'motivos_perdida', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'n', n) order by n desc) from perdidos), '[]'::jsonb)
  )
);
$fn$ language sql stable security definer set search_path = public, pg_temp;

revoke execute on function metricas_embudo(date, date) from anon;
revoke execute on function tipo_desde_canal(text)      from anon;

commit;

-- VERIFICACIÓN
--   select origen, count(*) from leads where deleted_at is null group by 1;
--   select metricas_embudo(current_date - 90, current_date);
