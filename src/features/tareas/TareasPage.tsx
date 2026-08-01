import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ChevronDown, Clock, ListChecks, Target } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { MetasPeriodoView } from './MetasPeriodoView'
import { MetasDiaView } from './MetasDiaView'
import { HorarioDiarioView } from './HorarioDiarioView'
import { CalendarioView } from './CalendarioView'
import { TareasSueltasView } from './TareasSueltasView'
import { VISTAS, type VistaId } from './goalMeta'

/**
 * Sección Tareas: un solo lugar, con un selector arriba que cambia el panel
 * visible sin recargar nada. Todas las vistas comparten el mismo motor de
 * metas (mes -> semana -> día); cambia el nivel al que se miran.
 *
 * La vista elegida se recuerda por usuario en localStorage: es una preferencia
 * de pantalla, no un dato del negocio, y no merece un viaje a la BD.
 */

const ICONOS: Record<VistaId, typeof Target> = {
  mes: Target,
  semana: Target,
  dia: ListChecks,
  horario: Clock,
  calendario: CalendarDays,
  sueltas: Check,
}

const SUBTITULOS: Record<VistaId, string> = {
  mes: 'Objetivos del mes: al crearlos se reparten solos en semanas y días',
  semana: 'El trozo de mes que toca esta semana',
  dia: 'Lo que toca hoy, de un vistazo',
  horario: 'Tu plantilla de bloques; al completarlos suman a la meta que alimentan',
  calendario: 'Metas, horario, tareas y seguimientos sobre la rejilla del mes',
  sueltas: 'To-do que no es numérico: prioritarias, secundarias e ideas',
}

const claveVista = (userId?: string) => `jd-crm:tareas:vista:${userId ?? 'anon'}`

export function TareasPage() {
  const userId = useAuthStore((s) => s.user?.id)
  const [vista, setVista] = useState<VistaId>('dia')
  const [abierto, setAbierto] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Preferencia guardada del usuario (si la hay y sigue siendo una vista válida).
  useEffect(() => {
    const guardada = localStorage.getItem(claveVista(userId))
    if (guardada && VISTAS.some((v) => v.id === guardada)) setVista(guardada as VistaId)
  }, [userId])

  const elegir = (id: VistaId) => {
    setVista(id)
    setAbierto(false)
    localStorage.setItem(claveVista(userId), id)
  }

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  const actual = VISTAS.find((v) => v.id === vista) ?? VISTAS[0]
  const Icono = ICONOS[vista]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tareas"
        subtitle={SUBTITULOS[vista]}
        actions={
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setAbierto((v) => !v)}
              className="btn border border-border px-4 text-sm hover:bg-surface-2"
              aria-haspopup="menu"
              aria-expanded={abierto}
            >
              <Icono className="h-4 w-4 text-primary-500" />
              {actual.label}
              <ChevronDown className={cn('h-4 w-4 text-muted transition', abierto && 'rotate-180')} />
            </button>

            {abierto && (
              <div
                role="menu"
                className="card absolute right-0 z-30 mt-2 w-60 overflow-hidden p-1 shadow-lg"
              >
                {VISTAS.map((v) => {
                  const I = ICONOS[v.id]
                  const activa = v.id === vista
                  return (
                    <button
                      key={v.id}
                      role="menuitem"
                      onClick={() => elegir(v.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition',
                        activa ? 'bg-primary-500/10 font-medium text-primary-600 dark:text-primary-300' : 'text-fg hover:bg-surface-2',
                      )}
                    >
                      <I className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{v.label}</span>
                      {activa && <Check className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        }
      />

      {vista === 'mes' && <MetasPeriodoView periodo="mes" />}
      {vista === 'semana' && <MetasPeriodoView periodo="semana" />}
      {vista === 'dia' && <MetasDiaView />}
      {vista === 'horario' && <HorarioDiarioView />}
      {vista === 'calendario' && <CalendarioView />}
      {vista === 'sueltas' && <TareasSueltasView />}
    </div>
  )
}
