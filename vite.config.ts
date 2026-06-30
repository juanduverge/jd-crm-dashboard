import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
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
        target: process.env.VITE_N8N_URL || 'http://localhost:5678',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/n8n-api/, '/api/v1'),
      },
      // Proxy de los webhooks del "CRM API" (lectura/escritura de Sheets vía n8n)
      '/n8n-hook': {
        target: process.env.VITE_N8N_URL || 'http://localhost:5678',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/n8n-hook/, '/webhook'),
      },
    },
  },
  // Base relativa para que funcione en jddeveloper.com/crm
  base: './',
})
