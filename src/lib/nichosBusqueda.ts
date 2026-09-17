/**
 * Términos de búsqueda de prospectos, cada uno atado a su nicho del catálogo.
 *
 * Aquí hay dos listas que tenían que ser una. El catálogo de nichos (tabla
 * `nichos`, migración 0033) es con lo que se CLASIFICA el lead una vez dentro:
 * nombres para la interfaz, "Construcción", "Salud". Esto es con lo que se
 * CAPTURA: la consulta concreta que Google Maps entiende, "roofing
 * contractor", de las que hay muchas por nicho. Buscar "Construcción" en Maps
 * devuelve ruido; buscar "roofing contractor" devuelve 50 negocios con
 * teléfono y web mala, que es el lead que sirve.
 *
 * Lo que las sincroniza es el campo `nicho`: cada término dice a qué nicho
 * pertenece, así que el desplegable del buscador se agrupa por los MISMOS
 * sectores que ve el resto del CRM, y lo que capturas con un término entra
 * clasificado en el nicho que estabas buscando. Los mismos pares
 * término→nicho se cargan como `nicho_alias` en la migración 0046: el
 * importador de Apify normaliza con esa tabla, de modo que la lista de la
 * interfaz y la que usa el importador son literalmente la misma.
 *
 * Al añadir un término aquí, añádelo también a la 0046 (o a una migración
 * nueva): esto pinta el desplegable, la tabla es la que clasifica.
 *
 * El inglés va primero porque es como está catalogado el negocio en Google
 * (el idioma de la ficha se traduce, la taxonomía no). El español está para
 * buscar en LatAm y España.
 *
 * `favorito: true` marca lo que mejor convierte vendiendo webs: negocio local,
 * ticket alto, y web propia mala o inexistente.
 */

export interface TerminoBusqueda {
  /** Lo que se manda como `tipo_negocio`. */
  termino: string
  /** Id del nicho del catálogo al que pertenece. */
  nicho: string
  /** Lo que más funciona vendiendo webs: sale en "Recomendados". */
  favorito?: boolean
  /** Nota corta que se pinta a la derecha (por qué o dónde funciona). */
  nota?: string
}

/**
 * Nichos que este catálogo necesita y que la 0033 no traía.
 *
 * Están aquí sólo para poder pintar su nombre y su grupo mientras la 0046 no
 * esté aplicada; en cuanto lo esté, manda la tabla `nichos` como con todos los
 * demás. Los ids y los grupos son los mismos que inserta la migración: si
 * cambia uno, cambian los dos.
 */
export const NICHOS_EXTRA: { id: string; nombre: string; emoji: string; grupo: string }[] = [
  { id: 'seguros', nombre: 'Seguros', emoji: '🛡️', grupo: 'Finanzas y seguros' },
  { id: 'hipotecas', nombre: 'Hipotecas y préstamos', emoji: '🏦', grupo: 'Finanzas y seguros' },
  { id: 'credito', nombre: 'Reparación de crédito', emoji: '💳', grupo: 'Finanzas y seguros' },
  { id: 'limpieza', nombre: 'Limpieza', emoji: '🧽', grupo: 'Servicios para el hogar' },
  { id: 'solar', nombre: 'Energía solar', emoji: '☀️', grupo: 'Servicios para el hogar' },
  { id: 'eventos', nombre: 'Eventos y bodas', emoji: '🎉', grupo: 'Hostelería y turismo' },
  { id: 'farmacias', nombre: 'Farmacias', emoji: '💊', grupo: 'Salud' },
  { id: 'cuidado-mayores', nombre: 'Cuidado de mayores', emoji: '👵', grupo: 'Salud' },
  { id: 'mascotas', nombre: 'Mascotas', emoji: '🐾', grupo: 'Comercio' },
  { id: 'imprenta', nombre: 'Imprenta y rotulación', emoji: '🖨️', grupo: 'Marketing y creatividad' },
  { id: 'rrhh', nombre: 'Personal y RRHH', emoji: '🧑‍💼', grupo: 'Servicios profesionales' },
]

