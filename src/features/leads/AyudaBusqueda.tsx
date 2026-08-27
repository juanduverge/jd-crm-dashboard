/**
 * Chuleta de la búsqueda avanzada de leads.
 *
 * Sin esto la sintaxis por campo es invisible: nadie adivina que puede escribir
 * `creado:>2026-01`. Lista los campos reales desde `AYUDA_CAMPOS`, así que
 * añadir un campo a `lib/leadSearch` lo publica aquí sin tocar nada.
 */

import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { AYUDA_CAMPOS } from '@/lib/leadSearch'
import { cn } from '@/lib/utils'

const EJEMPLOS: { q: string; que: string }[] = [
  { q: 'ciudad:madrid nicho:dentista', que: 'Dentistas de Madrid' },
  { q: 'tel:600', que: 'Teléfonos que empiezan por 600' },
  { q: 'calle:"gran via"', que: 'En Gran Vía (frase exacta)' },
  { q: 'creado:7d', que: 'Capturados en los últimos 7 días' },
  { q: 'creado:>2026-01-01', que: 'Capturados a partir de enero' },
  { q: 'score:>70 valor:>=1000', que: 'Score alto y buen valor' },
  { q: 'email:vacio', que: 'Sin email' },
  { q: 'web:tiene ssl:no', que: 'Con web pero sin SSL' },
  { q: 'favorito:si -perdido', que: 'Favoritos, excluyendo perdidos' },
  { q: 'megusta:si descartado:no', que: 'Los que te gustan, sin descartados' },
  { q: 'seguimiento:hoy', que: 'Con seguimiento para hoy' },
]

const TIPO_ETIQUETA: Record<string, string> = {
  texto: 'texto',
  telefono: 'nº tel.',
  numero: 'número',
  fecha: 'fecha',
  bool: 'sí/no',
}

export function AyudaBusqueda({ onEjemplo }: { onEjemplo: (q: string) => void }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setAbierto((v) => !v)}>
        <HelpCircle className="h-4 w-4" /> Búsqueda avanzada
      </Button>

      {abierto && (
        <>
          {/* Capa para cerrar al hacer clic fuera. */}
          <div className="fixed inset-0 z-40" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 w-[min(38rem,90vw)] rounded-xl border border-border bg-surface p-4 shadow-lg">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-fg">Buscar en toda la ficha</h3>
                <p className="mt-0.5 text-xs text-muted">
                  Escribe lo que sea y se busca en todos los campos. Varias palabras = todas
                  deben aparecer. Sin acentos ni mayúsculas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar ayuda"
                className="rounded p-1 text-muted hover:text-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Ejemplos (clic para usar)
            </p>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {EJEMPLOS.map((e) => (
                <button
                  key={e.q}
                  type="button"
                  title={e.que}
                  onClick={() => { onEjemplo(e.q); setAbierto(false) }}
                  className={cn(
                    'rounded-full border border-border px-2.5 py-1 font-mono text-[11px]',
                    'text-muted transition-colors hover:border-primary-400 hover:text-fg',
                  )}
                >
                  {e.q}
                </button>
              ))}
            </div>

            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Campos disponibles
            </p>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <tbody>
                  {AYUDA_CAMPOS.map((c) => (
                    <tr key={c.clave} className="border-b border-border/60 last:border-0">
                      <td className="w-40 px-2 py-1 font-mono text-[11px] text-primary-600 dark:text-primary-300">
                        {c.clave}:
                      </td>
                      <td className="px-2 py-1 text-fg">{c.etiqueta}</td>
                      <td className="px-2 py-1 text-[11px] text-muted">{TIPO_ETIQUETA[c.tipo]}</td>
                      <td className="px-2 py-1 font-mono text-[10px] text-muted">
                        {c.alias.join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              <b>Operadores:</b> <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code>{' '}
              <code>&lt;=</code> en números y fechas · <code>-termino</code> excluye ·{' '}
              <code>"entre comillas"</code> frase exacta · <code>campo:vacio</code> /{' '}
              <code>campo:tiene</code> · fechas: <code>hoy</code>, <code>ayer</code>,{' '}
              <code>7d</code>, <code>3m</code>, <code>2026-07</code>, <code>14/07/2026</code>.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
