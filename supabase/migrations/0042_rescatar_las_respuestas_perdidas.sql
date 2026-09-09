-- =============================================================
-- 0042 — Rescatar las respuestas que se perdieron
--
-- La 0041 arregla el trigger, pero solo para lo que venga a partir de ahora.
-- Todo lo que se movió a «Respondió» mientras el fallo estuvo vivo se quedó
-- con su toque en 'sin_respuesta', y ningún trigger va a volver atrás a
-- mirarlo. Esta migración los recupera.
--
-- DE DÓNDE SALE EL DATO
--
-- `pipeline_events` es un historial append-only: guarda CADA cambio de etapa
-- desde que se creó el lead, no solo dónde está parado hoy. Así que el paso
-- por «Respondió» de un lead que después se cerró como perdido sigue escrito
-- ahí, con su fecha. Eso es lo que se usa para saber quién contestó y cuándo,
-- sin tener que acordarse ni buscar ids a mano.
--
-- QUÉ SE MARCA
--
-- El último toque que había salido ANTES de que contestaran: es el que
-- provocó la respuesta, la misma regla de la 0041. Y `respondido_en` toma la
-- fecha del movimiento, no la de hoy, para que la respuesta cuente el día en
-- que ocurrió de verdad.
--
-- Solo se tocan los toques que siguen en 'sin_respuesta'. Lo que ya estaba
-- marcado —a mano o por la 0041— se queda como está: esto rellena huecos, no
-- reescribe lo que alguien decidió.
-- =============================================================

begin;

with respuestas as (
  -- El primer paso por «Respondió» de cada lead. Si se movió varias veces
  -- (respondió, se enfrió, volvió a responder), manda el primero: es el que
  -- convierte al lead en «alguien que contesta», que es lo que mide la tasa.
  select e.lead_id, min(e.changed_at) as respondio_en
    from pipeline_events e
    join leads l on l.id = e.lead_id and l.deleted_at is null
   where e.etapa = 'respondio'
   group by e.lead_id
),
huerfanas as (
  -- Solo los leads a los que NO les consta ninguna respuesta. Si ya tienen un
  -- toque con resultado, el registro está bien y no hay nada que rescatar.
  select r.* from respuestas r
   where not exists (
     select 1 from follow_ups f
      where f.lead_id = r.lead_id and f.deleted_at is null
        and f.resultado in ('positivo','negativo')
   )
),
toque_culpable as (
  -- El último toque anterior a la respuesta. El `<=` con margen de un minuto
  -- cubre el caso normal —mover la tarjeta creaba el toque y el evento casi a
  -- la vez— sin colar toques posteriores.
  select distinct on (f.lead_id) f.id, h.respondio_en
    from follow_ups f
    join huerfanas h on h.lead_id = f.lead_id
   where f.estado = 'completado' and f.deleted_at is null
     and f.resultado = 'sin_respuesta'
     and f.completed_at <= h.respondio_en + interval '1 minute'
   order by f.lead_id, f.completed_at desc
)
update follow_ups f
   set resultado     = 'positivo',
       respondido_en = t.respondio_en,
       nota          = coalesce(f.nota || ' · ', '')
                       || 'Respuesta rescatada por la 0042: el paso por Respondió constaba en el historial'
  from toque_culpable t
 where f.id = t.id;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) A quién le tocó y con qué fecha:
--
--   select l.empresa, l.estado, f.tipo, f.completed_at, f.respondido_en
--     from follow_ups f
--     join leads l on l.id = f.lead_id
--    where f.nota like '%rescatada por la 0042%'
--    order by f.respondido_en desc;
--
-- 2) La tasa de respuesta de hoy deja de ser 0:
--
--   select metrica_valor('respuestas_recibidas', current_date, current_date);
--
-- 3) Ya no queda ningún lead que pasara por «Respondió» sin respuesta a su
--    nombre, salvo los que nunca tuvieron un toque previo que marcar:
--
--   select l.empresa, l.estado, l.touch_actual
--     from leads l
--    where l.deleted_at is null and l.respondio_en is null
--      and exists (select 1 from pipeline_events e
--                   where e.lead_id = l.id and e.etapa = 'respondio');
--
-- 4) Deshacer, si hiciera falta (deja los toques como estaban):
--
--   -- update follow_ups set resultado = 'sin_respuesta', respondido_en = null
--   --  where nota like '%rescatada por la 0042%';
