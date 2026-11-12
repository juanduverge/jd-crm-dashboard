import { supabase } from '@/lib/supabaseClient'
import type { Proyecto, ProyectoPago } from '@/types'

/**
 * proyectosService — módulo Proyectos contra Supabase (migración 0064).
 *
 * Los proyectos se escriben con UPDATE directo, no por RPC: a diferencia de
 * un seguimiento, guardar un proyecto no arrastra nada más (no mueve toques ni
 * etapas del lead). Lo único compuesto —crearlo desde un lead con su plan de
 * pagos— sí va por RPC, el mismo que usa el trigger al ganar.
 */

interface PagoRow {
  id: string
  proyecto_id: string
  concepto: string
  monto: number | string
  fecha_prevista: string | null
  cobrado_en: string | null
  metodo: string | null
  orden: number
}

interface ProyectoRow {
  id: string
  lead_id: string | null
  nombre: string
  etapa: string
  en_pausa: boolean
  etapa_desde: string
  tipo: string | null
  plataforma: string | null
  num_paginas: number | null
  paginas: string[] | null
  funcionalidades: string[] | null
  alcance: string | null
  fuera_alcance: string | null
  rondas_incluidas: number
  rondas_usadas: number
  precio: number | string | null
  moneda: string
  fecha_inicio: string | null
  fecha_entrega_prevista: string | null
  fecha_entregado: string | null
  checklist: Proyecto['checklist'] | null
  accesos: Proyecto['accesos'] | null
  enlaces: Proyecto['enlaces'] | null
  referencias: Proyecto['referencias'] | null
  notas: string | null
  responsable: string | null
  created_at: string
  updated_at: string
  proyecto_pagos?: PagoRow[]
}

// numeric llega como texto desde PostgREST: sin esto, 500 + 500 = "500500".
const num = (v: number | string | null | undefined) => (v === null || v === undefined ? undefined : Number(v))

function rowToPago(r: PagoRow): ProyectoPago {
  return {
    id: r.id,
    proyectoId: r.proyecto_id,
    concepto: r.concepto,
    monto: num(r.monto) ?? 0,
    fechaPrevista: r.fecha_prevista ?? undefined,
    cobradoEn: r.cobrado_en ?? undefined,
    metodo: r.metodo ?? undefined,
    orden: r.orden,
  }
}

function rowToProyecto(r: ProyectoRow): Proyecto {
  return {
    id: r.id,
    leadId: r.lead_id ?? undefined,
    nombre: r.nombre,
    etapa: r.etapa as Proyecto['etapa'],
    enPausa: r.en_pausa,
    etapaDesde: r.etapa_desde,
    tipo: r.tipo ?? undefined,
    plataforma: r.plataforma ?? undefined,
    numPaginas: r.num_paginas ?? undefined,
    paginas: r.paginas ?? [],
    funcionalidades: r.funcionalidades ?? [],
    alcance: r.alcance ?? undefined,
    fueraAlcance: r.fuera_alcance ?? undefined,
    rondasIncluidas: r.rondas_incluidas,
    rondasUsadas: r.rondas_usadas,
    precio: num(r.precio),
    moneda: r.moneda,
    fechaInicio: r.fecha_inicio ?? undefined,
    fechaEntregaPrevista: r.fecha_entrega_prevista ?? undefined,
    fechaEntregado: r.fecha_entregado ?? undefined,
    checklist: r.checklist ?? [],
    accesos: r.accesos ?? [],
    enlaces: r.enlaces ?? {},
    referencias: r.referencias ?? [],
    notas: r.notas ?? undefined,
    responsable: r.responsable ?? undefined,
    creadoEn: r.created_at,
    actualizadoEn: r.updated_at,
    pagos: (r.proyecto_pagos ?? []).map(rowToPago).sort((a, b) => a.orden - b.orden),
  }
}

