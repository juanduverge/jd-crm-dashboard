# Roadmap — JDDeveloper CRM

## ✅ Fase 1 — Completada

Setup, marca, login, layout, búsqueda global Cmd+K, Tab Resumen (KPIs + gráficos),
Tab Leads (tabla + CRUD + drawer). Detalle en [ESTADO.md](ESTADO.md).

---

## 🟡 Fase 2 — Pipeline + Campañas (siguiente)

**Objetivo:** convertir leads en oportunidades gestionables y lanzar campañas reales.

- **💰 Pipeline (Kanban)** con dnd-kit:
  - Columnas Nuevo → … → Cerrado Ganado/Perdido.
  - Cards arrastrables (empresa, valor, días en columna, prioridad, canal).
  - Total $ y conteo por columna; forecast del mes por probabilidad de etapa.
  - Drag & drop → actualiza Sheets vía webhook n8n.
  - Alertas de leads estancados; vista lista alternativa.
- **🎯 Campañas**:
  - Grid de cards por campaña con métricas.
  - Wizard 3 pasos (info → selección de leads → template + programación).
  - Lanzar campaña → dispara workflow `Fase 3 - Envío de Emails` (`ITdsEWd94R8ptUlb`).
  - Pausar/reanudar, A/B testing de templates.
  - Editor de templates con variables `{{empresa}}`, `{{nombre}}`, `{{web}}`, etc.
  - Biblioteca de templates por nicho + generador con Claude (vía n8n).
- **Escritura a Sheets vía n8n** (cierra el loop de mutaciones de Fase 1).

---

## 🟡 Fase 3 — Bandeja + Mensajes + Automatizaciones

- **📧 Bandeja**: inbox IMAP (`imap.hostinger.com:993`, `sales@jddeveloper.com`),
  categorización con Claude, sugerencia de respuesta AI, vincular email a lead.
- **📱 Mensajes**: historial multicanal (Email/WhatsApp/IG) tipo chat, snippets,
  sentiment analysis (🔥/🟡/🔵) con Claude.
- **🤖 Automatizaciones**: control center n8n (toggle activar/desactivar, ejecutar,
  logs de ejecuciones, tasa de éxito, abrir en n8n), panel de integraciones.
- **Búsqueda global** ampliada a mensajes y campañas.

---

## 🟡 Fase 4 — Analíticas + Configuración

- **📊 Analíticas**: rango de fechas, performance por campaña/nicho/ciudad, heatmap
  mejor hora de envío, sankey del embudo, revenue proyectado vs real, cohortes,
  LTV, CAC, ROI, export a PDF, reportes programados.
- **⚙️ Configuración**: perfil del negocio, conexiones API (test por integración),
  usuarios y roles, nichos, etapas del pipeline, plantillas, notificaciones,
  backups, apariencia (tema/idioma/densidad).
- **Transversales**: notificaciones in-app, i18n ES/EN, PWA offline, onboarding.

---

## 🚀 Futuro (post-Fase 4)

### Corto plazo (1-3 meses)
- Webhook receiver n8n → CRM en tiempo real.
- Auto-clasificación de respuestas y generación de propuestas con Claude.
- Calendario de tareas/seguimientos; to-dos por lead.

### Mediano plazo (3-6 meses)
- Multi-usuario con roles reales.
- Stripe (cobros), firma electrónica (DocuSign/Dropbox Sign).
- VoIP con grabación/transcripción; Instagram DM; LinkedIn outreach.
- Chat live en jddeveloper.com conectado al CRM.
- Generador de auditorías web (Lighthouse + Claude).

### Largo plazo (6-12 meses)
- **Multi-tenant / white-label** (vender el CRM a otras agencias).
- IA conversacional que califica leads 24/7.
- Predicción de cierre con ML; recomendador de próxima acción.
- Marketplace de templates/workflows; app móvil React Native.
- API pública; voice commands.

---

## Principios de evolución

1. Cada integración nueva = un archivo en `services/` + un hook. Sin refactor del core.
2. Las mutaciones pasan por n8n (backend), no exponen secretos en el cliente.
3. Roles e i18n ya están cableados para activarse sin reescribir.
