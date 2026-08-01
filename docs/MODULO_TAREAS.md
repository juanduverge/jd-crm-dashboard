# Módulo Tareas

> Gestión **100% manual**. Nada se envía solo: son metas que subes tú y tareas que marcas tú.
> Todo vive en Supabase (`goals`, `horario_bloques`, `horario_completions`, `tasks`).

La sección **Tareas** es una sola pantalla con un selector arriba que cambia el panel
visible sin recargar. Todas las vistas comparten el mismo motor: metas numéricas con
progreso, en cascada **mes → semana → día**.

| Vista | Para qué |
|---|---|
| Metas del mes | Crear objetivos del mes; al crearlos se reparten solos en semanas y días |
| Metas de la semana | El trozo de mes que toca esta semana (auto-generado) |
| Metas del día | El checklist que abres a las 8am |
| Horario diario | Plantilla de bloques de tiempo; al completarlos suman a la meta que alimentan |
| Horario / Calendario | Rejilla del mes con metas, horario, tareas y seguimientos |
| Tareas sueltas | To-do no numérico: prioritarias, secundarias e ideas |

Cada tarea suelta lleva título, tipo (seguimiento/llamada/email/reunión/whatsapp/otro),
vencimiento con aviso "Hoy"/"Vencida", prioridad, notas y lead asociado. El botón
**"Programar seguimiento"** del drawer de una solicitud del Inbox sigue creando una
tarea del lead (vencimiento +2 días) sin salir de la pantalla — ver `WebLeadDrawer.tsx`.

La vista elegida se recuerda por usuario en `localStorage`
(`jd-crm:tareas:vista:<userId>`): es preferencia de pantalla, no dato de negocio.

## La cascada (lo importante)

Al crear una **meta mensual** de tipo contador con objetivo y unidad, el CRM crea
también sus metas semanales y diarias:

- **Semanal** = parte proporcional del objetivo mensual según los **días laborables**
  de cada tramo. No es "target ÷ 4": la primera y la última semana del mes casi nunca
  están completas. Con semanas completas el resultado coincide con dividir en partes
  iguales; con semanas partidas es el reparto correcto.
- **Diaria** = objetivo de la semana repartido entre sus días laborables (por defecto
  lunes a viernes; se elige al crear la meta).
- El reparto es iterativo (`share = restante / tramos restantes`), así que **la suma de
  las hijas cuadra exacta** con el objetivo de la madre, sin residuos de redondeo.

El avance se registra **una sola vez, en la meta diaria**, y sube solo:

```
meta diaria  +5  →  meta semanal +5  →  meta mensual +5
```

Esto lo garantiza un trigger de la base de datos, no la interfaz: el `valor_actual` de
una meta con hijas **es siempre** la suma de sus hijas. Por eso los botones +/− sólo
aparecen en metas hoja — para mover el número hay que bajar al nivel de abajo.

Editar el objetivo de una meta con hijas lo **redistribuye** entre ellas (y baja hasta
las diarias) sin perder el progreso ya registrado. Editar una meta diaria no toca nada
hacia arriba: el ajuste fino vive abajo.

## Horario diario

Los bloques son una plantilla recurrente (`dias_semana` en ISO: 1 = lunes … 7 = domingo);
la marca de completado es **por fecha**, en `horario_completions`.

Un bloque puede colgar de una **meta mensual**. Al marcarlo, el CRM resuelve la meta
diaria de esa fecha dentro de esa familia y le suma el `aporte` del bloque; al
desmarcarlo lo resta exactamente (la completación guarda la meta y el aporte que aplicó,
así que deshacer funciona aunque el bloque cambie después).

El enlace se hace con la meta del **mes** y no con la del día a propósito: el bloque es
plantilla fija, la meta diaria cambia cada jornada.

## Datos

`supabase/migrations/0015_goals_module.sql` (aditiva: no borra ni renombra nada).

- **`goals`** — `nombre`, `periodo` (mes/semana/dia), `parent_id`, `tipo`
  (contador/toggle), `target`, `valor_actual`, `unidad`, `fecha_inicio`, `fecha_fin`,
  `responsable`, soft-delete.
  Invariantes en BD: jerarquía coherente (día→semana→mes) y dentro del rango de la
  madre; una mensual es siempre raíz; un toggle es target 1 y valor 0/1.
- **`horario_bloques`** — `titulo`, `hora_inicio`, `hora_fin`, `dias_semana[]`,
  `goal_id`, `aporte`, `activo`.
- **`horario_completions`** — `bloque_id` + `fecha` (único), con `goal_aplicado_id` y
  `aporte_aplicado` para deshacer exacto. Sólo se escribe por RPC.
- **`tasks`** — se le añaden `seccion` (prioritaria/secundaria/idea) y `goal_id`.
  **No se toca `prioridad`** (baja/media/alta/urgente), que ya tiene datos vivos y la
  usa el resto del CRM.

### RPCs

| Función | Qué hace |
|---|---|
| `crear_meta_mensual(...)` | Crea la mensual y su cascada en una transacción |
| `generar_cascada_goal(id, dias[])` | Crea semanas + días de una mensual que se creó sin cascada |
| `generar_dias_de_semana(id, dias[])` | Días de una semana concreta |
| `redistribuir_hijos(id)` | Reparte de nuevo el objetivo entre las hijas existentes, sin perder progreso |
| `registrar_avance(id, delta)` | Suma/resta en una meta hoja; la BD lo sube en cascada |
| `completar_bloque(id, fecha)` / `descompletar_bloque(id, fecha)` | Marca el bloque y ajusta la meta diaria ligada |

RLS con el mismo patrón que el resto (`auth_role()`: admin/vendedor escriben, viewer
lee). Todas las funciones van con `search_path` fijo y revocadas de `anon` desde el
principio — la lección de la 0014.

## Archivos

- `supabase/migrations/0015_goals_module.sql` — tablas, triggers, RPCs, RLS
- `src/services/goalsService.ts` — CRUD + RPCs
- `src/hooks/useData.ts` — `useGoals`, `useRegistrarAvance`, `useHorarioDia`, `useToggleBloque`, …
- `src/features/tareas/` — `TareasPage` (shell + selector), `MetasPeriodoView`,
  `MetasDiaView`, `HorarioDiarioView`, `CalendarioView`, `TareasSueltasView`,
  `GoalCard`, `NuevaMetaModal`, `goalMeta.ts`
- `src/types/index.ts` — `Goal`, `HorarioBloque`, `HorarioBloqueDia`, `TareaSeccion`

## Pendiente

- **Google Calendar**: no está conectado al CRM. La vista Calendario pinta hoy lo que
  ya vive en Supabase (metas, horario, tareas, seguimientos). Cuando se conecte, los
  eventos se leerán en vivo de Calendar y se superpondrán aquí — sin duplicarlos en la
  base de datos.
- Recordatorio matutino (workflow n8n que lea las metas del día y te avise a ti).
