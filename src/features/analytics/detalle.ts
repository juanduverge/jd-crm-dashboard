import { TIPO_META } from '@/lib/followUps'
import { IDIOMA_META } from '@/lib/origen'
import { origenLabel } from '@/lib/origen'
import { formatMontos, sumarMontos, type Montos } from '@/lib/utils'
import { esContactado, ganado, llegoReunion, norm, respondio } from '@/features/mapa/mapaDatos'
import type { EventoCrudo, ToqueCrudo } from '@/services/analyticsService'
import type { FollowUpTipo, Lead, LeadIdioma, LeadStatus, Proyecto } from '@/types'
import type { ClaveGlosario } from './glosario'

/**
 * Qué leads hay detrás de cada dato de Analíticas.
 *
 * Cada `Consulta` describe UN dato (por ejemplo «respondieron por WhatsApp»)
 * y `resolver` devuelve la lista de leads que lo forman, con las MISMAS
 * reglas que los RPC de métricas (0041, 0065, 0067). Si una regla cambia en
 * SQL, se cambia aquí también: el número y su lista tienen que cuadrar.
 */

export type Paso = 'leads' | 'contactados' | 'respondieron' | 'reuniones' | 'ganados'
export type Agrupar = 'nicho' | 'ciudad' | 'idioma' | 'origen'

export type Consulta =
  | { k: 'cohorte'; paso: Paso; grupo?: { por: Agrupar; clave: string; nombre: string } }
  | { k: 'primer_contacto' }
  | { k: 'toques'; canal?: FollowUpTipo; conRespuesta?: boolean; dia?: number; hora?: number }
  | { k: 'respuestas' }
  | { k: 'etapa'; etapa: 'reunion' | 'propuesta' }
  | { k: 'abrieron'; canal: FollowUpTipo; paso?: 'reuniones' | 'ganados' }
  | { k: 'ganados'; vista?: 'valor' | 'ticket' | 'ciclo' }
  | { k: 'cobros'; estado: 'cobrado' | 'pendiente' }
  | { k: 'perdidos'; motivo?: string }
  | { k: 'primera_respuesta'; toque: number }
  | { k: 'tiempo'; canal: FollowUpTipo }

export interface Fila {
  key: string
  leadId: string
  empresa: string
  sub?: string
  estado?: LeadStatus
  dato?: string
  fecha?: string
}

export interface Detalle {
  titulo: string
  termino?: ClaveGlosario
  /** El cálculo con los números reales: «US$550 ÷ 2 ventas = US$275». */
  formula?: string
  filas: Fila[]
}

export interface Contexto {
  leads: Lead[]
  toques: ToqueCrudo[]
  eventos: EventoCrudo[]
  proyectos: Proyecto[]
  desde: string
  hasta: string
  nombreNicho: (id?: string) => string
}

// ---------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------

const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10)
/** Día del CRM (hora local) de una marca ISO. */
export const diaDe = (iso?: string) => (iso ? isoLocal(new Date(iso)) : '')
const enRango = (dia: string, c: Contexto) => !!dia && dia >= c.desde && dia <= c.hasta
const fechaCorta = (iso?: string) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : undefined
const canalNombre = (c: string) => TIPO_META[c as FollowUpTipo]?.label ?? c
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const PASO_LABEL: Record<Paso, string> = {
  leads: 'Entraron', contactados: 'Contactados', respondieron: 'Respondieron', reuniones: 'Llegaron a reunión', ganados: 'Ventas',
}

/** Índices que se calculan una vez por contexto y sirven a todas las consultas. */
function indices(c: Contexto) {
  const leadPorId = new Map(c.leads.map((l) => [l.id, l]))
  const numToque = new Map<string, number>()
  const cuenta = new Map<string, number>()
  const primeraResp = new Map<string, ToqueCrudo>()
  for (const t of c.toques) {
    const n = (cuenta.get(t.leadId) ?? 0) + 1
    cuenta.set(t.leadId, n)
    numToque.set(t.id, n)
    if ((t.resultado === 'positivo' || t.resultado === 'negativo') && !primeraResp.has(t.leadId)) primeraResp.set(t.leadId, t)
  }
  const conAvance = new Set(c.eventos.map((e) => e.leadId))
  const proyectoPorLead = new Map(c.proyectos.filter((p) => p.leadId).map((p) => [p.leadId!, p]))
  return { leadPorId, numToque, primeraResp, conAvance, proyectoPorLead }
}

