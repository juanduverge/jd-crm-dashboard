/**
 * Búsqueda avanzada de leads.
 *
 * Una sola caja de texto que busca en TODOS los campos de la ficha, con
 * sintaxis opcional por campo. Reemplaza al `fuzzyMatch` sobre cuatro campos
 * sueltos que tenía la lista de Leads.
 *
 * Ejemplos:
 *   madrid                        → cualquier campo contiene "madrid"
 *   dentista barcelona            → AND: los dos términos, en cualquier campo
 *   "clinica dental sur"          → frase exacta
 *   telefono:600123               → sólo por teléfono (compara sólo dígitos)
 *   ciudad:madrid nicho:dentista  → filtro por campo
 *   creado:>2026-01-01            → capturados después de esa fecha
 *   creado:7d                     → capturados en los últimos 7 días
 *   score:>70 valor:>=1000        → comparadores numéricos
 *   favorito:si ssl:no            → booleanos
 *   email:vacio                   → sin email  (también `email:tiene`)
 *   -perdido                      → excluye los que contengan "perdido"
 *
 * Todo se normaliza sin acentos y sin mayúsculas, así que "sanchez" encuentra
 * "Sánchez" y al revés.
 */

import type { Lead } from '@/types'

// ---------------------------------------------------------------------------
// Normalización
// ---------------------------------------------------------------------------

/** minúsculas + sin acentos + espacios colapsados. */
export function normalizar(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Sólo los dígitos: así "+34 600 12 34 56" y "600123456" son el mismo número. */
function soloDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D+/g, '')
}

/** Fecha a milisegundos, aceptando "2026-07-14" y ISO completo. Vacío → null. */
function aMillis(v: unknown): number | null {
  if (!v) return null
  const s = String(v)
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s)
  return isNaN(d.getTime()) ? null : d.getTime()
}

/**
 * Texto buscable de una fecha: el ISO y la versión legible en español, para
 * que la búsqueda libre encuentre tanto "2026-07-14" como "14 jul 2026".
 */
function fechaBuscable(v: unknown): string {
  const ms = aMillis(v)
  if (ms === null) return ''
  const d = new Date(ms)
  return `${d.toISOString().slice(0, 10)} ${d.toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  })} ${d.toLocaleDateString('es-ES')}`
}

// ---------------------------------------------------------------------------
// Catálogo de campos buscables
// ---------------------------------------------------------------------------

type TipoCampo = 'texto' | 'telefono' | 'numero' | 'fecha' | 'bool'

interface CampoBusqueda {
  /** Primer alias = nombre canónico; el resto son sinónimos aceptados. */
  claves: string[]
  etiqueta: string
  tipo: TipoCampo
  valor: (l: Lead) => unknown
  /** false = no entra en la búsqueda libre (sólo con `campo:`), para no ensuciar. */
  libre?: boolean
}

/**
 * Cada campo de la ficha del lead, con los alias en español que la gente
 * escribe de verdad ("tel", "movil", "calle", "correo"…).
 */
