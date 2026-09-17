-- =============================================================
-- 0046_nichos_y_buscador_la_misma_lista.sql
--
-- SÍNTOMA. En "Buscar nuevos prospectos" el desplegable de nicho tenía cinco
-- opciones, y eran otras cinco distintas de las que ve el resto del CRM. Para
-- que una búsqueda diera resultados había que saberse de memoria cómo llama
-- Google a cada sector, y lo que entraba se clasificaba a ciegas.
--
-- CAUSA. Había dos listas sin relación:
--   * el catálogo de la 0033 (tabla `nichos`, 37 sectores) con los nombres de
--     la interfaz — con lo que se CLASIFICA el lead;
--   * ocho sugerencias escritas a mano dentro del componente del buscador —
--     con lo que se CAPTURA.
-- Y la lista de captura es la que tiene que hablar el idioma de Google
-- ("roofing contractor", no "Construcción"), así que no podían ser la misma
-- lista... pero sí tenían que estar unidas por el nicho.
--
-- QUÉ HACE:
--   1. Añade los 11 sectores que el buscador necesitaba y la 0033 no traía
--      (seguros, hipotecas, crédito, limpieza, solar, eventos, farmacias,
--      cuidado de mayores, mascotas, imprenta, RRHH). Salen de términos que ya
--      se estaban buscando a mano: "Credito / New york" es de las consultas
--      más repetidas del historial y no tenía nicho donde caer.
--   2. Carga como `nicho_alias` los ~220 términos del buscador
--      (src/lib/nichosBusqueda.ts), cada uno con el nicho al que pertenece.
--      A partir de aquí el término que eliges para buscar es el que
--      `normalizar_nicho()` usa como pista al importar: se captura y se
--      clasifica con la misma lista.
--   3. Reclasifica los leads que ya están dentro y cuyo nicho ahora sí tiene
--      sitio (los 'auto' pendientes y los que cayeron en 'otros').
--
-- Idempotente: todo es `on conflict do nothing` y sólo toca lo que no estaba.
-- =============================================================

-- --- 1. Los sectores que faltaban ----------------------------
-- `origen = 'fabrica'`: vienen con el CRM, no los creó el usuario ni el
-- importador, así que no van a la bandeja de revisión.
insert into nichos (id, nombre, emoji, color, grupo, orden, origen) values
  -- El `orden` es global y la interfaz agrupa por sector según lo que venga
  -- seguido: los ids de un mismo grupo tienen que quedar contiguos. De ahí que
  -- RRHH vaya pegado a los otros servicios profesionales (40-42) y el bloque
  -- de finanzas empiece después.
  ('seguros','Seguros','🛡️','#0ea5e9','Finanzas y seguros',44,'fabrica'),
  ('hipotecas','Hipotecas y préstamos','🏦','#0284c7','Finanzas y seguros',45,'fabrica'),
  ('credito','Reparación de crédito','💳','#38bdf8','Finanzas y seguros',46,'fabrica'),
  ('limpieza','Limpieza','🧽','#22d3ee','Servicios para el hogar',15,'fabrica'),
  ('solar','Energía solar','☀️','#f59e0b','Servicios para el hogar',16,'fabrica'),
  ('eventos','Eventos y bodas','🎉','#ec4899','Hostelería y turismo',23,'fabrica'),
  ('farmacias','Farmacias','💊','#14b8a6','Salud',33,'fabrica'),
  ('cuidado-mayores','Cuidado de mayores','👵','#2dd4bf','Salud',34,'fabrica'),
  ('mascotas','Mascotas','🐾','#84cc16','Comercio',82,'fabrica'),
  ('imprenta','Imprenta y rotulación','🖨️','#f472b6','Marketing y creatividad',52,'fabrica'),
  ('rrhh','Personal y RRHH','🧑‍💼','#8b5cf6','Servicios profesionales',43,'fabrica')
on conflict (id) do nothing;

