-- 0073 · Registrar contactos desde la ficha del lead
--
-- Juan pidió (20-nov) que la ficha tenga «¿Qué quieres hacer?»: llamar
-- (normal o por WhatsApp, desde uno de SUS números), escribir, y que al
-- terminar se pregunte cómo fue, cuánto duró y cuándo volvemos.
--
-- Tres datos nuevos por toque, todos opcionales:
--   - duracion_seg: lo que duró la llamada (cronómetro del CRM o a mano).
--   - numero_usado: desde cuál de los números de Juan se hizo («Móvil
--     trabajo · +1 809…»). Texto libre: los números viven en Ajustes.
--   - detalle: el resultado fino. `resultado` sigue siendo el que cuentan las
--     métricas (positivo / negativo / sin_respuesta); `detalle` dice si fue
--     buzón, ocupado, «llámame luego»… Así las métricas no cambian.
--
-- Y dos funciones para hacerlo en un solo paso (atómico):
--   - registrar_contacto: completa el seguimiento pendiente si lo hay (es el
--     toque que tocaba) o, si no, apunta uno nuevo ya completado.
--   - registrar_respuesta: cuando el lead contesta a un mensaje ya enviado,
--     marca la respuesta en el último toque.
--
-- Etapa: la mueve el trigger de siempre (`avanzar_etapa_por_toque`, 0038)
-- solo cuando el resultado es 'positivo'. «Llámame luego» y «no le interesa»
-- van como 'negativo': cuentan como respuesta pero no mueven al lead.

begin;

alter table follow_ups
  add column if not exists duracion_seg int,
  add column if not exists numero_usado text,
  add column if not exists detalle      text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_follow_up_duracion') then
    alter table follow_ups
      add constraint ck_follow_up_duracion check (duracion_seg is null or duracion_seg between 0 and 86400);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_follow_up_detalle') then
    alter table follow_ups
      add constraint ck_follow_up_detalle check (detalle is null or detalle in (
        'enviado', 'no_contesto', 'buzon', 'ocupado', 'numero_equivocado',
        'interesado', 'pidio_info', 'llamar_luego', 'no_interesa'
      ));
  end if;
end $$;

-- ---------------------------------------------------------------
-- registrar_contacto
-- ---------------------------------------------------------------
create or replace function registrar_contacto(
  p_lead_id      uuid,
  p_tipo         follow_up_tipo,
  p_resultado    follow_up_resultado,
  p_nota         text default null,
  p_duracion_seg int  default null,
  p_numero       text default null,
  p_detalle      text default null
) returns uuid as $$
declare
  v_id    uuid;
  v_orden int;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  -- El seguimiento pendiente ES el contacto que tocaba: se completa ese, con
  -- el canal real (pudo programarse como WhatsApp y acabar siendo llamada).
  select id into v_id
    from follow_ups
   where lead_id = p_lead_id and estado = 'pendiente' and deleted_at is null
   limit 1
   for update;

  if v_id is not null then
    update follow_ups
       set tipo         = p_tipo,
           duracion_seg = p_duracion_seg,
           numero_usado = p_numero,
           detalle      = p_detalle
     where id = v_id;
    perform completar_follow_up(v_id, p_resultado, p_nota);
    return v_id;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = p_lead_id and deleted_at is null;

  insert into follow_ups (
    lead_id, fecha_programada, tipo, estado, resultado, orden, nota,
    completed_at, respondido_en, duracion_seg, numero_usado, detalle
  ) values (
    p_lead_id, current_date, p_tipo, 'completado', p_resultado, v_orden, p_nota,
    now(), case when p_resultado in ('positivo','negativo') then now() end,
    p_duracion_seg, p_numero, p_detalle
  )
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- ---------------------------------------------------------------
-- registrar_respuesta
-- ---------------------------------------------------------------
create or replace function registrar_respuesta(
  p_lead_id   uuid,
  p_resultado follow_up_resultado,
  p_nota      text default null,
  p_detalle   text default null,
  p_tipo      follow_up_tipo default 'whatsapp'
) returns uuid as $$
declare
  v_id    uuid;
  v_orden int;
  v_lead  leads;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;
  if p_resultado = 'sin_respuesta' then
    raise exception 'una respuesta no puede ser «sin respuesta»';
  end if;

  -- La respuesta es al último toque que salió.
  select id into v_id
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null
   order by completed_at desc
   limit 1;

  if v_id is not null then
    update follow_ups
       set resultado     = p_resultado,
           respondido_en = coalesce(respondido_en, now()),
           detalle       = coalesce(p_detalle, detalle),
           nota          = case when p_nota is null or p_nota = '' then nota
                                when nota is null or nota = '' then p_nota
                                else nota || E'\n' || p_nota end
     where id = v_id;
  else
    -- Escribió él primero: queda constancia de la conversación.
    select coalesce(max(orden), 0) + 1 into v_orden
      from follow_ups where lead_id = p_lead_id and deleted_at is null;
    insert into follow_ups (
      lead_id, fecha_programada, tipo, estado, resultado, orden, nota,
      completed_at, respondido_en, detalle
    ) values (
      p_lead_id, current_date, p_tipo, 'completado', p_resultado, v_orden, p_nota,
      now(), now(), p_detalle
    )
    returning id into v_id;
  end if;

  -- Interesado o pidió info: el lead pasa a «Respondió» si aún estaba antes.
  -- (El trigger de etapa no salta aquí porque el toque ya estaba completado.)
  if p_resultado = 'positivo' then
    select * into v_lead from leads where id = p_lead_id;
    if v_lead.estado in ('nuevo','contactado','seguimiento') then
      update leads set estado = 'respondio' where id = p_lead_id;
      insert into pipeline_events (lead_id, etapa, notas)
      values (p_lead_id, 'respondio', 'Respondió (registrado desde la ficha)');
    end if;
  end if;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function
  registrar_contacto(uuid, follow_up_tipo, follow_up_resultado, text, int, text, text),
  registrar_respuesta(uuid, follow_up_resultado, text, text, follow_up_tipo)
from public, anon;

grant execute on function
  registrar_contacto(uuid, follow_up_tipo, follow_up_resultado, text, int, text, text),
  registrar_respuesta(uuid, follow_up_resultado, text, text, follow_up_tipo)
to authenticated, service_role;

commit;
