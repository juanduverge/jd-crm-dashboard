-- =============================================================
-- 0041 — Cuando contestan, que quede registrado
--
-- PROBLEMA QUE RESUELVE
--
-- Comprobado el 9-sep-2026: dos leads contestaron ese mismo día, se movieron
-- a «Respondió» y luego se cerraron como perdidos. El panel del día siguió
-- diciendo «0 respuestas sobre los toques dados». La respuesta se perdió.
--
-- No era un fallo de cuentas, era el trigger de la 0039. Al mover la tarjeta
-- a «Respondió» comprobaba «¿ya hay un toque hoy?» y, si lo había, se iba sin
-- hacer nada. Pero el caso normal es justo ese: se escribe por la mañana (el
-- envío deja su toque, 0040) y contestan por la tarde. Es decir, la respuesta
-- se descartaba precisamente cuando llegaba rápido, que es cuando más vale.
--
-- Y cuando NO había toque ese día hacía lo contrario, y también mal: creaba
-- un toque nuevo. Que a uno le contesten no es un contacto que hayamos hecho
-- nosotros; contarlo como toque infla «contactos realizados» e «insistencia»
-- con trabajo que nadie hizo.
--
-- LA REGLA
--
-- Una respuesta no es un toque nuevo: es el RESULTADO del toque que la
-- provocó. Mover a «Respondió» marca ese último toque como positivo y anota
-- CUÁNDO contestaron. Sólo si el lead no tiene ningún toque —entró por la
-- puerta, escribió él primero— se crea uno, porque hubo conversación y tiene
-- que constar en algún sitio.
--
-- POR QUÉ UNA COLUMNA NUEVA (`respondido_en`)
--
-- Hasta ahora las respuestas se fechaban por `completed_at`, la fecha del
-- ENVÍO. Con eso, un correo del lunes contestado el jueves sumaba su
-- respuesta al lunes: el jueves salía a cero y el lunes cambiaba solo días
-- después. `respondido_en` guarda el día en que contestaron, que es lo que la
-- pregunta «¿cuántas respuestas tuve hoy?» quiere saber.
--
-- El canal sigue saliendo del toque, no de la respuesta: la pregunta «¿qué
-- canal consigue que me contesten?» se mide sobre por dónde se mandó.
--
-- LO QUE NO CAMBIA
--
-- Cerrar como ganado o perdido no borra nada. El lead que hoy pasó por
-- contactado -> respondió -> perdido conserva su respuesta en las métricas,
-- porque cada estado quedó escrito donde le toca: el contacto y la respuesta
-- en `follow_ups`, el recorrido completo en `pipeline_events`, el cierre en
-- `leads.cerrado_en`.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. EL DÍA EN QUE CONTESTARON
-- -------------------------------------------------------------
alter table follow_ups
  add column if not exists respondido_en timestamptz;

comment on column follow_ups.respondido_en is
  'Cuándo contestó el lead a este toque. Distinto de completed_at, que es cuándo se mandó.';

-- Backfill: para los toques que ya tenían resultado, la única fecha que
-- consta es la del envío. No es exacta, pero es la que se venía usando, así
-- que ningún número histórico se mueve por esta migración.
update follow_ups
   set respondido_en = completed_at
 where resultado in ('positivo', 'negativo')
   and completed_at is not null
   and respondido_en is null;

create index if not exists idx_follow_ups_respondido
  on follow_ups (respondido_en) where respondido_en is not null;

-- -------------------------------------------------------------
-- 2. COMPLETAR UN TOQUE CON RESULTADO ES UNA RESPUESTA
-- -------------------------------------------------------------
-- Mismo criterio que ya usaba `recalcular_touch_lead` desde la 0028: hubo
-- respuesta cuando el toque dio resultado, sea bueno o malo. 'sin_respuesta'
-- es literalmente lo contrario, y deja la columna en null.
create or replace function completar_follow_up(
  p_id        uuid,
  p_resultado follow_up_resultado,
  p_nota      text default null
) returns void as $$
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  update follow_ups
     set estado        = 'completado',
         resultado     = p_resultado,
         completed_at  = now(),
         respondido_en = case when p_resultado in ('positivo','negativo')
                              then now() else null end,
         nota          = coalesce(p_nota, nota)
   where id = p_id
     and estado = 'pendiente'
     and deleted_at is null;

  if not found then
    raise exception 'seguimiento no encontrado o no está pendiente';
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 3. MOVER A «RESPONDIÓ» MARCA EL TOQUE QUE LA PROVOCÓ
-- -------------------------------------------------------------
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

  -- --- CONTESTARON ---
  if new.estado = 'respondio' then
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

    -- Sin ningún toque previo: el lead escribió primero. Se deja constancia
    -- de la conversación, con envío y respuesta el mismo día.
    select coalesce(max(orden), 0) + 1 into v_orden
      from follow_ups where lead_id = new.id and deleted_at is null;

    insert into follow_ups (
      lead_id, fecha_programada, tipo, estado, resultado, orden,
      responsable, completed_at, respondido_en, nota
    ) values (
      new.id, dia_crm(now()), v_tipo, 'completado', 'positivo', v_orden,
      new.responsable, now(), now(),
      'Registrado al mover el lead a respondio (sin toque previo: contestó él)'
    );

    return null;
  end if;

  -- --- LO CONTACTAMOS NOSOTROS ---
  -- Mover a reunión, propuesta o ganado son consecuencias de un contacto
  -- anterior, no contactos nuevos: registrarlos inflaría la cuenta.
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
  'Mover a contactado/seguimiento deja el toque; mover a respondio marca como respondido el toque que la provocó, sin inventar un contacto nuevo.';

