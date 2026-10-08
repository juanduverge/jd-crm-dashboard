-- =============================================================
-- 0052_radar_empresas.sql — Radar de negocios: memoria e investigacion.
--
-- Hasta ahora el Radar leia los registros mercantiles en directo y no guardaba
-- nada: cada vez que se abria la pestana se volvia a calcular todo, y lo que
-- se averiguaba de una empresa se perdia al recargar.
--
-- Esta tabla es su memoria. Guarda cada empresa candidata con lo que dice el
-- registro, lo que se dedujo gratis (actividad, dominios, nota por reglas) y
-- lo que despues averigue la investigacion con IA (webs, redes, contactos).
--
-- Quien escribe:
--   - El recolector diario (servidor de casa) y el propio CRM insertan y
--     actualizan candidatas, y las marcan `en_cola` para que se investiguen.
--   - n8n toma las `en_cola` con `radar_tomar_para_investigar`, pregunta a
--     Gemini y guarda el resultado.
--
-- El tope diario de investigaciones vive AQUI, en la base, y no en n8n ni en
-- el CRM: asi da igual cuantas veces se pulse el boton o cuantos workflows
-- corran a la vez, nunca se pasa del cupo gratis.
-- =============================================================

begin;

create table if not exists radar_empresas (
  -- Clave del registro de origen: "CT:3529167". Estable entre corridas.
  id                text primary key,
  estado            text not null,               -- CO, CT, OR… (estado de EE. UU.)
  nombre            text not null,
  tipo              text,                        -- forma legal segun el registro
  fecha_registro    date not null,
  direccion         text,
  ciudad            text,
  correo            text,
  categoria         text,                        -- actividad oficial, si el registro la da
  url_registro      text not null,

  -- Deducido sin IA.
  actividad_termino text,
  actividad_nicho   text,
  actividad_nombre  text,
  contacto_nombre   text,
  contacto_rol      text,
  dominios          jsonb,                       -- [{dominio, estado}]
  nota_reglas       int check (nota_reglas between 1 and 10),
  motivos_reglas    jsonb,

  -- Investigacion con IA.
  investigacion_estado text not null default 'sin_pedir'
    check (investigacion_estado in ('sin_pedir', 'en_cola', 'investigando', 'hecha', 'fallo')),
  investigacion     jsonb,                       -- webs, redes, contactos, cada uno con su fuente
  veredicto         text,                        -- sin_web | web_floja | tiene_web | sin_rastro
  nota_final        int check (nota_final between 1 and 10),
  investigacion_error text,
  intentos          int not null default 0,
  encolada_en       timestamptz,
  tomada_en         timestamptz,
  investigada_en    timestamptz,

  -- Se rellena al pasarla a Leads, para no ofrecerla dos veces.
  lead_id           uuid references leads(id) on delete set null,
  descartada        boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_radar_cola
  on radar_empresas (encolada_en) where investigacion_estado = 'en_cola';
create index if not exists idx_radar_lista
  on radar_empresas (coalesce(nota_final, nota_reglas) desc, fecha_registro desc)
  where lead_id is null and not descartada;
create index if not exists idx_radar_tomadas on radar_empresas (tomada_en);

comment on table radar_empresas is
  'Empresas recien registradas que el Radar considero candidatas, con lo deducido por reglas y lo investigado con IA.';

-- --- RLS ------------------------------------------------------
alter table radar_empresas enable row level security;

drop policy if exists radar_select on radar_empresas;
create policy radar_select on radar_empresas for select
  using (auth_role() in ('admin', 'vendedor', 'viewer'));

drop policy if exists radar_insert on radar_empresas;
create policy radar_insert on radar_empresas for insert
  with check (auth_role() in ('admin', 'vendedor'));

drop policy if exists radar_update on radar_empresas;
create policy radar_update on radar_empresas for update
  using (auth_role() in ('admin', 'vendedor'))
  with check (auth_role() in ('admin', 'vendedor'));

-- Sin politica de delete: las que no interesan se marcan `descartada`.

-- --- Ajustes --------------------------------------------------
-- El tope es un ajuste y no un numero en el codigo: se cambia sin migracion.
insert into settings (key, value, user_id)
select 'radar_tope_diario', '250', null
 where not exists (select 1 from settings where key = 'radar_tope_diario' and user_id is null);

-- --- Tomar trabajo para investigar ----------------------------
/**
 * Devuelve hasta `p_limite` empresas en cola y las marca `investigando`.
 *
 * Respeta el tope diario contando las que YA se tomaron hoy (no las que
 * terminaron: una busqueda que falla tambien gasto cupo). El dia se cuenta en
 * hora del Pacifico porque es cuando Google reinicia el cupo gratis.
 *
 * `skip locked`: si dos ejecuciones de n8n coinciden, no se pisan ni se
 * llevan la misma empresa.
 */
create or replace function radar_tomar_para_investigar(p_limite int default 5)
returns setof radar_empresas
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare
  v_tope   int;
  v_usadas int;
  v_cupo   int;
begin
  select coalesce(nullif(value, '')::int, 250) into v_tope
    from settings where key = 'radar_tope_diario' and user_id is null;
  v_tope := coalesce(v_tope, 250);

  select count(*) into v_usadas
    from radar_empresas
   where (tomada_en at time zone 'America/Los_Angeles')::date
       = (now()     at time zone 'America/Los_Angeles')::date;

  v_cupo := least(greatest(p_limite, 0), v_tope - v_usadas);
  if v_cupo <= 0 then return; end if;

  return query
  update radar_empresas r
     set investigacion_estado = 'investigando',
         tomada_en = now(),
         intentos = r.intentos + 1,
         updated_at = now()
   where r.id in (
     select c.id from radar_empresas c
      where c.investigacion_estado = 'en_cola'
      order by coalesce(c.nota_reglas, 0) desc, c.encolada_en asc
      limit v_cupo
      for update skip locked
   )
  returning r.*;
end $fn$;

-- Solo n8n (service_role) toma trabajo: desde el navegador se encola, no se toma.
revoke all on function radar_tomar_para_investigar(int) from public, anon, authenticated;
grant execute on function radar_tomar_para_investigar(int) to service_role;

/**
 * Cuanto cupo queda hoy. Lo lee el CRM para avisar antes de encolar de mas.
 */
create or replace function radar_cupo_hoy()
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $fn$
  select jsonb_build_object(
    'tope', coalesce((select nullif(value, '')::int from settings
                       where key = 'radar_tope_diario' and user_id is null), 250),
    'usadas', (select count(*) from radar_empresas
                where (tomada_en at time zone 'America/Los_Angeles')::date
                    = (now()     at time zone 'America/Los_Angeles')::date),
    'en_cola', (select count(*) from radar_empresas where investigacion_estado = 'en_cola')
  );
$fn$;

revoke all on function radar_cupo_hoy() from public, anon;
grant execute on function radar_cupo_hoy() to authenticated, service_role;

/**
 * Las que se quedaron `investigando` (n8n se cayo a media busqueda) vuelven a
 * la cola pasados 15 minutos, hasta tres intentos. Sin esto se quedarian
 * colgadas para siempre.
 */
create or replace function radar_recuperar_colgadas()
returns int
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare v_n int;
begin
  update radar_empresas
     set investigacion_estado = case when intentos >= 3 then 'fallo' else 'en_cola' end,
         investigacion_error  = case when intentos >= 3 then 'tres intentos sin respuesta' else investigacion_error end,
         updated_at = now()
   where investigacion_estado = 'investigando'
     and tomada_en < now() - interval '15 minutes';
  get diagnostics v_n = row_count;
  return v_n;
end $fn$;

revoke all on function radar_recuperar_colgadas() from public, anon, authenticated;
grant execute on function radar_recuperar_colgadas() to service_role;

commit;

-- --- Como comprobar que quedo bien ----------------------------
--   select radar_cupo_hoy();
--     -> {"tope": 250, "usadas": 0, "en_cola": 0}
--
--   insert into radar_empresas (id, estado, nombre, fecha_registro, url_registro, investigacion_estado, encolada_en)
--   values ('TEST:1', 'CT', 'Empresa de prueba LLC', current_date, 'https://example.com/1', 'en_cola', now());
--   select id, investigacion_estado from radar_tomar_para_investigar(5);   -- como service_role
--     -> TEST:1 | investigando
--   delete from radar_empresas where id = 'TEST:1';