-- --- 2. Los términos del buscador, como alias ----------------
-- Mismo espejo que `src/lib/nichosBusqueda.ts`: si se añade un término allí,
-- se añade aquí (o en una migración nueva). Se guardan pasados por
-- `clave_nicho()` porque es la forma con la que se comparan; guardarlos crudos
-- sería garantizar que la mitad no case nunca.
insert into nicho_alias (alias, nicho_id)
select clave_nicho(a.alias), a.nicho_id from (values
  -- Construcción y reformas
  ('roofing contractor','construccion'), ('contratista de techos','construccion'),
  ('general contractor','construccion'), ('remodeling contractor','construccion'),
  ('kitchen remodeler','construccion'), ('bathroom remodeler','construccion'),
  ('flooring contractor','construccion'), ('plumber','construccion'),
  ('electrician','construccion'), ('hvac contractor','construccion'),
  ('pool contractor','construccion'), ('fence contractor','construccion'),
  ('concrete contractor','construccion'), ('garage door repair','construccion'),
  ('window installation service','construccion'), ('painter','construccion'),
  ('landscaper','construccion'), ('construction company','construccion'),
  ('constructora','construccion'), ('empresa de reformas','construccion'),
  ('fontanero','construccion'), ('electricista','construccion'),
  -- Servicios para el hogar
  ('solar energy company','solar'), ('solar panel installer','solar'),
  ('placas solares','solar'), ('energia solar','solar'),
  ('cleaning service','limpieza'), ('commercial cleaning service','limpieza'),
  ('pressure washing service','limpieza'), ('pest control service','limpieza'),
  ('empresa de limpieza','limpieza'), ('limpieza','limpieza'),
  -- Arquitectura y espacios
  ('architecture firm','arquitectura'), ('architect','arquitectura'),
  ('estudio de arquitectura','arquitectura'), ('landscape architect','arquitectura'),
  ('interior designer','interiorismo'), ('diseno de interiores','interiorismo'),
  ('cabinet maker','interiorismo'),
  ('civil engineer','ingenieria'), ('engineering consultant','ingenieria'),
  ('ingenieria civil','ingenieria'),
  -- Bienes raíces
  ('real estate agency','real-estate'), ('real estate agent','real-estate'),
  ('inmobiliaria','real-estate'), ('property management company','real-estate'),
  ('vacation rental agency','real-estate'), ('title company','real-estate'),
  -- Finanzas y seguros
  ('credit repair service','credito'), ('credit counseling service','credito'),
  ('credito','credito'), ('credit','credito'), ('reparacion de credito','credito'),
  ('mortgage broker','hipotecas'), ('mortgage lender','hipotecas'),
  ('loan agency','hipotecas'), ('financial planner','hipotecas'),
  ('hipotecas','hipotecas'),
  ('insurance agency','seguros'), ('insurance broker','seguros'),
  ('agencia de seguros','seguros'), ('correduria de seguros','seguros'),
  ('seguros','seguros'),
  -- Servicios profesionales
  ('immigration lawyer','abogados'), ('personal injury attorney','abogados'),
  ('family law attorney','abogados'), ('criminal defense attorney','abogados'),
  ('business attorney','abogados'), ('abogado de inmigracion','abogados'),
  ('bufete de abogados','abogados'), ('notary public','abogados'),
  ('accounting firm','contadores'), ('bookkeeping service','contadores'),
  ('contador publico','contadores'),
  ('business management consultant','consultores'),
  ('consultoria de empresas','consultores'), ('translation service','consultores'),
  ('staffing agency','rrhh'), ('employment agency','rrhh'),
  ('empresa de trabajo temporal','rrhh'), ('recursos humanos','rrhh'),
  -- Salud
  ('cosmetic dentist','dentistas'),
  ('urgent care clinic','clinicas'), ('physical therapy clinic','clinicas'),
  ('fertility clinic','clinicas'), ('med spa','clinicas'),
  ('clinica veterinaria','clinicas'),
  ('plastic surgeon','medicos'), ('chiropractor','medicos'),
  ('optometrist','medicos'), ('psychologist','medicos'),
  ('pharmacy','farmacias'), ('farmacia','farmacias'), ('drugstore','farmacias'),
  ('home health care service','cuidado-mayores'),
  ('assisted living facility','cuidado-mayores'), ('nursing home','cuidado-mayores'),
  ('residencia de mayores','cuidado-mayores'), ('geriatrico','cuidado-mayores'),
  -- Automoción
  ('auto detailing service','talleres'), ('car wash','talleres'),
  ('taller de chapa y pintura','talleres'), ('towing service','automotriz'),
  -- Hostelería, turismo y eventos
  ('food truck','restaurantes'), ('catering service','restaurantes'),
  ('boutique hotel','hoteles'),
  ('event venue','eventos'), ('wedding planner','eventos'),
  ('party equipment rental service','eventos'), ('salon de eventos','eventos'),
  ('eventos','eventos'), ('bodas','eventos'),
  -- Bienestar y belleza
  ('pilates studio','fitness'), ('crossfit box','fitness'),
  ('padel club','centros-deportivos'), ('tattoo shop','salones-belleza'),
  ('centro de estetica','salones-belleza'),
  -- Comercio
  ('jewelry store','retail'), ('appliance store','retail'),
  ('hardware store','retail'), ('garden center','retail'),
  ('bike shop','retail'), ('boutique','retail'),
  ('pet store','mascotas'), ('pet groomer','mascotas'),
  ('dog trainer','mascotas'), ('mascotas','mascotas'),
  ('peluqueria canina','mascotas'),
  -- Industria y logística
  ('metal fabricator','manufactura'), ('machine shop','manufactura'),
  ('wholesale distributor','industriales'), ('mayorista','industriales'),
  -- Educación
  ('private school','escuelas'), ('colegio privado','escuelas'),
  ('guarderia','escuelas'),
  ('driving school','educacion'), ('tutoring service','educacion'),
  ('vocational school','educacion'), ('music school','educacion'),
  ('dance school','educacion'), ('academia de idiomas','educacion'),
  ('autoescuela','educacion'),
  -- Marketing, creativos y tecnología
  ('printing service','imprenta'), ('sign shop','imprenta'),
  ('imprenta','imprenta'), ('rotulacion','imprenta'),
  ('fotografo de bodas','estudios-creativos'),
  -- Organizaciones
  ('chamber of commerce','ong')
) as a(alias, nicho_id)
where clave_nicho(a.alias) is not null
on conflict (alias) do nothing;

