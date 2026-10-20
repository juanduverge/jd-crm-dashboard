-- =============================================================
-- 0056_luz_verde_tras_espera_wa.sql
--
-- DECISIÓN DE JUAN (20-oct-2026): el verificador de WhatsApp no consigue dar
-- «no tiene WhatsApp» (WhatsApp no procesa los contactos que no lo usan; ver
-- 0055) y 63 correos aprobados llevaban semanas parados en «Espera verificar».
--
-- REGLA NUEVA: un correo sale si el lead NO está «confirmado» con WhatsApp y
-- lleva aprobado más de `envio_espera_wa_horas` horas (5 por defecto). El
-- verificador queda como está. `cancelar_secuencias_caducadas` (0054) sigue
-- cancelando lo no enviado si luego WhatsApp lo confirma.
--
-- RIESGO ASUMIDO: puede salir un correo a alguien que sí tiene WhatsApp pero
-- que el verificador nunca llegó a confirmar.
-- =============================================================

begin;

create or replace function tomar_correos_programados(p_tanda int default 2)
returns table (id uuid, lead_id uuid, toque smallint, destinatario text,
               remitente text, asunto text, cuerpo text)
language plpgsql security definer set search_path = public, pg_temp as $fn$
#variable_conflict use_column
declare
  v_zona  text := envio_cfg('envio_zona', 'America/New_York');
  v_local  timestamp := now() at time zone v_zona;
  v_ini    int := envio_cfg('envio_hora_inicio', '9')::int;
  v_fin    int := envio_cfg('envio_hora_fin', '17')::int;
  v_dias   int[] := string_to_array(envio_cfg('envio_dias', '1,2,3,4,5'), ',')::int[];
  v_max_h  int := envio_cfg('envio_max_hora', '5')::int;
  v_min_d  int := envio_cfg('envio_min_dia', '10')::int;
  v_max_d  int := envio_cfg('envio_max_dia', '25')::int;
  v_hora   int; v_ult_h int; v_hoy int; v_cupo int; v_horas_rest numeric;
begin
  perform cancelar_secuencias_caducadas();

  if envio_cfg('envio_auto_activo', 'false') <> 'true' then return; end if;
  if btrim(envio_cfg('direccion_fisica', '')) = '' then return; end if;
  v_hora := extract(hour from v_local);
  if not (extract(isodow from v_local)::int = any (v_dias)) or v_hora < v_ini or v_hora >= v_fin then
    return;
  end if;

  -- Cuenta todo correo enviado, venga de donde venga: el tope protege el
  -- dominio, no solo esta secuencia.
  select count(*) into v_ult_h from outreach_messages
   where status in ('enviado', 'seguimiento_enviado') and sent_at > now() - interval '60 minutes';
  select count(*) into v_hoy from outreach_messages
   where status in ('enviado', 'seguimiento_enviado')
     and (sent_at at time zone v_zona)::date = v_local::date;

  v_cupo := v_max_h - v_ult_h;
  -- Mínimo diario: si a este ritmo no se llega, se sube lo justo.
  v_horas_rest := greatest(v_fin - (v_hora + extract(minute from v_local) / 60.0), 0.25);
  if v_min_d - v_hoy > v_max_h * v_horas_rest then
    v_cupo := greatest(v_cupo, ceil((v_min_d - v_hoy) / v_horas_rest)::int - v_ult_h);
  end if;
  v_cupo := least(v_cupo, v_max_d - v_hoy, p_tanda);
  if v_cupo <= 0 then return; end if;

  return query
  with cand as (
    select o.id
      from outreach_messages o
      join leads l on l.id = o.lead_id
     where o.status = 'programado'
       and o.destinatario is not null
       and l.deleted_at is null and not l.descartado
       -- Luz verde: sin WhatsApp confirmado Y aprobado hace más de N horas
       -- (ajuste envio_espera_wa_horas, 5 por defecto). Ver cabecera.
       and (l.whatsapp_estado = 'no_aparece'
            or (coalesce(l.whatsapp_estado, '') <> 'confirmado'
                and coalesce(o.aprobado_en, o.created_at)
                    <= now() - make_interval(hours => envio_cfg('envio_espera_wa_horas', '5')::int)))
       and l.respondio_en is null
       and l.estado in ('nuevo', 'contactado', 'seguimiento')
       and not exists (select 1 from optout_emails x where lower(x.email) = lower(o.destinatario))
       and (o.toque = 1 or exists (
             select 1 from outreach_messages p
              where p.lead_id = o.lead_id and p.toque = o.toque - 1
                and p.status = 'enviado'
                and p.sent_at <= now() - case when o.toque = 2 then interval '4 days' else interval '5 days' end))
       -- un lead, un correo por día
       and not exists (select 1 from outreach_messages h
                        where h.lead_id = o.lead_id and h.status in ('enviado', 'enviando')
                          and h.sent_at > now() - interval '20 hours')
     order by o.toque desc, o.aprobado_en, o.created_at
     limit v_cupo
     for update of o skip locked
  )
  update outreach_messages o
     set status = 'enviando', sent_at = now()
    from cand where o.id = cand.id
  returning o.id, o.lead_id, o.toque, o.destinatario,
            coalesce(o.remitente, envio_cfg('envio_remitente', 'sales@jddeveloper.com')),
            o.asunto, o.cuerpo;
end $fn$;

revoke execute on function tomar_correos_programados(int) from public, anon;
grant execute on function tomar_correos_programados(int) to service_role;

commit;
