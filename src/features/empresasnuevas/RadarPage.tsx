import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ExplorarRegistros } from './EmpresasNuevasPage'
import { ListasParaContactar } from './ListasParaContactar'

type Modo = 'listas' | 'explorar'

const MODOS: { id: Modo; texto: string; pista: string }[] = [
  { id: 'listas', texto: 'Listas para contactar', pista: 'Lo que el Radar ya investigó' },
  { id: 'explorar', texto: 'Explorar registros', pista: 'Todo lo registrado, en directo' },
]

/**
 * Radar de negocios. Dos formas de mirar lo mismo:
 *  - «Listas para contactar» lee lo que los workflows de n8n dejaron trabajado
 *    en `radar_empresas`. Es la que se usa a diario.
 *  - «Explorar registros» consulta los registros oficiales en directo, para
 *    buscar algo concreto que el Radar no eligió.
 */
export function RadarPage() {
  const [modo, setModo] = useState<Modo>('listas')

  const selector = (
    <div className="inline-flex rounded-xl border border-border bg-surface p-1">
      {MODOS.map((m) => (
        <button
          key={m.id}
          onClick={() => setModo(m.id)}
          title={m.pista}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium transition',
            modo === m.id ? 'bg-primary-500 text-white shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {m.texto}
        </button>
      ))}
    </div>
  )

  return modo === 'listas' ? <ListasParaContactar selector={selector} /> : <ExplorarRegistros selector={selector} />
}
