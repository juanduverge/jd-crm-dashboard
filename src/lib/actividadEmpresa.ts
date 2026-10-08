/**
 * A qué se dedica una empresa recién registrada, deducido de su nombre.
 *
 * Los registros mercantiles dan el nombre y poco más; solo Connecticut publica
 * la actividad. Pero el nombre suele decirlo: «Robby's Classic Hair Shop LLC»
 * es una peluquería. Esto son reglas de palabras, sin IA: gratis, instantáneo
 * y siempre igual. Lo que no encaje en ninguna queda sin clasificar, que es
 * preferible a inventarle un nicho.
 *
 * Cada regla apunta a un término de `TERMINOS_BUSQUEDA`, no a un nicho suelto:
 * así la empresa entra al CRM con la misma etiqueta que tendría si la hubieras
 * capturado buscando ese término, y el importador la normaliza con la tabla
 * `nicho_alias` de siempre.
 */

import { DEFAULT_NICHES } from '@/lib/config'
import { NICHOS_EXTRA, TERMINOS_BUSQUEDA } from '@/lib/nichosBusqueda'

export interface Actividad {
  /** Término del catálogo; es lo que viaja al importador como categoría. */
  termino: string
  /** Id del nicho al que pertenece ese término. */
  nicho: string
  /** Nombre del nicho para pintar. */
  nombre: string
}

const NOMBRE_NICHO = new Map<string, string>([
  ...DEFAULT_NICHES.map((n) => [n.id, n.nombre] as const),
  ...NICHOS_EXTRA.map((n) => [n.id, n.nombre] as const),
])

const NICHO_DE_TERMINO = new Map(TERMINOS_BUSQUEDA.map((t) => [t.termino, t.nicho] as const))

/**
 * El orden importa: gana la primera que case. Lo específico va antes que lo
 * genérico («kitchen remodel» antes que «kitchen», «interior design» antes que
 * «design»).
 */
