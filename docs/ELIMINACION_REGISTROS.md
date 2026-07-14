# Eliminación de registros

Estrategia de borrado del CRM: **soft-delete + purga lógica en dos etapas**, sin borrado físico de filas en Google Sheets.

## Por qué dos etapas

1. **Eliminar** (soft-delete): oculta el registro de las vistas normales y lo muestra en la Papelera. Reversible con "Restaurar".
2. **Purgar** (Papelera → "Eliminar definitivamente" o "Vaciar papelera"): oculta el registro también de la Papelera. Ya no es reversible desde la UI.

En ningún caso se borra la fila de Google Sheets. Esto preserva un rastro de auditoría completo (quién eliminó, cuándo, y qué se purgó) y evita el riesgo de borrar accidentalmente datos que alimentan reportes, campañas o integraciones (n8n, email) que referencian esas filas por id.

## Columnas usadas por hoja

| Hoja        | Marca de soft-delete                  | Marca de purga        |
|-------------|----------------------------------------|------------------------|
| `prospects` | `Eliminado` (ISO) / `Eliminado_por`   | `Purgado` (col **AH**) |
| `pipeline`  | `Eliminado` (ISO) / `Eliminado_por`   | `Purgado` (col **N**)  |
| `campaigns` | `estado = 'eliminada'`                | `estado = 'purgada'`   |
| `tareas`    | `Eliminado` (ISO) / `Eliminado_por`   | `Purgado` (col **O**)  |
| `web_leads` | `Eliminado` (ISO) / `Eliminado_por`   | `Purgado` (col **AA**) |

Las vistas normales (Leads, Pipeline, Tareas, Inbox de Leads, Campañas) filtran cualquier fila con `Eliminado`/`estado==='eliminada'`. La Papelera muestra únicamente filas con `Eliminado`/`estado==='eliminada'` que **no** tengan `Purgado`/`estado==='purgada'`.

## Módulos con soporte de eliminación

| Módulo              | Eliminar | Restaurar | Purgar | Notas |
|----------------------|:--------:|:---------:|:------:|-------|
| Leads                | ✅       | ✅        | ✅     | Lead + fila de Pipeline se eliminan/restauran/purgan siempre juntos (un lead sin su fila de pipeline queda huérfano). |
| Pipeline             | ✅       | ✅        | ✅     | Ver arriba — unificado con Leads en la Papelera. |
| Campañas             | —        | ✅        | ✅     | El alta de campañas no expone borrado desde la UI; solo restaurar/purgar campañas ya marcadas `eliminada` (p. ej. por integración externa). |
| Tareas               | ✅       | ✅        | ✅     | Independiente, no referencia otras hojas por fila. |
| Inbox de Leads (web_leads) | ✅ | ✅        | ✅     | Independiente. |

## Integridad referencial

- **Lead ↔ Pipeline**: acoplados. `deleteLead`/`restoreLead`/`purgeLead` siempre se disparan junto con su contraparte de Pipeline (`LeadsPage.tsx`, `useRestoreTrashItem`/`usePurgeTrashItem` en `useData.ts`).
- No hay otras relaciones fila-a-fila que exijan bloquear el borrado (mensajes, tareas y solicitudes web se identifican por `lead_id` como referencia informativa, no como llave con integridad forzada — eliminar un lead no elimina sus tareas o mensajes asociados).

## Backend (n8n)

Los tres workflows que escriben en Sheets (`CRM API - Escribir Sheets`, `CRM API - Tareas`, `CRM API - Web Lead`) exponen acciones `*_delete`/`*_restore`/`*_purge` (o `delete`/`restore`/`purge` según el payload) que solo escriben timestamps/flags mediante `batchUpdate` o `appendOrUpdate` — nunca `DELETE` ni `clear` de filas.

## UI

- Confirmación de soft-delete: `ConfirmDeleteModal` — copy estándar "¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer." con aviso de que el registro pasa a la Papelera.
- Papelera (`/papelera`, `TrashPage.tsx`): lista unificada de todos los módulos, filtro por módulo, botón "Restaurar" por fila, botón "Eliminar definitivamente" por fila con confirmación propia, y "Vaciar papelera" para purgar todo lo listado.
