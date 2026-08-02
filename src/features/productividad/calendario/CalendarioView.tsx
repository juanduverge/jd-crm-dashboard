import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDays, addMonths, addYears, endOfMonth, endOfWeek, endOfYear, format, getYear,
  startOfMonth, startOfWeek, startOfYear,
} from 'date-fns'
import toast from 'react-hot-toast'
import { Info } from 'lucide-react'
import { Skeleton } from '@/components/ui'
import { useMoverEvento } from '@/hooks/useData'
import { fmtDia, fmtMes, fmtRangoSemana, iso } from '../shared/goalMeta'
import { CabeceraCalendario, type VistaCalendario } from './CabeceraCalendario'
import { ItemModal } from './ItemModal'
import { RejillaHoras } from './RejillaHoras'
import { VistaAnio } from './VistaAnio'
import { VistaMes } from './VistaMes'
import { ETIQUETA_FUENTE, type ItemCalendario } from './itemCalendario'
import { useCalendario } from './useCalendario'

/**
 * EL CALENDARIO
 *
 * Este componente sólo orquesta: decide qué rango de días se está mirando y se
 * lo pasa a `useCalendario`; el resto lo hacen las piezas. Cuatro vistas, una
 * cabecera y un modal, todas alimentadas por el mismo `ItemCalendario`.
 *
 * Cómo se reparte el trabajo:
 *   - `itemCalendario.ts` normaliza las cinco fuentes y calcula la geometría.
 *   - `useCalendario.ts` es el único que sabe qué tablas hay que leer.
 *   - `RejillaHoras` pinta día y semana; `VistaMes` y `VistaAnio`, lo suyo.
 *   - `ItemModal` crea y edita, mandando cada tipo a SU tabla.
 *
 * Qué se puede editar desde aquí: sólo los eventos. Una meta, una tarea, un
 * bloque o un seguimiento se pintan y, al pulsarlos, llevan a su módulo. No es
 * una limitación técnica: mover una meta "a las 11:00" sería inventarle una
 * hora que su tabla no tiene, y arrastrar un bloque del horario cambiaría la
 * plantilla de TODAS las semanas, no la de ese día.
 */

/** A dónde lleva cada fuente cuando se pulsa algo que no es un evento. */
const DESTINO: Record<ItemCalendario['fuente'], string> = {
  evento: '/productividad/calendario',
  meta: '/productividad/metas/dia',
  bloque: '/productividad/horario',
  tarea: '/productividad/tareas',
  seguimiento: '/seguimientos',
}

