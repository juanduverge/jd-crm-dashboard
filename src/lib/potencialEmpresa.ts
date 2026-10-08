/**
 * Nota del 1 al 10: qué probabilidad hay de que esta empresa recién registrada
 * necesite una web y se la podamos vender.
 *
 * Son reglas fijas, no una opinión de IA: la misma empresa saca siempre la
 * misma nota y cada punto tiene su motivo escrito, que es lo que se enseña en
 * la ficha. Si una regla no convence, se cambia aquí y cambia en todas.
 *
 * La nota sube con lo que se sabe: sin comprobar el dominio se queda a medias,
 * y por eso la pantalla lo comprueba sola para las primeras de la lista.
 */

import { differenceInCalendarDays } from 'date-fns'
import type { DominiosEmpresa } from '@/lib/dominioEmpresa'
import { pareceVehiculo, type EmpresaNueva } from '@/lib/registrosNuevos'

export interface Motivo {
  puntos: number
  texto: string
}

export interface Potencial {
  nota: number
  motivos: Motivo[]
}

/**
 * Negocio local que vive de que el vecino lo encuentre: una web le trae
 * llamadas, reservas o presupuestos desde el primer día.
 */
const NICHOS_LOCALES = new Set([
  'construccion', 'limpieza', 'solar', 'salones-belleza', 'barberias', 'restaurantes',
  'talleres', 'automotriz', 'clinicas', 'dentistas', 'medicos', 'cuidado-mayores',
  'fitness', 'mascotas', 'eventos', 'interiorismo', 'escuelas', 'educacion',
  'abogados', 'contadores', 'seguros', 'transporte', 'hoteles', 'turismo', 'farmacias',
])

/** Saben hacerse la web ellos mismos, o ya trabajan con alguien que sabe. */
const NICHOS_QUE_SE_LA_HACEN = new Set(['software', 'saas', 'ia', 'agencias-marketing', 'estudios-creativos'])

const NICHOS_SIN_PRESUPUESTO = new Set(['ong', 'iglesias'])

export function calcularPotencial(e: EmpresaNueva, dominios?: DominiosEmpresa | null): Potencial {
  const motivos: Motivo[] = []
  const suma = (puntos: number, texto: string) => motivos.push({ puntos, texto })

  if (pareceVehiculo(e)) {
    suma(-3, 'El nombre parece una sociedad de inversión o de patrimonio, no un negocio abierto al público.')
  } else if (!e.actividad) {
    suma(0, 'El nombre no dice a qué se dedica: hay que investigarla para saber si interesa.')
  } else if (NICHOS_LOCALES.has(e.actividad.nicho)) {
    suma(3, `${e.actividad.nombre}: negocio local que vive de que lo encuentren.`)
  } else if (NICHOS_QUE_SE_LA_HACEN.has(e.actividad.nicho)) {
    suma(-1, `${e.actividad.nombre}: suelen hacerse la web ellos mismos.`)
  } else if (NICHOS_SIN_PRESUPUESTO.has(e.actividad.nicho)) {
    suma(-2, `${e.actividad.nombre}: rara vez tienen presupuesto para una web.`)
  } else {
    suma(1, `${e.actividad.nombre}: actividad conocida, aunque no es de las que más convierten.`)
  }

  if (dominios) {
    const ocupado = dominios.dominios.find((d) => d.estado === 'ocupado')
    const comprado = dominios.dominios.find((d) => d.estado === 'sin_pagina')
    if (ocupado?.dominio.endsWith('.com')) suma(-3, `${ocupado.dominio} ya tiene una página. Ábrela: si es suya, no hay venta.`)
    else if (ocupado) suma(-1, `${ocupado.dominio} tiene una página, pero el .com no. Puede ser de otra empresa.`)
    else if (comprado) suma(3, `Compraron ${comprado.dominio} y aún no han montado nada: están en el momento justo.`)
    else suma(2, 'No existe ningún dominio con su nombre: todavía no tienen web.')
  }

  if (e.correo) suma(1, 'El registro publica su correo: se le puede escribir hoy.')

  const dias = differenceInCalendarDays(new Date(), new Date(`${e.fecha}T00:00:00`))
  if (dias >= 0 && dias <= 2) suma(1, dias === 0 ? 'Registrada hoy.' : `Registrada hace ${dias} ${dias === 1 ? 'día' : 'días'}: nadie más la ha llamado.`)

  const nota = Math.max(1, Math.min(10, 4 + motivos.reduce((t, m) => t + m.puntos, 0)))
  return { nota, motivos }
}
