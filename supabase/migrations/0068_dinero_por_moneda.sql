-- =============================================================
-- 0068 — El dinero de las métricas, separado por moneda
--
-- EL FALLO
--
-- `metricas_embudo` (0065) sumaba precios sin mirar la moneda del proyecto.
-- Con una venta de 300 USD y otra de 15.000 DOP, Analíticas enseñaba
-- «Dinero vendido US$15,300». Lo mismo con cobrado, por cobrar, ticket medio
-- y la columna «Dinero» por canal y por origen.
--
-- QUÉ CAMBIA
--
-- Cada cifra de dinero gana una hermana `*_mon` con el importe por moneda:
--   valor_total_mon = {"USD": 300, "DOP": 15000}
-- La moneda es la del proyecto; si la venta no tiene proyecto (se usa el
-- valor estimado del lead, que no guarda moneda) cuenta como USD.
--
-- Los campos numéricos de antes se quedan tal cual para que la versión del
-- CRM ya publicada siga funcionando hasta el siguiente despliegue. El
-- cliente nuevo usa los `*_mon` y no vuelve a sumar monedas distintas.
--
-- No convierte entre monedas: el cambio varía y un total convertido
-- escondería de cuánto es cada venta.
--
-- CÓMO APLICARLA: SQL Editor de Supabase, entera.
-- =============================================================

begin;

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
proyecto_lead as (
  select distinct on (p.lead_id) p.lead_id, p.precio, p.moneda
    from proyectos p
   where p.deleted_at is null and p.lead_id is not null
   order by p.lead_id, p.created_at desc
),
precio as (
  -- Precio del proyecto (con su moneda) o, si no hay, el valor estimado en USD.
  select l.id,
         coalesce(nullif(pl.precio, 0), l.valor_estimado, 0) as valor,
         case when nullif(pl.precio, 0) is not null then coalesce(pl.moneda, 'USD') else 'USD' end as moneda
    from leads l
    left join proyecto_lead pl on pl.lead_id = l.id
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
canal_base as (
  select r.canal, r.lead_id, a.llego_reunion, a.ganado, pr.valor, pr.moneda
    from primera_respuesta r
    join avanzados a on a.id = r.lead_id
    left join precio pr on pr.id = r.lead_id
   where dia_crm(r.completed_at) between p_desde and p_hasta
),
canal_mon as (
  select canal, jsonb_object_agg(moneda, total) as valor_mon
    from (select canal, moneda, sum(valor) as total
            from canal_base where ganado and valor > 0
           group by canal, moneda) s
   group by canal
),
resultado_canal as (
  select canal,
         count(*)                             as abrieron,
         count(*) filter (where llego_reunion) as reuniones,
         count(*) filter (where ganado)        as ganados,
         coalesce(sum(valor) filter (where ganado), 0) as valor
    from canal_base
   group by canal
),
por_canal as (
  select coalesce(a.canal, r.canal) as canal,
         coalesce(a.toques, 0) as toques, coalesce(a.leads, 0) as leads,
         coalesce(a.respuestas, 0) as respuestas, coalesce(a.positivas, 0) as positivas,
         coalesce(r.abrieron, 0) as abrieron, coalesce(r.reuniones, 0) as reuniones,
         coalesce(r.ganados, 0) as ganados, coalesce(r.valor, 0) as valor,
         coalesce(m.valor_mon, '{}'::jsonb) as valor_mon
    from actividad a
    full join resultado_canal r on r.canal = a.canal
    left join canal_mon m on m.canal = coalesce(a.canal, r.canal)
),
origen_base as (
  select coalesce(l.origen, 'sin_dato') as origen, l.touch_actual, l.respondio_en,
         a.llego_reunion, a.ganado, pr.valor, pr.moneda
    from leads l
    join avanzados a on a.id = l.id
    left join precio pr on pr.id = l.id
   where l.deleted_at is null
     and dia_crm(l.created_at) between p_desde and p_hasta
),
origen_mon as (
  select origen, jsonb_object_agg(moneda, total) as valor_mon
    from (select origen, moneda, sum(valor) as total
            from origen_base where ganado and valor > 0
           group by origen, moneda) s
   group by origen
),
por_origen as (
  select b.origen,
         count(*)                                       as leads,
         count(*) filter (where b.touch_actual > 0)     as contactados,
         count(*) filter (where b.respondio_en is not null) as respondieron,
         count(*) filter (where b.llego_reunion)        as reuniones,
         count(*) filter (where b.ganado)               as ganados,
         coalesce(sum(b.valor) filter (where b.ganado), 0) as valor,
         coalesce(max(m.valor_mon::text), '{}')::jsonb  as valor_mon
    from origen_base b
    left join origen_mon m on m.origen = b.origen
   group by b.origen
),
ganados as (
  select l.id, pr.valor, pr.moneda,
         extract(epoch from (l.cerrado_en - coalesce(l.primer_contacto_en, l.created_at))) / 86400 as dias
    from leads l
    join precio pr on pr.id = l.id
   where dia_crm(l.cerrado_en) between p_desde and p_hasta
),
pagos_base as (
  select g.monto, g.cobrado_en, coalesce(p.moneda, 'USD') as moneda
    from proyecto_pagos g
    join proyectos p on p.id = g.proyecto_id and p.deleted_at is null
    join ganados x on x.id = p.lead_id
),
pagos as (
  select coalesce(sum(monto) filter (where cobrado_en is not null), 0) as cobrado,
         coalesce(sum(monto) filter (where cobrado_en is null), 0)     as pendiente
    from pagos_base
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
    'valor_total_mon', coalesce((select jsonb_object_agg(moneda, total) from
                         (select moneda, sum(valor) as total from ganados where valor > 0 group by moneda) s), '{}'::jsonb),
    'ticket_medio_mon', coalesce((select jsonb_object_agg(moneda, media) from
                         (select moneda, round(avg(valor)::numeric, 2) as media from ganados where valor > 0 group by moneda) s), '{}'::jsonb),
    'cobrado_mon',    coalesce((select jsonb_object_agg(moneda, total) from
                         (select moneda, sum(monto) as total from pagos_base where cobrado_en is not null group by moneda) s), '{}'::jsonb),
    'pendiente_mon',  coalesce((select jsonb_object_agg(moneda, total) from
                         (select moneda, sum(monto) as total from pagos_base where cobrado_en is null group by moneda) s), '{}'::jsonb),
    'perdidos',       (select coalesce(sum(n), 0) from perdidos),
    'motivos_perdida', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'n', n) order by n desc) from perdidos), '[]'::jsonb)
  )
);
$fn$ language sql stable security definer set search_path = public, pg_temp;

revoke execute on function metricas_embudo(date, date) from anon;

commit;
