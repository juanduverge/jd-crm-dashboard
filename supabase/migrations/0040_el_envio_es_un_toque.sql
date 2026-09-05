-- =============================================================
-- 0040 — Un mensaje que sale es un contacto, en todo el panel
--
-- PROBLEMA QUE RESUELVE
--
-- La 0039 hizo que los envíos reales contaran... sólo en las métricas de
-- canal. El resto del panel siguió leyendo `follow_ups` y siguió en cero:
--
--   · «Embudo del periodo»    -> Contactados 0, con 8 correos fuera
--   · «Insistencia por toque» -> los cinco escalones a 0
--   · «Días entre contactos»  -> sin datos
--   · «Qué me falta»          -> 85 leads «sin contactar» que sí lo estaban
--
-- Un panel donde un bloque dice «8 enviados» y el de al lado «0 contactados»
-- no es medio correcto: es incoherente, y quien lo mira deja de fiarse de los
-- dos. El arreglo a medias fue mío y esto lo termina.
--
-- LA REGLA, AHORA EN UN SOLO SITIO
--
-- Un mensaje que SALE es un toque. Da igual que lo mande n8n, el CRM o que se
-- registre a mano; da igual que además se mueva la tarjeta. `follow_ups` es
-- el registro de contactos del CRM y ahora TODOS los caminos escriben ahí:
--
--   · mover la tarjeta de etapa        -> 0039
--   · mandar un correo o un WhatsApp   -> esta migración
--   · registrarlo a mano en el modal   -> desde siempre
--
-- Con eso, todo lo que ya se derivaba de los toques (número de toque,
-- insistencia, primer y último contacto, días entre contactos, «sin
-- contactar») se alimenta solo, sin una segunda contabilidad en paralelo.
--
-- Y `v_contactos_canal` de la 0039 sigue siendo correcta sin tocarla: como
-- deduplica por lead + canal + día, el toque que ahora crea este trigger cae
-- exactamente encima del envío que lo originó y no infla nada.
--
-- OJO — ESTA MIGRACIÓN SÍ CAMBIA DATOS
--
-- A diferencia de la 0038 y la 0039, aquí hay un backfill que ESCRIBE: crea
-- los toques de los 19 envíos que ya existían. Eso arrastra, por los triggers
-- de la 0028, que los leads afectados avancen de 'nuevo' a 'contactado' y se
-- les rellene `primer_contacto_en`.
--
-- Es lo correcto —esos leads FUERON contactados, la ficha lo negaba— pero es
-- un cambio visible en el pipeline, no sólo en un número. Al final del
-- archivo hay una consulta para ver a quién afecta ANTES de aplicarla.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. MANDAR UN MENSAJE DEJA EL TOQUE
-- -------------------------------------------------------------
-- Se dispara cuando un mensaje ENTRA en un estado de enviado, no en cada
-- update: reenviar el mismo registro o corregirle el cuerpo no es un contacto
-- nuevo. El canal sale del status, como lo dejó escrito la 0037.
create or replace function registrar_toque_por_envio() returns trigger as $fn$
declare
  v_tipo  follow_up_tipo;
  v_orden int;
  v_dia   date;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- Sin lead no hay dónde colgar el toque. Los envíos sueltos a una dirección
  -- (0024) siguen contando en las métricas de canal vía `v_envios`, que no
  -- necesita ficha; aquí simplemente no hay historial que escribir.
  if new.lead_id is null or new.sent_at is null then
    return null;
  end if;

  if new.status not in ('enviado', 'seguimiento_enviado', 'whatsapp_enviado') then
    return null;
  end if;

  -- Sólo la TRANSICIÓN a enviado. Un update que no cambia el status ya estaba
  -- contado.
  if tg_op = 'UPDATE' and old.status = new.status then
    return null;
  end if;

  v_tipo := case when new.status = 'whatsapp_enviado'
                 then 'whatsapp'::follow_up_tipo
                 else 'email'::follow_up_tipo end;

  v_dia := dia_crm(new.sent_at);

  -- Misma regla que el resto del sistema: un lead, un día, un toque. Si ya se
  -- registró a mano o al mover la tarjeta, este envío es el mismo contacto.
  if exists (
    select 1 from follow_ups
     where lead_id = new.lead_id and estado = 'completado' and deleted_at is null
       and dia_crm(completed_at) = v_dia
  ) then
    return null;
  end if;

  select coalesce(max(orden), 0) + 1 into v_orden
    from follow_ups where lead_id = new.lead_id and deleted_at is null;

  -- `sin_respuesta` porque enviar no es que contesten. Cuando el lead
  -- responda, el toque se marcará desde el modal o al mover la tarjeta a
  -- «Respondió», y ahí es donde la tasa de respuesta se gana.
  insert into follow_ups (
    lead_id, fecha_programada, tipo, estado, resultado, orden,
    responsable, completed_at, nota
  )
  select new.lead_id, v_dia, v_tipo, 'completado', 'sin_respuesta', v_orden,
         l.responsable, new.sent_at,
         'Registrado al salir el mensaje (' || new.status || ')'
    from leads l where l.id = new.lead_id and l.deleted_at is null;

  return null;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

