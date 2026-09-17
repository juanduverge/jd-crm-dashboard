/**
 * Términos de búsqueda de prospectos, agrupados por sector.
 *
 * Esto NO es el catálogo de nichos (ese vive en la tabla `nichos`, migración
 * 0033, y sirve para clasificar el lead una vez dentro). Esto es la otra mitad:
 * qué se escribe en el buscador para que Apify/Google Maps devuelva algo.
 *
 * Son dos listas distintas a propósito. El catálogo tiene 37 nichos con
 * nombres bonitos para la interfaz ("Construcción"); el buscador necesita la
 * consulta concreta que Google entiende ("roofing contractor", "contratista de
 * techos", "general contractor"), y de cada nicho hay muchas. Buscar
 * "Construcción" en Maps devuelve ruido; buscar "roofing contractor" devuelve
 * 50 negocios con teléfono y web mala, que es el lead que sirve.
 *
 * El inglés va primero en los mercados de EE. UU. porque es como está
 * catalogado el negocio en Google: el idioma de la ficha se traduce, la
 * taxonomía no. El español está para buscar en LatAm y España.
 *
 * `favorito: true` marca lo que mejor convierte vendiendo webs: negocio local,
 * ticket alto, y web propia mala o inexistente. Salen arriba en el desplegable
 * sin tener que recordarlos.
 */

export interface TerminoBusqueda {
  /** Lo que se manda como `tipo_negocio`. */
  termino: string
  /** Lo que más funciona vendiendo webs: sale en "Recomendados". */
  favorito?: boolean
  /** Nota corta que se pinta a la derecha (por qué o dónde funciona). */
  nota?: string
}

export interface GrupoTerminos {
  grupo: string
  emoji: string
  terminos: TerminoBusqueda[]
}

