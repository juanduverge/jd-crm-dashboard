-- =============================================================
-- 0043 — El lead que está en «Contactado» y dice «Sin contactar»
--
-- LO QUE SE VE EN EL KANBAN
--
-- 32 tarjetas en la columna «Contactado» con la etiqueta «Sin contactar»
-- encima. Son dos cosas distintas pintadas en la misma tarjeta —la columna es
-- la ETAPA del pipeline, la etiqueta es el CONTADOR DE TOQUES— y cuando se
-- contradicen el CRM parece roto aunque cada mitad esté haciendo su trabajo.
--
-- POR QUÉ PASÓ
--
-- Hasta el 4-sep-2026, mover una tarjeta de etapa no dejaba rastro en ningún
-- sitio: la 0039 fue justo la que hizo que mover a «Contactado» registrara el
-- toque. Todo lo movido antes cambió de columna y nada más. `touch_actual` se
-- quedó en 0, y con él la ficha, los filtros de toque, la insistencia y el
-- "sin contactar" de la agenda.
--
-- Comprobado sobre los 32: 26 se movieron entre el 14-ago y el 3-sep, o sea
-- antes del arreglo. No es un fallo vivo, es lo que quedó por detrás.
--
-- QUÉ HACE ESTA MIGRACIÓN
--
-- Lo mismo que la 0042 hizo con las respuestas: preguntarle al historial.
-- `pipeline_events` guarda cuándo pasó cada lead a «Contactado», así que el
-- contacto consta —con su fecha— aunque el toque nunca se escribiera. Se crea
-- ese toque que faltaba, fechado en el día del movimiento, no hoy.
--
-- ATENCIÓN: ESTO CAMBIA NÚMEROS HISTÓRICOS
--
-- Estos toques caen en agosto y principios de septiembre, así que «contactos
-- realizados» y «Touch 1» de esos días suben. Es lo correcto —esos leads
-- FUERON contactados y la ficha lo negaba— pero si mañana comparas el panel
-- de agosto con una captura vieja, no van a cuadrar, y el motivo es este.
--
-- LO QUE NO SE TOCA
--
-- · Los leads que ya tienen algún toque completado: ahí no falta nada.
-- · El resultado va a 'sin_respuesta'. Mover a «Contactado» significa que se
--   escribió, no que contestaran; si alguno contestó, la 0042 ya lo marcó por
--   su paso por «Respondió».
-- · Los seguimientos PENDIENTES que ya tenían programados se quedan como
--   están: son trabajo futuro, no contacto pasado.
-- =============================================================

begin;

-- Los leads a rescatar, en una tabla temporal porque hacen falta dos veces:
-- primero para abrirle hueco al toque y luego para insertarlo.
create temp table huerfanos on commit drop as
with primer_contacto as (
  -- El primer paso por «Contactado» o «Seguimiento» de cada lead. Las dos
  -- etapas implican que se escribió; el resto (reunión, propuesta, ganado)
  -- son consecuencias de un contacto anterior, no contactos nuevos.
  select e.lead_id, min(e.changed_at) as cuando
    from pipeline_events e
    join leads l on l.id = e.lead_id and l.deleted_at is null
   where e.etapa in ('contactado', 'seguimiento')
   group by e.lead_id
)
-- Sólo los que no tienen NINGÚN toque completado. Con uno solo que tengan, el
-- contacto ya consta y no hay hueco que rellenar.
select p.* from primer_contacto p
 where not exists (
   select 1 from follow_ups f
    where f.lead_id = p.lead_id and f.estado = 'completado'
      and f.deleted_at is null
 );

-- El contacto rescatado ocurrió ANTES que el seguimiento que estuviera
-- programado, así que es el toque nº 1 y lo demás corre un puesto. El `orden`
-- es lo que la ficha enseña como «toque nº 3»: si empezara en 0, o repitiera
-- número, la secuencia dejaría de leerse.
update follow_ups f
   set orden = f.orden + 1
  from huerfanos h
 where f.lead_id = h.lead_id and f.deleted_at is null;

insert into follow_ups (
  lead_id, fecha_programada, tipo, estado, resultado, orden,
  responsable, completed_at, nota
)
select
  h.lead_id,
  dia_crm(h.cuando),
  -- El canal que declara la ficha, el mismo criterio que usa el trigger de la
  -- 0039. Sin él, 'llamada', para no inventar un canal que nadie eligió.
  case l.canal_principal
    when 'email'    then 'email'::follow_up_tipo
    when 'whatsapp' then 'whatsapp'::follow_up_tipo
    else 'llamada'::follow_up_tipo
  end,
  'completado',
  'sin_respuesta',
  1,
  l.responsable,
  h.cuando,
  'Backfill 0043: la tarjeta se movió a contactado antes de que eso registrara el toque'
from huerfanos h
join leads l on l.id = h.lead_id;

commit;

-- =============================================================
-- VERIFICACIÓN
-- =============================================================
-- 1) Cuántos toques se crearon y de qué canal:
--
--   select tipo, count(*) from follow_ups
--    where nota like 'Backfill 0043%' group by tipo;
--
-- 2) La contradicción desaparece: ningún lead en «Contactado» sigue con el
--    contador a cero, salvo el que nunca pasó por el pipeline.
--
--   select empresa, estado, touch_actual from leads
--    where deleted_at is null and estado = 'contactado' and touch_actual = 0;
--
-- 3) El `orden` de cada lead sigue siendo una secuencia limpia, sin repetidos:
--
--   select lead_id, orden, count(*) from follow_ups
--    where deleted_at is null group by 1, 2 having count(*) > 1;
--   -- vacío
--
-- 4) Deshacer, si hiciera falta:
--
--   -- delete from follow_ups where nota like 'Backfill 0043%';
--   -- select recalcular_touch_lead(id) from leads where deleted_at is null;
--
-- =============================================================
-- LO QUE ESTA MIGRACIÓN NO ARREGLA
-- =============================================================
-- Cinco de los 32 (Coast 2 Coast, ACP, THE ROOF XPERTS, All American, AQC)
-- tienen su mensaje en `outreach_messages` con `sent_at` puesto y el status
-- todavía en 'draft': el fallo de la 0037, el correo sale y el estado no se
-- actualiza. Aquí entran igual, porque lo que se usa es el movimiento de la
-- tarjeta, no el mensaje. Pero el status sigue mintiendo y `v_envios` los
-- seguirá ignorando; eso es harina de otro costal y hay que mirarlo en el
-- código que manda el correo, no aquí.
--
--   select l.empresa, o.status, o.sent_at from outreach_messages o
--     join leads l on l.id = o.lead_id
--    where o.status = 'draft' and o.sent_at is not null order by o.sent_at;
--
-- «Home Repair | Diseño y renovación de interiores» está en «Contactado» sin
-- un solo evento en `pipeline_events`: nadie movió esa tarjeta, alguien le
-- escribió el estado directamente a la tabla saltándose el pipeline. Aquí se
-- queda fuera a propósito —no hay fecha que ponerle al toque— y merece
-- averiguar quién lo escribió (importador o n8n) antes de taparlo a mano.
--
--   select empresa, estado, fuente, created_at, updated_at from leads
--    where empresa like 'Home Repair%';
