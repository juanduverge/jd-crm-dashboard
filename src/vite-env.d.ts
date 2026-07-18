/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase (backend: DB, Auth). Ambas son publicas (van en el bundle).
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // n8n (integracion: email, IA, busqueda). La API key NO se lee aqui:
  // la inyecta nginx server-side en /n8n-api. Ver deploy/nginx.conf.template.
  readonly VITE_N8N_URL: string
  readonly VITE_N8N_HOOK_TOKEN: string
  // IDs de workflows n8n.
  readonly VITE_WF_ENVIO_EMAILS: string
  readonly VITE_WF_SEGUIMIENTO_EMAIL: string
  readonly VITE_WF_WHATSAPP_SEGUIMIENTO: string
  // Datos de negocio.
  readonly VITE_BUSINESS_EMAIL_MAIN: string
  readonly VITE_BUSINESS_EMAIL_OUTREACH: string
  readonly VITE_BUSINESS_WHATSAPP: string
  readonly VITE_BUSINESS_BOOKING: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
