-- =============================================================
-- 0008_pipeline_module.sql — Ajustes de esquema para migrar el módulo
-- Pipeline (etapa/prioridad/canal/valor/responsable/seguimiento/probabilidad/
-- score manual) de Sheets a Supabase.
--
-- Diseño: en Sheets, "prospects" y "pipeline" eran dos hojas distintas unidas
-- por ID Lead, pero conceptualmente una sola entidad (un lead SIEMPRE tiene
-- una etapa de pipeline). Se decidió NO crear una tabla `pipeline` separada:
-- el estado "actual" del pipeline se guarda como columnas denormalizadas en
-- `leads` (lectura simple, un solo round-trip, coincide con como ya se
-- consume en la UI), y `pipeline_events` (ya existente desde 0001) se usa
-- exclusivamente como historial append-only: se inserta una fila cada vez
-- que cambia `estado`, para auditoría/analítica futura (tiempo en cada
-- etapa, forecast histórico, etc). No se agregan políticas RLS nuevas:
-- `leads_update`/`leads_select` (0002) ya cubren estas columnas, y
-- `pipeline_select`/`pipeline_insert` (0002) ya cubren pipeline_events.
-- =============================================================

alter table leads add column if not exists estado pipeline_stage not null default 'nuevo';
alter table leads add column if not exists prioridad text check (prioridad in ('alta','media','baja'));
alter table leads add column if not exists canal_principal text check (canal_principal in ('email','whatsapp','instagram','linkedin'));
alter table leads add column if not exists fecha_primer_contacto date;
alter table leads add column if not exists proximo_seguimiento date;
alter table leads add column if not exists valor_estimado numeric;
alter table leads add column if not exists responsable text;
alter table leads add column if not exists probabilidad numeric check (probabilidad between 0 and 100);
alter table leads add column if not exists fecha_cierre_estimada date;
alter table leads add column if not exists score_manual int check (score_manual between 0 and 100);

create index if not exists idx_leads_estado on leads (estado) where deleted_at is null;
