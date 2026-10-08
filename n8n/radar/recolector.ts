/**
 * Recolector diario del Radar, para ejecutar dentro de un nodo Code de n8n.
 *
 * No reimplementa nada: empaqueta los mismos módulos que usa la pantalla del
 * CRM (`src/lib/registrosNuevos`, `actividadEmpresa`, `dominioEmpresa`,
 * `potencialEmpresa`), así que una regla que cambie allí cambia aquí al
 * volver a generar el workflow con `construir.mjs`.
 *
 * Lo único propio es el `fetch`: el entorno de código de n8n no lo trae, y se
 * sustituye por `this.helpers.httpRequest`.
 */

import { buscarDuenosCT, buscarEmpresasNuevas, pareceVehiculo, type EmpresaNueva } from '@/lib/registrosNuevos'
import { comprobarVariasEmpresas, type DominiosEmpresa } from '@/lib/dominioEmpresa'
import { calcularPotencial } from '@/lib/potencialEmpresa'

// esbuild cambia cada `fetch` del paquete por este nombre (ver construir.mjs).
declare let __radarFetch: unknown
// Por aquí sale la función al nodo de n8n. El mecanismo de exportación de
// esbuild (getters sobre un objeto) no funciona en su entorno de código.
declare const __radarSalida: { recolectar?: typeof recolectar }

interface Ayudas {
  httpRequest: (o: Record<string, unknown>) => Promise<{ statusCode: number; body: unknown }>
}

export interface Opciones {
  /** Días hacia atrás. Más de uno, porque los registros publican con retraso. */
  dias?: number
  /** A cuántas de las mejores se les comprueban los dominios. */
  comprobar?: number
  /** Ids que ya están en la tabla: no se vuelven a trabajar. */
  conocidas?: string[]
}

async function recolectar(ayudas: Ayudas, o: Opciones = {}) {
  const { dias = 3, comprobar = 300 } = o
  const conocidas = new Set(o.conocidas ?? [])

  __radarFetch = async (url: string) => {
    const r = await ayudas.httpRequest({
      method: 'GET', url, json: false, returnFullResponse: true, ignoreHttpStatusErrors: true, timeout: 45000,
    })
    return {
      ok: r.statusCode >= 200 && r.statusCode < 300,
      status: r.statusCode,
      json: async () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body),
    }
  }

  const { empresas, fallidos } = await buscarEmpresasNuevas(dias)

  // Solo se guarda lo que la pantalla llama «Recomendadas»: negocio con
  // actividad reconocida, que no sea un vehículo de inversión y que con lo
  // poco que se sabe ya llegue al 6. El resto es ruido sin una IA que lo lea.
  const candidatas = empresas
    .filter((e) => !conocidas.has(e.id) && !pareceVehiculo(e) && e.actividad && calcularPotencial(e).nota >= 6)
    .sort((a, b) => calcularPotencial(b).nota - calcularPotencial(a).nota || b.fecha.localeCompare(a.fecha))

  // Solo se trabajan y se guardan las mejores de hoy. Las que no entran no se
  // pierden: mañana siguen saliendo en los registros y, como las de hoy ya
  // estarán en `conocidas`, les llega el turno.
  const pendientes = candidatas.length - Math.min(candidatas.length, comprobar)
  candidatas.length = Math.min(candidatas.length, comprobar)

  const duenos = await buscarDuenosCT(candidatas).catch(() => new Map())
  for (const e of candidatas) e.contacto = e.contacto ?? duenos.get(e.id)

  const dominios = new Map<string, DominiosEmpresa | null>()
  await comprobarVariasEmpresas(candidatas, (id, r) => dominios.set(id, r))

  const ahora = new Date().toISOString()
  let enCola = 0
  const filas = candidatas.map((e: EmpresaNueva) => {
    const d = dominios.get(e.id)
    const p = calcularPotencial(e, d)
    // Sin ningún dominio con su nombre no hay página que leer: el veredicto
    // sale de la regla y no gasta IA. Se llama «sin_dominio» y no «sin_web»
    // porque eso es lo único que se ha comprobado.
    const sinDominio = !!d && d.resumen !== 'ocupado'
    // Todas las que tienen un dominio ocupado van a la cola: el tope diario lo
    // pone la base, no este paso.
    const aLeer = !!d && d.resumen === 'ocupado'
    // El nombre no da para deducir un dominio: no hay nada que comprobar.
    const sinPista = !d
    if (aLeer) enCola++
    return {
      id: e.id,
      estado: e.estado,
      nombre: e.nombre,
      tipo: e.tipo || null,
      fecha_registro: e.fecha,
      direccion: e.direccion || null,
      ciudad: e.ciudad || null,
      correo: e.correo ?? null,
      categoria: e.categoria ?? null,
      url_registro: e.urlRegistro,
      actividad_termino: e.actividad?.termino ?? null,
      actividad_nicho: e.actividad?.nicho ?? null,
      actividad_nombre: e.actividad?.nombre ?? null,
      contacto_nombre: e.contacto?.nombre ?? null,
      contacto_rol: e.contacto?.rol ?? null,
      dominios: d?.dominios ?? null,
      nota_reglas: p.nota,
      motivos_reglas: p.motivos,
      investigacion_estado: aLeer ? 'en_cola' : 'hecha',
      encolada_en: aLeer ? ahora : null,
      investigada_en: aLeer ? null : ahora,
      veredicto: sinDominio ? 'sin_dominio' : sinPista ? 'sin_decidir' : null,
      nota_final: aLeer ? null : p.nota,
    }
  })

  return {
    filas,
    resumen: {
      leidas: empresas.length,
      estados_sin_respuesta: fallidos,
      ya_guardadas: conocidas.size,
      nuevas: filas.length,
      quedan_para_manana: pendientes,
      sin_dominio: filas.filter((f) => f.veredicto === 'sin_dominio').length,
      a_leer_su_pagina: enCola,
    },
  }
}

__radarSalida.recolectar = recolectar
