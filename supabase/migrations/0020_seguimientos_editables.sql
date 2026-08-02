-- =============================================================
-- 0020_seguimientos_editables.sql — Editar un seguimiento de verdad
-- =============================================================
--
-- Qué resuelve
-- ------------
-- Hasta ahora un seguimiento sólo se podía CREAR (`programar_follow_up`),
-- MOVER DE DÍA (`reprogramar_follow_up`) o COMPLETAR. Todo lo demás — el medio
-- de contacto, la hora, el responsable, la prioridad — quedaba congelado en el
-- momento de crearlo. En la práctica el usuario tenía que completar el toque y
-- programar otro sólo para cambiar "llamada" por "videollamada", lo que ensucia
-- el historial con toques que nunca ocurrieron.
--
-- Decisiones
-- ----------
-- 1. `follow_up_tipo` se AMPLÍA, no se sustituye: 'reunion' sigue significando
--    reunión presencial y no hay que tocar ni una fila existente. Se añaden los
--    medios que faltaban (videollamada, linkedin, instagram, sms).
--
-- 2. `hora` es una columna aparte, `time`, y NULLABLE. No se fusiona con
--    `fecha_programada` en un timestamptz porque la agenda, los índices, la
--    vista y el trigger que sincroniza `leads.proximo_seguimiento` razonan en
--    DÍAS. Un seguimiento sin hora ("mañana, cuando pueda") es legítimo y debe
--    seguir siéndolo; la hora es una precisión opcional, no un requisito.
--
-- 3. `prioridad` es text con check, igual que `leads.prioridad`. No se crea un
--    enum: sería el tercer vocabulario de prioridad del esquema.
--
-- 4. Un solo RPC `actualizar_follow_up` con todos los campos opcionales, en vez
--    de un RPC por campo. Editar es UNA operación del usuario y debe ser UNA
--    transacción: cambiar tipo y fecha por separado deja un estado intermedio
--    visible en la agenda.
--
-- 100% aditiva. No borra ni reescribe nada.
-- =============================================================

-- -------------------------------------------------------------
-- 1. NUEVOS MEDIOS DE CONTACTO
-- -------------------------------------------------------------
-- Fuera de la transacción a propósito: `alter type ... add value` no puede
-- convivir con un uso del valor nuevo en la misma transacción.
alter type follow_up_tipo add value if not exists 'videollamada';
alter type follow_up_tipo add value if not exists 'linkedin';
alter type follow_up_tipo add value if not exists 'instagram';
alter type follow_up_tipo add value if not exists 'sms';

begin;

-- -------------------------------------------------------------
-- 2. COLUMNAS NUEVAS (todas nullable: nada existente se invalida)
-- -------------------------------------------------------------
alter table follow_ups
  add column if not exists hora                 time,
  add column if not exists prioridad            text,
  add column if not exists resultado_esperado   text,
  add column if not exists comentarios_internos text;

comment on column follow_ups.hora is
  'Hora del toque. NULL = sin hora fijada, que es un caso normal, no un dato incompleto.';
comment on column follow_ups.resultado_esperado is
  'Qué se busca conseguir con este toque. Se escribe ANTES; `resultado` se rellena después.';
comment on column follow_ups.comentarios_internos is
  'Notas privadas del equipo. `nota` es el contexto del toque; esto no se comparte con el cliente.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_follow_up_prioridad'
  ) then
    alter table follow_ups
      add constraint ck_follow_up_prioridad
      check (prioridad is null or prioridad in ('alta','media','baja'));
  end if;
end $$;

-- -------------------------------------------------------------
-- 3. LA AGENDA EXPONE LOS CAMPOS NUEVOS
-- -------------------------------------------------------------
-- Se reconstruye idéntica salvo por las cuatro columnas añadidas, que van al
-- final: el orden de las de antes se conserva intacto porque
-- `create or replace view` NO admite otra cosa (ver el comentario de abajo).
create or replace view follow_ups_agenda as
select
  f.id, f.lead_id, f.fecha_programada, f.tipo, f.nota, f.estado,
  f.orden, f.responsable, f.created_at,
  l.empresa      as lead_empresa,
  l.estado       as lead_estado,
  l.prioridad    as lead_prioridad,
  l.telefono     as lead_telefono,
  l.email        as lead_email,
  l.whatsapp     as lead_whatsapp,
  case
    when f.fecha_programada <  current_date then 'vencido'
    when f.fecha_programada =  current_date then 'hoy'
    else 'proximo'
  end as urgencia,
  (current_date - f.fecha_programada) as dias_vencido,
  -- Las cuatro nuevas van OBLIGATORIAMENTE al final: `create or replace view`
  -- sólo sabe añadir columnas por el final. Intercalarlas hace que Postgres
  -- crea que estás renombrando la columna que ocupaba esa posición y aborta
  -- con "cannot change name of view column".
  f.hora, f.prioridad, f.resultado_esperado, f.comentarios_internos
from follow_ups f
join leads l on l.id = f.lead_id
where f.estado = 'pendiente'
  and f.deleted_at is null
  and l.deleted_at is null
  and l.estado not in ('ganado','perdido');