export function CalendarioView() {
  const navegar = useNavigate()
  const moverEvento = useMoverEvento()
  const [vista, setVista] = useState<VistaCalendario>('semana')
  const [refFecha, setRefFecha] = useState(() => new Date())

  const [modal, setModal] = useState<{ fecha: string; hora?: string; evento?: ItemCalendario['evento'] } | null>(null)

  /** El rango que hay que pedir depende de la vista, y de nada más. */
  const { desde, hasta, titulo } = useMemo(() => {
    switch (vista) {
      case 'dia':
        return { desde: iso(refFecha), hasta: iso(refFecha), titulo: fmtDia(refFecha) }
      case 'semana': {
        const a = startOfWeek(refFecha, { weekStartsOn: 1 })
        const b = endOfWeek(refFecha, { weekStartsOn: 1 })
        return { desde: iso(a), hasta: iso(b), titulo: fmtRangoSemana(iso(a), iso(b)) }
      }
      case 'anio': {
        // La rejilla de cada mes se extiende a semanas completas, así que el
        // año necesita un poco de diciembre anterior y de enero siguiente.
        const a = startOfWeek(startOfYear(refFecha), { weekStartsOn: 1 })
        const b = endOfWeek(endOfYear(refFecha), { weekStartsOn: 1 })
        return { desde: iso(a), hasta: iso(b), titulo: String(getYear(refFecha)) }
      }
      default: {
        const a = startOfWeek(startOfMonth(refFecha), { weekStartsOn: 1 })
        const b = endOfWeek(endOfMonth(refFecha), { weekStartsOn: 1 })
        return { desde: iso(a), hasta: iso(b), titulo: fmtMes(refFecha) }
      }
    }
  }, [vista, refFecha])

  const { dias, porFecha, cargando } = useCalendario(desde, hasta)

  /** Adelante/atrás salta lo que dura la vista. */
  const paso = useCallback((dir: -1 | 1) => {
    setRefFecha((d) => {
      switch (vista) {
        case 'dia': return addDays(d, dir)
        case 'semana': return addDays(d, 7 * dir)
        case 'anio': return addYears(d, dir)
        default: return addMonths(d, dir)
      }
    })
  }, [vista])

  /**
   * Atajos de teclado, como en Google Calendar. Se ignoran mientras se escribe
   * en un campo: la `d` de "desayuno" no debe cambiar de vista.
   */
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
      const k = e.key.toLowerCase()
      if (k === 'd') setVista('dia')
      else if (k === 's') setVista('semana')
      else if (k === 'm') setVista('mes')
      else if (k === 'a') setVista('anio')
      else if (k === 't' || k === 'h') setRefFecha(new Date())
      else if (k === 'arrowleft') paso(-1)
      else if (k === 'arrowright') paso(1)
    }
    window.addEventListener('keydown', onTecla)
    return () => window.removeEventListener('keydown', onTecla)
  }, [paso])

  /**
   * Soltar tras arrastrar. Va por `mover_evento` (RPC), no por un update
   * suelto: inicio y fin tienen que cambiar a la vez o la fila queda un
   * instante con el fin antes del inicio. Si falla, no hay nada que revertir
   * a mano — la vista se repinta con lo que diga la tabla.
   */
  const mover = useCallback((item: ItemCalendario, inicio: Date, fin: Date) => {
    if (!item.evento) return
    moverEvento.mutate(
      { id: item.id, inicio: inicio.toISOString(), fin: fin.toISOString() },
      {
        onSuccess: () => toast.success('Evento movido'),
        onError: (e) => toast.error(e instanceof Error ? e.message : 'No se pudo mover el evento'),
      },
    )
  }, [moverEvento])

  const abrirItem = useCallback((item: ItemCalendario) => {
    if (item.fuente === 'evento' && item.evento) {
      setModal({ fecha: item.fecha, evento: item.evento })
      return
    }
    navegar(DESTINO[item.fuente])
  }, [navegar])

  const irADia = useCallback((fecha: string) => {
    setRefFecha(new Date(`${fecha}T00:00:00`))
    setVista('dia')
  }, [])

  const irAMes = useCallback((fecha: string) => {
    setRefFecha(new Date(`${fecha}T00:00:00`))
    setVista('mes')
  }, [])

  return (
    <div className="space-y-4">
      <CabeceraCalendario
        fecha={refFecha}
        vista={vista}
        titulo={titulo}
        onFecha={setRefFecha}
        onPaso={paso}
        onVista={setVista}
        onHoy={() => setRefFecha(new Date())}
        onNuevo={() => setModal({ fecha: iso(refFecha), hora: format(new Date(), 'HH:00') })}
      />

      {cargando ? (
        <Skeleton className="h-[60vh] w-full" />
      ) : vista === 'anio' ? (
        <VistaAnio anio={refFecha} porFecha={porFecha} onDia={irADia} onMes={irAMes} />
      ) : vista === 'mes' ? (
        <VistaMes
          mes={refFecha}
          dias={dias}
          porFecha={porFecha}
          onDia={irADia}
          onHueco={(fecha) => setModal({ fecha })}
          onItem={abrirItem}
        />
      ) : (
        <RejillaHoras
          dias={dias}
          porFecha={porFecha}
          conCabecera={vista === 'semana'}
          onHueco={(fecha, hora) => setModal({ fecha, hora })}
          onItem={abrirItem}
          onMover={mover}
        />
      )}

      {/* Leyenda: sin ella los colores son decoración. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        {(Object.keys(ETIQUETA_FUENTE) as ItemCalendario['fuente'][]).map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${
              f === 'evento' ? 'bg-primary-500'
                : f === 'meta' ? 'bg-violet-500'
                  : f === 'bloque' ? 'bg-sky-500'
                    : f === 'tarea' ? 'bg-slate-500' : 'bg-amber-500'
            }`} />
            {ETIQUETA_FUENTE[f]}
          </span>
        ))}
        <span className="ml-auto hidden sm:inline">D · S · M · A cambian de vista · T vuelve a hoy</span>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Metas, bloques del horario, tareas y seguimientos se pintan aquí leyéndolos de su módulo:
          al pulsarlos se abren allí, que es donde se editan. Los eventos y reuniones sí se crean y
          se editan desde el propio calendario: en las vistas de día y semana se arrastran para
          cambiarlos de hora o de día, y se estiran por el borde de abajo para cambiar lo que duran.
          La sincronización con Google Calendar es el paso que queda.
        </span>
      </p>

      {modal && (
        <ItemModal
          open
          onClose={() => setModal(null)}
          fecha={modal.fecha}
          hora={modal.hora}
          evento={modal.evento}
        />
      )}
    </div>
  )
}