export const TERMINOS_BUSQUEDA: TerminoBusqueda[] = [
  // --- Construcción y reformas -------------------------------------------
  { termino: 'roofing contractor', nicho: 'construccion', favorito: true, nota: 'ticket alto, webs malas' },
  { termino: 'contratista de techos', nicho: 'construccion', favorito: true },
  { termino: 'general contractor', nicho: 'construccion', favorito: true },
  { termino: 'remodeling contractor', nicho: 'construccion', favorito: true },
  { termino: 'kitchen remodeler', nicho: 'construccion' },
  { termino: 'bathroom remodeler', nicho: 'construccion' },
  { termino: 'flooring contractor', nicho: 'construccion' },
  { termino: 'plumber', nicho: 'construccion', favorito: true, nota: 'mucho volumen' },
  { termino: 'electrician', nicho: 'construccion', favorito: true },
  { termino: 'hvac contractor', nicho: 'construccion', favorito: true, nota: 'aire acondicionado' },
  { termino: 'pool contractor', nicho: 'construccion' },
  { termino: 'fence contractor', nicho: 'construccion' },
  { termino: 'concrete contractor', nicho: 'construccion' },
  { termino: 'garage door repair', nicho: 'construccion' },
  { termino: 'window installation service', nicho: 'construccion' },
  { termino: 'painter', nicho: 'construccion' },
  { termino: 'landscaper', nicho: 'construccion' },
  { termino: 'construction company', nicho: 'construccion' },
  { termino: 'constructora', nicho: 'construccion' },
  { termino: 'empresa de reformas', nicho: 'construccion' },
  { termino: 'fontanero', nicho: 'construccion' },
  { termino: 'electricista', nicho: 'construccion' },

  // --- Servicios para el hogar -------------------------------------------
  { termino: 'solar energy company', nicho: 'solar', favorito: true, nota: 'ticket muy alto' },
  { termino: 'solar panel installer', nicho: 'solar' },
  { termino: 'placas solares', nicho: 'solar' },
  { termino: 'cleaning service', nicho: 'limpieza', favorito: true },
  { termino: 'commercial cleaning service', nicho: 'limpieza' },
  { termino: 'pressure washing service', nicho: 'limpieza' },
  { termino: 'pest control service', nicho: 'limpieza', favorito: true },
  { termino: 'empresa de limpieza', nicho: 'limpieza' },

  // --- Arquitectura y diseño de espacios ---------------------------------
  { termino: 'architecture firm', nicho: 'arquitectura', favorito: true, nota: 'valoran el diseño' },
  { termino: 'architect', nicho: 'arquitectura' },
  { termino: 'estudio de arquitectura', nicho: 'arquitectura', favorito: true },
  { termino: 'landscape architect', nicho: 'arquitectura' },
  { termino: 'interior designer', nicho: 'interiorismo', favorito: true },
  { termino: 'diseño de interiores', nicho: 'interiorismo' },
  { termino: 'cabinet maker', nicho: 'interiorismo' },
  { termino: 'civil engineer', nicho: 'ingenieria' },
  { termino: 'engineering consultant', nicho: 'ingenieria' },
  { termino: 'ingeniería civil', nicho: 'ingenieria' },

  // --- Bienes raíces ------------------------------------------------------
  { termino: 'real estate agency', nicho: 'real-estate', favorito: true, nota: 'el más usado' },
  { termino: 'real estate agent', nicho: 'real-estate', favorito: true },
  { termino: 'inmobiliaria', nicho: 'real-estate', favorito: true },
  { termino: 'property management company', nicho: 'real-estate', favorito: true },
  { termino: 'vacation rental agency', nicho: 'real-estate', favorito: true },
  { termino: 'title company', nicho: 'real-estate' },

  // --- Finanzas y seguros -------------------------------------------------
  { termino: 'credit repair service', nicho: 'credito', favorito: true, nota: 'ya probado' },
  { termino: 'credit counseling service', nicho: 'credito' },
  { termino: 'crédito', nicho: 'credito' },
  { termino: 'mortgage broker', nicho: 'hipotecas', favorito: true },
  { termino: 'mortgage lender', nicho: 'hipotecas' },
  { termino: 'loan agency', nicho: 'hipotecas' },
  { termino: 'financial planner', nicho: 'hipotecas' },
  { termino: 'insurance agency', nicho: 'seguros', favorito: true },
  { termino: 'insurance broker', nicho: 'seguros' },
  { termino: 'agencia de seguros', nicho: 'seguros' },
  { termino: 'correduría de seguros', nicho: 'seguros' },

  // --- Servicios profesionales -------------------------------------------
  { termino: 'immigration lawyer', nicho: 'abogados', favorito: true, nota: 'ticket muy alto' },
  { termino: 'personal injury attorney', nicho: 'abogados', favorito: true },
  { termino: 'family law attorney', nicho: 'abogados' },
  { termino: 'criminal defense attorney', nicho: 'abogados' },
  { termino: 'business attorney', nicho: 'abogados' },
  { termino: 'law firm', nicho: 'abogados', favorito: true },
  { termino: 'abogado de inmigración', nicho: 'abogados' },
  { termino: 'bufete de abogados', nicho: 'abogados' },
  { termino: 'notary public', nicho: 'abogados' },
  { termino: 'accounting firm', nicho: 'contadores', favorito: true },
  { termino: 'tax preparation service', nicho: 'contadores', favorito: true, nota: 'temporada fiscal' },
  { termino: 'bookkeeping service', nicho: 'contadores' },
  { termino: 'contador público', nicho: 'contadores' },
  { termino: 'asesoría fiscal', nicho: 'contadores' },
  { termino: 'gestoría', nicho: 'contadores' },
  { termino: 'business management consultant', nicho: 'consultores' },
  { termino: 'consultoría de empresas', nicho: 'consultores' },
  { termino: 'translation service', nicho: 'consultores' },
  { termino: 'staffing agency', nicho: 'rrhh', favorito: true },
  { termino: 'employment agency', nicho: 'rrhh' },
  { termino: 'empresa de trabajo temporal', nicho: 'rrhh' },

  // --- Salud --------------------------------------------------------------
  { termino: 'dental clinic', nicho: 'dentistas', favorito: true, nota: 'clásico que convierte' },
  { termino: 'dentist', nicho: 'dentistas', favorito: true },
  { termino: 'clínica dental', nicho: 'dentistas', favorito: true },
  { termino: 'orthodontist', nicho: 'dentistas' },
  { termino: 'cosmetic dentist', nicho: 'dentistas' },
  { termino: 'medical clinic', nicho: 'clinicas', favorito: true },
  { termino: 'urgent care clinic', nicho: 'clinicas' },
  { termino: 'physical therapy clinic', nicho: 'clinicas' },
  { termino: 'fertility clinic', nicho: 'clinicas' },
  { termino: 'med spa', nicho: 'clinicas', favorito: true, nota: 'medicina estética' },
  { termino: 'veterinarian', nicho: 'clinicas', favorito: true },
  { termino: 'clínica veterinaria', nicho: 'clinicas' },
  { termino: 'plastic surgeon', nicho: 'medicos', favorito: true, nota: 'ticket alto' },
  { termino: 'dermatologist', nicho: 'medicos' },
  { termino: 'chiropractor', nicho: 'medicos', favorito: true },
  { termino: 'optometrist', nicho: 'medicos' },
  { termino: 'pediatrician', nicho: 'medicos' },
  { termino: 'psychologist', nicho: 'medicos' },
  { termino: 'pharmacy', nicho: 'farmacias' },
  { termino: 'farmacia', nicho: 'farmacias' },
  { termino: 'home health care service', nicho: 'cuidado-mayores', favorito: true },
  { termino: 'assisted living facility', nicho: 'cuidado-mayores' },
  { termino: 'nursing home', nicho: 'cuidado-mayores' },
  { termino: 'residencia de mayores', nicho: 'cuidado-mayores' },

  // --- Automoción ---------------------------------------------------------
  { termino: 'auto repair shop', nicho: 'talleres', favorito: true, nota: 'probado en NY y TX' },
  { termino: 'taller mecánico', nicho: 'talleres', favorito: true },
  { termino: 'auto body shop', nicho: 'talleres' },
  { termino: 'tire shop', nicho: 'talleres' },
  { termino: 'auto detailing service', nicho: 'talleres' },
  { termino: 'car wash', nicho: 'talleres' },
  { termino: 'taller de chapa y pintura', nicho: 'talleres' },
  { termino: 'car dealer', nicho: 'automotriz' },
  { termino: 'used car dealer', nicho: 'automotriz', favorito: true },
  { termino: 'towing service', nicho: 'automotriz' },
  { termino: 'concesionario', nicho: 'automotriz' },

  // --- Hostelería, turismo y eventos -------------------------------------
  { termino: 'restaurant', nicho: 'restaurantes', favorito: true },
  { termino: 'restaurantes', nicho: 'restaurantes' },
  { termino: 'catering service', nicho: 'restaurantes', favorito: true, nota: 'web para pedidos' },
  { termino: 'bakery', nicho: 'restaurantes' },
  { termino: 'coffee shop', nicho: 'restaurantes' },
  { termino: 'food truck', nicho: 'restaurantes' },
  { termino: 'hotel', nicho: 'hoteles' },
  { termino: 'boutique hotel', nicho: 'hoteles' },
  { termino: 'bed and breakfast', nicho: 'hoteles' },
  { termino: 'travel agency', nicho: 'turismo' },
  { termino: 'tour operator', nicho: 'turismo' },
  { termino: 'agencia de viajes', nicho: 'turismo' },
  { termino: 'event venue', nicho: 'eventos', favorito: true },
  { termino: 'wedding planner', nicho: 'eventos', favorito: true },
  { termino: 'party equipment rental service', nicho: 'eventos' },
  { termino: 'salón de eventos', nicho: 'eventos' },

  // --- Bienestar y belleza ------------------------------------------------
  { termino: 'gym', nicho: 'fitness' },
  { termino: 'fitness center', nicho: 'fitness' },
  { termino: 'personal trainer', nicho: 'fitness' },
  { termino: 'yoga studio', nicho: 'fitness' },
  { termino: 'pilates studio', nicho: 'fitness', favorito: true },
  { termino: 'crossfit box', nicho: 'fitness' },
  { termino: 'gimnasio', nicho: 'fitness' },
  { termino: 'sports complex', nicho: 'centros-deportivos' },
  { termino: 'padel club', nicho: 'centros-deportivos' },
  { termino: 'barber shop', nicho: 'barberias' },
  { termino: 'barbería', nicho: 'barberias' },
  { termino: 'beauty salon', nicho: 'salones-belleza' },
  { termino: 'hair salon', nicho: 'salones-belleza', favorito: true },
  { termino: 'nail salon', nicho: 'salones-belleza' },
  { termino: 'day spa', nicho: 'salones-belleza', favorito: true },
  { termino: 'tattoo shop', nicho: 'salones-belleza' },
  { termino: 'salón de belleza', nicho: 'salones-belleza' },
  { termino: 'centro de estética', nicho: 'salones-belleza' },

  // --- Comercio -----------------------------------------------------------
  { termino: 'furniture store', nicho: 'retail' },
  { termino: 'clothing store', nicho: 'retail' },
  { termino: 'jewelry store', nicho: 'retail', favorito: true },
  { termino: 'appliance store', nicho: 'retail' },
  { termino: 'hardware store', nicho: 'retail' },
  { termino: 'garden center', nicho: 'retail' },
  { termino: 'bike shop', nicho: 'retail' },
  { termino: 'boutique', nicho: 'retail' },
  { termino: 'pet store', nicho: 'mascotas' },
  { termino: 'pet groomer', nicho: 'mascotas' },
  { termino: 'dog trainer', nicho: 'mascotas' },
  { termino: 'tienda online', nicho: 'ecommerce' },

  // --- Industria y logística ---------------------------------------------
  { termino: 'manufacturer', nicho: 'manufactura', favorito: true, nota: 'B2B, webs antiguas' },
  { termino: 'metal fabricator', nicho: 'manufactura' },
  { termino: 'machine shop', nicho: 'manufactura' },
  { termino: 'fábrica', nicho: 'manufactura' },
  { termino: 'industrial equipment supplier', nicho: 'industriales' },
  { termino: 'wholesale distributor', nicho: 'industriales' },
  { termino: 'mayorista', nicho: 'industriales' },
  { termino: 'logistics service', nicho: 'logistica' },
  { termino: 'freight forwarding service', nicho: 'logistica', favorito: true },
  { termino: 'warehouse', nicho: 'logistica' },
  { termino: 'trucking company', nicho: 'transporte', favorito: true },
  { termino: 'moving company', nicho: 'transporte' },
  { termino: 'courier service', nicho: 'transporte' },
  { termino: 'empresa de transporte', nicho: 'transporte' },

  // --- Educación ----------------------------------------------------------
  { termino: 'private school', nicho: 'escuelas' },
  { termino: 'preschool', nicho: 'escuelas', favorito: true },
  { termino: 'colegio privado', nicho: 'escuelas' },
  { termino: 'guardería', nicho: 'escuelas' },
  { termino: 'language school', nicho: 'educacion' },
  { termino: 'driving school', nicho: 'educacion', favorito: true },
  { termino: 'tutoring service', nicho: 'educacion' },
  { termino: 'vocational school', nicho: 'educacion' },
  { termino: 'music school', nicho: 'educacion' },
  { termino: 'dance school', nicho: 'educacion' },
  { termino: 'academia de idiomas', nicho: 'educacion' },
  { termino: 'autoescuela', nicho: 'educacion' },

  // --- Marketing, creativos y tecnología ---------------------------------
  { termino: 'marketing agency', nicho: 'agencias-marketing', nota: 'ojo: competencia' },
  { termino: 'advertising agency', nicho: 'agencias-marketing' },
  { termino: 'photographer', nicho: 'estudios-creativos', favorito: true },
  { termino: 'video production service', nicho: 'estudios-creativos', favorito: true },
  { termino: 'graphic designer', nicho: 'estudios-creativos' },
  { termino: 'fotógrafo de bodas', nicho: 'estudios-creativos' },
  { termino: 'printing service', nicho: 'imprenta', favorito: true },
  { termino: 'sign shop', nicho: 'imprenta' },
  { termino: 'imprenta', nicho: 'imprenta' },
  { termino: 'software company', nicho: 'software' },
  { termino: 'it services', nicho: 'software' },

  // --- Organizaciones -----------------------------------------------------
  { termino: 'non profit organization', nicho: 'ong' },
  { termino: 'charity', nicho: 'ong' },
  { termino: 'fundación', nicho: 'ong' },
  { termino: 'asociación', nicho: 'ong' },
  { termino: 'chamber of commerce', nicho: 'ong' },
  { termino: 'church', nicho: 'iglesias', nota: 'presupuesto bajo' },
  { termino: 'iglesia', nicho: 'iglesias' },
]

/** Los recomendados, en el orden en que están definidos. */
export const TERMINOS_FAVORITOS: TerminoBusqueda[] = TERMINOS_BUSQUEDA.filter((t) => t.favorito)

/** Forma comparable para filtrar y deduplicar: minúsculas y sin acentos. */
export function claveTermino(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
