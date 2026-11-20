# Conectar Google Calendar al CRM

El CRM ya está preparado. Falta activar un workflow en n8n. Cuando esté
activo, el CRM lo detecta solo (como mucho en 5 minutos, o al recargar).

## Qué hace

- Todo evento o reunión creado en el CRM se crea también en tu Google Calendar.
- Al crear una **reunión** se puede pedir el **enlace de Meet**: Google crea la
  sala en ese momento y el CRM lo guarda en el evento (y lo copia al portapapeles).
- **Invitados**: si pones correos y marcas «Enviar invitación», Google les
  manda la invitación con el enlace.
- Mover, editar o borrar en el CRM hace lo mismo en Google.
- Lo que crees o cambies en Google (o en el móvil) aparece en el CRM al abrir
  el calendario, y cada 5 minutos mientras está abierto.

## Pasos (en n8n, servidor de casa)

1. **Importar** `n8n/crm-calendario-google.json`
   (Workflows → Import from file). Se llama «CRM API - Calendario Google».
2. El nodo **Webhook** va sin autenticación, como el resto de webhooks del
   CRM: a 20-nov `CRM_HOOK_TOKEN` está vacío en el contenedor del CRM, así
   que nginx no manda ningún token. **Pendiente de seguridad**: definir ese
   token en el servidor y poner *Header Auth* (`X-CRM-TOKEN`) en todos los
   webhooks a la vez.
3. Nodos **Google (con cuerpo)** y **Google (sin cuerpo)** → credencial
   **Google Calendar account** (ya existe en n8n).
4. **Guardar y publicar/activar** el workflow (recuerda: editar no basta,
   hay que publicarlo).
5. **Probar**: abrir el CRM → Calendario. Debajo de la cabecera debe salir
   el punto verde «Sincronizado con Google Calendar (tu correo)».

Prueba directa desde el servidor, si hace falta:

```bash
curl -s -X POST http://localhost:5678/webhook/crm-calendario \
  -H 'Content-Type: application/json' -H "X-CRM-TOKEN: $CRM_HOOK_TOKEN" \
  -d '{"accion":"estado"}'
# → {"ok":true,"calendario":"tu@correo","zonaHoraria":"America/Santo_Domingo"}
```

## Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| El CRM sigue diciendo «sin conectar» | Workflow sin publicar, o recarga la página (el estado se guarda 5 min). |
| `403 Insufficient Permission` | La credencial de Google no tiene permiso de escritura en el calendario: reconectarla en n8n aceptando todos los permisos de Calendar. |
| `401` desde el webhook | El token de la credencial «CRM Hook Token» no coincide con `CRM_HOOK_TOKEN`. |
| Sale el evento pero sin enlace de Meet | La cuenta de Google no permite Meet (cuentas de Workspace con Meet desactivado). |

## Detalles técnicos

- Una sola URL `crm-calendario` con `accion`: `estado`, `listar`, `crear`,
  `actualizar`, `borrar`.
- Calendario: `primary` (el principal de la cuenta conectada). Zona horaria
  por defecto `America/Santo_Domingo`.
- El enlace con el evento de Google se guarda en `eventos.google_event_id`
  (columnas de la migración 0018). No hace falta migración nueva.
- Código del CRM: `src/services/googleCalendarService.ts`.