export const CAMPOS_BUSQUEDA: CampoBusqueda[] = [
  // --- Identidad ---
  { claves: ['id'], etiqueta: 'ID', tipo: 'texto', valor: (l) => l.id },
  { claves: ['empresa', 'nombre', 'negocio'], etiqueta: 'Empresa', tipo: 'texto', valor: (l) => l.empresa },
  { claves: ['cargo', 'puesto'], etiqueta: 'Cargo', tipo: 'texto', valor: (l) => l.cargo },
  { claves: ['nicho', 'sector'], etiqueta: 'Nicho', tipo: 'texto', valor: (l) => l.nicho },
  { claves: ['categoria'], etiqueta: 'Categoría', tipo: 'texto', valor: (l) => l.categoria },
  { claves: ['etiqueta', 'etiquetas', 'tag', 'tags'], etiqueta: 'Etiquetas', tipo: 'texto', valor: (l) => l.etiquetas?.join(' ') },

  // --- Localización ---
  { claves: ['ciudad'], etiqueta: 'Ciudad', tipo: 'texto', valor: (l) => l.ciudad },
  { claves: ['pais'], etiqueta: 'País', tipo: 'texto', valor: (l) => l.pais },
  { claves: ['direccion', 'calle', 'dir'], etiqueta: 'Dirección', tipo: 'texto', valor: (l) => l.direccion },
  { claves: ['maps', 'googlemaps'], etiqueta: 'Google Maps', tipo: 'texto', valor: (l) => l.googleMaps, libre: false },
  { claves: ['placeid'], etiqueta: 'Place ID', tipo: 'texto', valor: (l) => l.placeId, libre: false },

  // --- Contacto ---
  { claves: ['telefono', 'tel', 'movil', 'phone'], etiqueta: 'Teléfono', tipo: 'telefono',
    valor: (l) => [l.telefono, l.telefono2, ...(l.telefonos ?? [])].filter(Boolean).join(' | ') },
  { claves: ['email', 'correo', 'mail'], etiqueta: 'Email', tipo: 'texto',
    valor: (l) => [l.email, ...(l.emails ?? [])].filter(Boolean).join(' | ') },
  { claves: ['web', 'sitio', 'url'], etiqueta: 'Web', tipo: 'texto', valor: (l) => l.web },
  { claves: ['whatsapp', 'wa'], etiqueta: 'WhatsApp', tipo: 'telefono', valor: (l) => l.whatsapp },

  // --- Redes ---
  { claves: ['instagram', 'ig'], etiqueta: 'Instagram', tipo: 'texto', valor: (l) => l.instagram },
  { claves: ['facebook', 'fb'], etiqueta: 'Facebook', tipo: 'texto', valor: (l) => l.facebook },
  { claves: ['linkedin'], etiqueta: 'LinkedIn', tipo: 'texto', valor: (l) => l.linkedin },
  { claves: ['youtube'], etiqueta: 'YouTube', tipo: 'texto', valor: (l) => l.youtube },
  { claves: ['tiktok'], etiqueta: 'TikTok', tipo: 'texto', valor: (l) => l.tiktok },
  { claves: ['twitter', 'x'], etiqueta: 'Twitter', tipo: 'texto', valor: (l) => l.twitter },
  { claves: ['pinterest'], etiqueta: 'Pinterest', tipo: 'texto', valor: (l) => l.pinterest },

  // --- Pipeline ---
  { claves: ['estado', 'etapa'], etiqueta: 'Estado', tipo: 'texto', valor: (l) => l.estado },
  { claves: ['prioridad'], etiqueta: 'Prioridad', tipo: 'texto', valor: (l) => l.prioridad },
  { claves: ['canal'], etiqueta: 'Canal', tipo: 'texto', valor: (l) => l.canalPrincipal },
  { claves: ['responsable', 'owner'], etiqueta: 'Responsable', tipo: 'texto', valor: (l) => l.responsable },
  { claves: ['fuente', 'origen'], etiqueta: 'Fuente', tipo: 'texto', valor: (l) => l.fuente },
  { claves: ['valor', 'importe'], etiqueta: 'Valor estimado', tipo: 'numero', valor: (l) => l.valorEstimado },
  { claves: ['probabilidad'], etiqueta: 'Probabilidad', tipo: 'numero', valor: (l) => l.probabilidad },
  { claves: ['favorito', 'fav'], etiqueta: 'Favorito', tipo: 'bool', valor: (l) => l.favorito },

  // --- Puntuación y diagnóstico ---
  { claves: ['score', 'puntuacion'], etiqueta: 'Score', tipo: 'numero', valor: (l) => l.score },
  { claves: ['scoreia', 'ia'], etiqueta: 'Score IA', tipo: 'numero', valor: (l) => l.scoreIA },
  { claves: ['scoremanual'], etiqueta: 'Score manual', tipo: 'numero', valor: (l) => l.scoreManual },
  { claves: ['rating', 'estrellas'], etiqueta: 'Rating Google', tipo: 'numero', valor: (l) => l.ratingGoogle },
  { claves: ['resenas', 'reviews'], etiqueta: 'Nº reseñas', tipo: 'numero', valor: (l) => l.numResenas },
  { claves: ['pagespeed', 'psi'], etiqueta: 'PageSpeed móvil', tipo: 'numero', valor: (l) => l.pageSpeedMovil },
  { claves: ['pagespeeddesktop'], etiqueta: 'PageSpeed escritorio', tipo: 'numero', valor: (l) => l.pageSpeedDesktop },
  { claves: ['ssl'], etiqueta: 'SSL', tipo: 'bool', valor: (l) => l.tieneSSL },
  { claves: ['diagnostico'], etiqueta: 'Diagnóstico IA', tipo: 'texto', valor: (l) => l.diagnosticoIA },
  { claves: ['observaciones'], etiqueta: 'Observaciones IA', tipo: 'texto', valor: (l) => l.observacionesIA },
  { claves: ['recomendaciones'], etiqueta: 'Recomendaciones IA', tipo: 'texto', valor: (l) => l.recomendacionesIA },
  { claves: ['oportunidades'], etiqueta: 'Oportunidades IA', tipo: 'texto', valor: (l) => l.oportunidadesIA },
  { claves: ['errores'], etiqueta: 'Errores IA', tipo: 'texto', valor: (l) => l.erroresIA },
  { claves: ['notas', 'nota'], etiqueta: 'Notas', tipo: 'texto', valor: (l) => l.notas },

  // --- Seguimiento ---
  { claves: ['toque', 'toques', 'touch'], etiqueta: 'Toque actual', tipo: 'numero', valor: (l) => l.touchActual },
  { claves: ['ultimaaccion', 'accion'], etiqueta: 'Última acción', tipo: 'texto', valor: (l) => l.ultimaAccion },
  { claves: ['ultimocontactotipo'], etiqueta: 'Tipo último contacto', tipo: 'texto', valor: (l) => l.ultimoContactoTipo },
  { claves: ['resultado'], etiqueta: 'Resultado último contacto', tipo: 'texto', valor: (l) => l.ultimoContactoResultado },
  { claves: ['motivo', 'motivocierre'], etiqueta: 'Motivo de cierre', tipo: 'texto', valor: (l) => l.motivoCierre },

  // --- Fechas ---
  { claves: ['creado', 'captura', 'fechacaptura', 'alta'], etiqueta: 'Fecha de captura', tipo: 'fecha', valor: (l) => l.fechaCaptura },
  { claves: ['seguimiento', 'proximo'], etiqueta: 'Próximo seguimiento', tipo: 'fecha', valor: (l) => l.proximoSeguimiento },
  { claves: ['movimiento', 'actualizado'], etiqueta: 'Último movimiento', tipo: 'fecha', valor: (l) => l.fechaUltimoMovimiento },
  { claves: ['cierre', 'fechacierre'], etiqueta: 'Fecha estimada de cierre', tipo: 'fecha', valor: (l) => l.fechaCierreEstimada },
  { claves: ['cerrado', 'cerradoen'], etiqueta: 'Cerrado en', tipo: 'fecha', valor: (l) => l.cerradoEn },
  { claves: ['primercontacto'], etiqueta: 'Primer contacto', tipo: 'fecha', valor: (l) => l.primerContactoEn },
  { claves: ['ultimocontacto'], etiqueta: 'Último contacto', tipo: 'fecha', valor: (l) => l.ultimoContactoEn },
  { claves: ['respondio'], etiqueta: 'Respondió en', tipo: 'fecha', valor: (l) => l.respondioEn },
]

