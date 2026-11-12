-- =============================================================
-- 0063 — Pasar de «Respondió» en adelante es haber respondido
--
-- PROBLEMA QUE RESUELVE
--
-- Comprobado el 12-nov-2026: dos leads en «Propuesta enviada» y dos en
-- «Cerrado ganado» no contaban como respuesta. El trigger de la 0041 solo
-- miraba el paso por «Respondió», y en la práctica muchas veces se salta:
-- el lead contesta «mándame una cotización» y la tarjeta va directa a
-- Propuesta, o se cierra como ganado de una vez.
--
-- Nadie agenda una reunión, manda una propuesta, negocia o cierra con un lead
-- que no ha contestado. Así que llegar a cualquiera de esas etapas implica
-- que respondió, aunque la tarjeta no pasara por esa columna.
--
-- LA REGLA
--
-- Mover a reunión, propuesta, negociación o ganado hace lo mismo que mover a
-- «Respondió» (0041), pero SOLO si al lead todavía no le consta ninguna
-- respuesta. Si ya respondió antes, ese registro manda y no se toca: pasar de
-- reunión a propuesta no es una respuesta nueva.
--
-- «Perdido» queda fuera a propósito: se pierde también a quien nunca contestó.
--
-- Lo que no cambia: sigue sin inventarse un toque nuevo cuando ya hay uno.
-- La respuesta se apunta en el último toque que salió (el que la provocó).
-- =============================================================

begin;

create or replace function registrar_toque_por_etapa() returns trigger as $fn$
declare
  v_tipo   follow_up_tipo;
  v_orden  int;
  v_ultimo uuid;
begin
  -- Corta la recursión: insertar el toque dispara `avanzar_etapa_por_toque`
  -- (0038), que puede volver a mover el estado del lead y reentrar aquí.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if new.deleted_at is not null then
    return null;
  end if;

  v_tipo := case new.canal_principal
              when 'email'    then 'email'::follow_up_tipo
              when 'whatsapp' then 'whatsapp'::follow_up_tipo
              else 'llamada'::follow_up_tipo
            end;

  -- --- CONTESTARON (directa o implícitamente) ---
  if new.estado in ('respondio', 'reunion', 'propuesta', 'negociacion', 'ganado') then
    -- En las etapas posteriores la respuesta solo se deduce si no consta ya.
    -- En «Respondió» se mantiene el comportamiento de la 0041 tal cual.
    if new.estado <> 'respondio' and exists (
      select 1 from follow_ups
       where lead_id = new.id and estado = 'completado' and deleted_at is null
         and resultado in ('positivo', 'negativo')
    ) then
      return null;
    end if;

    -- El último toque que salió es el que provocó la respuesta. Se le pone el
    -- resultado y la fecha de HOY, que es cuando contestaron, aunque el
    -- mensaje hubiera salido la semana pasada.
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

    -- Sin ningún toque previo: el lead escribió primero (o la conversación no
    -- se registró). Se deja constancia, con envío y respuesta el mismo día.
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

  -- --- LO CONTACTAMOS NOSOTROS ---
  if new.estado not in ('contactado', 'seguimiento') then
    return null;
  end if;

  -- Un lead, un día, un toque: si ya se registró a mano, por el envío o por
  -- un movimiento anterior, este es el mismo contacto.
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

comment on function registrar_toque_por_etapa() is
  'Mover a contactado/seguimiento deja el toque; mover a respondio, reunion, propuesta, negociacion o ganado marca la respuesta si aún no constaba, sin inventar un contacto nuevo.';

-- -------------------------------------------------------------
-- RESCATE: leads que ya están en etapas avanzadas sin respuesta
-- -------------------------------------------------------------
-- La fecha de la respuesta es la del primer paso por una etapa de respuesta
-- en `pipeline_events`; si no hay historial, la última modificación del lead.
-- Mismo criterio de la 0042: se marca el último toque anterior a esa fecha
-- y, si no hay ninguno, se deja constancia con un toque nuevo.
-- `avanzar_etapa_por_toque` no mueve leads en estas etapas, así que ninguno
-- vuelve atrás por este rescate.
do $$
declare
  r       record;
  v_toque uuid;
begin
  for r in
    select l.id, l.canal_principal, l.responsable, l.estado,
           coalesce(
             (select min(e.changed_at) from pipeline_events e
               where e.lead_id = l.id
                 and e.etapa in ('respondio','reunion','propuesta','negociacion','ganado')),
             l.updated_at
           ) as cuando
      from leads l
     where l.deleted_at is null
       and l.estado in ('respondio','reunion','propuesta','negociacion','ganado')
       and not exists (
         select 1 from follow_ups f
          where f.lead_id = l.id and f.deleted_at is null and f.estado = 'completado'
            and f.resultado in ('positivo','negativo')
       )
  loop
    select id into v_toque
      from follow_ups
     where lead_id = r.id and estado = 'completado' and deleted_at is null
       and completed_at <= r.cuando + interval '1 minute'
     order by completed_at desc
     limit 1;

    if v_toque is not null then
      update follow_ups
         set resultado = 'positivo', respondido_en = coalesce(respondido_en, r.cuando)
       where id = v_toque;
    else
      insert into follow_ups (
        lead_id, fecha_programada, tipo, estado, resultado, orden,
        responsable, completed_at, respondido_en, nota
      ) values (
        r.id, dia_crm(r.cuando),
        case r.canal_principal when 'email' then 'email'::follow_up_tipo
                               when 'whatsapp' then 'whatsapp'::follow_up_tipo
                               else 'llamada'::follow_up_tipo end,
        'completado', 'positivo',
        (select coalesce(max(orden), 0) + 1 from follow_ups where lead_id = r.id and deleted_at is null),
        r.responsable, r.cuando, r.cuando,
        'Rescatado por la 0063: el lead estaba en ' || r.estado::text || ' sin respuesta registrada'
      );
    end if;
  end loop;
end $$;

commit;

-- VERIFICACIÓN (debe devolver 0 filas):
--   select l.empresa, l.estado from leads l
--    where l.deleted_at is null
--      and l.estado in ('respondio','reunion','propuesta','negociacion','ganado')
--      and l.respondio_en is null;
