-- 0072 · Metas libres: horas estimadas
--
-- Juan pidió (20-nov) metas escritas a mano del tipo «este día arreglo cosas
-- de mi web», con título, descripción, fecha y CUÁNTAS HORAS le llevará. Todo
-- lo demás ya cabía en `goals` (tipo 'toggle' = hecho / no hecho, descripción
-- de la 0017, prioridad y estado de la 0022). Solo faltaba esto.
--
-- Nullable y sin default: una meta de número («10 reuniones») no tiene por
-- qué tener horas. El CRM funciona sin esta columna (no la manda si está
-- vacía y reintenta sin ella), así que aplicarla no tiene prisa.

alter table goals
  add column if not exists horas_estimadas numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_goal_horas') then
    alter table goals
      add constraint ck_goal_horas check (horas_estimadas is null or (horas_estimadas > 0 and horas_estimadas <= 500));
  end if;
end $$;

comment on column goals.horas_estimadas is
  'Horas que se calcula que llevará la meta (metas libres). Solo informativa.';