export type Indices = ReturnType<typeof indices>
export const crearIndices = indices

type Venta = { valor: number; moneda: string }

/**
 * Precio de una venta: el del proyecto (en su moneda) si lo tiene; si no, el
 * valor estimado del lead, que no guarda moneda y cuenta como USD (igual que la 0068).
 */
function valorVenta(l: Lead, ix: Indices): Venta {
  const p = ix.proyectoPorLead.get(l.id)
  if (p?.precio) return { valor: p.precio, moneda: p.moneda || 'USD' }
  return { valor: l.valorEstimado || 0, moneda: 'USD' }
}

const fmtVenta = (v: Venta) => formatMontos({ [v.moneda]: v.valor })

/** «a + b = total» por cada moneda, sin mezclarlas nunca. */
function sumaPorMoneda(vs: Venta[]): string {
  const porMoneda = new Map<string, Venta[]>()
  for (const v of vs) if (v.valor) porMoneda.set(v.moneda, [...(porMoneda.get(v.moneda) ?? []), v])
  const partes = [...porMoneda.entries()].map(([m, xs]) => {
    const total = fmtVenta({ moneda: m, valor: xs.reduce((s, x) => s + x.valor, 0) })
    return xs.length > 1 ? `${xs.map(fmtVenta).join(' + ')} = ${total}` : total
  })
  return partes.join(' · ') + (partes.length > 1 ? ' (cada moneda por separado)' : '')
}

function claveGrupo(l: Lead, por: Agrupar): string {
  if (por === 'nicho') return l.nicho ?? ''
  if (por === 'ciudad') return `${norm(l.ciudad)}|${norm(l.pais)}`
  if (por === 'idioma') return l.idioma || 'sin'
  return l.origen || 'sin_dato'
}

function cumplePaso(l: Lead, paso: Paso, ix: Indices, por?: Agrupar): boolean {
  if (paso === 'leads') return true
  if (paso === 'contactados') return por === 'origen' ? l.touchActual > 0 : esContactado(l)
  if (paso === 'respondieron') return respondio(l)
  // El RPC de origen (0065) también mira el historial; el resto, como el Mapa.
  if (paso === 'reuniones') return llegoReunion(l) || (por === 'origen' && ix.conAvance.has(l.id))
  return ganado(l)
}

function filaLead(l: Lead, c: Contexto, extra?: Partial<Fila>): Fila {
  return {
    key: l.id,
    leadId: l.id,
    empresa: l.empresa,
    sub: [l.ciudad, c.nombreNicho(l.nicho)].filter((x) => x && x !== 'Sin nicho').join(' · ') || undefined,
    estado: l.estado,
    ...extra,
  }
}

function filaToque(t: ToqueCrudo, ix: Indices, c: Contexto, conResultado = true): Fila | null {
  const l = ix.leadPorId.get(t.leadId)
  if (!l) return null
  const resp = t.resultado === 'positivo' ? 'respondió' : t.resultado === 'negativo' ? 'no le interesa' : 'sin respuesta'
  return filaLead(l, c, {
    key: t.id,
    dato: `${canalNombre(t.canal)} · toque ${ix.numToque.get(t.id) ?? '?'}${conResultado ? ` · ${resp}` : ''}`,
    fecha: t.completadoEn,
  })
}

const porFecha = (a: Fila, b: Fila) => (b.fecha ?? '').localeCompare(a.fecha ?? '')

// ---------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------