export const TERMINOS_BUSQUEDA: GrupoTerminos[] = [
  {
    grupo: 'Construcción y reformas',
    emoji: '🏗️',
    terminos: [
      { termino: 'roofing contractor', favorito: true, nota: 'ticket alto, webs malas' },
      { termino: 'contratista de techos', favorito: true },
      { termino: 'general contractor', favorito: true },
      { termino: 'remodeling contractor', favorito: true },
      { termino: 'kitchen remodeler' },
      { termino: 'bathroom remodeler' },
      { termino: 'flooring contractor' },
      { termino: 'plumber', favorito: true, nota: 'mucho volumen' },
      { termino: 'electrician', favorito: true },
      { termino: 'hvac contractor', favorito: true, nota: 'aire acondicionado' },
      { termino: 'pool contractor' },
      { termino: 'fence contractor' },
      { termino: 'concrete contractor' },
      { termino: 'garage door repair' },
      { termino: 'window installation service' },
      { termino: 'solar energy company' },
      { termino: 'painter' },
      { termino: 'landscaper' },
      { termino: 'pest control service' },
      { termino: 'cleaning service' },
      { termino: 'moving company' },
      { termino: 'construction company' },
      { termino: 'constructora' },
      { termino: 'empresa de reformas' },
      { termino: 'fontanero' },
      { termino: 'electricista' },
    ],
  },
  {
    grupo: 'Arquitectura y diseño de espacios',
    emoji: '📐',
    terminos: [
      { termino: 'architecture firm', favorito: true, nota: 'valoran el diseño' },
      { termino: 'architect' },
      { termino: 'estudio de arquitectura', favorito: true },
      { termino: 'interior designer', favorito: true },
      { termino: 'diseño de interiores' },
      { termino: 'landscape architect' },
      { termino: 'civil engineer' },
      { termino: 'engineering consultant' },
      { termino: 'ingeniería civil' },
      { termino: 'cabinet maker' },
      { termino: 'furniture store' },
    ],
  },
  {
    grupo: 'Bienes raíces y finanzas',
    emoji: '🏠',
    terminos: [
      { termino: 'real estate agency', favorito: true, nota: 'el que más se ha usado' },
      { termino: 'real estate agent', favorito: true },
      { termino: 'inmobiliaria', favorito: true },
      { termino: 'property management company', favorito: true },
      { termino: 'mortgage broker', favorito: true },
      { termino: 'mortgage lender' },
      { termino: 'credit repair service', favorito: true, nota: 'ya probado' },
      { termino: 'credit counseling service' },
      { termino: 'crédito' },
      { termino: 'title company' },
      { termino: 'insurance agency', favorito: true },
      { termino: 'insurance broker' },
      { termino: 'agencia de seguros' },
      { termino: 'financial planner' },
      { termino: 'investment service' },
      { termino: 'notary public' },
    ],
  },
  {
    grupo: 'Servicios profesionales',
    emoji: '⚖️',
    terminos: [
      { termino: 'immigration lawyer', favorito: true, nota: 'ticket muy alto' },
      { termino: 'personal injury attorney', favorito: true },
      { termino: 'family law attorney' },
      { termino: 'criminal defense attorney' },
      { termino: 'business attorney' },
      { termino: 'law firm', favorito: true },
      { termino: 'abogado de inmigración' },
      { termino: 'bufete de abogados' },
      { termino: 'accounting firm', favorito: true },
      { termino: 'tax preparation service', favorito: true, nota: 'temporada fiscal' },
      { termino: 'bookkeeping service' },
      { termino: 'contador público' },
      { termino: 'asesoría fiscal' },
      { termino: 'gestoría' },
      { termino: 'business management consultant' },
      { termino: 'consultoría de empresas' },
      { termino: 'staffing agency' },
      { termino: 'translation service' },
    ],
  },
  {
    grupo: 'Salud y clínicas',
    emoji: '🏥',
    terminos: [
      { termino: 'dental clinic', favorito: true, nota: 'clásico que convierte' },
      { termino: 'dentist', favorito: true },
      { termino: 'clínica dental', favorito: true },
      { termino: 'orthodontist' },
      { termino: 'cosmetic dentist' },
      { termino: 'medical clinic', favorito: true },
      { termino: 'urgent care clinic' },
      { termino: 'plastic surgeon', favorito: true, nota: 'ticket alto' },
      { termino: 'dermatologist' },
      { termino: 'chiropractor', favorito: true },
      { termino: 'physical therapy clinic' },
      { termino: 'optometrist' },
      { termino: 'pediatrician' },
      { termino: 'psychologist' },
      { termino: 'fertility clinic' },
      { termino: 'med spa', favorito: true, nota: 'medicina estética' },
      { termino: 'veterinarian', favorito: true },
      { termino: 'clínica veterinaria' },
      { termino: 'home health care service' },
      { termino: 'assisted living facility' },
      { termino: 'pharmacy' },
    ],
  },
  {
    grupo: 'Automoción',
    emoji: '🚗',
    terminos: [
      { termino: 'auto repair shop', favorito: true, nota: 'probado en NY y TX' },
      { termino: 'taller mecánico', favorito: true },
      { termino: 'car dealer' },
      { termino: 'used car dealer', favorito: true },
      { termino: 'auto body shop' },
      { termino: 'tire shop' },
      { termino: 'car wash' },
      { termino: 'auto detailing service' },
      { termino: 'towing service' },
      { termino: 'concesionario' },
      { termino: 'taller de chapa y pintura' },
    ],
  },
  {
    grupo: 'Hostelería y turismo',
    emoji: '🍽️',
    terminos: [
      { termino: 'restaurant', favorito: true },
      { termino: 'restaurantes' },
      { termino: 'catering service', favorito: true, nota: 'necesitan web para pedidos' },
      { termino: 'bakery' },
      { termino: 'coffee shop' },
      { termino: 'bar' },
      { termino: 'food truck' },
      { termino: 'hotel' },
      { termino: 'boutique hotel' },
      { termino: 'bed and breakfast' },
      { termino: 'vacation rental agency', favorito: true },
      { termino: 'travel agency' },
      { termino: 'tour operator' },
      { termino: 'agencia de viajes' },
      { termino: 'event venue', favorito: true },
      { termino: 'wedding planner', favorito: true },
      { termino: 'salón de eventos' },
    ],
  },
  {
    grupo: 'Bienestar y belleza',
    emoji: '💅',
    terminos: [
      { termino: 'gym' },
      { termino: 'fitness center' },
      { termino: 'personal trainer' },
      { termino: 'yoga studio' },
      { termino: 'pilates studio', favorito: true },
      { termino: 'crossfit box' },
      { termino: 'gimnasio' },
      { termino: 'beauty salon' },
      { termino: 'hair salon', favorito: true },
      { termino: 'nail salon' },
      { termino: 'barber shop' },
      { termino: 'barbería' },
      { termino: 'day spa', favorito: true },
      { termino: 'tattoo shop' },
      { termino: 'salón de belleza' },
      { termino: 'centro de estética' },
      { termino: 'sports complex' },
      { termino: 'padel club' },
    ],
  },
  {
    grupo: 'Comercio y ecommerce',
    emoji: '🛒',
    terminos: [
      { termino: 'furniture store' },
      { termino: 'clothing store' },
      { termino: 'jewelry store', favorito: true },
      { termino: 'appliance store' },
      { termino: 'hardware store' },
      { termino: 'garden center' },
      { termino: 'pet store' },
      { termino: 'bike shop' },
      { termino: 'boutique' },
      { termino: 'tienda online' },
      { termino: 'mayorista' },
    ],
  },
  {
    grupo: 'Industria y logística',
    emoji: '🏭',
    terminos: [
      { termino: 'manufacturer', favorito: true, nota: 'B2B, webs antiguas' },
      { termino: 'industrial equipment supplier' },
      { termino: 'metal fabricator' },
      { termino: 'machine shop' },
      { termino: 'wholesale distributor' },
      { termino: 'logistics service' },
      { termino: 'freight forwarding service', favorito: true },
      { termino: 'trucking company', favorito: true },
      { termino: 'warehouse' },
      { termino: 'courier service' },
      { termino: 'empresa de transporte' },
      { termino: 'fábrica' },
    ],
  },
  {
    grupo: 'Educación y formación',
    emoji: '📚',
    terminos: [
      { termino: 'private school' },
      { termino: 'preschool', favorito: true },
      { termino: 'language school' },
      { termino: 'driving school', favorito: true },
      { termino: 'tutoring service' },
      { termino: 'vocational school' },
      { termino: 'music school' },
      { termino: 'dance school' },
      { termino: 'academia de idiomas' },
      { termino: 'autoescuela' },
      { termino: 'colegio privado' },
      { termino: 'guardería' },
    ],
  },
  {
    grupo: 'Marketing, tecnología y creativos',
    emoji: '📣',
    terminos: [
      { termino: 'marketing agency', nota: 'ojo: son competencia' },
      { termino: 'advertising agency' },
      { termino: 'graphic designer' },
      { termino: 'photographer', favorito: true },
      { termino: 'video production service', favorito: true },
      { termino: 'printing service' },
      { termino: 'sign shop' },
      { termino: 'software company' },
      { termino: 'it services' },
      { termino: 'imprenta' },
      { termino: 'fotógrafo de bodas' },
    ],
  },
  {
    grupo: 'Organizaciones',
    emoji: '🤝',
    terminos: [
      { termino: 'non profit organization' },
      { termino: 'charity' },
      { termino: 'church', nota: 'presupuesto bajo' },
      { termino: 'iglesia' },
      { termino: 'fundación' },
      { termino: 'asociación' },
      { termino: 'chamber of commerce' },
    ],
  },
]

/** Todos los términos en plano, para el `datalist` y el filtrado. */
export const TODOS_LOS_TERMINOS: TerminoBusqueda[] = TERMINOS_BUSQUEDA.flatMap((g) => g.terminos)

/** Los recomendados, en el orden en que están definidos. */
export const TERMINOS_FAVORITOS: TerminoBusqueda[] = TODOS_LOS_TERMINOS.filter((t) => t.favorito)

/** Forma comparable para filtrar: minúsculas y sin acentos. */
export function claveTermino(txt: string): string {
  return txt
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
