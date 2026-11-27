-- 0077_cms_fecha_fija_al_publicar.sql — La fecha de un artículo publicado no se mueve
--
-- El problema (27-nov-2026, Juan): la web mostraba la fecha de creación en artículos
-- publicados después. La 0069 ya ponía la fecha al publicar, pero el editor (CRM de la
-- empresa y Blog CMS de JD Lab) manda `fecha` en cada guardado con el valor que tenía
-- cargado. Corregir una palabra después de publicar devolvía la fecha de creación:
-- webflow-partner salió el 20-nov, se editó esa tarde y volvió al 18-nov.
--
-- Regla de Juan:
--   · la fecha de la web es el día de la PRIMERA publicación (hora de RD);
--   · editar texto o imagen y volver a publicar NO la cambia;
--   · solo cambia si se borra el artículo y se publica uno nuevo.
-- Por eso, en cuanto hay published_at, fecha = día de published_at, en cualquier
-- INSERT o UPDATE, venga de donde venga. Antes de publicar, al programar, la fecha
-- sigue siendo el día programado (0069).

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

  -- published_at es la primera publicación: una vez puesto, nadie lo cambia ni lo borra.
  if tg_op = 'UPDATE' and old.published_at is not null then
    new.published_at := old.published_at;
  end if;

  if new.status = 'programado' and new.programado_para is not null and new.published_at is null
     and (tg_op = 'INSERT' or old.status is distinct from new.status
          or old.programado_para is distinct from new.programado_para) then
    new.fecha := (new.programado_para at time zone 'America/Santo_Domingo')::date;
  end if;

  if new.status = 'publicado' and new.published_at is null then
    new.published_at := now();
  end if;

  if new.published_at is not null then
    new.fecha := (new.published_at at time zone 'America/Santo_Domingo')::date;
  end if;
  return new;
end $function$;

-- Ahora mira todos los cambios: el guardado del editor también pasa por aquí.
drop trigger if exists trg_cms_items_guardia on public.cms_items;
create trigger trg_cms_items_guardia
  before insert or update on public.cms_items
  for each row execute function public.cms_items_guardia_publicar();

-- Los tres artículos importados el 20-oct traían published_at a medianoche UTC del 14-oct,
-- que en RD es el 13 por la noche. Se llevan a mediodía de RD para que sigan en el 14.
-- El trigger conserva el published_at viejo en cada UPDATE: se apaga solo para esto.
alter table public.cms_items disable trigger trg_cms_items_guardia;
update public.cms_items
   set published_at = ((published_at at time zone 'UTC')::date + time '12:00') at time zone 'America/Santo_Domingo'
 where published_at is not null
   and published_at = date_trunc('day', published_at at time zone 'UTC') at time zone 'UTC';
alter table public.cms_items enable trigger trg_cms_items_guardia;

-- Corrige los publicados cuya fecha se movió (el trigger pone la de su publicación).
update public.cms_items
   set fecha = fecha
 where published_at is not null
   and fecha is distinct from (published_at at time zone 'America/Santo_Domingo')::date;
