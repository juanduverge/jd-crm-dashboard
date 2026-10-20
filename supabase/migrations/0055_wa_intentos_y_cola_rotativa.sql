-- =============================================================
-- 0055_wa_intentos_y_cola_rotativa.sql
--
-- EL PROBLEMA (20-oct-2026): 63 leads con correos listos llevan semanas en
-- «Espera verificar WhatsApp». No es que estén verificados: el verificador
-- devuelve `sin_verificar` (WhatsApp no sincronizó el contacto), que no sella
-- fecha. Con el orden `verificado_en nulls first, created_at desc` los mismos
-- 20 leads más nuevos se repiten pasada tras pasada y tapan al resto, y nadie
-- puede ver cuántas veces se intentó cada uno.
--
-- LA CORRECCIÓN, en dos partes:
--   1. `whatsapp_intentos` y `whatsapp_ultimo_intento`: cada pasada, con o sin
--      veredicto, deja constancia. Sirve a la pantalla («Sin resultado tras N
--      intentos, último hace X días») y a la cola.
--   2. La cola ordena por último intento: los nunca intentados primero, luego
--      los intentados hace más tiempo. Rota en vez de repetir los mismos.
--
-- Esto NO convierte los intentos fallidos en un «no tiene WhatsApp»: ese
-- veredicto sigue exigiendo sincronización confirmada. Ver 0035.
-- =============================================================

begin;

alter table leads
  add column if not exists whatsapp_intentos        int not null default 0,
  add column if not exists whatsapp_ultimo_intento  timestamptz;

comment on column leads.whatsapp_intentos is
  'Veces que el verificador de WhatsApp ha pasado por este lead, con o sin veredicto.';
comment on column leads.whatsapp_ultimo_intento is
  'Última pasada del verificador por este lead. No es `whatsapp_verificado_en`: ese sólo se sella con veredicto.';

create index if not exists leads_cola_wa_intento_idx
  on leads (whatsapp_verificado_en asc nulls first, whatsapp_ultimo_intento asc nulls first, created_at desc)
  where deleted_at is null;

-- --- Cola rotativa (cuerpo de la 0036 + orden por último intento) ---
create or replace function leads_para_verificar_wa(
  p_limite    int default 60,
  p_reintento interval default '180 days'
) returns table (id uuid, empresa text, telefonos text[]) as $$
  select l.id, l.empresa, t.telefonos
    from leads l
    cross join lateral (
      select array_agg(distinct x) as telefonos
        from unnest(
               coalesce(l.telefonos, '{}'::text[])
               || array_remove(array[l.telefono, l.telefono_2], null)
             ) x
       where wa_digitos(x) is not null
         and length(wa_digitos(x)) between 7 and 15
    ) t
   where l.deleted_at is null
     and coalesce(array_length(t.telefonos, 1), 0) > 0
     and (l.whatsapp_verificado_en is null
          or l.whatsapp_verificado_en < now() - p_reintento)
   order by l.whatsapp_verificado_en asc nulls first,
            l.whatsapp_ultimo_intento asc nulls first,
            l.created_at desc
   limit greatest(1, least(p_limite, 500));
$$ language sql stable security definer set search_path = public, pg_temp;

revoke all on function leads_para_verificar_wa(int, interval) from public, anon, authenticated;
grant execute on function leads_para_verificar_wa(int, interval) to service_role;


comment on function leads_para_verificar_wa(int, interval) is
  'Siguiente lote a comprobar. Los nunca verificados primero: eso cubre tanto '
  'los leads nuevos de Apify como el repaso del histórico.';

-- --- 4. Escribir el resultado ----------------------------------
-- p_resultados: [{"numero":"+18095550000","tiene":true}, …]
-- Sólo cuentan los que traen `tiene` explícito. Un número ausente de la lista
-- no es un «no»: es un número del que no se sabe nada.
create or replace function registrar_whatsapp(
  p_id         uuid,
  p_resultados jsonb default '[]'::jsonb,
  p_fuente     text default 'wa_probe'
) returns jsonb as $$
declare
  l             leads%rowtype;
  v_con_wa      text[] := '{}';
  v_comprobados int := 0;
  v_estado      text;
  v_relleno     boolean := false;
begin
  select * into l from leads where id = p_id and deleted_at is null;
  if not found then
    raise exception 'registrar_whatsapp: lead % no existe o está en la papelera', p_id;
  end if;

  -- Los que la comprobación dice que SÍ tienen WhatsApp, y cuántos números
  -- traían veredicto (los que no lo traen no cuentan como comprobados).
  select
    coalesce(array_agg(distinct btrim(r ->> 'numero'))
             filter (where (r ->> 'tiene')::boolean is true), '{}'),
    count(*) filter (where (r ->> 'tiene') is not null)
    into v_con_wa, v_comprobados
    from jsonb_array_elements(coalesce(p_resultados, '[]'::jsonb)) r
   where jsonb_typeof(r) = 'object'
     and nullif(btrim(coalesce(r ->> 'numero', '')), '') is not null;

  -- ---- El caso que protege los datos --------------------------
  -- Cero números con veredicto = la comprobación no llegó a hacerse. No se
  -- concluye nada, no se sella la fecha, y el lead vuelve a la cola.
  if v_comprobados = 0 then
    update leads x
       set whatsapp_estado = 'sin_verificar',
           whatsapp_intentos = x.whatsapp_intentos + 1,
           whatsapp_ultimo_intento = now(),
           updated_at = now()
     where x.id = p_id
       -- Un fallo no degrada un 'confirmado' anterior.
       and coalesce(x.whatsapp_estado, '') <> 'confirmado';

    return jsonb_build_object(
      'lead_id', p_id,
      'estado', 'sin_verificar',
      'comprobados', 0,
      'nota', 'lote sin resultados: no se concluye nada y se reintentará');
  end if;

  v_estado := case when cardinality(v_con_wa) > 0 then 'confirmado' else 'no_aparece' end;

  -- ¿Vamos a rellenar un `whatsapp` que estaba vacío? Sólo entonces se toca
  -- `whatsapp_source`: un WhatsApp publicado por la empresa en su web o
  -- puesto a mano manda sobre lo que diga la comprobación.
  v_relleno := (l.whatsapp is null or btrim(l.whatsapp) = '')
               and cardinality(v_con_wa) > 0;

  update leads x set
    whatsapp = coalesce(nullif(btrim(coalesce(x.whatsapp, '')), ''), v_con_wa[1]),
    -- Unión con lo que ya hubiera: dos pasadas parciales suman, no se pisan.
    whatsapp_numeros = (
      select array_agg(distinct n)
        from unnest(coalesce(x.whatsapp_numeros, '{}'::text[]) || v_con_wa) n
    ),
    whatsapp_source        = case when v_relleno then p_fuente else x.whatsapp_source end,
    whatsapp_estado        = v_estado,
    whatsapp_verificado_en = now(),
    whatsapp_intentos      = x.whatsapp_intentos + 1,
    whatsapp_ultimo_intento = now(),
    updated_at             = now()
  where x.id = p_id;

  return jsonb_build_object(
    'lead_id',          p_id,
    'estado',           v_estado,
    'comprobados',      v_comprobados,
    'con_whatsapp',     to_jsonb(v_con_wa),
    'relleno_whatsapp', v_relleno);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke all on function registrar_whatsapp(uuid, jsonb, text) from public, anon;
grant execute on function registrar_whatsapp(uuid, jsonb, text) to authenticated, service_role;

commit;
