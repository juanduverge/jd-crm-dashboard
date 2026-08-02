import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `loadEnv` lee el .env aquí, en Node. Esto NO mete nada en el bundle: el
  // proxy de desarrollo vive en el servidor de Vite, igual que nginx en
  // producción, y es quien pone las cabeceras. Sin esto, en local las llamadas
  // a /n8n-api llegaban a n8n SIN la API key -> 401 -> "Sin conexión", que es
  // la desconexión que había que reconectar a mano.
  const env = loadEnv(mode, process.cwd(), '')
  const destinoN8n = env.VITE_N8N_URL || 'http://localhost:5678'

  const cabecerasDev = {
    // Se prefiere el nombre SIN prefijo VITE_: así la key nunca puede acabar
    // en el bundle ni por descuido. `VITE_N8N_API_KEY` se acepta por
    // compatibilidad con los .env que ya existían.
    ...((env.N8N_API_KEY_DEV || env.VITE_N8N_API_KEY)
      ? { 'X-N8N-API-KEY': env.N8N_API_KEY_DEV || env.VITE_N8N_API_KEY }
      : {}),
    // Par de credenciales de servicio de Cloudflare Access. Sin ellas, un
    // n8n detrás de Access devuelve su pantalla de login al proxy, que no
    // tiene cookie de sesión y no puede autenticarse.
    ...(env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID } : {}),
    ...(env.CF_ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET } : {}),
  }

  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      // Proxy n8n (API pública) para evitar CORS en desarrollo
      '/n8n-api': {
        target: destinoN8n,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/n8n-api/, '/api/v1'),
        headers: cabecerasDev,
      },
      // Proxy de los webhooks del "CRM API" (lectura/escritura de Sheets vía n8n)
      '/n8n-hook': {
        target: destinoN8n,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/n8n-hook/, '/webhook'),
        headers: {
          ...(env.VITE_N8N_HOOK_TOKEN ? { 'X-CRM-TOKEN': env.VITE_N8N_HOOK_TOKEN } : {}),
          ...(env.CF_ACCESS_CLIENT_ID ? { 'CF-Access-Client-Id': env.CF_ACCESS_CLIENT_ID } : {}),
          ...(env.CF_ACCESS_CLIENT_SECRET ? { 'CF-Access-Client-Secret': env.CF_ACCESS_CLIENT_SECRET } : {}),
        },
      },
    },
  },
  // Base relativa para que funcione en jddeveloper.com/crm
  base: './',
  }
})