-- -------------------------------------------------------------
-- 4. LA FECHA DE RESPUESTA DEL LEAD SALE DE LA RESPUESTA
-- -------------------------------------------------------------
-- Antes se tomaba el `completed_at` del toque; ahora manda `respondido_en`,
-- con el envío como respaldo para los toques anteriores a esta migración.
create or replace function recalcular_touch_lead(p_lead_id uuid) returns void as $fn$
declare
  v_touch  int;
  v_primer timestamptz;
  v_ultimo timestamptz;
  v_tipo   text;
  v_res    text;
  v_resp   timestamptz;
begin
  select count(*), min(completed_at), max(completed_at)
    into v_touch, v_primer, v_ultimo
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null;

  select tipo::text, resultado::text into v_tipo, v_res
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null
   order by completed_at desc
   limit 1;

  select min(coalesce(respondido_en, completed_at)) into v_resp
    from follow_ups
   where lead_id = p_lead_id and estado = 'completado' and deleted_at is null
     and resultado in ('positivo','negativo');

  update leads
     set touch_actual              = coalesce(v_touch, 0),
         primer_contacto_en        = v_primer,
         ultimo_contacto_en        = v_ultimo,
         ultimo_contacto_tipo      = v_tipo,
         ultimo_contacto_resultado = v_res,
         respondio_en              = v_resp,
         fecha_primer_contacto     = coalesce(v_primer::date, fecha_primer_contacto)
   where id = p_lead_id;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 5. LAS RESPUESTAS SE CUENTAN EL DÍA QUE LLEGAN
-- -------------------------------------------------------------
-- `respondido_en` va al final de la vista: `create or replace view` exige que
-- las columnas que ya había sigan en el mismo sitio (la lección de c1d4a4c).
create or replace view v_toques as
select
  f.id,
  f.lead_id,
  f.completed_at,
  f.tipo,
  f.resultado,
  row_number() over (partition by f.lead_id order by f.completed_at, f.id) as toque_n,
  f.tipo::text as canal,
  -- Respaldo para los toques viejos, que no tienen fecha propia de respuesta.
  case when f.resultado in ('positivo','negativo')
       then coalesce(f.respondido_en, f.completed_at) end as respondido_en
from follow_ups f
where f.estado = 'completado' and f.deleted_at is null;

comment on view v_toques is
  'Toques completados con su canal y, si contestaron, el día en que lo hicieron.';

alter view v_toques set (security_invoker = on);
grant select on v_toques to authenticated;

