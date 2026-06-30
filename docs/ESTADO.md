# Estado del proyecto — JDDeveloper CRM

## ✅ Fase 1 — COMPLETADA (funcional)

| Pieza | Estado |
|-------|--------|
| Extracción de colores/tipografía de la web | ✅ `src/styles/brand.js` |
| Setup proyecto + dependencias | ✅ |
| Tema claro/oscuro con tokens de marca + persistencia | ✅ |
| Login (contraseña `JDDeveloper2026`, sesión en localStorage, logout) | ✅ Funcional |
| Layout: sidebar colapsable + topbar + routing animado | ✅ Funcional |
| Búsqueda global Cmd/Ctrl+K (leads + páginas) | ✅ Funcional |
| **Tab Resumen**: 6 KPIs con sparkline, embudo, líneas 30 días, dona por nicho, feed actividad, estado workflows n8n, leads que necesitan atención | ✅ Funcional (KPIs y gráficos calculados de datos reales) |
| **Tab Leads**: tabla, búsqueda fuzzy, filtros (estado/nicho/score), orden por columna, selección múltiple, badges de score, acciones inline (email/WhatsApp/ver), export CSV, agregar/editar (modal + validación Zod), drawer de detalle con tabs y "mover a etapa" | ✅ Funcional |
| Datos: lectura Google Sheets (con fallback a datos de ejemplo) | ✅ |
| Conexión n8n (listar workflows, estado en vivo) | ✅ |

### Notas Fase 1
- **Sin `VITE_GOOGLE_API_KEY`**, los leads vienen de datos de ejemplo realistas
  (mismo esquema que las hojas `prospects`/`pipeline`). Al configurar la API key,
  pasa a datos en vivo automáticamente.
- Las **mutaciones de leads** (agregar/editar/eliminar/mover etapa) son optimistas en
  el store local. La escritura a Sheets vía n8n se conecta en Fase 2.
- El estado de **workflows n8n** es en vivo si n8n corre en `localhost:5678`.

## 🟡 Fase 2 — Pendiente (estructura placeholder)
- Tab Pipeline (Kanban dnd-kit) — placeholder visual.
- Tab Campañas (wizard, templates) — placeholder visual.
- Disparo de workflows n8n desde campañas + escritura a Sheets.

## 🟡 Fase 3 — Pendiente (estructura placeholder)
- Tab Bandeja (IMAP), Tab Mensajes (multicanal), Tab Automatizaciones (control n8n).

## 🟡 Fase 4 — Pendiente (estructura placeholder)
- Tab Analíticas (reportes, heatmaps, sankey), Tab Configuración completa, notificaciones.

## Arquitectura lista para el roadmap
- Roles en `authStore` (admin/vendedor/viewer) listos para multi-usuario.
- `services/` aislado para sumar IMAP, Claude, Stripe, etc. sin refactor.
- Tipos del dominio centralizados en `src/types`.
