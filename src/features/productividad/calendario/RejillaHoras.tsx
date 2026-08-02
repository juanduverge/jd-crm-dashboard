import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { format, isToday } from 'date-fns'
import { es } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { iso } from '../shared/goalMeta'
import {
  HORA_PX, MIN_DURACION, aMinutos, aPx, clasesBloque, clasesPunto, colocar, deltaMinutos,
  fechaEnMinuto, fmtTramo, minutosDelDia,
  type ItemCalendario,
} from './itemCalendario'

/**
 * La rejilla de horas. La comparten la vista de día (una columna) y la de
 * semana (siete): son la misma cuadrícula con distinto número de días, y
 * escribirla dos veces habría sido dos sitios donde arreglar cada detalle de
 * posicionamiento.
 *
 * Los items sin hora (metas, tareas, seguimientos, eventos de todo el día) no
 * caben en una rejilla de horas: van a la franja de arriba, como en Google
 * Calendar. Meterlos a las 00:00 sería mentir sobre cuándo pasan.
 *
 * ARRASTRE (fase 15). Sólo se arrastra lo `editable`, que hoy son los eventos:
 * mover una meta le inventaría una hora que su tabla no tiene, y mover un
 * bloque del horario cambiaría la plantilla de TODAS las semanas. Se puede
 * mover el bloque entero —también de un día a otro, en la vista de semana— y
 * estirarlo por su borde inferior. Todo engancha al paso de 15 minutos.
 *
 * Va con eventos de puntero y no con HTML5 drag-and-drop porque aquí hace
 * falta la posición exacta del ratón en píxeles para traducirla a minutos, y
 * el arrastre nativo sólo da el elemento sobre el que sueltas.
 */

const HORAS = Array.from({ length: 24 }, (_, h) => h)

const DIA_MIN = 24 * 60

type ModoArrastre = 'mover' | 'redimensionar'

interface Arrastre {
  item: ItemCalendario
  modo: ModoArrastre
  /** Origen del gesto, para medir el desplazamiento. */
  y0: number
  fecha0: string
  inicio0: number
  fin0: number
  /** Dónde está ahora, en minutos desde medianoche del día `fecha`. */
  fecha: string
  inicio: number
  fin: number
  /** Hasta que no se mueve de verdad, el gesto sigue siendo un clic. */
  movido: boolean
}

