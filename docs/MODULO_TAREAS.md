# Módulo Tareas y Seguimientos

> Gestión **100% manual** de recordatorios comerciales. **Nada se envía automáticamente** —
> son tareas que el equipo marca como hechas, no correos que salgan solos (decisión explícita de Juan).

## Qué hace
- Pestaña **Tareas**: contadores (pendientes / vencidas / completadas), filtros
  (pendientes / todas / hechas), marcar hecha con un clic, crear tarea.
- Cada tarea: título, tipo (seguimiento/llamada/email/reunión/whatsapp/otro),
  fecha de vencimiento (con aviso "Hoy"/"Vencida"), prioridad, notas, lead asociado.
- **Integración con el Inbox**: botón "Programar seguimiento" en el drawer de una
  solicitud crea una tarea del lead (vencimiento +2 días) sin salir de la pantalla.

## Arquitectura
```
Frontend (TareasPage, NuevaTareaModal)
   ↓ crmApi.createTarea / updateTarea  → POST /webhook/crm-tarea
Workflow "CRM API - Tareas"  (create | update, appendOrUpdate por id)
   ↓
Hoja "tareas"  (id, titulo, tipo, lead_id, lead_nombre, fecha_vencimiento,
                estado, prioridad, responsable, notas, creado, actualizado)
   ↓ lectura via crm-sheets-read?sheet=tareas (en whitelist)
Frontend useTareas (polling 30s)
```

## Archivos
- `n8n/CRM_API_Tareas.json` — workflow (id live `G3QwTpsOvI27hnwl`)
- `src/features/tareas/TareasPage.tsx` — página + modal de creación
- `src/hooks/useData.ts` — `useTareas` / `useCreateTarea` / `useUpdateTarea`
- `src/services/crmApi.ts` — `createTarea` / `updateTarea`
- `src/types/index.ts` — `Tarea`, `TareaEstado`, `TareaTipo`
- Nav + ruta `/tareas`, y "Programar seguimiento" en `WebLeadDrawer.tsx`

## Arquitectura futura (preparada)
- **Recordatorios por email/push**: se puede añadir un workflow n8n programado que
  lea `tareas` con vencimiento = hoy y te avise — seguiría siendo un aviso a TI, no un
  envío al cliente.
- **Vista calendario/agenda** sobre la misma hoja.
- Al migrar a Postgres, `tareas` pasa a tabla con FK a `leads`.
