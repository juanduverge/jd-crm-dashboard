-- 0069_cms_fecha_sigue_publicacion.sql — La fecha del artículo es la de su publicación
--
-- El problema (17-nov-2026): la web muestra y ordena por `cms_items.fecha`, y la
-- fecha se ponía al crear el borrador. Un artículo escrito el 18-nov y programado
-- para el 15-dic salía fechado el 18-nov: parecía viejo el día de salir, quedaba
-- detrás de otros en el listado y Google recibía una fecha de publicación falsa.
--
-- Ahora, en el mismo trigger que ya protege programar/publicar (0057):
--   · al programar, la fecha pasa a ser el día programado (hora de RD);
--   · al publicar por primera vez (published_at vacío), la fecha pasa a ser hoy.
-- Republicar algo archivado o actualizar la web NO cambia la fecha: ya tenía
-- published_at. Si Juan quiere otra fecha, la cambia a mano después de publicar.

create or replace function public.cms_items_guardia_publicar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status in ('programado', 'publicado')
     and (tg_op = 'INSERT' or old.status is distinct from new.status)
     and coalesce(auth.role(), '') <> 'service_role'
     and auth_role() is distinct from 'admin'::user_role then
    raise exception 'cms: solo un administrador puede programar o publicar';
  end if;

  if new.status = 'programado' and new.programado_para is not null
     and (tg_op = 'INSERT' or old.status is distinct from new.status
          or old.programado_para is distinct from new.programado_para) then
    new.fecha := (new.programado_para at time zone 'America/Santo_Domingo')::date;
  end if;

  if new.status = 'publicado' and new.published_at is null then
    new.published_at := now();
    new.fecha := (now() at time zone 'America/Santo_Domingo')::date;
  end if;
  return new;
end $function$;

-- El trigger tiene que mirar también los cambios de hora («Cambiar fecha…»).
drop trigger if exists trg_cms_items_guardia on public.cms_items;
create trigger trg_cms_items_guardia
  before insert or update of status, programado_para on public.cms_items
  for each row execute function public.cms_items_guardia_publicar();
