-- =============================================================
-- 0067 — Cuándo contactar y cuánto insistir
--
-- `metricas_ritmo(desde, hasta)` completa a `metricas_embudo` (0065) con
-- las preguntas de «cuándo» y «cuánto», todas sobre los toques COMPLETADOS
-- en el periodo:
--
--   · por_dia:   día de la semana (1 = lunes … 7 = domingo) en que salió el
--                toque, y cuántos de esos obtuvieron respuesta.
--   · por_hora:  lo mismo por hora del día, en la zona del CRM.
--                Ojo: es la hora en que se marcó el toque como hecho, que
--                casi siempre coincide con el envío, pero no siempre.
--   · por_toque: en qué número de toque llegó la PRIMERA respuesta de cada
--                lead. Dice cuántos seguimientos vale la pena hacer.
--   · tiempo_respuesta: días de media entre el toque y la respuesta, por
--                canal (solo toques con `respondido_en`).
--
-- Solo lectura, sin cambios de esquema. Se puede ejecutar más de una vez.
-- =============================================================

begin;

create or replace function metricas_ritmo(p_desde date, p_hasta date)
returns jsonb as $fn$
with
toques as (
  select f.lead_id, f.tipo::text as canal, f.resultado, f.completed_at, f.respondido_en,
         (f.completed_at at time zone zona_crm()) as local_ts,
         row_number() over (partition by f.lead_id order by f.completed_at, f.id) as n
    from follow_ups f
    join leads l on l.id = f.lead_id and l.deleted_at is null
   where f.estado = 'completado' and f.deleted_at is null
),
periodo as (
  select * from toques where dia_crm(completed_at) between p_desde and p_hasta
),
por_dia as (
  select extract(isodow from local_ts)::int as dia,
         count(*) as toques,
         count(*) filter (where resultado in ('positivo','negativo')) as respuestas
    from periodo group by 1
),
por_hora as (
  select extract(hour from local_ts)::int as hora,
         count(*) as toques,
         count(*) filter (where resultado in ('positivo','negativo')) as respuestas
    from periodo group by 1
),
primera as (
  select distinct on (lead_id) lead_id, n, completed_at
    from toques
   where resultado in ('positivo','negativo')
   order by lead_id, completed_at
),
por_toque as (
  select least(n, 6)::int as toque, count(*) as leads
    from primera
   where dia_crm(completed_at) between p_desde and p_hasta
   group by 1
),
tiempo as (
  select canal,
         count(*) as n,
         round(avg(extract(epoch from (respondido_en - completed_at)) / 86400)::numeric, 1) as dias
    from periodo
   where respondido_en is not null and respondido_en >= completed_at
   group by canal
)
select jsonb_build_object(
  'por_dia',   coalesce((select jsonb_agg(to_jsonb(d) order by d.dia)   from por_dia d),   '[]'::jsonb),
  'por_hora',  coalesce((select jsonb_agg(to_jsonb(h) order by h.hora)  from por_hora h),  '[]'::jsonb),
  'por_toque', coalesce((select jsonb_agg(to_jsonb(t) order by t.toque) from por_toque t), '[]'::jsonb),
  'tiempo_respuesta', coalesce((select jsonb_agg(to_jsonb(x) order by x.n desc) from tiempo x), '[]'::jsonb)
);
$fn$ language sql stable security definer set search_path = public, pg_temp;

revoke execute on function metricas_ritmo(date, date) from anon;

commit;

-- VERIFICACIÓN
--   select metricas_ritmo(current_date - 90, current_date);
