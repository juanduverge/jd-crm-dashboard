import { useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { Sparkles, Tags, Check, Merge, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, Button, Input, Select, Badge, Skeleton } from '@/components/ui'
import {
  useNichosQuery, useNichosPendientes, useConteoNichos, useGuardarNicho, useFusionarNichos,
} from '@/hooks/useData'
import type { Niche } from '@/lib/config'
import { cn } from '@/lib/utils'

/**
 * Gestión del catálogo de nichos (tabla `nichos`, migración 0033).
 *
 * Dos cosas en una tarjeta, porque son el mismo trabajo:
 *
 * 1. **Nichos nuevos.** Cuando Apify trae una categoría que no se parece a
 *    nada del catálogo ("Pet groomer"), el importador la da de alta sola en
 *    vez de tirarla a "Otros" — perder la categoría es peor que tener una de
 *    más. Nace marcada como pendiente y aparece aquí para que le pongas
 *    emoji, color y grupo, o la fusiones con la que ya tenías.
 * 2. **El catálogo entero.** Renombrar, cambiar de grupo y fusionar.
 *
 * Fusionar es la operación de verdad: mueve los leads, aprende el alias (la
 * próxima importación con ese mismo texto ya cae bien sola) y borra el nicho
 * de origen. Por eso no hay un botón de "borrar" a secas: un nicho no se
 * puede borrar sin decidir antes dónde van sus leads.
 *
 * El `id` nunca se edita: es lo que está escrito en `leads.nicho`, y cambiarlo
 * dejaría huérfanos a todos los leads que ya lo tenían.
 */
export function NichosCard() {
  const { data: nichos, isLoading } = useNichosQuery()
  const pendientes = useNichosPendientes()
  const { data: conteos } = useConteoNichos()
  const guardar = useGuardarNicho()
  const fusionar = useFusionarNichos()
  const [filtro, setFiltro] = useState('')

  const grupos = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const m = new Map<string, Niche[]>()
    for (const n of nichos ?? []) {
      if (q && !n.nombre.toLowerCase().includes(q) && !n.id.includes(q)) continue
      const g = m.get(n.grupo) ?? []
      g.push(n)
      m.set(n.grupo, g)
    }
    return [...m.entries()]
  }, [nichos, filtro])

  const nombresGrupo = useMemo(
    () => [...new Set((nichos ?? []).map((n) => n.grupo))],
    [nichos],
  )

  const alFusionar = async (desde: Niche, hacia: string) => {
    if (!hacia || hacia === desde.id) return
    const destino = nichos?.find((n) => n.id === hacia)
    try {
      const movidos = await fusionar.mutateAsync({ desde: desde.id, hacia })
      toast.success(
        movidos
          ? `${movidos} lead${movidos === 1 ? '' : 's'} movido${movidos === 1 ? '' : 's'} a ${destino?.nombre ?? hacia}`
          : `"${desde.nombre}" fusionado con ${destino?.nombre ?? hacia}`,
      )
    } catch {
      toast.error('No se pudo fusionar')
    }
  }

  const alGuardar = async (n: Niche, cambios: Partial<Niche>) => {
    try {
      await guardar.mutateAsync({ id: n.id, ...cambios })
    } catch {
      toast.error('No se pudo guardar el nicho')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Tags className="h-4 w-4" /> Nichos
          {pendientes.length > 0 && (
            <Badge className="bg-amber-500/15 text-amber-400">{pendientes.length} sin revisar</Badge>
          )}
        </CardTitle>
      </CardHeader>

      {isLoading ? (
        <div className="space-y-2 p-4"><Skeleton className="h-8" /><Skeleton className="h-8" /><Skeleton className="h-8" /></div>
      ) : (
        <div className="space-y-4 p-4">
          {pendientes.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-400">
                <Sparkles className="h-4 w-4" /> Nichos nuevos que trajo la búsqueda
              </p>
              <p className="mb-3 text-xs text-muted">
                Los creó el importador porque no se parecían a nada del catálogo. Dales un
                sitio, o fusiónalos con el nicho que ya tenías.
              </p>
              <div className="space-y-2">
                {pendientes.map((n) => (
                  <FilaNicho
                    key={n.id}
                    nicho={n}
                    leads={conteos?.[n.id] ?? 0}
                    grupos={nombresGrupo}
                    todos={nichos ?? []}
                    ocupado={guardar.isPending || fusionar.isPending}
                    onGuardar={alGuardar}
                    onFusionar={alFusionar}
                  />
                ))}
              </div>
            </div>
          )}

          <Input
            placeholder="Buscar nicho…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="max-w-xs"
          />

          {grupos.map(([grupo, lista]) => (
            <div key={grupo}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{grupo}</p>
              <div className="space-y-1.5">
                {lista.map((n) => (
                  <FilaNicho
                    key={n.id}
                    nicho={n}
                    leads={conteos?.[n.id] ?? 0}
                    grupos={nombresGrupo}
                    todos={nichos ?? []}
                    ocupado={guardar.isPending || fusionar.isPending}
                    onGuardar={alGuardar}
                    onFusionar={alFusionar}
                  />
                ))}
              </div>
            </div>
          ))}
          {grupos.length === 0 && <p className="text-sm text-muted">Ningún nicho coincide con «{filtro}».</p>}
        </div>
      )}
    </Card>
  )
}

