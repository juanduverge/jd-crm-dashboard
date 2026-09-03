-- =============================================================
-- La cola de verificación devolvía leads imposibles de verificar
--
-- EL PROBLEMA, VISTO EN PRODUCCIÓN EL 3-sep-2026:
--
-- Siete leads (Constructora RE, Fibrocem, Sensory Design Studio…) salían en
-- la cola una y otra vez, pasada tras pasada, con la lista de teléfonos
-- vacía. Nunca podían verificarse y nunca dejaban de intentarlo.
--
-- La causa: su columna `telefono` no es NULL, es **cadena vacía**. El filtro
-- decía `telefono is not null`, que una cadena vacía cumple, así que el lead
-- entraba; pero el `select` que arma la lista sí aplica `wa_digitos()`, que
-- la descarta. Resultado: entra en la cola, sale sin teléfonos, no se le
-- puede sellar fecha, y vuelve a entrar. Para siempre.
--
-- Además de gastar sitio en cada lote (7 de 60 huecos), enmascaraba el
-- resultado: la pasada informaba de `sin_verificar` sin que nada estuviera
-- roto.
--
-- LA CORRECCIÓN: el filtro de entrada usa el mismo criterio que la lista.
-- Si después de limpiar no queda ningún teléfono usable, el lead no entra.
--
-- No se le marca ningún estado a propósito: un lead sin teléfono hoy puede
-- tenerlo mañana (el enriquecimiento los añade), y entonces vuelve a entrar
-- en la cola solo, sin que nadie tenga que acordarse de rehabilitarlo.
-- =============================================================

begin;

create or replace function leads_para_verificar_wa(
  p_limite    int default 60,
  p_reintento interval default '180 days'
) returns table (id uuid, empresa text, telefonos text[]) as $$
  select l.id, l.empresa, t.telefonos
    from leads l
    -- La lista se calcula una sola vez y se puede filtrar por ella, que es
    -- lo que evita el bucle: antes se calculaba en el `select`, cuando el
    -- lead ya había entrado.
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
     -- Sin teléfono utilizable no hay nada que comprobar. Ojo: cadena vacía
     -- no es NULL, y ese fue justo el fallo.
     and coalesce(array_length(t.telefonos, 1), 0) > 0
     -- Nunca verificado (esto incluye todo el histórico del CRM), o toca
     -- repasar. Un `sin_verificar` no sella fecha, así que vuelve solo.
     and (l.whatsapp_verificado_en is null
          or l.whatsapp_verificado_en < now() - p_reintento)
   order by l.whatsapp_verificado_en asc nulls first, l.created_at desc
   limit greatest(1, least(p_limite, 500));
$$ language sql stable security definer set search_path = public, pg_temp;

-- Igual que la 0035: la cola no se expone al navegador.
revoke all on function leads_para_verificar_wa(int, interval) from public, anon, authenticated;
grant execute on function leads_para_verificar_wa(int, interval) to service_role;

commit;