/** Campo de la UI → columna. Solo lo editable; lo demás lo pone la BD. */
const COLUMNAS: Partial<Record<keyof Proyecto, string>> = {
  nombre: 'nombre', etapa: 'etapa', enPausa: 'en_pausa', tipo: 'tipo', plataforma: 'plataforma',
  numPaginas: 'num_paginas', paginas: 'paginas', funcionalidades: 'funcionalidades',
  alcance: 'alcance', fueraAlcance: 'fuera_alcance', rondasIncluidas: 'rondas_incluidas',
  rondasUsadas: 'rondas_usadas', precio: 'precio', moneda: 'moneda', fechaInicio: 'fecha_inicio',
  fechaEntregaPrevista: 'fecha_entrega_prevista', fechaEntregado: 'fecha_entregado',
  checklist: 'checklist', accesos: 'accesos', enlaces: 'enlaces', referencias: 'referencias',
  notas: 'notas', responsable: 'responsable',
}

function patchToRow(patch: Partial<Proyecto>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    const col = COLUMNAS[k as keyof Proyecto]
    // '' y undefined se guardan como null: un campo vaciado es un campo sin dato.
    if (col) row[col] = v === '' || v === undefined ? null : v
  }
  return row
}

const SELECT = '*, proyecto_pagos(*)'

export const proyectosService = {
  async list(): Promise<Proyecto[]> {
    const { data, error } = await supabase
      .from('proyectos')
      .select(SELECT)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => rowToProyecto(r as unknown as ProyectoRow))
  },

  async get(id: string): Promise<Proyecto | null> {
    const { data, error } = await supabase
      .from('proyectos')
      .select(SELECT)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data ? rowToProyecto(data as unknown as ProyectoRow) : null
  },

  async getByLead(leadId: string): Promise<Proyecto | null> {
    const { data, error } = await supabase
      .from('proyectos')
      .select(SELECT)
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .maybeSingle()
    if (error) throw error
    return data ? rowToProyecto(data as unknown as ProyectoRow) : null
  },

  /** Proyecto suelto, sin lead detrás (un cliente que llegó por otro lado). */
  async create(nombre: string): Promise<string> {
    const { data, error } = await supabase
      .from('proyectos')
      .insert({ nombre: nombre.trim(), fecha_inicio: new Date().toISOString().slice(0, 10) })
      .select('id')
      .single()
    if (error) throw error
    return (data as { id: string }).id
  },

  /** Crea (o devuelve) el proyecto de un lead, con checklist y plan 50/50. */
  async crearDesdeLead(leadId: string): Promise<string> {
    const { data, error } = await supabase.rpc('proyecto_desde_lead', { p_lead_id: leadId })
    if (error) throw error
    return data as string
  },

  async update(id: string, patch: Partial<Proyecto>): Promise<void> {
    const row = patchToRow(patch)
    if (!Object.keys(row).length) return
    const { error } = await supabase.from('proyectos').update(row).eq('id', id)
    if (error) throw error
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase
      .from('proyectos')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async addPago(p: Omit<ProyectoPago, 'id'>): Promise<void> {
    const { error } = await supabase.from('proyecto_pagos').insert({
      proyecto_id: p.proyectoId,
      concepto: p.concepto,
      monto: p.monto,
      fecha_prevista: p.fechaPrevista || null,
      cobrado_en: p.cobradoEn || null,
      metodo: p.metodo || null,
      orden: p.orden,
    })
    if (error) throw error
  },

  async updatePago(id: string, patch: Partial<Omit<ProyectoPago, 'id' | 'proyectoId'>>): Promise<void> {
    const row: Record<string, unknown> = {}
    if ('concepto' in patch) row.concepto = patch.concepto
    if ('monto' in patch) row.monto = patch.monto ?? 0
    if ('fechaPrevista' in patch) row.fecha_prevista = patch.fechaPrevista || null
    if ('cobradoEn' in patch) row.cobrado_en = patch.cobradoEn || null
    if ('metodo' in patch) row.metodo = patch.metodo || null
    if ('orden' in patch) row.orden = patch.orden
    const { error } = await supabase.from('proyecto_pagos').update(row).eq('id', id)
    if (error) throw error
  },

  async removePago(id: string): Promise<void> {
    const { error } = await supabase.from('proyecto_pagos').delete().eq('id', id)
    if (error) throw error
  },
}