const hhmmDe = (min: number): string =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function RejillaHoras({
  dias, porFecha, onHueco, onItem, onMover, conCabecera = true,
}: {
  dias: Date[]
  porFecha: Map<string, ItemCalendario[]>
  /** Clic en un hueco libre: crear ahí. `hora` viene en HH:MM. */
  onHueco: (fecha: string, hora: string) => void
  onItem: (item: ItemCalendario) => void
  /** Soltar tras arrastrar. Sin este callback la rejilla es de sólo lectura. */
  onMover?: (item: ItemCalendario, inicio: Date, fin: Date) => void
  conCabecera?: boolean
}) {
  const cuerpoRef = useRef<HTMLDivElement>(null)
  const [ahora, setAhora] = useState(() => new Date())

  // La línea de "ahora" se mueve sola. Un minuto es de sobra: la línea avanza
  // 0,8 px por minuto y nadie mira el calendario esperando a que se mueva.
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  /**
   * Al abrir se baja a las 7:00. Arrancar a medianoche deja media pantalla de
   * horas en las que no trabaja nadie y obliga a hacer scroll siempre.
   */
  useEffect(() => {
    if (cuerpoRef.current) cuerpoRef.current.scrollTop = aPx(7 * 60)
  }, [])

  // ---------------------------------------------------------------
  // ARRASTRE
  // ---------------------------------------------------------------

  /**
   * El gesto vive en un ref, no en el estado: los listeners de `window` tienen
   * que ver siempre el último valor, y con estado leerían el del render en el
   * que se registraron. `redibujar` es lo único que pide pintura.
   */
  const arr = useRef<Arrastre | null>(null)
  const [, redibujar] = useReducer((n: number) => n + 1, 0)

  /** Carril de cada día, para saber sobre qué columna está el ratón. */
  const carriles = useRef(new Map<string, HTMLDivElement>())
  /** Un arrastre termina en un `click` del navegador que no hay que abrir. */
  const trasArrastre = useRef(false)

  const empezar = useCallback((
    e: React.PointerEvent<HTMLElement>,
    item: ItemCalendario,
    modo: ModoArrastre,
  ) => {
    // Con el dedo no: el gesto pelearía con el scroll vertical de la rejilla,
    // y en móvil el formulario del modal es mejor herramienta que el arrastre.
    if (e.pointerType === 'touch') return
    if (e.button !== 0 || !onMover || !item.editable || !item.inicio || !item.fin) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    trasArrastre.current = false
    const inicio = minutosDelDia(item.inicio)
    const fin = Math.max(inicio + MIN_DURACION, minutosDelDia(item.fin))
    arr.current = {
      item, modo,
      y0: e.clientY,
      fecha0: item.fecha, inicio0: inicio, fin0: fin,
      fecha: item.fecha, inicio, fin,
      movido: false,
    }
    redibujar()
  }, [onMover])

  useEffect(() => {
    if (!arr.current) return

    const alMover = (e: PointerEvent) => {
      const a = arr.current
      if (!a) return
      const d = deltaMinutos(e.clientY - a.y0)

      if (a.modo === 'mover') {
        const dura = a.fin0 - a.inicio0
        a.inicio = Math.max(0, Math.min(DIA_MIN - dura, a.inicio0 + d))
        a.fin = a.inicio + dura
        // La columna sale de la posición horizontal, así que en la vista de
        // semana se cambia de día sin soltar.
        for (const [fecha, el] of carriles.current) {
          const r = el.getBoundingClientRect()
          if (e.clientX >= r.left && e.clientX < r.right) { a.fecha = fecha; break }
        }
      } else {
        a.fin = Math.max(a.inicio + MIN_DURACION, Math.min(DIA_MIN, a.fin0 + d))
      }

      a.movido = a.movido
        || a.fecha !== a.fecha0 || a.inicio !== a.inicio0 || a.fin !== a.fin0
      redibujar()
    }

    const alSoltar = () => {
      const a = arr.current
      arr.current = null
      redibujar()
      if (!a || !a.movido) return
      // El `click` posterior llega después de este pointerup; la bandera se
      // limpia sola por si el navegador no lo emite (soltar fuera de la vista).
      trasArrastre.current = true
      setTimeout(() => { trasArrastre.current = false }, 300)
      onMover?.(a.item, fechaEnMinuto(a.fecha, a.inicio), fechaEnMinuto(a.fecha, a.fin))
    }

    const alCancelar = () => { arr.current = null; redibujar() }
    const alTecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alCancelar() }

    window.addEventListener('pointermove', alMover)
    window.addEventListener('pointerup', alSoltar)
    window.addEventListener('pointercancel', alCancelar)
    window.addEventListener('keydown', alTecla)
    return () => {
      window.removeEventListener('pointermove', alMover)
      window.removeEventListener('pointerup', alSoltar)
      window.removeEventListener('pointercancel', alCancelar)
      window.removeEventListener('keydown', alTecla)
    }
  }, [arr.current !== null, onMover]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Lo que se ve mientras se arrastra. En vez de dibujar un fantasma aparte, el
   * item se sustituye por su versión movida y se vuelve a repartir el ancho:
   * así los solapes de destino se ven mientras se mueve, no al soltar.
   */
  const porFechaVista = useMemo(() => {
    const a = arr.current
    if (!a || !a.movido) return porFecha
    const m = new Map(porFecha)
    for (const [f, lista] of m) {
      if (lista.some((i) => i.clave === a.item.clave)) {
        m.set(f, lista.filter((i) => i.clave !== a.item.clave))
      }
    }
    const inicio = fechaEnMinuto(a.fecha, a.inicio)
    const fin = fechaEnMinuto(a.fecha, a.fin)
    const movido: ItemCalendario = {
      ...a.item, fecha: a.fecha, inicio, fin, subtitulo: fmtTramo(inicio, fin),
    }
    m.set(a.fecha, [...(m.get(a.fecha) ?? []), movido])
    return m
    // `arr.current` no es reactivo: la dependencia real es el redibujado, que
    // ya obliga a recalcular este memo en cada movimiento del ratón.
  }, [porFecha, arr.current?.fecha, arr.current?.inicio, arr.current?.fin, arr.current?.movido]) // eslint-disable-line react-hooks/exhaustive-deps

  const columnas = useMemo(
    () => dias.map((d) => {
      const fecha = iso(d)
      const todos = porFechaVista.get(fecha) ?? []
      return {
        d,
        fecha,
        colocados: colocar(todos),
        sinHora: todos.filter((i) => !i.inicio),
      }
    }),
    [dias, porFechaVista],
  )

  const haySinHora = columnas.some((c) => c.sinHora.length > 0)
  const claveArrastrada = arr.current?.movido ? arr.current.item.clave : null

  return (
    <div className={cn('card overflow-hidden p-0', claveArrastrada && 'select-none')}>
      {/* ---------- Cabecera de días ---------- */}
      {conCabecera && (
        <div className="flex border-b border-border">
          <div className="w-14 shrink-0" />
          {columnas.map((c) => (
            <div key={c.fecha} className="min-w-0 flex-1 border-l border-border px-1 py-2 text-center">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                {format(c.d, 'EEE', { locale: es })}
              </p>
              <p className={cn(
                'mx-auto mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                isToday(c.d) ? 'bg-primary-500 text-white' : 'text-fg',
              )}>
                {format(c.d, 'd')}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Franja de todo el día ---------- */}
      {haySinHora && (
        <div className="flex border-b border-border bg-surface-2/40">
          <div className="flex w-14 shrink-0 items-start justify-end pr-2 pt-1.5 text-[10px] uppercase text-muted">
            Todo
          </div>
          {columnas.map((c) => (
            <div key={c.fecha} className="min-w-0 flex-1 space-y-1 border-l border-border p-1">
              {c.sinHora.map((i) => (
                <button
                  key={i.clave}
                  onClick={() => onItem(i)}
                  title={`${i.titulo}${i.subtitulo ? ` · ${i.subtitulo}` : ''}`}
                  className="flex w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[11px] text-fg transition hover:bg-surface"
                >
                  <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', clasesPunto(i.color))} />
                  <span className="truncate">{i.titulo}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ---------- Cuerpo con horas ---------- */}
      <div ref={cuerpoRef} className="relative max-h-[62vh] overflow-y-auto">
        <div className="flex" style={{ height: HORA_PX * 24 }}>
          {/* Regla de horas */}
          <div className="relative w-14 shrink-0">
            {HORAS.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted"
                style={{ top: aPx(h * 60) }}
              >
                {h === 0 ? '' : `${h}:00`}
              </div>
            ))}
          </div>

          {columnas.map((c) => (
            <div
              key={c.fecha}
              ref={(el) => {
                if (el) carriles.current.set(c.fecha, el)
                else carriles.current.delete(c.fecha)
              }}
              className="relative min-w-0 flex-1 border-l border-border"
            >
              {/* Las líneas de hora van detrás y no capturan el clic: el que
                  recibe el clic es el carril entero, que sabe convertir la
                  posición del ratón en una hora. */}
              {HORAS.map((h) => (
                <div
                  key={h}
                  className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                  style={{ top: aPx(h * 60) }}
                />
              ))}

              <button
                type="button"
                aria-label={`Crear el ${c.fecha}`}
                className="absolute inset-0 h-full w-full cursor-pointer"
                onClick={(e) => {
                  if (trasArrastre.current) return
                  const caja = e.currentTarget.getBoundingClientRect()
                  const min = aMinutos(e.clientY - caja.top)
                  onHueco(c.fecha, hhmmDe(min))
                }}
              />

              {/* Línea de ahora, sólo en la columna de hoy. */}
              {isToday(c.d) && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-red-500"
                  style={{ top: aPx(minutosDelDia(ahora)) }}
                >
                  <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                </div>
              )}

              {c.colocados.map(({ item, izquierda, ancho, topPx, altoPx }) => {
                const arrastrable = !!onMover && item.editable && !!item.inicio
                const enMovimiento = item.clave === claveArrastrada
                return (
                  <div
                    key={item.clave}
                    style={{
                      top: topPx,
                      height: altoPx,
                      left: `calc(${izquierda}% + 2px)`,
                      width: `calc(${ancho}% - 4px)`,
                    }}
                    className={cn(
                      'absolute overflow-hidden rounded-md border-l-[3px] transition-shadow',
                      clasesBloque(item.color),
                      // Lo que no es editable se marca punteado: se ve, se abre,
                      // pero no se arrastra desde aquí.
                      !item.editable && 'border-dashed',
                      enMovimiento
                        ? 'z-30 shadow-lg ring-2 ring-primary-500/60'
                        : 'z-10 hover:brightness-105',
                    )}
                  >
                    <button
                      type="button"
                      onPointerDown={(e) => empezar(e, item, 'mover')}
                      onClick={() => { if (!trasArrastre.current) onItem(item) }}
                      title={`${item.titulo}${item.inicio && item.fin ? ` · ${fmtTramo(item.inicio, item.fin)}` : ''}`}
                      className={cn(
                        'h-full w-full overflow-hidden px-1.5 py-0.5 text-left',
                        arrastrable && (enMovimiento ? 'cursor-grabbing' : 'cursor-grab'),
                      )}
                    >
                      <p className="truncate text-[11px] font-medium leading-tight">{item.titulo}</p>
                      {altoPx > 32 && item.subtitulo && (
                        <p className="truncate text-[10px] opacity-80">{item.subtitulo}</p>
                      )}
                    </button>

                    {/* Tirador de abajo para cambiar la duración. Sólo si el
                        bloque es lo bastante alto: en uno de 15 minutos taparía
                        casi todo el sitio donde hay que pulsar para abrirlo. */}
                    {arrastrable && altoPx >= 28 && (
                      <div
                        role="presentation"
                        onPointerDown={(e) => empezar(e, item, 'redimensionar')}
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mientras se arrastra, la hora de destino en grande: el bloque es
          demasiado pequeño para leer ahí el tramo mientras se mueve. */}
      {arr.current?.movido && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-3 py-1.5 text-xs font-medium text-bg shadow-lg">
          {hhmmDe(arr.current.inicio)} – {hhmmDe(arr.current.fin)}
        </div>
      )}
    </div>
  )
}