const POR_CLAVE = new Map<string, CampoBusqueda>()
for (const campo of CAMPOS_BUSQUEDA) {
  for (const clave of campo.claves) POR_CLAVE.set(clave, campo)
}

/** Alias canónicos, para la ayuda de la interfaz. */
export const AYUDA_CAMPOS = CAMPOS_BUSQUEDA.map((c) => ({
  clave: c.claves[0],
  alias: c.claves.slice(1),
  etiqueta: c.etiqueta,
  tipo: c.tipo,
}))

// ---------------------------------------------------------------------------
// Texto plano de un lead (para la búsqueda libre)
// ---------------------------------------------------------------------------

interface Heno { texto: string; digitos: string }

const cacheHeno = new WeakMap<Lead, Heno>()

/**
 * Todo el contenido buscable del lead en una sola cadena normalizada.
 * Se cachea por objeto: la lista se refiltra en cada tecla y los leads son
 * inmutables (el store los reemplaza al actualizar), así que la caché es válida.
 */
function henoDe(lead: Lead): Heno {
  const previo = cacheHeno.get(lead)
  if (previo !== undefined) return previo
  const partes: string[] = []
  const digitos: string[] = []
  for (const campo of CAMPOS_BUSQUEDA) {
    if (campo.libre === false) continue
    const v = campo.valor(lead)
    if (v === null || v === undefined || v === '') continue
    if (campo.tipo === 'fecha') partes.push(fechaBuscable(v))
    else if (campo.tipo === 'bool') partes.push(v ? campo.claves[0] : '')
    else {
      partes.push(String(v))
      // Los teléfonos van a su propio índice de dígitos: mezclarlos con el
      // texto hacía que "(727)" casara con cualquier cifra suelta de la ficha.
      if (campo.tipo === 'telefono') {
        for (const t of String(v).split('|')) {
          const d = soloDigitos(t)
          if (d) digitos.push(d)
        }
      }
    }
  }
  const heno: Heno = {
    texto: normalizar(partes.join(' · ')),
    digitos: digitos.join(' '),
  }
  cacheHeno.set(lead, heno)
  return heno
}

