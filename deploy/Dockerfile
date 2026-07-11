# ============================================================
# JD Developer CRM — build de producción (Vite → nginx)
# Fuente de verdad versionada. Reemplaza la copia gitignorada
# que vivía en n8n-migracion/.
#
# IMPORTANTE: los ARG VITE_* se hornean en el bundle y son PÚBLICOS.
# NO pasar aquí VITE_N8N_API_KEY ni VITE_N8N_HOOK_TOKEN: esos secretos
# los inyecta nginx en runtime (ver nginx.conf.template + variables de
# entorno del contenedor N8N_API_KEY / CRM_HOOK_TOKEN / N8N_INTERNAL_URL).
# ============================================================

FROM node:20-alpine AS build
WORKDIR /app

# Solo variables NO sensibles (datos de negocio, IDs de workflow).
ARG VITE_GOOGLE_SHEETS_ID
ARG VITE_WF_ENVIO_EMAILS
ARG VITE_WF_SEGUIMIENTO_EMAIL
ARG VITE_WF_WHATSAPP_SEGUIMIENTO
ARG VITE_BUSINESS_EMAIL_MAIN
ARG VITE_BUSINESS_EMAIL_OUTREACH
ARG VITE_BUSINESS_WHATSAPP
ARG VITE_BUSINESS_BOOKING

ENV VITE_GOOGLE_SHEETS_ID=$VITE_GOOGLE_SHEETS_ID \
    VITE_WF_ENVIO_EMAILS=$VITE_WF_ENVIO_EMAILS \
    VITE_WF_SEGUIMIENTO_EMAIL=$VITE_WF_SEGUIMIENTO_EMAIL \
    VITE_WF_WHATSAPP_SEGUIMIENTO=$VITE_WF_WHATSAPP_SEGUIMIENTO \
    VITE_BUSINESS_EMAIL_MAIN=$VITE_BUSINESS_EMAIL_MAIN \
    VITE_BUSINESS_EMAIL_OUTREACH=$VITE_BUSINESS_EMAIL_OUTREACH \
    VITE_BUSINESS_WHATSAPP=$VITE_BUSINESS_WHATSAPP \
    VITE_BUSINESS_BOOKING=$VITE_BUSINESS_BOOKING

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine
# nginx:alpine aplica envsubst sobre los .template en arranque.
COPY deploy/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
</content>
