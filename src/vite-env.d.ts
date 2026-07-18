/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase (backend: DB, Auth). Ambas son publicas (van en el bundle).
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // n8n (integracion: email, IA, busqueda). La API key NO se lee aqui:
  // la inyecta nginx server-side en /n8n-api. Ver deploy/nginx.conf.template.
  readonly VITE_N8N_URL: string
  readonly VITE_N8N_HOOK_TOKEN: string
  // ID del workflow n8n de envío de emails (único que la app dispara por ID).
  readonly VITE_WF_ENVIO_EMAILS: string
  // Datos de negocio.
  readonly VITE_BUSINESS_EMAIL_MAIN: string
  readonly VITE_BUSINESS_EMAIL_OUTREACH: string
  readonly VITE_BUSINESS_WHATSAPP: string
  readonly VITE_BUSINESS_BOOKING: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