const REGLAS: [RegExp, string][] = [
  // Construcción y oficios
  [/\broof(ing|ers?)?\b/, 'roofing contractor'],
  [/\bplumb(ing|ers?)\b/, 'plumber'],
  [/\b(hvac|heating|cooling|air condition\w*|refrigeration)\b/, 'hvac contractor'],
  [/\belectric(al|ians?)?\b/, 'electrician'],
  [/\b(remodel\w*|renovations?)\b/, 'remodeling contractor'],
  [/\b(floor(ing|s)?|tile|carpet)\b/, 'flooring contractor'],
  [/\b(paint(ing|ers?)?|drywall)\b/, 'painter'],
  [/\b(landscap\w*|lawn|mowing|tree (service|care)|gardening|irrigation)\b/, 'landscaper'],
  [/\b(concrete|masonry|paving|asphalt)\b/, 'concrete contractor'],
  [/\bfenc(e|es|ing)\b/, 'fence contractor'],
  [/\bpools?\b/, 'pool contractor'],
  [/\bgarage doors?\b/, 'garage door repair'],
  [/\b(windows?|glass|siding|gutters?)\b/, 'window installation service'],
  [/\bsolar\b/, 'solar energy company'],
  [/\b(construction|contract(ing|ors?)|builders?|carpentry|handyman|excavat\w*|framing|welding)\b/, 'general contractor'],

  // Limpieza
  [/\b(pressure|power) wash\w*\b/, 'pressure washing service'],
  [/\b(pest|exterminat\w*)\b/, 'pest control service'],
  [/\b(clean(ing|ers?)?|janitorial|maids?|housekeeping)\b/, 'cleaning service'],

  // Motor
  [/\b(detail(ing|ers?)?)\b/, 'auto detailing service'],
  [/\bcar ?wash\b/, 'car wash'],
  [/\b(towing|tow)\b/, 'towing service'],
  [/\b(auto body|collision)\b/, 'auto body shop'],
  [/\btires?\b/, 'tire shop'],
  [/\b(auto(motive)? (repair|service|care)|mechanics?|automotive|diesel repair)\b/, 'auto repair shop'],
  [/\b(auto sales|motors|car sales|dealership)\b/, 'used car dealer'],

  // Belleza y cuidado personal
  [/\bbarbers?(shop)?\b/, 'barber shop'],
  [/\b(nails?)\b/, 'nail salon'],
  [/\b(tattoo|ink)\b/, 'tattoo shop'],
  [/\b(med ?spa|aesthetics?|botox)\b/, 'med spa'],
  [/\b(hair|stylists?|braids?|locs)\b/, 'hair salon'],
  [/\b(salon|beauty|lash(es)?|brows?|esthetic\w*|skin ?care|waxing|makeup)\b/, 'beauty salon'],
  [/\b(spa|massage)\b/, 'day spa'],

  // Salud
  [/\b(dental|dentist\w*|orthodont\w*)\b/, 'dental clinic'],
  [/\bchiropract\w*\b/, 'chiropractor'],
  [/\b(veterinar\w*|animal hospital)\b/, 'veterinarian'],
  [/\b(home (health|care)|senior care|caregiv\w*|assisted living)\b/, 'home health care service'],
  [/\b(physical therapy|rehab\w*|physio\w*)\b/, 'physical therapy clinic'],
  [/\b(counseling|psycholog\w*|psychiatr\w*|mental health|behavioral)\b/, 'psychologist'],
  [/\bpharmac\w*\b/, 'pharmacy'],
  [/\b(clinic|medical|health ?care|urgent care|wellness|pediatric\w*)\b/, 'medical clinic'],

  // Hostelería
  [/\bfood trucks?\b/, 'food truck'],
  [/\bcatering\b/, 'catering service'],
  [/\b(bakery|bakes|cakes?|cupcakes?|donuts?|pastr\w*)\b/, 'bakery'],
  [/\b(coffee|cafe|espresso|roasters?|tea house)\b/, 'coffee shop'],
  [/\b(restaurant\w*|grill|pizza\w*|tacos?|taqueria|cantina|bbq|barbecue|sushi|burgers?|diner|bistro|kitchen|eatery|wings|noodles?|ramen|deli|cuisine|steakhouse|pub|tavern|brew\w*)\b/, 'restaurant'],
  [/\b(hotel|motel|inn|lodge)\b/, 'hotel'],
  [/\b(travel|tours?|vacations?)\b/, 'travel agency'],
  [/\b(wedding\w*|events?|party|parties|banquet)\b/, 'wedding planner'],

  // Fitness
  [/\b(yoga)\b/, 'yoga studio'],
  [/\bpilates\b/, 'pilates studio'],
  [/\b(gym|fitness|crossfit|martial arts|boxing|jiu ?jitsu|personal training|athletics?)\b/, 'gym'],

  // Mascotas
  [/\b(groom(ing|ers?)|dog|dogs|pets?|paws?|canine|kennel)\b/, 'pet groomer'],

  // Servicios profesionales
  [/\b(law|legal|attorneys?|lawyers?)\b/, 'law firm'],
  [/\b(account(ing|ants?)|bookkeep\w*|tax(es)?|cpa)\b/, 'accounting firm'],
  [/\binsurance\b/, 'insurance agency'],
  [/\b(mortgage|lending|loans?)\b/, 'mortgage broker'],
  [/\b(realty|real estate|realtors?)\b/, 'real estate agency'],
  [/\bproperty management\b/, 'property management company'],
  [/\bstaffing\b/, 'staffing agency'],
  [/\bnotary\b/, 'notary public'],
  [/\b(architect\w*)\b/, 'architecture firm'],
  [/\binterior(s| design\w*)\b/, 'interior designer'],
  [/\bengineering\b/, 'engineering consultant'],

  // Transporte
  [/\b(moving|movers)\b/, 'moving company'],
  [/\b(trucking|hauling|haulers?|freight|carriers?|transport\w*|express)\b/, 'trucking company'],
  [/\b(logistics|dispatch\w*)\b/, 'logistics service'],
  [/\b(courier|delivery|deliveries)\b/, 'courier service'],

  // Creatividad y tecnología
  [/\b(photo\w*|portraits?)\b/, 'photographer'],
  [/\b(films?|video\w*|productions?|media)\b/, 'video production service'],
  [/\b(marketing|advertising|branding|seo)\b/, 'marketing agency'],
  [/\b(print(ing|s)?|signs?|embroidery|screen ?print\w*)\b/, 'printing service'],
  [/\b(graphic\w*|design(s|ers?)?|creative)\b/, 'graphic designer'],
  [/\b(software|tech(nolog\w*)?|digital|apps?|cyber\w*|data|cloud|it (services|solutions)|ai)\b/, 'software company'],

  // Educación
  [/\b(daycare|day care|child ?care|preschool|montessori|learning center)\b/, 'preschool'],
  [/\b(tutor\w*|academy|learning|education\w*|school)\b/, 'tutoring service'],
  [/\b(dance)\b/, 'dance school'],
  [/\b(music)\b/, 'music school'],

  // Comercio
  [/\b(jewel\w*)\b/, 'jewelry store'],
  [/\bfurniture\b/, 'furniture store'],
  [/\b(boutique|apparel|clothing|fashion|threads|wear)\b/, 'boutique'],

  // Sin ánimo de lucro (no son clientes típicos, pero se etiquetan para poder apartarlos)
  [/\b(church|ministr\w*|chapel|iglesia)\b/, 'church'],
  [/\b(foundation|nonprofit|non-profit|charit\w*|association|coalition)\b/, 'non profit organization'],

  // Lo más genérico, al final
  [/\bconsult(ing|ants?|ancy)\b/, 'business management consultant'],
]

/** Deduce la actividad a partir del nombre y, si la hay, de la categoría oficial. */
export function clasificarActividad(nombre: string, categoriaOficial?: string): Actividad | null {
  const texto = `${nombre} ${categoriaOficial ?? ''}`.toLowerCase()
  for (const [patron, termino] of REGLAS) {
    if (!patron.test(texto)) continue
    const nicho = NICHO_DE_TERMINO.get(termino)
    if (!nicho) continue
    return { termino, nicho, nombre: NOMBRE_NICHO.get(nicho) ?? nicho }
  }
  return null
}