/** Todo el contenido buscable del lead como texto plano (para depurar/exportar). */
export function textoBuscable(lead: Lead): string {
  const h = henoDe(lead)
  return `${h.texto} ${h.digitos}`.trim()
}

// ---------------------------------------------------------------------------
// Parseo de la consulta
// ---------------------------------------------------------------------------

type Operador = '=' | '>' | '<' | '>=' | '<='

interface Termino {
  negado: boolean
  /** null = término libre (busca en todo el texto del lead). */
  campo: CampoBusqueda | null
  operador: Operador
  valor: string
  /** El término es un número: se compara contra el índice de dígitos. */
  telefono?: boolean
}

/** Trocea respetando comillas: `ciudad:"las palmas"` es un solo trozo. */
function trocear(q: string): string[] {
  return q.match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
}

function quitarComillas(v: string): string {
  return v.replace(/"/g, '')
}

/**
 * ¿La consulta entera es un número de teléfono? "(727) 471-0677" lleva espacios,
 * así que trocearla por espacios la convertía en dos términos sueltos —
 * y "(727)" casaba con media base. Se trata como UN solo término telefónico.
 */
function esConsultaTelefono(q: string): boolean {
  const s = q.trim()
  if (!/^[+()\-.\s\d]+$/.test(s)) return false
  return soloDigitos(s).length >= 6
}

export function parsearConsulta(q: string): Termino[] {
  const terminos: Termino[] = []
  if (esConsultaTelefono(q)) {
    return [{ negado: false, campo: null, operador: '=', valor: q.trim(), telefono: true }]
  }
  for (const bruto of trocear(q)) {
    let texto = bruto
    let negado = false
    if (texto.startsWith('-') && texto.length > 1) {
      negado = true
      texto = texto.slice(1)
    }
    const m = texto.match(/^([a-zA-Z_][a-zA-Z0-9_]*):(>=|<=|>|<|=)?(.*)$/)
    if (m) {
      const campo = POR_CLAVE.get(normalizar(m[1]))
      if (campo) {
        terminos.push({
          negado,
          campo,
          operador: (m[2] as Operador) || '=',
          valor: quitarComillas(m[3]).trim(),
        })
        continue
      }
    }
    const valor = quitarComillas(texto).trim()
    if (valor) terminos.push({ negado, campo: null, operador: '=', valor })
  }
  return terminos
}

// ---------------------------------------------------------------------------
// Comparadores por tipo
// ---------------------------------------------------------------------------

const VACIO = new Set(['vacio', 'vacia', 'sin', 'ninguno', 'nulo', 'null'])
const CON_VALOR = new Set(['tiene', 'con', 'lleno', 'algo', '*'])
const VERDADERO = new Set(['si', 'true', '1', 'yes', 'y', 'v'])
const FALSO = new Set(['no', 'false', '0', 'n', 'f'])

/** Rango [desde, hasta) en milisegundos a partir de un valor de fecha escrito. */
function rangoFecha(v: string): { desde: number; hasta: number } | null {
  const s = normalizar(v)
  const ahora = new Date()
  const inicioDia = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime()
  const DIA = 86_400_000

  if (s === 'hoy') return { desde: inicioDia, hasta: inicioDia + DIA }
  if (s === 'ayer') return { desde: inicioDia - DIA, hasta: inicioDia }
  if (s === 'manana') return { desde: inicioDia + DIA, hasta: inicioDia + 2 * DIA }
  if (s === 'semana') return { desde: inicioDia - 7 * DIA, hasta: inicioDia + DIA }
  if (s === 'mes') return { desde: inicioDia - 30 * DIA, hasta: inicioDia + DIA }
  if (s === 'ano' || s === 'año') return { desde: inicioDia - 365 * DIA, hasta: inicioDia + DIA }

  // "7d" / "3m" / "2a" → últimos N días / meses / años.
  const rel = s.match(/^(\d+)\s*(d|m|a)$/)
  if (rel) {
    const n = Number(rel[1])
    const dias = rel[2] === 'd' ? n : rel[2] === 'm' ? n * 30 : n * 365
    return { desde: inicioDia - dias * DIA, hasta: inicioDia + DIA }
  }

  // "2026" → todo el año. "2026-07" → todo el mes. "2026-07-14" → ese día.
  let m = s.match(/^(\d{4})$/)
  if (m) return { desde: Date.UTC(+m[1], 0, 1), hasta: Date.UTC(+m[1] + 1, 0, 1) }
  m = s.match(/^(\d{4})[-/](\d{1,2})$/)
  if (m) return { desde: Date.UTC(+m[1], +m[2] - 1, 1), hasta: Date.UTC(+m[1], +m[2], 1) }
  m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (m) {
    const d = Date.UTC(+m[1], +m[2] - 1, +m[3])
    return { desde: d, hasta: d + DIA }
  }
  // "14/07/2026" o "14-7-2026" (formato español).
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
  if (m) {
    const d = Date.UTC(+m[3], +m[2] - 1, +m[1])
    return { desde: d, hasta: d + DIA }
  }
  return null
}

function comparar(op: Operador, a: number, b: number): boolean {
  switch (op) {
    case '>': return a > b
    case '<': return a < b
    case '>=': return a >= b
    case '<=': return a <= b
    default: return a === b
  }
}

function cumpleCampo(lead: Lead, t: Termino): boolean {
  const campo = t.campo!
  const bruto = campo.valor(lead)
  const vacio = bruto === null || bruto === undefined || bruto === '' ||
    (Array.isArray(bruto) && bruto.length === 0)
  const q = normalizar(t.valor)

  if (!q) return !vacio                    // `ciudad:` → los que tienen ciudad
  if (VACIO.has(q)) return vacio
  if (CON_VALOR.has(q)) return !vacio
  if (vacio) return false

  switch (campo.tipo) {
    case 'bool': {
      const esperado = VERDADERO.has(q) ? true : FALSO.has(q) ? false : null
      return esperado === null ? Boolean(bruto) : Boolean(bruto) === esperado
    }
    case 'numero': {
      const n = Number(bruto)
      const objetivo = Number(q.replace(',', '.'))
      if (isNaN(n) || isNaN(objetivo)) return false
      return comparar(t.operador, n, objetivo)
    }
    case 'fecha': {
      const ms = aMillis(bruto)
      if (ms === null) return false
      const rango = rangoFecha(t.valor)
      if (!rango) return normalizar(fechaBuscable(bruto)).includes(q)
      switch (t.operador) {
        case '>': return ms >= rango.hasta
        case '>=': return ms >= rango.desde
        case '<': return ms < rango.desde
        case '<=': return ms < rango.hasta
        default: return ms >= rango.desde && ms < rango.hasta
      }
    }
    case 'telefono': {
      const digitosQ = soloDigitos(t.valor)
      if (digitosQ) return soloDigitos(bruto).includes(digitosQ)
      return normalizar(bruto).includes(q)
    }
    default:
      return normalizar(bruto).includes(q)
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * ¿Este lead cumple la consulta? Todos los términos son AND; los prefijados
 * con `-` son exclusiones. Consulta vacía → siempre sí.
 */
export function coincideLead(lead: Lead, consulta: string): boolean {
  return crearFiltroLeads(consulta)(lead)
}

/**
 * ¿Un término libre casa con el lead?
 *
 * Sólo subcadena, nunca subsecuencia difusa: sobre un texto que concatena 48
 * campos, el difuso casaba con casi cualquier ficha (buscar un teléfono
 * devolvía la base entera). La precisión importa más que la tolerancia a
 * erratas cuando la caja busca en todo.
 */
function cumpleLibre(heno: Heno, t: Termino): boolean {
  const digitos = soloDigitos(t.valor)
  const enTelefonos = () => heno.digitos.split(' ').some((d) => d.includes(digitos))
  if (t.telefono) return digitos.length > 0 && enTelefonos()
  if (heno.texto.includes(normalizar(t.valor))) return true
  // Un término mayormente numérico también se prueba contra los teléfonos.
  return digitos.length >= 4 && enTelefonos()
}

/** Versión precompilada, para no reparsear la consulta en cada fila. */
export function crearFiltroLeads(consulta: string): (lead: Lead) => boolean {
  const terminos = parsearConsulta(consulta)
  if (terminos.length === 0) return () => true
  return (lead: Lead) => {
    const heno = henoDe(lead)
    for (const t of terminos) {
      const ok = t.campo ? cumpleCampo(lead, t) : cumpleLibre(heno, t)
      if (ok === t.negado) return false
    }
    return true
  }
}

/**
 * Cuánto "encaja" un lead con la consulta, para ordenar los resultados.
 * Mayor = más arriba. Los tramos son gruesos a propósito: sólo suben lo que es
 * claramente el lead que buscabas (teléfono exacto, nombre que empieza igual),
 * y dejan el resto empatado para que el orden de columna siga mandando.
 */
export function relevanciaLead(lead: Lead, consulta: string): number {
  const q = consulta.trim()
  if (!q) return 0
  const heno = henoDe(lead)
  const digitos = soloDigitos(q)

  if (digitos.length >= 6) {
    const tels = heno.digitos.split(' ')
    if (tels.some((d) => d === digitos)) return 100        // teléfono idéntico
    if (tels.some((d) => d.endsWith(digitos))) return 90   // sin prefijo de país
    if (tels.some((d) => d.includes(digitos))) return 80
  }

  const n = normalizar(q)
  const empresa = normalizar(lead.empresa)
  if (empresa === n) return 100
  if (empresa.startsWith(n)) return 70
  if (empresa.includes(n)) return 60
  if (normalizar(lead.email).includes(n) || normalizar(lead.ciudad).includes(n)) return 40
  return 0
}
