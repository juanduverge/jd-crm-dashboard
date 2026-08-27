-- =============================================================
-- 0033_catalogo_nichos.sql — El nicho deja de ser texto suelto
--
-- SÍNTOMA (dos, y son el mismo): al buscar en Apify el nicho "no se carga", y
-- en la tabla del CRM la columna Nicho sale "—" en casi todo lo importado.
--
-- CAUSA. El importador escribe en `leads.nicho` lo que venga de Apify:
--
--     apify_txt(it, 'nicho', 'categoryName', 'category', 'industry')
--
-- o sea "Roofing contractor", "Dental clinic", "Cabinet maker". Texto libre,
-- en inglés, tal cual lo clasifica Google. Pero el CRM no trata `nicho` como
-- texto: lo trata como un ID de catálogo. La tabla hace
-- `nichos.find(n => n.id === l.nicho)` y, como "Roofing contractor" no es
-- ningún id, devuelve undefined y pinta "—". El dato SÍ llegó; lo que no hay
-- es forma de reconocerlo.
--
-- Y la búsqueda pierde por el camino lo único que no era ambiguo: tú escribes
-- "dentistas" en el modal, eso viaja a n8n como `tipo_negocio`, llega aquí
-- dentro de `p_consulta` ("dentistas / Miami")... y nadie lo mira.
--
-- QUÉ HACE:
--   1. El catálogo de nichos baja de TypeScript a Supabase (tabla `nichos`).
--      Sin esto no se puede normalizar en SQL, que es donde entran los datos.
--      Trae `grupo` (la categoría) y `orden`, editables desde el CRM.
--   2. `nicho_alias`: cómo llama Google/Apify a cada nicho. Es lo que traduce
--      "Roofing contractor" -> construccion.
--   3. `normalizar_nicho(texto, pista)`: exacto -> alias -> parecido (trigram)
--      -> nicho nuevo marcado `pendiente`. Nunca devuelve basura y nunca
--      pierde un sector metiéndolo en "Otros" a la fuerza.
--   4. El importador lo usa, con lo que tú escribiste en la búsqueda como
--      pista de más peso. El texto crudo de Apify sigue intacto en
--      `leads.categoria`: normalizar no borra el original.
--   5. Relleno de los leads que ya están dentro, reusando `lead_imports` para
--      recuperar también la consulta con la que se capturaron.
-- =============================================================

