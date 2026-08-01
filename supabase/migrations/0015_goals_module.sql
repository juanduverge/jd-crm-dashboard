-- =============================================================
-- 0015_goals_module.sql — Módulo Tareas: metas en cascada + horario
--
-- Convierte la sección "Tareas" (hoy una lista plana sobre `tasks`) en un
-- motor de metas numéricas con progreso, en cascada mes -> semana -> día,
-- más una plantilla de horario diario que puede alimentar esas metas.
--
-- PRINCIPIO: 100% ADITIVA. No borra ni renombra nada. `tasks` sigue igual
-- (sólo se le añaden dos columnas opcionales), el módulo Seguimientos
-- (follow_ups, 0013/0014) no se toca, y ninguna política RLS existente
-- se modifica.
--
-- Decisiones de diseño:
--
-- 1. `valor_actual` de una meta CON hijas es SIEMPRE la suma de sus hijas,
--    garantizado por trigger (no por la UI). El avance se registra una sola
--    vez, en la meta diaria, y sube solo. Una meta sin hijas (una mensual
--    tipo toggle, una semanal suelta) mantiene su valor propio.
--
-- 2. El reparto mes -> semana NO es "target ÷ 4". Se reparte proporcional a
--    los DÍAS LABORABLES de cada tramo, porque la primera y la última semana
--    del mes casi nunca están completas. Con semanas completas el resultado
--    es idéntico a dividir en partes iguales; con semanas partidas es el
--    reparto correcto. El reparto es iterativo (share = restante / tramos
--    restantes), así que la suma de las hijas cuadra EXACTA con el target
--    de la madre, sin residuos por redondeo.
--
-- 3. Editar a mano una meta semanal recalcula sus días (redistribuir_hijos);
--    editar una diaria no toca nada hacia arriba. El ajuste fino vive abajo.
--
-- 4. Un bloque de horario apunta a la meta MENSUAL (la familia estable), no
--    a la meta diaria concreta — un bloque es una plantilla recurrente y la
--    meta diaria cambia cada día. Al completarlo, `completar_bloque` resuelve
--    la meta diaria de esa fecha dentro de esa familia y le suma el aporte.
--    La completación queda registrada con la meta y el aporte aplicados, para
--    poder deshacerla exactamente.
--
-- 5. Las metas se comparten en el equipo con el mismo patrón RLS que el resto
--    del CRM (admin/vendedor escriben, viewer lee). `responsable` es texto
--    libre, igual que en leads/tasks/follow_ups.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. ENUMS
-- -------------------------------------------------------------
do $$ begin
  create type goal_periodo as enum ('mes','semana','dia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type goal_tipo as enum ('contador','toggle');
exception when duplicate_object then null; end $$;

-- -------------------------------------------------------------
-- 2. TABLA goals
-- -------------------------------------------------------------
create table if not exists goals (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null,
  periodo       goal_periodo not null,
  parent_id     uuid references goals(id) on delete cascade,
  tipo          goal_tipo not null default 'contador',
  target        numeric(12,2) not null default 1,
  valor_actual  numeric(12,2) not null default 0,
  unidad        text,
  fecha_inicio  date not null,
  fecha_fin     date not null,
  responsable   text,
  orden         int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  constraint ck_goal_rango  check (fecha_fin >= fecha_inicio),
  constraint ck_goal_target check (target > 0),
  constraint ck_goal_valor  check (valor_actual >= 0),
  -- Un toggle es sí/no: target 1, valor 0 ó 1.
  constraint ck_goal_toggle check (
    tipo <> 'toggle' or (target = 1 and valor_actual in (0,1))
  ),
  -- Una meta mensual es siempre raíz. Semanales y diarias pueden colgar de
  -- una madre o existir sueltas (meta puntual de una semana concreta).
  constraint ck_goal_raiz check (periodo <> 'mes' or parent_id is null)
);

create index if not exists idx_goals_periodo
  on goals (periodo, fecha_inicio) where deleted_at is null;
create index if not exists idx_goals_parent
  on goals (parent_id) where deleted_at is null;
create index if not exists idx_goals_dia
  on goals (fecha_inicio) where periodo = 'dia' and deleted_at is null;

-- -------------------------------------------------------------
-- 3. TABLA horario_bloques (plantilla de horario diario)
-- -------------------------------------------------------------
create table if not exists horario_bloques (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  hora_inicio  time not null,
  hora_fin     time not null,
  -- ISO dow: 1 = lunes ... 7 = domingo
  dias_semana  smallint[] not null default '{1,2,3,4,5}',
  goal_id      uuid references goals(id) on delete set null,
  -- Cuánto suma a la meta diaria al marcar el bloque como completado.
  aporte       numeric(12,2) not null default 1,
  orden        int not null default 0,
  activo       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,

  constraint ck_bloque_horas check (hora_fin > hora_inicio),
  constraint ck_bloque_aporte check (aporte >= 0),
  constraint ck_bloque_dias check (
    array_length(dias_semana, 1) between 1 and 7
    and dias_semana <@ array[1,2,3,4,5,6,7]::smallint[]
  )
);

create index if not exists idx_horario_bloques_orden
  on horario_bloques (hora_inicio, orden) where deleted_at is null and activo;

-- Completaciones: una fila por bloque y día.
create table if not exists horario_completions (
  id                uuid primary key default gen_random_uuid(),
  bloque_id         uuid not null references horario_bloques(id) on delete cascade,
  fecha             date not null,
  -- Meta y aporte realmente aplicados, para deshacer exacto aunque el bloque
  -- cambie de meta o de aporte después.
  goal_aplicado_id  uuid references goals(id) on delete set null,
  aporte_aplicado   numeric(12,2) not null default 0,
  created_at        timestamptz not null default now(),

  constraint uq_horario_completion unique (bloque_id, fecha)
);

create index if not exists idx_horario_completions_fecha
  on horario_completions (fecha);

-- -------------------------------------------------------------
-- 4. COLUMNAS ADITIVAS EN tasks
-- -------------------------------------------------------------
-- `seccion` cubre el prioritaria/secundaria/idea del tablero. NO se toca la
-- escala de `prioridad` (baja/media/alta/urgente), que ya usa el resto del
-- CRM y tiene datos vivos.
alter table tasks
  add column if not exists seccion text not null default 'prioritaria',
  add column if not exists goal_id uuid references goals(id) on delete set null;

do $$ begin
  alter table tasks add constraint ck_tasks_seccion
    check (seccion in ('prioritaria','secundaria','idea'));
exception when duplicate_object then null; end $$;

create index if not exists idx_tasks_seccion
  on tasks (seccion, estado) where deleted_at is null;

-- -------------------------------------------------------------
-- 5. TRIGGERS — invariantes de la cascada
-- -------------------------------------------------------------

-- 5.1 Coherencia de la jerarquía: una diaria cuelga de una semanal, una
--     semanal de una mensual, y la hija cae dentro del rango de la madre.
create or replace function goal_check_jerarquia() returns trigger as $$
declare m goals;
begin
  if new.parent_id is null then return new; end if;
  if new.parent_id = new.id then
    raise exception 'una meta no puede ser madre de sí misma';
  end if;

  select * into m from goals where id = new.parent_id;
  if not found then raise exception 'la meta madre no existe'; end if;

  if not ((new.periodo = 'dia' and m.periodo = 'semana')
       or (new.periodo = 'semana' and m.periodo = 'mes')) then
    raise exception 'jerarquía inválida: % no puede colgar de %', new.periodo, m.periodo;
  end if;

  if new.fecha_inicio < m.fecha_inicio or new.fecha_fin > m.fecha_fin then
    raise exception 'la meta hija (% a %) se sale del rango de su madre (% a %)',
      new.fecha_inicio, new.fecha_fin, m.fecha_inicio, m.fecha_fin;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_goals_jerarquia on goals;
create trigger trg_goals_jerarquia
  before insert or update of parent_id, periodo, fecha_inicio, fecha_fin on goals
  for each row execute function goal_check_jerarquia();

-- 5.2 Guardia de valor: si la meta tiene hijas activas, su valor NO se edita
--     a mano — es la suma de las hijas, siempre.
create or replace function goal_valor_guard() returns trigger as $$
declare v_suma numeric;
begin
  new.updated_at := now();

  select sum(valor_actual) into v_suma
  from goals where parent_id = new.id and deleted_at is null;

  if v_suma is not null then
    new.valor_actual := v_suma;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_goals_valor_guard on goals;
create trigger trg_goals_valor_guard
  before update on goals
  for each row execute function goal_valor_guard();

-- 5.3 Rollup: cualquier cambio de valor en una hija reescribe el de la madre.
--     Como la madre es a su vez hija, el efecto sube solo hasta la mensual
--     (cadena de 3 niveles, termina siempre).
create or replace function goal_rollup() returns trigger as $$
declare v_parent uuid;
begin
  -- Ojo: en un DELETE la variable NEW no está asignada (y en un INSERT lo que
  -- no está es OLD), así que hay que ramificar por TG_OP en vez de hacer
  -- coalesce sobre los registros.
  if tg_op = 'DELETE' then
    v_parent := old.parent_id;
  else
    v_parent := new.parent_id;
  end if;

  if v_parent is not null then
    update goals p
       set valor_actual = coalesce(
             (select sum(c.valor_actual) from goals c
               where c.parent_id = p.id and c.deleted_at is null), 0)
     where p.id = v_parent;
  end if;

  -- Si una meta cambió de madre, la anterior también hay que recalcularla.
  if tg_op = 'UPDATE' and old.parent_id is not null
     and old.parent_id is distinct from new.parent_id then
    update goals p
       set valor_actual = coalesce(
             (select sum(c.valor_actual) from goals c
               where c.parent_id = p.id and c.deleted_at is null), 0)
     where p.id = old.parent_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_goals_rollup_ins on goals;
create trigger trg_goals_rollup_ins
  after insert on goals
  for each row execute function goal_rollup();

drop trigger if exists trg_goals_rollup_upd on goals;
create trigger trg_goals_rollup_upd
  after update on goals
  for each row
  when (old.valor_actual is distinct from new.valor_actual
     or old.deleted_at is distinct from new.deleted_at
     or old.parent_id is distinct from new.parent_id)
  execute function goal_rollup();

drop trigger if exists trg_goals_rollup_del on goals;
create trigger trg_goals_rollup_del
  after delete on goals
  for each row execute function goal_rollup();

-- 5.4 updated_at del horario
create or replace function horario_touch() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_horario_bloques_touch on horario_bloques;
create trigger trg_horario_bloques_touch
  before update on horario_bloques
  for each row execute function horario_touch();

-- -------------------------------------------------------------
-- 6. RPCs — cascada y avance
-- -------------------------------------------------------------

-- 6.1 Genera (o regenera) las metas diarias de una semana, repartiendo el
--     target de la semana entre sus días laborables.
create or replace function generar_dias_de_semana(
  p_semana_id uuid,
  p_dias smallint[] default '{1,2,3,4,5}'
) returns int as $$
declare
  s goals;
  d date;
  v_restante numeric;
  v_pendientes int;
  v_share numeric;
  v_creadas int := 0;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select * into s from goals where id = p_semana_id and deleted_at is null;
  if not found then raise exception 'meta semanal no encontrada'; end if;
  if s.periodo <> 'semana' then raise exception 'sólo se generan días desde una meta semanal'; end if;
  if s.tipo = 'toggle' then return 0; end if;

  select count(*) into v_pendientes
  from generate_series(s.fecha_inicio, s.fecha_fin, '1 day'::interval) g
  where extract(isodow from g)::smallint = any(p_dias);

  if v_pendientes = 0 then return 0; end if;

  v_restante := s.target;

  for d in
    select g::date from generate_series(s.fecha_inicio, s.fecha_fin, '1 day'::interval) g
    where extract(isodow from g)::smallint = any(p_dias)
    order by 1
  loop
    v_share := round(v_restante / v_pendientes, 2);
    if v_share <= 0 then v_share := 0.01; end if;

    insert into goals (nombre, periodo, parent_id, tipo, target, unidad,
                       fecha_inicio, fecha_fin, responsable, orden)
    values (s.nombre, 'dia', s.id, 'contador', v_share, s.unidad,
            d, d, s.responsable, s.orden);

    v_restante   := v_restante - v_share;
    v_pendientes := v_pendientes - 1;
    v_creadas    := v_creadas + 1;
  end loop;

  return v_creadas;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 6.2 Cascada completa desde una meta mensual: crea semanas + días.
create or replace function generar_cascada_goal(
  p_goal_id uuid,
  p_dias smallint[] default '{1,2,3,4,5}'
) returns int as $$
declare
  g goals;
  w record;
  v_restante numeric;
  v_pendientes int;
  v_share numeric;
  v_sem_id uuid;
  v_creadas int := 0;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select * into g from goals where id = p_goal_id and deleted_at is null;
  if not found then raise exception 'meta no encontrada'; end if;
  if g.periodo <> 'mes' then raise exception 'la cascada se genera desde una meta mensual'; end if;
  if g.tipo = 'toggle' then return 0; end if;
  if exists (select 1 from goals where parent_id = g.id and deleted_at is null) then
    raise exception 'la meta ya tiene metas semanales; usa redistribuir_hijos()';
  end if;

  -- Tramos = semanas ISO (lunes a domingo) recortadas al mes, descartando
  -- las que no contienen ningún día laborable.
  select count(*) into v_pendientes
  from generate_series(date_trunc('week', g.fecha_inicio)::date, g.fecha_fin, '7 days'::interval) s
  where exists (
    select 1 from generate_series(
      greatest(s::date, g.fecha_inicio), least(s::date + 6, g.fecha_fin), '1 day'::interval) d
    where extract(isodow from d)::smallint = any(p_dias)
  );

  if v_pendientes = 0 then return 0; end if;

  v_restante := g.target;

  for w in
    select greatest(s::date, g.fecha_inicio) as ini,
           least(s::date + 6, g.fecha_fin)   as fin
    from generate_series(date_trunc('week', g.fecha_inicio)::date, g.fecha_fin, '7 days'::interval) s
    where exists (
      select 1 from generate_series(
        greatest(s::date, g.fecha_inicio), least(s::date + 6, g.fecha_fin), '1 day'::interval) d
      where extract(isodow from d)::smallint = any(p_dias)
    )
    order by 1
  loop
    v_share := round(v_restante / v_pendientes, 2);
    if v_share <= 0 then v_share := 0.01; end if;

    insert into goals (nombre, periodo, parent_id, tipo, target, unidad,
                       fecha_inicio, fecha_fin, responsable, orden)
    values (g.nombre, 'semana', g.id, 'contador', v_share, g.unidad,
            w.ini, w.fin, g.responsable, g.orden)
    returning id into v_sem_id;

    perform generar_dias_de_semana(v_sem_id, p_dias);

    v_restante   := v_restante - v_share;
    v_pendientes := v_pendientes - 1;
    v_creadas    := v_creadas + 1;
  end loop;

  return v_creadas;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 6.3 Redistribuye el target de una meta entre sus hijas EXISTENTES, sin
--     borrarlas ni tocar su progreso. Si la hija es semanal, baja también a
--     sus días. Es lo que se llama tras editar un target a mano.
create or replace function redistribuir_hijos(p_goal_id uuid) returns int as $$
declare
  g goals;
  c goals;
  v_restante numeric;
  v_pendientes int;
  v_share numeric;
  v_tocadas int := 0;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select * into g from goals where id = p_goal_id and deleted_at is null;
  if not found then raise exception 'meta no encontrada'; end if;

  select count(*) into v_pendientes
  from goals where parent_id = g.id and deleted_at is null;
  if v_pendientes = 0 then return 0; end if;

  v_restante := g.target;

  for c in
    select * from goals where parent_id = g.id and deleted_at is null order by fecha_inicio
  loop
    v_share := round(v_restante / v_pendientes, 2);
    if v_share <= 0 then v_share := 0.01; end if;

    update goals set target = v_share where id = c.id;

    if c.periodo = 'semana' then
      perform redistribuir_hijos(c.id);
    end if;

    v_restante   := v_restante - v_share;
    v_pendientes := v_pendientes - 1;
    v_tocadas    := v_tocadas + 1;
  end loop;

  return v_tocadas;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 6.4 Registra avance. Sólo sobre metas HOJA: si tiene hijas, el valor es la
--     suma de ellas y hay que registrar abajo.
create or replace function registrar_avance(p_goal_id uuid, p_delta numeric)
returns numeric as $$
declare
  g goals;
  v_nuevo numeric;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select * into g from goals where id = p_goal_id and deleted_at is null;
  if not found then raise exception 'meta no encontrada'; end if;

  if exists (select 1 from goals where parent_id = g.id and deleted_at is null) then
    raise exception 'esta meta suma desde sus metas hijas; registra el avance en el nivel de abajo';
  end if;

  if g.tipo = 'toggle' then
    v_nuevo := case when p_delta > 0 then 1 else 0 end;
  else
    v_nuevo := greatest(g.valor_actual + p_delta, 0);
  end if;

  update goals set valor_actual = v_nuevo where id = g.id;
  return v_nuevo;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 6.5 Crear meta mensual + cascada en una sola transacción.
create or replace function crear_meta_mensual(
  p_nombre text,
  p_tipo goal_tipo,
  p_target numeric,
  p_unidad text,
  p_mes date,                                  -- cualquier día del mes
  p_generar_cascada boolean default true,
  p_dias smallint[] default '{1,2,3,4,5}',
  p_responsable text default null
) returns uuid as $$
declare
  v_id uuid;
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  insert into goals (nombre, periodo, tipo, target, unidad, fecha_inicio, fecha_fin, responsable)
  values (p_nombre, 'mes', p_tipo,
          case when p_tipo = 'toggle' then 1 else p_target end,
          p_unidad, v_ini, v_fin, p_responsable)
  returning id into v_id;

  if p_generar_cascada and p_tipo = 'contador' then
    perform generar_cascada_goal(v_id, p_dias);
  end if;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 7. RPCs — horario
-- -------------------------------------------------------------

-- Resuelve la meta DIARIA de una fecha dentro de la familia de una meta
-- (que normalmente es la mensual a la que apunta el bloque).
create or replace function goal_dia_de_familia(p_goal_id uuid, p_fecha date)
returns uuid as $$
declare v_id uuid;
begin
  select d.id into v_id
  from goals d
  where d.periodo = 'dia'
    and d.deleted_at is null
    and d.fecha_inicio = p_fecha
    and (
      d.id = p_goal_id
      or d.parent_id = p_goal_id
      or d.parent_id in (select s.id from goals s where s.parent_id = p_goal_id)
    )
  limit 1;
  return v_id;
end;
$$ language plpgsql stable security definer set search_path = public, pg_temp;

create or replace function completar_bloque(p_bloque_id uuid, p_fecha date)
returns uuid as $$
declare
  b horario_bloques;
  v_goal_dia uuid;
  v_id uuid;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select * into b from horario_bloques where id = p_bloque_id and deleted_at is null;
  if not found then raise exception 'bloque no encontrado'; end if;

  if exists (select 1 from horario_completions where bloque_id = p_bloque_id and fecha = p_fecha) then
    return null;  -- ya estaba completado: idempotente
  end if;

  if b.goal_id is not null and b.aporte > 0 then
    v_goal_dia := goal_dia_de_familia(b.goal_id, p_fecha);
    if v_goal_dia is not null then
      perform registrar_avance(v_goal_dia, b.aporte);
    end if;
  end if;

  insert into horario_completions (bloque_id, fecha, goal_aplicado_id, aporte_aplicado)
  values (p_bloque_id, p_fecha, v_goal_dia,
          case when v_goal_dia is null then 0 else b.aporte end)
  returning id into v_id;

  return v_id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function descompletar_bloque(p_bloque_id uuid, p_fecha date)
returns void as $$
declare c horario_completions;
begin
  if auth_role() not in ('admin','vendedor') then raise exception 'no autorizado'; end if;

  select * into c from horario_completions where bloque_id = p_bloque_id and fecha = p_fecha;
  if not found then return; end if;

  if c.goal_aplicado_id is not null and c.aporte_aplicado > 0 then
    perform registrar_avance(c.goal_aplicado_id, -c.aporte_aplicado);
  end if;

  delete from horario_completions where id = c.id;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- -------------------------------------------------------------
-- 8. RLS — mismo patrón que 0002_rls.sql / 0013
-- -------------------------------------------------------------
alter table goals               enable row level security;
alter table horario_bloques     enable row level security;
alter table horario_completions enable row level security;

drop policy if exists "goals_select" on goals;
create policy "goals_select" on goals for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));

