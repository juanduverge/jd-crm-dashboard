import { useState } from 'react'
import { BookOpen, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import { GLOSARIO, type ClaveGlosario } from './glosario'

/**
 * Todos los términos de Analíticas en un solo sitio, para leerlos de una vez
 * en lugar de ir abriendo ⓘ uno a uno.
 */
export function GlosarioBoton() {
  const [abierto, setAbierto] = useState(false)
  const [desplegado, setDesplegado] = useState<ClaveGlosario | null>('ticket_medio')
  const claves = Object.keys(GLOSARIO) as ClaveGlosario[]

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <BookOpen className="h-4 w-4" /> Glosario
      </Button>
      <Modal open={abierto} onClose={() => setAbierto(false)} title="Qué significa cada cosa" size="lg">
        <p className="t-hint mb-3">Toca un término para ver qué es, cómo se calcula y cómo leerlo.</p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {claves.map((k) => {
            const t = GLOSARIO[k]
            const open = desplegado === k
            return (
              <li key={k}>
                <button
                  onClick={() => setDesplegado(open ? null : k)}
                  className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm font-medium text-fg hover:bg-surface-2/60"
                  aria-expanded={open}
                >
                  {t.titulo}
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} />
                </button>
                {open && (
                  <div className="space-y-2.5 px-3 pb-4 text-sm leading-relaxed">
                    <p className="text-fg">{t.que}</p>
                    <p className="text-muted"><span className="font-medium text-fg">Cálculo: </span>{t.calculo}</p>
                    {'lectura' in t && t.lectura && (
                      <p className="rounded-lg bg-primary-50/70 px-3 py-2 text-fg dark:bg-primary-400/10">{t.lectura}</p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </Modal>
    </>
  )
}