/**
 * Una fila del catálogo. El estado del texto es local y sólo se manda al
 * soltar el foco: guardar en cada tecla llenaría la red de escrituras y haría
 * saltar la lista de sitio mientras escribes.
 */
function FilaNicho({
  nicho, leads, grupos, todos, ocupado, onGuardar, onFusionar,
}: {
  nicho: Niche
  leads: number
  grupos: string[]
  todos: Niche[]
  ocupado: boolean
  onGuardar: (n: Niche, cambios: Partial<Niche>) => void
  onFusionar: (n: Niche, hacia: string) => void
}) {
  const [emoji, setEmoji] = useState(nicho.emoji)
  const [nombre, setNombre] = useState(nicho.nombre)
  const [fusionando, setFusionando] = useState(false)

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2/40 px-2 py-1.5',
      ocupado && 'opacity-70',
    )}>
      <Input
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
        onBlur={() => emoji !== nicho.emoji && onGuardar(nicho, { emoji: emoji || '🏷️' })}
        className="w-12 text-center"
        title="Emoji"
      />
      <Input
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onBlur={() => nombre.trim() && nombre !== nicho.nombre && onGuardar(nicho, { nombre: nombre.trim() })}
        className="min-w-[10rem] flex-1"
      />
      <Select
        value={nicho.grupo}
        onChange={(e) => onGuardar(nicho, { grupo: e.target.value })}
        className="w-44"
        title="Grupo"
      >
        {grupos.map((g) => <option key={g} value={g}>{g}</option>)}
      </Select>
      <span className="w-20 shrink-0 text-right text-xs text-muted" title="Leads con este nicho">
        {leads} lead{leads === 1 ? '' : 's'}
      </span>

      {fusionando ? (
        <Select
          autoFocus
          defaultValue=""
          className="w-48"
          onBlur={() => setFusionando(false)}
          onChange={(e) => { setFusionando(false); onFusionar(nicho, e.target.value) }}
        >
          <option value="">Fusionar en…</option>
          {todos.filter((o) => o.id !== nicho.id).map((o) => (
            <option key={o.id} value={o.id}>{o.emoji} {o.nombre}</option>
          ))}
        </Select>
      ) : (
        <Button variant="outline" size="sm" onClick={() => setFusionando(true)} disabled={ocupado}
          title="Mover sus leads a otro nicho y borrar este">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
        </Button>
      )}

      {nicho.pendiente && (
        <Button variant="outline" size="sm" onClick={() => onGuardar(nicho, { pendiente: false })}
          title="Ya está revisado: quítalo de la bandeja">
          <Check className="h-4 w-4" /> Listo
        </Button>
      )}
    </div>
  )
}
