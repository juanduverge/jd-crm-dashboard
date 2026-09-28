import toast from 'react-hot-toast'

/**
 * Aviso para cuando n8n no respondió y el trabajo quedó en la cola de
 * Supabase (ver crmApi, fase 2). No es un error: se hará solo en cuanto n8n
 * vuelva, y si fallara 5 veces aparecerá en la campana.
 */
export function avisoEnCola(que: string) {
  toast(`n8n no responde ahora: ${que} queda en cola y se hará sola en cuanto vuelva.`, {
    icon: '⏳',
    duration: 8000,
  })
}
