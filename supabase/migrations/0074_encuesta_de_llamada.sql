-- 0074 · Encuesta al terminar cada llamada
--
-- Juan pidió (20-nov) que al colgar el CRM pregunte cómo fue la llamada:
-- cómo se sintió, cuánto interés mostró el cliente, qué tipo de proyecto era,
-- qué estrategia usó, quién atendió y qué objeción salió. Las llamadas son
-- conversación libre (no hay plantilla como en los mensajes), así que estos
-- datos son lo único que permite ver qué funciona.
--
-- Columnas propias en vez de un jsonb: el análisis agrupa por cada una
-- («tasa de interesados por estrategia») y así se indexa y se lee directo.
-- Las listas de opciones viven en la interfaz y pueden crecer sin migración;
-- solo `animo` e `interes` tienen escala fija y se validan aquí.
--
-- Todo es opcional: las 14 llamadas anteriores quedan sin encuesta y las
-- métricas existentes (resultado, detalle) no cambian.

begin;

alter table follow_ups
  add column if not exists animo         smallint,
  add column if not exists interes       text,
  add column if not exists tipo_proyecto text,
  add column if not exists estrategia    text,
  add column if not exists atendio       text,
  add column if not exists objecion      text,
  add column if not exists aprendizaje   text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_follow_up_animo') then
    alter table follow_ups
      add constraint ck_follow_up_animo check (animo is null or animo between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_follow_up_interes') then
    alter table follow_ups
      add constraint ck_follow_up_interes check (interes is null or interes in ('frio', 'tibio', 'caliente'));
  end if;
end $$;

-- ---------------------------------------------------------------
-- guardar_encuesta_llamada
-- Va aparte de registrar_contacto para no cambiar su firma (la usan la ficha
-- y el MCP). Se llama justo después, con el id que devolvió.
-- ---------------------------------------------------------------
create or replace function guardar_encuesta_llamada(
  p_id            uuid,
  p_animo         smallint default null,
  p_interes       text     default null,
  p_tipo_proyecto text     default null,
  p_estrategia    text     default null,
  p_atendio       text     default null,
  p_objecion      text     default null,
  p_aprendizaje   text     default null
) returns void as $$
begin
  if auth_role() not in ('admin','vendedor') then
    raise exception 'no autorizado';
  end if;

  update follow_ups
     set animo         = p_animo,
         interes       = nullif(p_interes, ''),
         tipo_proyecto = nullif(p_tipo_proyecto, ''),
         estrategia    = nullif(p_estrategia, ''),
         atendio       = nullif(p_atendio, ''),
         objecion      = nullif(p_objecion, ''),
         aprendizaje   = nullif(trim(p_aprendizaje), '')
   where id = p_id
     and tipo in ('llamada', 'llamada_whatsapp', 'videollamada')
     and deleted_at is null;

  if not found then
    raise exception 'esa llamada no existe';
  end if;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function
  guardar_encuesta_llamada(uuid, smallint, text, text, text, text, text, text)
from public, anon;

grant execute on function
  guardar_encuesta_llamada(uuid, smallint, text, text, text, text, text, text)
to authenticated, service_role;

-- El análisis de llamadas filtra siempre por canal y fecha de completado.
create index if not exists ix_follow_ups_llamadas_completadas
  on follow_ups (completed_at)
  where tipo in ('llamada', 'llamada_whatsapp', 'videollamada')
    and estado = 'completado' and deleted_at is null;

commit;