comment on function registrar_toque_por_envio() is
  'Un mensaje enviado deja su toque en follow_ups. Sin esto los envíos de n8n no llegaban al embudo ni a la insistencia.';

drop trigger if exists trg_outreach_registrar_toque on outreach_messages;
create trigger trg_outreach_registrar_toque
  after insert or update of status on outreach_messages
  for each row execute function registrar_toque_por_envio();

-- -------------------------------------------------------------
-- 2. BACKFILL — los envíos que ya habían salido
-- -------------------------------------------------------------
-- Los mensajes que salieron antes de existir el trigger. Se recorren en orden
-- cronológico y de uno en uno a propósito: la regla «un lead, un día, un
-- toque» tiene que ver los toques que va creando el propio bucle, cosa que un
-- `insert ... select` masivo no puede hacer.
--
-- El `orden` se recalcula en cada vuelta por lo mismo.
do $do$
declare
  r      record;
  v_tipo follow_up_tipo;
  v_dia  date;
  v_ord  int;
  v_n    int := 0;
begin
  for r in
    select o.id, o.lead_id, o.sent_at, o.status, l.responsable
      from outreach_messages o
      join leads l on l.id = o.lead_id and l.deleted_at is null
     where o.sent_at is not null
       and o.status in ('enviado', 'seguimiento_enviado', 'whatsapp_enviado')
     order by o.sent_at
  loop
    v_dia := dia_crm(r.sent_at);

    if exists (
      select 1 from follow_ups
       where lead_id = r.lead_id and estado = 'completado' and deleted_at is null
         and dia_crm(completed_at) = v_dia
    ) then
      continue;
    end if;

    v_tipo := case when r.status = 'whatsapp_enviado'
                   then 'whatsapp'::follow_up_tipo
                   else 'email'::follow_up_tipo end;

    select coalesce(max(orden), 0) + 1 into v_ord
      from follow_ups where lead_id = r.lead_id and deleted_at is null;

    insert into follow_ups (
      lead_id, fecha_programada, tipo, estado, resultado, orden,
      responsable, completed_at, nota
    ) values (
      r.lead_id, v_dia, v_tipo, 'completado', 'sin_respuesta', v_ord,
      r.responsable, r.sent_at,
      'Backfill 0040: el mensaje había salido (' || r.status || ') y no constaba el contacto'
    );

    v_n := v_n + 1;
  end loop;

  raise notice 'Backfill 0040: % toques creados desde envíos ya existentes', v_n;
end $do$;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 0) ANTES de aplicar, para saber a quién va a tocar (no hace falta después):
--
--   select l.empresa, l.estado, o.status, o.sent_at
--     from outreach_messages o
--     join leads l on l.id = o.lead_id and l.deleted_at is null
--    where o.sent_at is not null
--      and o.status in ('enviado','seguimiento_enviado','whatsapp_enviado')
--    order by o.sent_at;
--
-- 1) El embudo deja de mentir. «Contactados» tiene que dejar de ser 0:
--
--   select jsonb_pretty(metricas_crm(date_trunc('month', current_date)::date,
--                                    current_date) -> 'periodo');
--
-- 2) Los toques creados son los esperados y se ve de dónde salió cada uno:
--
--   select tipo, count(*) from follow_ups
--    where nota like 'Backfill 0040%' group by tipo;
--
-- 3) Nadie tiene dos toques el mismo día por la misma causa:
--
--   select lead_id, dia_crm(completed_at) as dia, count(*)
--     from follow_ups
--    where estado = 'completado' and deleted_at is null
--    group by 1, 2 having count(*) > 1;
--   -- vacío
--
-- 4) «Sin contactar» baja: esos leads sí lo estaban.
--
--   select count(*) from v_leads_seguimiento where situacion = 'sin_contactar';
--
-- 5) Si algo saliera mal, los toques del backfill son identificables y
--    reversibles de un golpe:
--
--   -- delete from follow_ups where nota like 'Backfill 0040%';
--   -- (y luego: select recalcular_touch_lead(id) from leads where deleted_at is null;)
