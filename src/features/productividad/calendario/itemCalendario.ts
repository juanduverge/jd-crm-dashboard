import { addMinutes, format, parseISO } from 'date-fns'
import type { Evento, FollowUpAgendaItem, Goal, HorarioBloque, Tarea } from '@/types'
import { iso, isoDow } from '../shared/goalMeta'

/**
 * LA CAPA QUE HACE POSIBLE EL CALENDARIO
 *
 * El calendario pinta cinco cosas que viven en cinco tablas distintas y que no
 * se parecen en nada entre sí: `eventos` (inicio/fin reales), `goals` (periodo
 * sin hora), `horario_bloques` (plantilla semanal recurrente), `tasks` (una
 * fecha de vencimiento) y `follow_ups` (una fecha de contacto).
 *
 * En vez de que cada vista sepa leer las cinco formas —que es como estaba
 * antes y por eso sólo existía la vista de mes— todas se normalizan aquí a un
 * único `ItemCalendario`. Las vistas sólo saben de esta forma; los servicios
 * sólo saben de la suya. Añadir una sexta fuente mañana es escribir un
 * `desde<X>()` más y ninguna vista cambia.
 *
 * REGLA: esto NO copia datos. Un item es una lectura de su fila de origen; lo
 * que se edita se manda al servicio de esa tabla. Ver la cabecera de la
 * migración 0018.
 */

export type FuenteItem = 'evento' | 'meta' | 'bloque' | 'tarea' | 'seguimiento'

export interface ItemCalendario {
  /**
   * Clave de React. No vale el id: un bloque del horario es una plantilla que
   * aparece en muchos días, así que el mismo id sale varias veces en pantalla.
   */
  clave: string
  /** Id en su tabla de origen. */
  id: string
  fuente: FuenteItem
  titulo: string
  /** Línea de apoyo: la hora, el progreso, el lead... según la fuente. */
  subtitulo?: string
  /** Día al que pertenece, yyyy-MM-dd. Es el que indexan las vistas. */
  fecha: string
  /** Ausentes en los items sin hora, que van a la franja de "todo el día". */
  inicio?: Date
  fin?: Date
  todoElDia: boolean
  color: ColorItem
  /**
   * Sólo los eventos se crean, mueven y borran desde el calendario. El resto
   * se pinta y se abre en su módulo: mover una meta aquí sería inventarle una
   * hora que su tabla no tiene dónde guardar.
   */
  editable: boolean
  evento?: Evento
}

// -------------------------------------------------------------
// COLOR
// -------------------------------------------------------------

/**
 * Paleta cerrada en vez de color libre. Tailwind compila las clases que ve
 * escritas, así que un `bg-[${hex}]` del usuario no existiría en el CSS final;
 * y una paleta corta obliga a que el color signifique algo, que es justo lo
 * que a Google Calendar se le fue de las manos.
 */
export type ColorItem =
  | 'coral' | 'azul' | 'verde' | 'ambar' | 'violeta' | 'rosa' | 'pizarra'

export const COLORES: { valor: ColorItem; label: string; muestra: string }[] = [
  { valor: 'coral', label: 'Coral', muestra: 'bg-primary-500' },
  { valor: 'azul', label: 'Azul', muestra: 'bg-sky-500' },
  { valor: 'verde', label: 'Verde', muestra: 'bg-emerald-500' },
  { valor: 'ambar', label: 'Ámbar', muestra: 'bg-amber-500' },
  { valor: 'violeta', label: 'Violeta', muestra: 'bg-violet-500' },
  { valor: 'rosa', label: 'Rosa', muestra: 'bg-pink-500' },
  { valor: 'pizarra', label: 'Pizarra', muestra: 'bg-slate-500' },
]