drop policy if exists "goals_insert" on goals;
create policy "goals_insert" on goals for insert
  with check (auth_role() in ('admin','vendedor'));

drop policy if exists "goals_update" on goals;
create policy "goals_update" on goals for update
  using (auth_role() in ('admin','vendedor')) with check (auth_role() in ('admin','vendedor'));

drop policy if exists "goals_delete" on goals;
create policy "goals_delete" on goals for delete
  using (auth_role() = 'admin' and deleted_at is not null);

drop policy if exists "horario_bloques_select" on horario_bloques;
create policy "horario_bloques_select" on horario_bloques for select
  using (auth_role() in ('admin','vendedor','viewer') and (deleted_at is null or auth_role() = 'admin'));

drop policy if exists "horario_bloques_insert" on horario_bloques;
create policy "horario_bloques_insert" on horario_bloques for insert
  with check (auth_role() in ('admin','vendedor'));

drop policy if exists "horario_bloques_update" on horario_bloques;
create policy "horario_bloques_update" on horario_bloques for update
  using (auth_role() in ('admin','vendedor')) with check (auth_role() in ('admin','vendedor'));

drop policy if exists "horario_bloques_delete" on horario_bloques;
create policy "horario_bloques_delete" on horario_bloques for delete
  using (auth_role() = 'admin' and deleted_at is not null);