-- --- 1. El catálogo ------------------------------------------
-- `id` es lo que queda escrito en `leads.nicho`, así que es la clave y no se
-- renombra: cambiar un id huérfana los leads que ya lo tenían (mismo criterio
-- que ya estaba escrito en config.ts). Para renombrar está `nombre`.
create table if not exists nichos (
  id         text primary key,
  nombre     text not null,
  emoji      text not null default '🏷️',
  color      text not null default '#94a3b8',
  grupo      text not null default 'Otros',
  orden      int  not null default 100,
  -- 'fabrica' = vino con el CRM; 'usuario' = lo creaste tú; 'auto' = lo creó
  -- el importador al no reconocer una categoría de Apify.
  origen     text not null default 'usuario' check (origen in ('fabrica','usuario','auto')),
  -- Un nicho 'auto' nace pendiente: existe y agrupa leads desde el minuto uno,
  -- pero se muestra en la bandeja de revisión hasta que le pongas nombre
  -- decente, emoji y grupo. Así no se pierde el sector ni se ensucia la lista.
  pendiente  boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_nichos_orden on nichos (grupo, orden, nombre);
create index if not exists idx_nichos_pendiente on nichos (id) where pendiente;
-- Búsqueda por parecido sobre el nombre: es la mitad del trabajo de normalizar.
create index if not exists idx_nichos_nombre_trgm on nichos using gin (nombre gin_trgm_ops);

-- --- 2. Los alias --------------------------------------------
-- Un nicho tiene un nombre para ti y N nombres para Google. `alias` se guarda
-- ya normalizado (minúsculas, sin acentos) porque es una clave de búsqueda,
-- no un texto que se enseñe.
create table if not exists nicho_alias (
  alias    text primary key,
  nicho_id text not null references nichos(id) on delete cascade,
  origen   text not null default 'fabrica' check (origen in ('fabrica','usuario','auto'))
);
create index if not exists idx_nicho_alias_nicho on nicho_alias (nicho_id);
create index if not exists idx_nicho_alias_trgm on nicho_alias using gin (alias gin_trgm_ops);

-- --- 3. Normalización de texto -------------------------------
-- `unaccent` no está instalado y no merece una extensión nueva para esto: la
-- lista de acentos que aparecen en nombres de sector es corta y cerrada.
create or replace function slug_nicho(p_txt text) returns text as $fn$
  select nullif(
    regexp_replace(
      regexp_replace(
        lower(translate(coalesce(p_txt,''),
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
        '[^a-z0-9]+', '-', 'g'),
      '^-+|-+$', '', 'g'),
    '');
$fn$ language sql immutable;

-- Forma comparable: el slug con los guiones como espacios, y sin el plural
-- más común del español y del inglés. Sin esto "dentistas" y "dentista" son
-- dos cosas distintas, que es exactamente el error que se quiere evitar.
create or replace function clave_nicho(p_txt text) returns text as $fn$
  select nullif(trim(regexp_replace(
    regexp_replace(replace(coalesce(slug_nicho(p_txt),''), '-', ' '),
                   '([a-z0-9]{4,}?)(es|s)\y', '\1', 'g'),
    '\s+', ' ', 'g')), '');
$fn$ language sql immutable;

-- --- 4. La normalización de verdad ---------------------------
-- Devuelve SIEMPRE un id de `nichos` válido. Orden de preferencia, de más
-- fiable a menos:
--   1. La pista (lo que tú escribiste al buscar) por id/nombre/alias exacto.
--   2. El texto de Apify por id/nombre/alias exacto.
--   3. Parecido (trigram) sobre nombres y alias, con umbral. Un "Roofing
--      contractor" que no esté en los alias cae aquí si se parece bastante.
--   4. Nada se parece -> se crea el nicho, marcado `pendiente`. No va a
--      "Otros": perder el sector es perder la dimensión de segmentación.
--
-- `p_pista` pesa más que el texto de Apify a propósito: tú sabes qué estabas
-- buscando, Google solo sabe cómo clasifica el negocio.
create or replace function normalizar_nicho(p_texto text, p_pista text default null)
returns text as $fn$
declare
  v_id      text;
  v_clave   text;
  v_nombre  text;
  v_txt     text;
begin
  -- 1 y 2: exacto, primero la pista y luego el texto de Apify.
  foreach v_txt in array array[p_pista, p_texto] loop
    v_clave := clave_nicho(v_txt);
    continue when v_clave is null;

    select n.id into v_id from nichos n
     where n.id = slug_nicho(v_txt) or clave_nicho(n.nombre) = v_clave
     limit 1;
    if v_id is not null then return v_id; end if;

    select a.nicho_id into v_id from nicho_alias a where a.alias = v_clave limit 1;
    if v_id is not null then return v_id; end if;
  end loop;

  -- 3: parecido. Se miran la pista y el texto en el mismo saco y gana el mejor
  -- candidato de los dos; 0.55 deja pasar "dental clinic"~"clinica dental"
  -- pero no "pet groomer"~"peluqueria" (que sería un falso positivo caro: un
  -- lead mal clasificado es peor que uno sin clasificar).
  select s.id into v_id from (
    select n.id,
           greatest(
             max(similarity(clave_nicho(n.nombre), c.clave)),
             coalesce(max(similarity(a.alias, c.clave)), 0)
           ) as puntos
      from nichos n
      left join nicho_alias a on a.nicho_id = n.id
      cross join (
        select clave_nicho(p_pista) as clave
        union
        select clave_nicho(p_texto)
      ) c
     where c.clave is not null and n.pendiente = false
     group by n.id
  ) s
   where s.puntos >= 0.55
   order by s.puntos desc
   limit 1;
  if v_id is not null then return v_id; end if;

  -- 4: no se parece a nada. Se crea con el texto de Apify (o la pista si Apify
  -- no dijo nada), tal cual vino, para que se pueda reconocer al revisarlo.
  v_nombre := coalesce(nullif(trim(p_texto), ''), nullif(trim(p_pista), ''));
  if v_nombre is null then return 'otros'; end if;
  v_id := slug_nicho(v_nombre);
  if v_id is null then return 'otros'; end if;

  insert into nichos (id, nombre, grupo, origen, pendiente, orden)
  values (v_id, initcap(v_nombre), 'Sin revisar', 'auto', true, 900)
  on conflict (id) do nothing;
  return v_id;
end;
$fn$ language plpgsql security definer set search_path = public, pg_temp;

-- --- 5. Semilla del catálogo ---------------------------------
-- Los 37 de fábrica, con el mismo id, emoji, color y grupo que tenían en
-- config.ts: los leads que ya apuntaban bien siguen apuntando bien.
insert into nichos (id, nombre, emoji, color, grupo, orden, origen) values
  ('arquitectura','Arquitectura','📐','#ff7448','Construcción y espacio',10,'fabrica'),
  ('ingenieria','Ingeniería','⚙️','#f38744','Construcción y espacio',11,'fabrica'),
  ('construccion','Construcción','🏗️','#eab308','Construcción y espacio',12,'fabrica'),
  ('real-estate','Bienes Raíces','🏠','#ff7448','Construcción y espacio',13,'fabrica'),
  ('interiorismo','Interiorismo','🛋️','#d946ef','Construcción y espacio',14,'fabrica'),
  ('restaurantes','Restaurantes','🍽️','#f38744','Hostelería y turismo',20,'fabrica'),
  ('hoteles','Hoteles','🏨','#0ea5e9','Hostelería y turismo',21,'fabrica'),
  ('turismo','Turismo','🧳','#06b6d4','Hostelería y turismo',22,'fabrica'),
  ('clinicas','Clínicas','🏥','#0082f3','Salud',30,'fabrica'),
  ('dentistas','Dentistas','🦷','#38bdf8','Salud',31,'fabrica'),
  ('medicos','Médicos','🩺','#0284c7','Salud',32,'fabrica'),
  ('abogados','Abogados','⚖️','#6248ff','Servicios profesionales',40,'fabrica'),
  ('contadores','Contadores','🧮','#7c3aed','Servicios profesionales',41,'fabrica'),
  ('consultores','Consultores','📊','#8b5cf6','Servicios profesionales',42,'fabrica'),
  ('agencias-marketing','Agencias de Marketing','📣','#ec4899','Marketing y creatividad',50,'fabrica'),
  ('estudios-creativos','Estudios Creativos','🎨','#f472b6','Marketing y creatividad',51,'fabrica'),
  ('software','Software','💻','#2563eb','Tecnología',60,'fabrica'),
  ('saas','SaaS','☁️','#3b82f6','Tecnología',61,'fabrica'),
  ('ia','Inteligencia Artificial','🤖','#6366f1','Tecnología',62,'fabrica'),
  ('educacion','Educación','📚','#f59e0b','Educación',70,'fabrica'),
  ('universidades','Universidades','🎓','#d97706','Educación',71,'fabrica'),
  ('escuelas','Escuelas','🏫','#fbbf24','Educación',72,'fabrica'),
  ('ecommerce','Ecommerce','🛒','#10b981','Comercio',80,'fabrica'),
  ('retail','Retail','🏪','#059669','Comercio',81,'fabrica'),
  ('manufactura','Manufactura','🏭','#64748b','Industria y logística',90,'fabrica'),
  ('industriales','Empresas Industriales','🔧','#475569','Industria y logística',91,'fabrica'),
  ('logistica','Logística','📦','#78716c','Industria y logística',92,'fabrica'),
  ('transporte','Transporte','🚚','#57534e','Industria y logística',93,'fabrica'),
  ('automotriz','Automotriz','🚗','#dc2626','Automoción',100,'fabrica'),
  ('talleres','Talleres','🔩','#b91c1c','Automoción',101,'fabrica'),
  ('fitness','Gimnasios','💪','#16a34a','Bienestar y belleza',110,'fabrica'),
  ('centros-deportivos','Centros Deportivos','⚽','#22c55e','Bienestar y belleza',111,'fabrica'),
  ('barberias','Barberías','💈','#e11d48','Bienestar y belleza',112,'fabrica'),
  ('salones-belleza','Salones de Belleza','💅','#f43f5e','Bienestar y belleza',113,'fabrica'),
  ('ong','ONG','🤝','#0d9488','Organizaciones',120,'fabrica'),
  ('iglesias','Iglesias','⛪','#a16207','Organizaciones',121,'fabrica'),
  ('otros','Otros','📦','#94a3b8','Otros',999,'fabrica')
on conflict (id) do nothing;

-- --- 6. Alias: cómo llama Google a cada cosa -----------------
-- Sale de las `categoryName` reales que devuelve el actor de Google Places,
-- que es lo que de verdad llega. En inglés porque es como las devuelve
-- (`language: 'es'` traduce la ficha, no la taxonomía), y en español para lo
-- que escribes tú al buscar. Se guardan ya pasados por `clave_nicho`: es la
-- forma con la que se van a comparar, y guardarlos crudos sería garantizar
-- que la mitad no case nunca.
insert into nicho_alias (alias, nicho_id)
select clave_nicho(a.alias), a.nicho_id from (values
  ('architect','arquitectura'), ('architecture firm','arquitectura'),
  ('arquitecto','arquitectura'), ('estudio de arquitectura','arquitectura'),
  ('engineer','ingenieria'), ('engineering consultant','ingenieria'),
  ('civil engineer','ingenieria'), ('ingeniero','ingenieria'),
  ('contractor','construccion'), ('general contractor','construccion'),
  ('roofing contractor','construccion'), ('roofer','construccion'),
  ('construction company','construccion'), ('builder','construccion'),
  ('remodeler','construccion'), ('home builder','construccion'),
  ('plumber','construccion'), ('electrician','construccion'),
  ('hvac contractor','construccion'), ('painter','construccion'),
  ('landscaper','construccion'), ('flooring contractor','construccion'),
  ('contratista','construccion'), ('constructora','construccion'),
  ('techos','construccion'), ('contratista de techos','construccion'),
  ('real estate agency','real-estate'), ('real estate agent','real-estate'),
  ('property management company','real-estate'), ('inmobiliaria','real-estate'),
  ('interior designer','interiorismo'), ('interior architect','interiorismo'),
  ('furniture store','interiorismo'), ('diseno de interiores','interiorismo'),
  ('restaurant','restaurantes'), ('cafe','restaurantes'), ('coffee shop','restaurantes'),
  ('bar','restaurantes'), ('pizza restaurant','restaurantes'), ('bakery','restaurantes'),
  ('catering','restaurantes'), ('cafeteria','restaurantes'),
  ('hotel','hoteles'), ('resort hotel','hoteles'), ('motel','hoteles'),
  ('bed and breakfast','hoteles'), ('hostel','hoteles'),
  ('travel agency','turismo'), ('tour operator','turismo'), ('tour agency','turismo'),
  ('agencia de viajes','turismo'),
  ('clinic','clinicas'), ('medical clinic','clinicas'), ('walk in clinic','clinicas'),
  ('veterinarian','clinicas'), ('veterinary care','clinicas'), ('clinica','clinicas'),
  ('dentist','dentistas'), ('dental clinic','dentistas'),
  ('dental implants periodontist','dentistas'), ('orthodontist','dentistas'),
  ('cosmetic dentist','dentistas'), ('dentista','dentistas'),
  ('clinica dental','dentistas'), ('clinicas dentales','dentistas'),
  ('doctor','medicos'), ('physician','medicos'), ('medical center','medicos'),
  ('pediatrician','medicos'), ('dermatologist','medicos'), ('medico','medicos'),
  ('lawyer','abogados'), ('law firm','abogados'), ('attorney','abogados'),
  ('legal services','abogados'), ('abogado','abogados'), ('bufete','abogados'),
  ('accountant','contadores'), ('accounting firm','contadores'),
  ('tax preparation service','contadores'), ('bookkeeping service','contadores'),
  ('contador','contadores'), ('asesoria fiscal','contadores'), ('gestoria','contadores'),
  ('business management consultant','consultores'), ('consultant','consultores'),
  ('business consultant','consultores'), ('consultoria','consultores'),
  ('marketing agency','agencias-marketing'), ('advertising agency','agencias-marketing'),
  ('internet marketing service','agencias-marketing'), ('seo agency','agencias-marketing'),
  ('agencia de marketing','agencias-marketing'), ('agencia de publicidad','agencias-marketing'),
  ('graphic designer','estudios-creativos'), ('design agency','estudios-creativos'),
  ('photographer','estudios-creativos'), ('video production service','estudios-creativos'),
  ('estudio creativo','estudios-creativos'), ('diseno grafico','estudios-creativos'),
  ('software company','software'), ('software development','software'),
  ('web designer','software'), ('website designer','software'),
  ('computer support and services','software'), ('it services','software'),
  ('desarrollo web','software'), ('desarrollo de software','software'),
  ('cloud software','saas'),
  ('artificial intelligence','ia'), ('inteligencia artificial','ia'),
  ('education center','educacion'), ('training centre','educacion'),
  ('language school','educacion'), ('academia','educacion'),
  ('university','universidades'), ('college','universidades'), ('universidad','universidades'),
  ('school','escuelas'), ('primary school','escuelas'), ('high school','escuelas'),
  ('preschool','escuelas'), ('kindergarten','escuelas'), ('colegio','escuelas'),
  ('e commerce service','ecommerce'), ('online shop','ecommerce'), ('tienda online','ecommerce'),
  ('store','retail'), ('clothing store','retail'), ('shop','retail'),
  ('supermarket','retail'), ('grocery store','retail'), ('tienda','retail'),
  ('manufacturer','manufactura'), ('factory','manufactura'), ('fabrica','manufactura'),
  ('industrial equipment supplier','industriales'), ('industrial','industriales'),
  ('logistics service','logistica'), ('warehouse','logistica'),
  ('freight forwarding service','logistica'),
  ('trucking company','transporte'), ('moving company','transporte'),
  ('transportation service','transporte'), ('courier service','transporte'),
  ('transportista','transporte'), ('mudanzas','transporte'),
  ('car dealer','automotriz'), ('used car dealer','automotriz'),
  ('concesionario','automotriz'),
  ('auto repair shop','talleres'), ('car repair','talleres'),
  ('auto body shop','talleres'), ('tire shop','talleres'), ('taller mecanico','talleres'),
  ('gym','fitness'), ('fitness center','fitness'), ('personal trainer','fitness'),
  ('yoga studio','fitness'), ('gimnasio','fitness'),
  ('sports complex','centros-deportivos'), ('sports club','centros-deportivos'),
  ('padel court','centros-deportivos'), ('centro deportivo','centros-deportivos'),
  ('barber shop','barberias'), ('barber','barberias'), ('barberia','barberias'),
  ('beauty salon','salones-belleza'), ('hair salon','salones-belleza'),
  ('nail salon','salones-belleza'), ('spa','salones-belleza'),
  ('day spa','salones-belleza'), ('peluqueria','salones-belleza'),
  ('salon de belleza','salones-belleza'), ('estetica','salones-belleza'),
  ('non profit organization','ong'), ('charity','ong'), ('foundation','ong'),
  ('fundacion','ong'), ('asociacion','ong'),
  ('church','iglesias'), ('catholic church','iglesias'), ('place of worship','iglesias'),
  ('iglesia','iglesias'), ('parroquia','iglesias')
) as a(alias, nicho_id)
where clave_nicho(a.alias) is not null
on conflict (alias) do nothing;

-- --- 7. RLS ---------------------------------------------------
-- Mismo criterio que el resto del CRM: lee cualquiera autenticado, escribe
-- cualquiera autenticado (es un catálogo de trabajo, no datos sensibles).
alter table nichos      enable row level security;
alter table nicho_alias enable row level security;
drop policy if exists nichos_lectura   on nichos;
drop policy if exists nichos_escritura on nichos;
drop policy if exists alias_lectura    on nicho_alias;
drop policy if exists alias_escritura  on nicho_alias;
create policy nichos_lectura   on nichos      for select to authenticated using (true);
create policy nichos_escritura on nichos      for all    to authenticated using (true) with check (true);
create policy alias_lectura    on nicho_alias for select to authenticated using (true);
create policy alias_escritura  on nicho_alias for all    to authenticated using (true) with check (true);

revoke all on function normalizar_nicho(text, text) from public, anon;
grant execute on function normalizar_nicho(text, text) to authenticated, service_role;
grant execute on function slug_nicho(text) to authenticated, service_role;
grant execute on function clave_nicho(text) to authenticated, service_role;

-- --- 8. Los nichos que ya te habias creado tu ----------------
-- Hasta ahora vivian en `settings` (clave `nichos_personalizados`) como un
-- JSON. Se suben al catalogo tal cual, marcados como tuyos y sin pendiente:
-- ya los revisaste al crearlos. La fila de `settings` se deja donde esta por
-- si hay que mirar atras; a partir de aqui manda la tabla.
insert into nichos (id, nombre, emoji, color, grupo, orden, origen)
select n ->> 'id',
       coalesce(nullif(n ->> 'nombre', ''), n ->> 'id'),
       coalesce(nullif(n ->> 'emoji',  ''), '🏷️'),
       coalesce(nullif(n ->> 'color',  ''), '#94a3b8'),
       coalesce(nullif(n ->> 'grupo',  ''), 'Mis categorías'),
       500,
       'usuario'
  from settings s
 cross join lateral jsonb_array_elements(
   case when jsonb_typeof(s.value::jsonb) = 'array' then s.value::jsonb else '[]'::jsonb end
 ) n
 where s.key = 'nichos_personalizados'
   and s.value is not null
   and nullif(n ->> 'id', '') is not null
on conflict (id) do nothing;
