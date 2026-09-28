import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * Red de errores de pantalla.
 *
 * Sin ella, un fallo al pintar cualquier componente desmonta la aplicación
 * entera y deja la página en blanco: en el móvil parece que el CRM murió. Con
 * ella, la pantalla que falla muestra un aviso y el resto (menú, barra
 * superior) sigue funcionando.
 *
 * Caso especial: después de publicar, los archivos de cada pantalla cambian de
 * nombre. Quien tenía el CRM abierto pide al navegar un archivo que ya no
 * existe («Failed to fetch dynamically imported module»). Eso se arregla
 * recargando, así que se recarga solo UNA vez; la marca en sessionStorage
 * evita un bucle si el fallo fuera otro.
 */
const MARCA_RECARGA = 'crm-recargado-por-version'

function esArchivoViejo(error: Error): boolean {
  return /dynamically imported module|Importing a module script failed|Loading chunk \d+ failed/i.test(error.message)
}

interface Props {
  children: ReactNode
  /** Cuando cambia (p. ej. la ruta), el aviso se descarta y se reintenta. */
  resetKey?: string
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (esArchivoViejo(error)) {
      try {
        if (!sessionStorage.getItem(MARCA_RECARGA)) {
          sessionStorage.setItem(MARCA_RECARGA, '1')
          window.location.reload()
          return
        }
      } catch {
        // sessionStorage bloqueado: se muestra el aviso normal.
      }
    }
    console.error('Error de pantalla:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="card mx-auto mt-10 max-w-md p-6 text-center">
        <h2 className="t-card text-base">Esta pantalla ha fallado</h2>
        <p className="t-hint mt-2">
          El resto del CRM sigue funcionando. Recarga para intentarlo de nuevo o ve a otra sección desde el menú.
        </p>
        <p className="t-hint mt-3 break-words font-mono text-xs">{error.message}</p>
        <button className="btn-primary mt-5" onClick={() => window.location.reload()}>
          Recargar
        </button>
      </div>
    )
  }
}
