import { supabase } from '@/lib/supabaseClient'
import type { DominioComprobado } from '@/lib/dominioEmpresa'
import type { Motivo } from '@/lib/potencialEmpresa'
import { importarEmpresasNuevas, type Contacto, type EmpresaNueva, type EstadoRegistro } from '@/lib/registrosNuevos'

/**
 * radarService — lo que el Radar ya dejó trabajado en `radar_empresas`.
 *
 * La tabla la llenan dos workflows de n8n (ver `n8n/radar/`): el recolector de
 * cada mañana y el lector de páginas. Aquí solo se lee, se descarta y se pasa a
 * Leads; nada de esto investiga.
 */

export type Veredicto =
  | 'sin_dominio' | 'dominio_ajeno' | 'web_en_construccion' | 'web_floja'
  | 'tiene_web' | 'sin_decidir'

/** Un dato de contacto con la página de donde salió. */
export interface DatoEncontrado {
  valor?: string
  red?: string
  url?: string
  fuente_url: string
  confianza: 'segura' | 'probable'
}

export interface WebJuzgada {
  dominio: string
  url: string
  es_suya: 'si' | 'probable' | 'no' | 'sin_contenido' | 'aparcado' | 'no_abre' | 'sin_juicio'
  calidad: 'buena' | 'floja' | 'no_aplica'
  motivo: string
  que_hace: string
  titulo: string
}

export interface Investigacion {
  metodo: 'paginas' | 'paginas+ia'
  resumen: string
  que_hace: string
  webs: WebJuzgada[]
  correos: DatoEncontrado[]
  telefonos: DatoEncontrado[]
  redes: DatoEncontrado[]
}

export interface RadarEmpresa {
  id: string
  estado: EstadoRegistro
  nombre: string
  tipo: string | null
  fecha_registro: string
  direccion: string | null
  ciudad: string | null
  correo: string | null
  categoria: string | null
  url_registro: string
  actividad_termino: string | null
  actividad_nicho: string | null
  actividad_nombre: string | null
  contacto_nombre: string | null
  contacto_rol: Contacto['rol'] | null
  dominios: DominioComprobado[] | null
  nota_reglas: number | null
  motivos_reglas: Motivo[] | null
  veredicto: Veredicto | null
  nota_final: number | null
  investigacion: Investigacion | null
  investigada_en: string | null
}

export interface EstadoRadar {
  /** Empresas esperando a que se lea su página. */
  enCola: number
  /** Lecturas con IA gastadas hoy y el máximo diario. */
  usadas: number
  tope: number
}

/** Las que ya tienen web hecha no son para contactar: se quedan fuera. */
const PARA_CONTACTAR: Veredicto[] = ['sin_dominio', 'dominio_ajeno', 'web_en_construccion', 'web_floja', 'sin_decidir']

/** La fila de la tabla, en la forma que entiende el importador de Leads. */
function aEmpresa(r: RadarEmpresa): EmpresaNueva {
  return {
    id: r.id,
    estado: r.estado,
    nombre: r.nombre,
    tipo: r.tipo ?? '',
    fecha: r.fecha_registro,
    direccion: r.direccion ?? '',
    ciudad: r.ciudad ?? '',
    correo: r.correo ?? undefined,
    categoria: r.categoria ?? undefined,
    actividad: r.actividad_termino && r.actividad_nicho
      ? { termino: r.actividad_termino, nicho: r.actividad_nicho, nombre: r.actividad_nombre ?? r.actividad_nicho }
      : null,
    contacto: r.contacto_nombre && r.contacto_rol ? { nombre: r.contacto_nombre, rol: r.contacto_rol } : undefined,
    urlRegistro: r.url_registro,
  }
}

export const radarService = {
  async listas(): Promise<RadarEmpresa[]> {
    const { data, error } = await supabase
      .from('radar_empresas')
      .select('*')
      .eq('investigacion_estado', 'hecha')
      .in('veredicto', PARA_CONTACTAR)
      .is('lead_id', null)
      .eq('descartada', false)
      .order('nota_final', { ascending: false })
      .order('fecha_registro', { ascending: false })
      .limit(500)
    if (error) throw new Error(error.message)
    return (data ?? []) as RadarEmpresa[]
  },

  async estado(): Promise<EstadoRadar> {
    const { data, error } = await supabase.rpc('radar_cupo_hoy')
    if (error) throw new Error(error.message)
    const r = data as { tope: number; usadas: number; en_cola: number }
    return { enCola: r.en_cola, usadas: r.usadas, tope: r.tope }
  },

  async descartar(id: string): Promise<void> {
    const { error } = await supabase.from('radar_empresas').update({ descartada: true }).eq('id', id)
    if (error) throw new Error(error.message)
  },

  /**
   * Pasa empresas a Leads con todo lo que se averiguó (web, correos, teléfonos
   * y redes encontrados) y las marca para que no vuelvan a salir en la lista.
   */
  async guardarEnLeads(filas: RadarEmpresa[]) {
    const porId = new Map(filas.map((f) => [f.id, f]))
    const resumen = await importarEmpresasNuevas(
      filas.map(aEmpresa),
      (e) => {
        const f = porId.get(e.id)!
        return [`Potencial ${f.nota_final ?? f.nota_reglas ?? '?'}/10.`, f.investigacion?.resumen].filter(Boolean).join(' ')
      },
      (e) => {
        const inv = porId.get(e.id)?.investigacion
        if (!inv) return {}
        const propia = inv.webs.find((w) => w.es_suya === 'si') ?? inv.webs.find((w) => w.es_suya === 'probable')
        const red = (nombre: string) => inv.redes.find((x) => x.red === nombre)?.url
        return {
          website: propia?.url,
          emails: inv.correos.map((c) => c.valor).filter(Boolean),
          phones: inv.telefonos.map((t) => t.valor).filter(Boolean),
          instagram: red('instagram'),
          facebook: red('facebook'),
          linkedin: red('linkedin'),
          tiktok: red('tiktok'),
        }
      },
    )

    // Se enlaza cada fila con su lead para que deje de ofrecerse. Si esto
    // falla el lead ya está guardado; lo peor que pasa es que la empresa siga
    // en la lista, y al volver a guardarla el importador no la duplica.
    const { data: leads } = await supabase
      .from('leads').select('id, perfil_url')
      .in('perfil_url', filas.map((f) => f.url_registro))
      .is('deleted_at', null)
    await Promise.all((leads ?? []).map((l) =>
      supabase.from('radar_empresas').update({ lead_id: l.id }).eq('url_registro', l.perfil_url),
    ))
    return resumen
  },
}