/** Clases del bloque pintado en la rejilla: fondo tenue + barra lateral. */
const CLASES: Record<ColorItem, { bloque: string; punto: string }> = {
  coral: { bloque: 'bg-primary-500/15 border-primary-500 text-primary-700 dark:text-primary-200', punto: 'bg-primary-500' },
  azul: { bloque: 'bg-sky-500/15 border-sky-500 text-sky-700 dark:text-sky-200', punto: 'bg-sky-500' },
  verde: { bloque: 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-200', punto: 'bg-emerald-500' },
  ambar: { bloque: 'bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-200', punto: 'bg-amber-500' },
  violeta: { bloque: 'bg-violet-500/15 border-violet-500 text-violet-700 dark:text-violet-200', punto: 'bg-violet-500' },
  rosa: { bloque: 'bg-pink-500/15 border-pink-500 text-pink-700 dark:text-pink-200', punto: 'bg-pink-500' },
  pizarra: { bloque: 'bg-slate-500/15 border-slate-500 text-slate-700 dark:text-slate-200', punto: 'bg-slate-500' },
}

export const clasesBloque = (c: ColorItem): string => CLASES[c].bloque
export const clasesPunto = (c: ColorItem): string => CLASES[c].punto

const esColor = (v: string | undefined): v is ColorItem =>
  !!v && COLORES.some((c) => c.valor === v)

/** Color por defecto de cada fuente, para que el calendario se lea de un vistazo. */
const COLOR_FUENTE: Record<FuenteItem, ColorItem> = {
  evento: 'coral',
  meta: 'violeta',
  bloque: 'azul',
  tarea: 'pizarra',
  seguimiento: 'ambar',
}

export const ETIQUETA_FUENTE: Record<FuenteItem, string> = {
  evento: 'Evento',
  meta: 'Meta',
  bloque: 'Bloque de trabajo',
  tarea: 'Tarea',
  seguimiento: 'Seguimiento',
}

// -------------------------------------------------------------
// GEOMETRÍA DE LA REJILLA HORARIA
// -------------------------------------------------------------

/** Alto de una hora en píxeles. Todo lo demás se deriva de aquí. */
export const HORA_PX = 48
/** Salto al que engancha el arrastre y al que se crea un hueco: 15 minutos. */
export const PASO_MIN = 15

export const minutosDelDia = (d: Date): number => d.getHours() * 60 + d.getMinutes()

/** Minutos → píxeles desde el borde superior de la rejilla. */
export const aPx = (min: number): number => (min / 60) * HORA_PX

/** Píxeles → minutos, redondeados al paso. Es la inversa de `aPx`. */
export function aMinutos(px: number): number {
  const bruto = (px / HORA_PX) * 60
  return Math.max(0, Math.min(24 * 60, Math.round(bruto / PASO_MIN) * PASO_MIN))
}

/**
 * Píxeles de DESPLAZAMIENTO → minutos, enganchados al paso. No es `aMinutos`:
 * aquí el valor es un delta, así que puede ser negativo y no se acota a un día.
 */
export const deltaMinutos = (px: number): number =>
  Math.round(((px / HORA_PX) * 60) / PASO_MIN) * PASO_MIN

/** Lo que dura como mínimo un evento arrastrado por su borde inferior. */
export const MIN_DURACION = 15

export const hhmm = (d: Date): string => format(d, 'HH:mm')

/** "9:30 – 10:15" o "9:30" si no dura nada (un recordatorio). */
export function fmtTramo(inicio: Date, fin: Date): string {
  const a = format(inicio, 'H:mm')
  return +fin === +inicio ? a : `${a} – ${format(fin, 'H:mm')}`
}

/** Fecha local a partir del día y los minutos desde medianoche. */
export function fechaEnMinuto(fecha: string, min: number): Date {
  const d = new Date(`${fecha}T00:00:00`)
  return addMinutes(d, min)
}

/** "HH:MM" del día dado, como Date local. */
export function fechaConHora(fecha: string, hora: string): Date {
  const [h, m] = hora.split(':')
  return fechaEnMinuto(fecha, (Number(h) || 0) * 60 + (Number(m) || 0))
}

// -------------------------------------------------------------
// NORMALIZADORES — uno por fuente
// -------------------------------------------------------------

export function desdeEvento(e: Evento): ItemCalendario {
  const inicio = parseISO(e.inicio)
  const fin = parseISO(e.fin)
  return {
    clave: `evento:${e.id}`,
    id: e.id,
    fuente: 'evento',
    titulo: e.titulo,
    subtitulo: e.todoElDia ? undefined : fmtTramo(inicio, fin),
    fecha: iso(inicio),
    inicio: e.todoElDia ? undefined : inicio,
    fin: e.todoElDia ? undefined : fin,
    todoElDia: e.todoElDia,
    color: esColor(e.color) ? e.color : COLOR_FUENTE.evento,
    editable: true,
    evento: e,
  }
}

/**
 * Una meta se pinta el día en que TERMINA, que es cuando exige algo. Las metas
 * de día caen en su propio día; las de semana y mes, en su fecha de cierre.
 */
export function desdeMeta(g: Goal): ItemCalendario {
  const fecha = g.periodo === 'dia' ? g.fechaInicio : g.fechaFin
  const pct = g.target > 0 ? Math.round((g.valorActual / g.target) * 100) : 0
  return {
    clave: `meta:${g.id}`,
    id: g.id,
    fuente: 'meta',
    titulo: g.nombre,
    subtitulo: g.periodo === 'dia' ? `${pct}%` : `Cierra la meta ${g.periodo === 'mes' ? 'mensual' : 'semanal'} · ${pct}%`,
    fecha,
    todoElDia: true,
    color: COLOR_FUENTE.meta,
    editable: false,
  }
}

/**
 * El bloque del horario es una PLANTILLA: no tiene fecha, tiene días de la
 * semana. Aquí se proyecta sobre un día concreto, que es lo que convierte el
 * horario en algo que se puede pintar junto a una reunión de las 10:30.
 */
export function desdeBloque(b: HorarioBloque, fecha: string): ItemCalendario {
  const inicio = fechaConHora(fecha, b.horaInicio)
  let fin = fechaConHora(fecha, b.horaFin)
  // Un bloque que cruza medianoche se corta al final del día: la rejilla es
  // de un día y partirlo en dos trozos confundiría más de lo que informa.
  if (fin <= inicio) fin = fechaEnMinuto(fecha, 24 * 60 - 1)
  return {
    clave: `bloque:${b.id}:${fecha}`,
    id: b.id,
    fuente: 'bloque',
    titulo: b.titulo,
    subtitulo: fmtTramo(inicio, fin),
    fecha,
    inicio,
    fin,
    todoElDia: false,
    color: COLOR_FUENTE.bloque,
    editable: false,
  }
}

export function desdeTarea(t: Tarea): ItemCalendario | null {
  if (!t.fechaVencimiento) return null
  return {
    clave: `tarea:${t.id}`,
    id: t.id,
    fuente: 'tarea',
    titulo: t.titulo,
    subtitulo: t.estado === 'hecha' ? 'Hecha' : 'Vence',
    fecha: t.fechaVencimiento,
    todoElDia: true,
    color: COLOR_FUENTE.tarea,
    editable: false,
  }
}

export function desdeSeguimiento(f: FollowUpAgendaItem): ItemCalendario {
  return {
    clave: `seguimiento:${f.id}`,
    id: f.id,
    fuente: 'seguimiento',
    titulo: f.leadEmpresa,
    subtitulo: `Seguimiento · ${f.tipo}`,
    fecha: f.fechaProgramada,
    todoElDia: true,
    color: COLOR_FUENTE.seguimiento,
    editable: false,
  }
}

// -------------------------------------------------------------
// ENSAMBLADO
// -------------------------------------------------------------

export interface FuentesCalendario {
  eventos?: Evento[]
  goals?: Goal[]
  bloques?: HorarioBloque[]
  tareas?: Tarea[]
  seguimientos?: FollowUpAgendaItem[]
}

/**
 * Construye todos los items del rango. Los bloques necesitan la lista de días
 * porque son recurrentes; el resto ya trae su fecha puesta.
 */
export function construirItems(f: FuentesCalendario, dias: Date[]): ItemCalendario[] {
  const out: ItemCalendario[] = []

  for (const e of f.eventos ?? []) out.push(desdeEvento(e))
  for (const g of f.goals ?? []) out.push(desdeMeta(g))
  for (const t of f.tareas ?? []) {
    const i = desdeTarea(t)
    if (i) out.push(i)
  }
  for (const s of f.seguimientos ?? []) out.push(desdeSeguimiento(s))

  const activos = (f.bloques ?? []).filter((b) => b.activo)
  if (activos.length) {
    for (const d of dias) {
      const dow = isoDow(d)
      const fecha = iso(d)
      for (const b of activos) {
        if (b.diasSemana.includes(dow)) out.push(desdeBloque(b, fecha))
      }
    }
  }

  return out
}

/** Índice por día. Las cuatro vistas preguntan siempre "¿qué hay el día X?". */
export function indexarPorFecha(items: ItemCalendario[]): Map<string, ItemCalendario[]> {
  const map = new Map<string, ItemCalendario[]>()
  for (const i of items) {
    const lista = map.get(i.fecha)
    if (lista) lista.push(i)
    else map.set(i.fecha, [i])
  }
  // Con hora primero y por hora; los de todo el día, al final y por título.
  for (const lista of map.values()) {
    lista.sort((a, b) => {
      if (a.inicio && b.inicio) return +a.inicio - +b.inicio
      if (a.inicio) return -1
      if (b.inicio) return 1
      return a.titulo.localeCompare(b.titulo)
    })
  }
  return map
}

// -------------------------------------------------------------
// SOLAPES — el reparto horizontal de la rejilla
// -------------------------------------------------------------

export interface ItemColocado {
  item: ItemCalendario
  /** Porcentajes, listos para `style`. */
  izquierda: number
  ancho: number
  topPx: number
  altoPx: number
}

/**
 * Reparte el ancho entre los items que se pisan, como hace Google Calendar:
 * se agrupan en "racimos" de solapes encadenados y cada racimo se divide en
 * tantas columnas como haga falta. Sin esto, dos reuniones a la misma hora se
 * taparían la una a la otra y sólo se vería la de arriba.
 */
export function colocar(items: ItemCalendario[]): ItemColocado[] {
  const conHora = items
    .filter((i): i is ItemCalendario & { inicio: Date; fin: Date } => !!i.inicio && !!i.fin)
    .sort((a, b) => +a.inicio - +b.inicio || +b.fin - +a.fin)

  const out: ItemColocado[] = []
  let racimo: (ItemCalendario & { inicio: Date; fin: Date })[] = []
  let finRacimo = 0

  const volcar = () => {
    if (!racimo.length) return
    // Columnas: cada item entra en la primera que ya haya terminado.
    const columnas: Date[] = []
    const col = new Map<string, number>()
    for (const it of racimo) {
      let c = columnas.findIndex((fin) => fin <= it.inicio)
      if (c === -1) { c = columnas.length; columnas.push(it.fin) }
      else columnas[c] = it.fin
      col.set(it.clave, c)
    }
    const n = columnas.length
    for (const it of racimo) {
      const desde = minutosDelDia(it.inicio)
      // Mínimo de 20 minutos de alto: un recordatorio de duración cero tiene
      // que seguir siendo clicable.
      const dura = Math.max(20, minutosDelDia(it.fin) - desde)
      out.push({
        item: it,
        izquierda: ((col.get(it.clave) ?? 0) / n) * 100,
        ancho: 100 / n,
        topPx: aPx(desde),
        altoPx: aPx(dura),
      })
    }
    racimo = []
    finRacimo = 0
  }

  for (const it of conHora) {
    if (racimo.length && +it.inicio >= finRacimo) volcar()
    racimo.push(it)
    finRacimo = Math.max(finRacimo, +it.fin)
  }
  volcar()

  return out
}
