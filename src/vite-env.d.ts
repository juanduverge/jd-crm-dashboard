/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_PASSWORD: string
  readonly VITE_N8N_URL: string
  readonly VITE_N8N_API_KEY: string
  readonly VITE_GOOGLE_SHEETS_ID: string
  readonly VITE_GOOGLE_API_KEY: string
  readonly VITE_CLAUDE_VIA_N8N: string
  readonly VITE_WF_ENVIO_EMAILS: string
  readonly VITE_WF_SEGUIMIENTO_EMAIL: string
  readonly VITE_WF_WHATSAPP_SEGUIMIENTO: string
  readonly VITE_BUSINESS_EMAIL_MAIN: string
  readonly VITE_BUSINESS_EMAIL_OUTREACH: string
  readonly VITE_BUSINESS_WHATSAPP: string
  readonly VITE_BUSINESS_BOOKING: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