-- --- 3. Reclasificar lo que ya estaba dentro -----------------
-- Sólo los leads cuyo nicho no dice nada: los 'auto' que el importador creó
-- por no reconocer la categoría, y los que cayeron en 'otros'. Los nichos que
-- clasificaste tú a mano no se tocan.
--
-- `categoria` guarda el texto crudo de Apify ("Insurance agency") y la
-- consulta con la que entró el lead es la pista: las dos entradas que quiere
-- `normalizar_nicho`. La consulta se recupera como en la 0034 —
-- `lead_imports.detalle` guarda el `lead_id` de cada item del lote— porque
-- `leads` no tiene columna que apunte a su importación.
create temporary table _pista_0046 on commit drop as
select distinct on (d.lead_id)
       (d.lead_id)::uuid as lead_id,
       nullif(trim(split_part(coalesce(li.consulta, ''), '/', 1)), '') as pista
  from lead_imports li
 cross join lateral jsonb_array_elements(coalesce(li.detalle, '[]'::jsonb)) x
 cross join lateral (select x ->> 'lead_id' as lead_id) d
 where d.lead_id is not null
 order by d.lead_id, li.created_at desc;

-- `normalizar_nicho` crea un nicho pendiente cuando no reconoce nada, así que
-- se llama UNA vez por lead y el resultado se guarda: llamarla en el `set` y
-- otra vez en el `where` duplicaría ese efecto.
create temporary table _recalculo_0046 on commit drop as
select l.id,
       l.nicho as nicho_actual,
       normalizar_nicho(coalesce(l.categoria, l.nicho), p.pista) as nicho_nuevo
  from leads l
  left join _pista_0046 p on p.lead_id = l.id
  left join nichos n on n.id = l.nicho
 where l.deleted_at is null
   and (l.nicho is null or l.nicho = 'otros' or n.pendiente = true)
   and coalesce(l.categoria, l.nicho) is not null;

update leads l
   set nicho = r.nicho_nuevo,
       updated_at = l.updated_at   -- no cuenta como actividad del lead
  from _recalculo_0046 r
 where l.id = r.id
   and r.nicho_nuevo <> 'otros'
   and r.nicho_nuevo is distinct from r.nicho_actual;

-- Un nicho 'auto' que se ha quedado sin ningún lead ya no aporta nada a la
-- bandeja de revisión: era el texto crudo de Google, y ahora esos leads viven
-- en un sector de verdad.
delete from nichos n
 where n.origen = 'auto'
   and n.pendiente = true
   and not exists (select 1 from leads l where l.nicho = n.id and l.deleted_at is null);