-- Sólo cambian las tres métricas de respuesta: pasan de fecharse por el envío
-- a fecharse por la contestación. El resto del motor queda tal cual (0039).
create or replace function metrica_valor(
  p_metrica text,
  p_desde   date,
  p_hasta   date
) returns numeric as $fn$
declare v numeric := 0;
begin
  case p_metrica

    -- --- PROSPECCIÓN ---
    when 'leads_encontrados' then
      select count(*) into v from leads
       where deleted_at is null and dia_crm(created_at) between p_desde and p_hasta;

    when 'leads_contactados' then
      select count(*) into v from leads
       where deleted_at is null
         and dia_crm(primer_contacto_en) between p_desde and p_hasta;

    -- --- ACTIVIDAD DE CONTACTO ---
    when 'contactos_realizados' then
      select count(*) into v from v_toques
       where dia_crm(completed_at) between p_desde and p_hasta;

    when 'touch_1' then select count(*) into v from v_toques where toque_n = 1 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_2' then select count(*) into v from v_toques where toque_n = 2 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_3' then select count(*) into v from v_toques where toque_n = 3 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_4' then select count(*) into v from v_toques where toque_n = 4 and dia_crm(completed_at) between p_desde and p_hasta;
    when 'touch_5' then select count(*) into v from v_toques where toque_n >= 5 and dia_crm(completed_at) between p_desde and p_hasta;

    -- --- ACTIVIDAD POR CANAL (0038, corregida en 0039) ---
    when 'contactos_whatsapp' then
      select count(*) into v from v_contactos_canal
       where canal = 'whatsapp' and dia between p_desde and p_hasta;

    when 'contactos_email' then
      select count(*) into v from v_contactos_canal
       where canal = 'email' and dia between p_desde and p_hasta;

    when 'respuestas_whatsapp' then
      select count(*) into v from v_toques
       where canal = 'whatsapp' and dia_crm(respondido_en) between p_desde and p_hasta;

    when 'respuestas_email' then
      select count(*) into v from v_toques
       where canal = 'email' and dia_crm(respondido_en) between p_desde and p_hasta;

    -- --- RESULTADO ---
    when 'respuestas_recibidas' then
      select count(*) into v from v_toques
       where dia_crm(respondido_en) between p_desde and p_hasta;

    when 'leads_respondieron' then
      select count(*) into v from leads
       where deleted_at is null and dia_crm(respondio_en) between p_desde and p_hasta;

    when 'reuniones_agendadas' then
      select count(distinct e.lead_id) into v
        from pipeline_events e
        join leads l on l.id = e.lead_id and l.deleted_at is null
       where e.etapa = 'reunion' and dia_crm(e.changed_at) between p_desde and p_hasta;

    when 'propuestas_enviadas' then
      select count(distinct e.lead_id) into v
        from pipeline_events e
        join leads l on l.id = e.lead_id and l.deleted_at is null
       where e.etapa = 'propuesta' and dia_crm(e.changed_at) between p_desde and p_hasta;

    when 'leads_ganados' then
      select count(*) into v from leads
       where deleted_at is null and estado = 'ganado'
         and dia_crm(cerrado_en) between p_desde and p_hasta;

    when 'leads_perdidos' then
      select count(*) into v from leads
       where deleted_at is null and estado = 'perdido'
         and dia_crm(cerrado_en) between p_desde and p_hasta;

    when 'valor_ganado' then
      select coalesce(sum(valor_estimado), 0) into v from leads
       where deleted_at is null and estado = 'ganado'
         and dia_crm(cerrado_en) between p_desde and p_hasta;

    -- --- ESFUERZO ---
    when 'tiempo_prospeccion_min' then
      select coalesce(sum(duracion_seg), 0) / 60 into v from time_entries
       where deleted_at is null and fecha between p_desde and p_hasta
         and duracion_seg is not null;

    when 'tareas_completadas' then
      select count(*) into v from tasks
       where deleted_at is null and estado = 'hecha'
         and dia_crm(completada_en) between p_desde and p_hasta;

    else
      raise exception 'métrica desconocida: %', p_metrica;
  end case;

  return coalesce(v, 0);
end;
$fn$ language plpgsql stable security definer set search_path = public, pg_temp;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Los leads del 9-sep que contestaron y se cerraron como perdidos. Su
--    toque se quedó en 'sin_respuesta' porque el movimiento ya pasó; esta
--    migración no puede adivinarlo, así que se marcan a mano una vez:
--
--   select l.empresa, l.estado, f.id, f.tipo, f.resultado,
--          f.completed_at, f.respondido_en
--     from follow_ups f
--     join leads l on l.id = f.lead_id
--    where dia_crm(f.completed_at) = current_date
--    order by f.completed_at;
--
--   -- update follow_ups set resultado = 'positivo', respondido_en = now()
--   --  where id in ('...', '...');
--
-- 2) La tasa de respuesta del día deja de ser 0:
--
--   select metrica_valor('respuestas_recibidas', current_date, current_date);
--
-- 3) Mover a «Respondió» ya no inventa un contacto: sobre un lead de prueba,
--    esto tiene que dar el mismo número antes y después del movimiento.
--
--   select metrica_valor('contactos_realizados', current_date, current_date);
--
-- 4) Ningún lead con respuesta se quedó sin `respondio_en`:
--
--   select count(*) from leads l
--    where l.deleted_at is null and l.respondio_en is null
--      and exists (select 1 from follow_ups f
--                   where f.lead_id = l.id and f.deleted_at is null
--                     and f.resultado in ('positivo','negativo'));
--   -- 0
--
-- 5) Si algo saliera mal, se vuelve a la 0039 reponiendo su
--    `registrar_toque_por_etapa()` y su `metrica_valor()`. La columna
--    `respondido_en` puede quedarse: nada la lee si las funciones vuelven.