export function resolver(q: Consulta, c: Contexto, ix: Indices): Detalle {
  const toquesPeriodo = () => c.toques.filter((t) => enRango(diaDe(t.completadoEn), c))
  const ganadosPeriodo = () => c.leads.filter((l) => l.estado === 'ganado' && enRango(diaDe(l.cerradoEn), c))

  switch (q.k) {
    case 'cohorte': {
      const cohorte = c.leads.filter((l) => enRango(l.fechaCaptura ?? '', c))
      const delGrupo = q.grupo ? cohorte.filter((l) => claveGrupo(l, q.grupo!.por) === q.grupo!.clave) : cohorte
      const filas = delGrupo
        .filter((l) => cumplePaso(l, q.paso, ix, q.grupo?.por))
        .map((l) => filaLead(l, c, {
          fecha: q.paso === 'respondieron' ? l.respondioEn : q.paso === 'contactados' ? l.primerContactoEn : q.paso === 'ganados' ? l.cerradoEn : l.fechaCaptura,
          dato: q.paso === 'ganados' ? fmtVenta(valorVenta(l, ix)) : q.paso === 'leads' ? `entró ${fechaCorta(l.fechaCaptura) ?? ''}` : undefined,
        }))
        .sort(porFecha)
      const total = delGrupo.length
      const grupoTxt = q.grupo ? ` · ${q.grupo.nombre}` : ''
      return {
        titulo: `${PASO_LABEL[q.paso]}${grupoTxt}`,
        termino: q.grupo ? (q.grupo.por === 'origen' ? 'origen' : 'base') : 'embudo',
        formula: q.paso !== 'leads' && total ? `${filas.length} de ${plural(total, 'lead que entró', 'leads que entraron')} en el periodo (${Math.round((filas.length / total) * 100)} %)` : undefined,
        filas,
      }
    }

    case 'primer_contacto': {
      const filas = c.leads
        .filter((l) => enRango(diaDe(l.primerContactoEn), c))
        .map((l) => filaLead(l, c, { fecha: l.primerContactoEn, dato: 'primer contacto' }))
        .sort(porFecha)
      return { titulo: 'Contactados por primera vez', termino: 'contactos_hechos', filas }
    }

    case 'toques': {
      let ts = toquesPeriodo()
      if (q.canal) ts = ts.filter((t) => t.canal === q.canal)
      if (q.dia) ts = ts.filter((t) => ((new Date(t.completadoEn).getDay() + 6) % 7) + 1 === q.dia)
      if (q.hora !== undefined) ts = ts.filter((t) => new Date(t.completadoEn).getHours() === q.hora)
      const base = ts.length
      if (q.conRespuesta) ts = ts.filter((t) => t.resultado === 'positivo' || t.resultado === 'negativo')
      const partes = [
        q.conRespuesta ? 'Respondieron' : 'Toques',
        q.canal && canalNombre(q.canal),
        q.dia && `los ${DIAS[q.dia]}`,
        q.hora !== undefined && `de ${q.hora}:00 a ${q.hora + 1}:00`,
      ].filter(Boolean)
      return {
        titulo: partes.join(' · '),
        termino: q.dia || q.hora !== undefined ? 'hora_toque' : q.conRespuesta ? 'tasa_respuesta' : 'toque',
        formula: q.conRespuesta && base ? `${ts.length} respuestas ÷ ${base} toques × 100 = ${Math.round((ts.length / base) * 100)} %` : undefined,
        filas: ts.map((t) => filaToque(t, ix, c)).filter((f): f is Fila => !!f).sort(porFecha),
      }
    }

    case 'respuestas': {
      // Como `respuestas_recibidas` (0041): por el día en que contestaron.
      const ts = c.toques.filter((t) =>
        (t.resultado === 'positivo' || t.resultado === 'negativo') && enRango(diaDe(t.respondidoEn ?? t.completadoEn), c))
      const nToques = toquesPeriodo().length
      return {
        titulo: 'Respuestas recibidas',
        termino: 'tasa_respuesta',
        formula: nToques ? `${ts.length} respuestas ÷ ${nToques} toques dados × 100 = ${Math.round((ts.length / nToques) * 1000) / 10} %` : undefined,
        filas: ts
          .map((t): Fila | null => { const f = filaToque(t, ix, c); return f && { ...f, fecha: t.respondidoEn ?? t.completadoEn } })
          .filter((f): f is Fila => !!f)
          .sort(porFecha),
      }
    }

    case 'etapa': {
      const primeros = new Map<string, string>()
      for (const e of c.eventos) {
        if (e.etapa === q.etapa && enRango(diaDe(e.en), c) && !primeros.has(e.leadId)) primeros.set(e.leadId, e.en)
      }
      const filas = [...primeros.entries()]
        .map(([id, en]) => { const l = ix.leadPorId.get(id); return l && filaLead(l, c, { fecha: en }) })
        .filter((f): f is Fila => !!f)
        .sort(porFecha)
      return { titulo: q.etapa === 'reunion' ? 'Reuniones agendadas' : 'Propuestas enviadas', termino: q.etapa === 'reunion' ? 'reuniones' : 'propuestas', filas }
    }

    case 'abrieron': {
      const filas: Fila[] = []
      for (const [leadId, t] of ix.primeraResp) {
        if (t.canal !== q.canal || !enRango(diaDe(t.completadoEn), c)) continue
        const l = ix.leadPorId.get(leadId)
        if (!l) continue
        const reunion = llegoReunion(l) || ix.conAvance.has(l.id)
        if (q.paso === 'reuniones' && !reunion) continue
        if (q.paso === 'ganados' && !ganado(l)) continue
        filas.push(filaLead(l, c, {
          key: t.id,
          fecha: t.completadoEn,
          dato: q.paso === 'ganados' ? fmtVenta(valorVenta(l, ix)) : `respondió al toque ${ix.numToque.get(t.id) ?? '?'}`,
        }))
      }
      const etiqueta = q.paso === 'reuniones' ? 'Reuniones' : q.paso === 'ganados' ? 'Ventas' : 'Abrieron conversación'
      return { titulo: `${etiqueta} · ${canalNombre(q.canal)}`, termino: 'abrio_conversacion', filas: filas.sort(porFecha) }
    }

    case 'ganados': {
      const gs = ganadosPeriodo()
      const conValor = gs.map((l) => ({ l, v: valorVenta(l, ix) }))
      const conPrecio = conValor.filter((x) => x.v.valor > 0)
      const totales = sumarMontos(conPrecio.map((x) => x.v))
      const cuenta: Montos = {}
      for (const x of conPrecio) cuenta[x.v.moneda] = (cuenta[x.v.moneda] ?? 0) + 1
      const ciclos = gs
        .map((l) => {
          const inicio = l.primerContactoEn ?? (l.fechaCaptura ? `${l.fechaCaptura}T12:00:00` : undefined)
          return { l, d: inicio && l.cerradoEn ? (Date.parse(l.cerradoEn) - Date.parse(inicio)) / 86_400_000 : undefined }
        })
      const ciclosOk = ciclos.filter((x) => x.d !== undefined && x.d >= 0) as { l: Lead; d: number }[]

      if (q.vista === 'ciclo') {
        const media = ciclosOk.length ? Math.round((ciclosOk.reduce((s, x) => s + x.d, 0) / ciclosOk.length) * 10) / 10 : 0
        return {
          titulo: 'Ciclo de venta',
          termino: 'ciclo_venta',
          formula: ciclosOk.length ? `(${ciclosOk.map((x) => Math.round(x.d)).join(' + ')}) días ÷ ${plural(ciclosOk.length, 'venta', 'ventas')} = ${media} días de media` : undefined,
          filas: ciclos.map(({ l, d }) => filaLead(l, c, {
            fecha: l.cerradoEn,
            dato: d !== undefined && d >= 0 ? `${Math.round(d)} días` : 'sin fecha de inicio',
          })).sort(porFecha),
        }
      }

      const formulaTicket = Object.entries(totales)
        .map(([m, t]) => `${formatMontos({ [m]: t })} ÷ ${plural(cuenta[m], 'venta', 'ventas')} = ${formatMontos({ [m]: t / cuenta[m] })}`)
        .join(' · ')
      return {
        titulo: q.vista === 'ticket' ? 'Ticket medio' : q.vista === 'valor' ? 'Dinero vendido' : 'Ventas',
        termino: q.vista === 'ticket' ? 'ticket_medio' : q.vista === 'valor' ? 'dinero_vendido' : 'ventas',
        formula: q.vista === 'ticket'
          ? (conPrecio.length ? `${formulaTicket} por cliente` : undefined)
          : q.vista === 'valor' && conPrecio.length
            ? sumaPorMoneda(conPrecio.map((x) => x.v))
            : undefined,
        filas: conValor.map(({ l, v }) => filaLead(l, c, {
          fecha: l.cerradoEn,
          dato: v.valor ? `${fmtVenta(v)}${ix.proyectoPorLead.get(l.id)?.precio ? '' : ' (estimado)'}` : 'sin precio',
        })).sort(porFecha),
      }
    }

    case 'cobros': {
      const ids = new Set(ganadosPeriodo().map((l) => l.id))
      const filas: Fila[] = []
      const pagos: Venta[] = []
      for (const p of c.proyectos) {
        if (!p.leadId || !ids.has(p.leadId)) continue
        const l = ix.leadPorId.get(p.leadId)
        for (const g of p.pagos) {
          if ((q.estado === 'cobrado') !== !!g.cobradoEn) continue
          pagos.push({ valor: g.monto, moneda: p.moneda || 'USD' })
          filas.push({
            key: g.id, leadId: p.leadId, empresa: l?.empresa ?? p.nombre, estado: l?.estado,
            sub: g.concepto,
            dato: fmtVenta({ valor: g.monto, moneda: p.moneda || 'USD' }),
            fecha: g.cobradoEn ?? g.fechaPrevista,
          })
        }
      }
      return {
        titulo: q.estado === 'cobrado' ? 'Cobrado' : 'Por cobrar',
        termino: 'cobrado',
        formula: filas.length ? `${plural(filas.length, 'pago', 'pagos')}: ${sumaPorMoneda(pagos)}` : undefined,
        filas: filas.sort(porFecha),
      }
    }

    case 'perdidos': {
      const filas = c.leads
        .filter((l) => l.estado === 'perdido' && enRango(diaDe(l.cerradoEn), c))
        .filter((l) => !q.motivo || (l.motivoCierre?.trim() || 'Sin motivo') === q.motivo)
        .map((l) => filaLead(l, c, { fecha: l.cerradoEn, dato: l.motivoCierre?.trim() || 'Sin motivo' }))
        .sort(porFecha)
      return { titulo: q.motivo ? `Perdidos · ${q.motivo}` : 'Perdidos', termino: 'motivos_perdida', filas }
    }

    case 'primera_respuesta': {
      const filas: Fila[] = []
      for (const [leadId, t] of ix.primeraResp) {
        const n = Math.min(ix.numToque.get(t.id) ?? 0, 6)
        if (n !== q.toque || !enRango(diaDe(t.completadoEn), c)) continue
        const l = ix.leadPorId.get(leadId)
        if (l) filas.push(filaLead(l, c, { key: t.id, fecha: t.completadoEn, dato: `${canalNombre(t.canal)} · toque ${ix.numToque.get(t.id)}` }))
      }
      return { titulo: `Respondieron en el toque ${q.toque}${q.toque === 6 ? ' o más' : ''}`, termino: 'primera_respuesta_toque', filas: filas.sort(porFecha) }
    }

    case 'tiempo': {
      const ts = toquesPeriodo().filter((t) => t.canal === q.canal && t.respondidoEn && t.respondidoEn >= t.completadoEn)
      const dias = ts.map((t) => (Date.parse(t.respondidoEn!) - Date.parse(t.completadoEn)) / 86_400_000)
      const media = dias.length ? Math.round((dias.reduce((s, d) => s + d, 0) / dias.length) * 10) / 10 : 0
      return {
        titulo: `Tiempo de respuesta · ${canalNombre(q.canal)}`,
        termino: 'tiempo_respuesta',
        formula: dias.length ? `media de ${plural(dias.length, 'respuesta', 'respuestas')} = ${media} días` : undefined,
        filas: ts.map((t, i) => {
          const l = ix.leadPorId.get(t.leadId)
          return l ? filaLead(l, c, { key: t.id, fecha: t.respondidoEn, dato: `${Math.round(dias[i] * 10) / 10} días` }) : null
        }).filter((f): f is Fila => !!f).sort(porFecha),
      }
    }
  }
}

/** Nombre legible de un grupo, para los títulos. */
export function nombreGrupo(por: Agrupar, clave: string, nombreNicho: (id?: string) => string): string {
  if (por === 'nicho') return nombreNicho(clave || undefined)
  if (por === 'idioma') return clave === 'sin' ? 'Sin marcar' : IDIOMA_META[clave as LeadIdioma]?.label ?? clave
  if (por === 'origen') return origenLabel(clave as Parameters<typeof origenLabel>[0])
  return clave
}