drop policy if exists "horario_completions_select" on horario_completions;
create policy "horario_completions_select" on horario_completions for select
  using (auth_role() in ('admin','vendedor','viewer'));

-- Insert/delete de completions van SIEMPRE por los RPCs (que ajustan la meta
-- diaria); no se abren al cliente para que el contador no se desincronice.

-- -------------------------------------------------------------
-- 9. Endurecimiento (lo que la 0014 tuvo que arreglar a posteriori)
-- -------------------------------------------------------------
-- Las funciones de trigger no se publican en /rest/v1/rpc/.
revoke execute on function goal_check_jerarquia() from anon, authenticated;
revoke execute on function goal_valor_guard()     from anon, authenticated;
revoke execute on function goal_rollup()          from anon, authenticated;
revoke execute on function horario_touch()        from anon, authenticated;

-- Los RPCs del módulo no se llaman sin sesión.
revoke execute on function generar_dias_de_semana(uuid, smallint[])                                  from anon;
revoke execute on function generar_cascada_goal(uuid, smallint[])                                    from anon;
revoke execute on function redistribuir_hijos(uuid)                                                  from anon;
revoke execute on function registrar_avance(uuid, numeric)                                           from anon;
revoke execute on function crear_meta_mensual(text, goal_tipo, numeric, text, date, boolean, smallint[], text) from anon;
revoke execute on function goal_dia_de_familia(uuid, date)                                           from anon;
revoke execute on function completar_bloque(uuid, date)                                              from anon;
revoke execute on function descompletar_bloque(uuid, date)                                           from anon;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Crear una meta de prueba y comprobar que la cascada cuadra exacta:
--
--   select crear_meta_mensual('Prueba leads','contador',400,'leads',current_date);
--
--   select m.nombre, m.target as target_mes,
--          (select sum(target) from goals s where s.parent_id = m.id and s.deleted_at is null) as suma_semanas,
--          (select sum(d.target) from goals s
--             join goals d on d.parent_id = s.id and d.deleted_at is null
--            where s.parent_id = m.id and s.deleted_at is null) as suma_dias
--     from goals m where m.periodo = 'mes' and m.deleted_at is null;
--   -- target_mes = suma_semanas = suma_dias
--
-- 2) Registrar avance en un día y ver cómo sube:
--
--   select registrar_avance((select id from goals where periodo='dia' order by fecha_inicio limit 1), 5);
--   select periodo, valor_actual from goals where deleted_at is null order by periodo;
--   -- el 5 debe aparecer en el día, en su semana y en el mes
--
-- 3) Limpiar la prueba:
--   delete from goals where nombre = 'Prueba leads' and periodo = 'mes';
-- =============================================================
