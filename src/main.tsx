import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import App from './App'
import './styles/index.css'
import { useUiStore, applyTheme } from './store/uiStore'

// Aplica el tema persistido antes del primer render.
applyTheme(useUiStore.getState().theme)

/** Mensaje legible a partir de un error de Supabase/axios/Error normal. */
function mensajeDeError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: string; hint?: string; details?: string }
    if (e.message) return e.hint ? `${e.message} (${e.hint})` : e.message
    if (e.details) return e.details
  }
  return 'Ha ocurrido un error inesperado'
}

/**
 * Red de seguridad para errores silenciosos.
 *
 * De las 57 mutaciones de `useData.ts`, NINGUNA declaraba `onError`: si la
 * llamada fallaba y el componente no pasaba su propio callback, el error se
 * quedaba dentro de React Query y la pantalla no decía nada. Con las
 * actualizaciones optimistas del store eso es peor que un fallo visible: el
 * cambio se pinta, el servidor lo rechaza y el usuario cree que se guardó
 * hasta que recarga.
 *
 * Estos handlers globales garantizan que todo fallo se vea. Un componente
 * que ya muestra su propio mensaje puede desactivarlo con
 * `meta: { silencioso: true }` en la mutación.
 */
const mutationCache = new MutationCache({
  onError: (error, _vars, _ctx, mutation) => {
    if (mutation.meta?.silencioso) return
    if (mutation.options.onError) return // el componente ya lo gestiona
    toast.error(mensajeDeError(error))
  },
})

// Un refetch de fondo que falla deja datos viejos en pantalla sin avisar:
// es exactamente el síntoma «los datos no se sincronizan». Se avisa una vez
// por consulta (no en cada reintento del polling de 30 s) para no saturar.
const avisadas = new Set<string>()
const queryCache = new QueryCache({
  onError: (error, query) => {
    const key = JSON.stringify(query.queryKey)
    if (avisadas.has(key)) return
    avisadas.add(key)
    toast.error(`No se pudieron cargar los datos: ${mensajeDeError(error)}`)
  },
  onSuccess: (_data, query) => {
    avisadas.delete(JSON.stringify(query.queryKey))
  },
})

const queryClient = new QueryClient({
  mutationCache,
  queryCache,
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
