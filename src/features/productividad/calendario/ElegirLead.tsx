import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Loader2, Mail, Search, X } from 'lucide-react'
import { Input } from '@/components/ui'
import { supabase } from '@/lib/supabaseClient'
import { STAGE_BY_ID } from '@/lib/pipeline'
import type { LeadStatus } from '@/types'

/**
 * «¿Con quién es la reunión?» — busca en los leads por empresa o correo.
 *
 * Busca en Supabase al escribir (no carga los 1.200 leads en el formulario):
 * como mucho 8 resultados, con su correo para la invitación. Si escribes un
 * correo que no es de ningún lead, se ofrece usarlo tal cual como invitado.
 */

export interface LeadElegido {
  id: string
  empresa: string
  email?: string
  estado: LeadStatus
}

interface FilaLead {
  id: string
  empresa: string
  email: string | null
  email_contacto: string | null
  emails: string[] | null
  estado: LeadStatus
}

const COLUMNAS = 'id, empresa, email, email_contacto, emails, estado'
const aLead = (r: FilaLead): LeadElegido => ({
  id: r.id,
  empresa: r.empresa,
  email: r.email_contacto || r.email || r.emails?.[0] || undefined,
  estado: r.estado,
})

async function buscar(texto: string): Promise<LeadElegido[]> {
  // Comas y paréntesis rompen la sintaxis de `or` de PostgREST.
  const q = texto.replace(/[,()]/g, ' ').trim()
  const { data, error } = await supabase
    .from('leads')
    .select(COLUMNAS)
    .is('deleted_at', null)
    .or(`empresa.ilike.%${q}%,email.ilike.%${q}%,email_contacto.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(8)
  if (error) throw error
  return ((data ?? []) as unknown as FilaLead[]).map(aLead)
}

/** Para una reunión ya guardada: el nombre del lead al que está ligada. */
export function useLeadPorId(id?: string) {
  return useQuery({
    queryKey: ['lead-mini', id],
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select(COLUMNAS).eq('id', id!).single()
      if (error) throw error
      return aLead(data as unknown as FilaLead)
    },
  })
}

export function ElegirLead({ elegido, onElegir, onCorreoSuelto, onQuitar }: {
  elegido?: LeadElegido
  onElegir: (l: LeadElegido) => void
  /** Escribió un correo que no es de ningún lead. */
  onCorreoSuelto: (email: string) => void
  onQuitar: () => void
}) {
  const [texto, setTexto] = useState('')
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  // Espera a que dejes de teclear para no lanzar una consulta por letra.
  useEffect(() => {
    const t = setTimeout(() => setQ(texto.trim()), 250)
    return () => clearTimeout(t)
  }, [texto])

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const res = useQuery({ queryKey: ['buscar-lead', q], queryFn: () => buscar(q), enabled: q.length >= 2, staleTime: 30_000 })
  const esCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim())

  if (elegido) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary-300 bg-primary-50/60 px-3 py-2 dark:border-primary-500/40 dark:bg-primary-500/10">
        <Building2 className="h-4 w-4 shrink-0 text-primary-600" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-fg">{elegido.empresa}</p>
          <p className="truncate text-xs text-muted">
            {elegido.email ?? 'Sin correo: añade uno abajo para enviar la invitación'} · {STAGE_BY_ID[elegido.estado]?.label ?? elegido.estado}
          </p>
        </div>
        <button type="button" onClick={onQuitar} className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg" aria-label="Quitar lead"><X className="h-4 w-4" /></button>
      </div>
    )
  }

  return (
    <div ref={caja} className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            const primero = res.data?.[0]
            if (primero) { onElegir(primero); setTexto(''); setAbierto(false) }
            else if (esCorreo) { onCorreoSuelto(texto.trim()); setTexto(''); setAbierto(false) }
          }
        }}
        placeholder="Escribe el nombre de la empresa o su correo…"
        className="pl-9"
      />
      {abierto && q.length >= 2 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          {res.isFetching && !res.data ? (
            <p className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Buscando…</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto py-1">
              {(res.data ?? []).map((l) => (
                <li key={l.id}>
                  <button type="button" onClick={() => { onElegir(l); setTexto(''); setAbierto(false) }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2">
                    <Building2 className="h-4 w-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{l.empresa}</span>
                      <span className="block truncate text-xs text-muted">{l.email ?? 'sin correo'} · {STAGE_BY_ID[l.estado]?.label ?? l.estado}</span>
                    </span>
                  </button>
                </li>
              ))}
              {esCorreo && (
                <li>
                  <button type="button" onClick={() => { onCorreoSuelto(texto.trim()); setTexto(''); setAbierto(false) }}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-2">
                    <Mail className="h-4 w-4 shrink-0 text-muted" />
                    <span className="text-sm text-fg">Invitar a <b>{texto.trim()}</b> (no es un lead)</span>
                  </button>
                </li>
              )}
              {!res.data?.length && !esCorreo && <li className="px-3 py-2.5 text-xs text-muted">Ningún lead coincide. Escribe un correo para invitarlo igualmente.</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