-- -------------------------------------------------------------
-- 4. RPC: editar un seguimiento en una sola operación
-- -------------------------------------------------------------
-- Todos los parámetros son opcionales. Se usa el patrón "sentinela": NULL
-- significa "no tocar". Para BORRAR un texto se manda la cadena vacía, que se
-- normaliza a NULL. Sin esta distinción no habría forma de vaciar una nota.
--
-- El estado NO se puede llevar a 'completado' desde aquí: completar exige un
-- resultado y sella `completed_at` (invariante `ck_follow_up_resultado_coherente`).
-- Eso sigue siendo trabajo exclusivo de `completar_follow_up`.
create or replace function actualizar_follow_up(
  p_id                   uuid,
  p_fecha                date           default null,
  p_hora                 time           default null,
  p_limpiar_hora         boolean        default false,
  p_tipo                 follow_up_tipo default null,
  p_estado               follow_up_estado default null,
  p_prioridad            text           default null,
  p_responsable          text           default null,
  p_nota                 text           default null,
  p_resultado_esperado   text           default null,
  p_comentarios_internos text           default null
) returns void as $$
declare
  v_estado follow_up_estado;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  select estado into v_estado
    from follow_ups
   where id = p_id and deleted_at is null
   for update;

  if not found then
    raise exception 'seguimiento no encontrado';
  end if;

  if p_estado = 'completado' then
    raise exception 'para completar un seguimiento usa completar_follow_up (exige resultado)';
  end if;

  -- Reabrir un cancelado chocaría con el índice único de "un solo pendiente
  -- por lead": mejor un mensaje claro que un error de constraint.
  if p_estado = 'pendiente' and v_estado <> 'pendiente' and exists (
    select 1 from follow_ups o
     where o.lead_id = (select lead_id from follow_ups where id = p_id)
       and o.estado = 'pendiente' and o.deleted_at is null and o.id <> p_id
  ) then
    raise exception 'el lead ya tiene un seguimiento pendiente';
  end if;

  update follow_ups set
    fecha_programada     = coalesce(p_fecha, fecha_programada),
    hora                 = case when p_limpiar_hora then null
                                else coalesce(p_hora, hora) end,
    tipo                 = coalesce(p_tipo, tipo),
    estado               = coalesce(p_estado, estado),
    prioridad            = coalesce(nullif(p_prioridad, ''), prioridad),
    responsable          = case when p_responsable is null then responsable
                                else nullif(p_responsable, '') end,
    nota                 = case when p_nota is null then nota
                                else nullif(p_nota, '') end,
    resultado_esperado   = case when p_resultado_esperado is null then resultado_esperado
                                else nullif(p_resultado_esperado, '') end,
    comentarios_internos = case when p_comentarios_internos is null then comentarios_internos
                                else nullif(p_comentarios_internos, '') end
  where id = p_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 5. RPC: programar con hora y prioridad
-- -------------------------------------------------------------
-- Nueva firma, no un reemplazo: la de 5 argumentos sigue existiendo y sigue
-- siendo la que llaman los triggers de la 0013. Postgres las distingue por
-- número de argumentos y las llamadas por nombre de PostgREST no se vuelven
-- ambiguas porque los nombres nuevos no existen en la firma vieja.
create or replace function programar_follow_up(
  p_lead_id     uuid,
  p_fecha       date,
  p_tipo        follow_up_tipo,
  p_nota        text,
  p_responsable text,
  p_hora        time,
  p_prioridad   text,
  p_resultado_esperado text
) returns uuid as $$
declare
  v_id uuid;
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  -- Se delega en la función original para no duplicar el cálculo de `orden`
  -- ni la comprobación de "un solo pendiente".
  v_id := programar_follow_up(p_lead_id, p_fecha, p_tipo, p_nota, p_responsable);

  update follow_ups
     set hora               = p_hora,
         prioridad          = nullif(p_prioridad, ''),
         resultado_esperado = nullif(p_resultado_esperado, '')
   where id = v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 6. PERMISOS — la lección de la 0014
-- -------------------------------------------------------------
revoke execute on function actualizar_follow_up(
  uuid, date, time, boolean, follow_up_tipo, follow_up_estado, text, text, text, text, text
) from anon;
revoke execute on function programar_follow_up(
  uuid, date, follow_up_tipo, text, text, time, text, text
) from anon;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
--   -- 1. Los medios nuevos existen (debe devolver 9):
--   select count(*) from pg_enum e
--     join pg_type t on t.oid = e.enumtypid where t.typname = 'follow_up_tipo';
--
--   -- 2. La agenda sigue cuadrando con los leads (debe devolver 0):
--   select count(*) from leads l
--     left join follow_ups f on f.lead_id = l.id
--      and f.estado='pendiente' and f.deleted_at is null
--    where l.deleted_at is null
--      and l.proximo_seguimiento is distinct from f.fecha_programada;
--
--   -- 3. Las columnas nuevas están en la vista (debe devolver 4):
--   select count(*) from information_schema.columns
--    where table_name = 'follow_ups_agenda'
--      and column_name in ('hora','prioridad','resultado_esperado','comentarios_internos');
-- =============================================================
