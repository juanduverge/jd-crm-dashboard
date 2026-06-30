# Instalación — JDDeveloper CRM

Guía para levantar el proyecto desde cero.

## Requisitos

- **Node.js** ≥ 20 (probado en v24.16.0)
- **npm** ≥ 10 (probado en v11.13.0)
- (Opcional) **n8n** corriendo en `localhost:5678` para datos de automatización en vivo
- (Opcional) **API key de Google Sheets** para leads en vivo

## Pasos

```bash
# 1. Entrar a la carpeta del proyecto
cd "C:\Users\juanm\Desktop\Escritorio\JD Developer\jd-crm-dashboard"

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
copy .env.example .env        # Windows (cmd)
# o:  cp .env.example .env     # Git Bash
# Edita .env y completa los valores (ver tabla abajo)

# 4. Levantar el servidor de desarrollo
npm run dev
```

La app queda disponible en **http://localhost:3000**.
Contraseña de acceso por defecto: **`JDDeveloper2026`** (variable `VITE_APP_PASSWORD`).

## Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `VITE_APP_PASSWORD` | Sí | Contraseña de login del dashboard |
| `VITE_N8N_URL` | Para n8n | URL base de n8n (ej. `http://localhost:5678`) |
| `VITE_N8N_API_KEY` | Para n8n | API key pública de n8n (Settings → n8n API) |
| `VITE_GOOGLE_SHEETS_ID` | Para Sheets | ID del Google Sheet de leads |
| `VITE_GOOGLE_API_KEY` | Para datos en vivo | API key de Google Cloud (Sheets API v4) |
| `VITE_WF_*` | Opcional | IDs de los workflows de n8n |
| `VITE_BUSINESS_*` | Opcional | Datos de contacto del negocio |

> Si `VITE_GOOGLE_API_KEY` está vacío, el CRM funciona con **datos de ejemplo**
> realistas (mismo esquema que las hojas reales). No bloquea el desarrollo.

### Cómo obtener la API key de Google Sheets

1. Entra a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea/elige un proyecto → APIs & Services → **Enable APIs** → habilita **Google Sheets API**.
3. Credentials → **Create credentials → API key**.
4. (Recomendado) Restringe la key a la Sheets API.
5. Comparte el Google Sheet como **"Cualquiera con el enlace puede ver"**.
6. Pega la key en `VITE_GOOGLE_API_KEY` dentro de `.env` y reinicia `npm run dev`.

## Scripts disponibles

```bash
npm run dev       # Servidor de desarrollo (puerto 3000)
npm run build     # Build de producción -> /dist
npm run preview   # Previsualiza el build de producción
npm run lint      # Linter
```

## Problemas comunes

- **Puerto 3000 ocupado**: cierra el proceso o cambia `server.port` en `vite.config.ts`.
- **CORS con n8n**: en dev se usa el proxy de Vite (`/n8n-api`). Asegúrate de que n8n
  esté corriendo y la API key sea válida.
- **Pantalla de login no avanza**: verifica `VITE_APP_PASSWORD` en `.env`.
