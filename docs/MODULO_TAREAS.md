# Módulo Tareas

> Gestión **100% manual**. Nada se envía solo: son metas que subes tú y tareas que marcas tú.
> Todo vive en Supabase (`goals`, `horario_bloques`, `horario_completions`, `tasks`,
> `time_entries`).

**Productividad** es una sección del menú lateral, no una pantalla: cada módulo tiene su
propia ruta, su propio enlace y su propio chunk. Todos comparten el mismo motor: metas
numéricas con progreso, en cascada **mes → semana → día**.

| Ruta | Módulo | Para qué |
|---|---|---|
| `/productividad/metas/mes` | Metas del mes | Crear objetivos del mes; al crearlos se reparten solos en semanas y días |
| `/productividad/metas/semana` | Metas de la semana | El trozo de mes que toca esta semana (auto-generado) |
| `/productividad/metas/dia` | Metas del día | El checklist que abres a las 8am |
| `/productividad/horario` | Horario diario | Plantilla de bloques de tiempo; al completarlos suman a la meta que alimentan |
| `/productividad/calendario` | Calendario | Rejilla del mes con metas, horario, tareas y seguimientos |
| `/productividad/tareas` | Tareas sueltas | To-do no numérico: prioritarias, secundarias e ideas |
| `/productividad/tiempo` | Tiempo | Cronómetro y registro de la jornada: en qué se fue el día |
| `/productividad/metricas` | Métricas | Panel del mes: horas medidas por día y metas cruzadas con el tiempo que costaron |

Los tres niveles de metas comparten página (`MetasPage`) y se distinguen por el
parámetro `:periodo` — son la misma pantalla mirada a distinta altura, no módulos
distintos. Un periodo desconocido en la URL redirige al día en vez de romper.
En el menú, **Metas** es un acordeón (`kind: 'group'` en `navItems.ts`) y el resto son
enlaces sueltos; qué grupos quedan abiertos se guarda en `uiStore`.

Cada tarea suelta lleva título, tipo (seguimiento/llamada/email/reunión/whatsapp/otro),
vencimiento con aviso "Hoy"/"Vencida", prioridad, notas y lead asociado. El botón
**"Programar seguimiento"** del drawer de una solicitud del Inbox sigue creando una
tarea del lead (vencimiento +2 días) sin salir de la pantalla — ver `WebLeadDrawer.tsx`.

La ruta antigua `/tareas` sigue viva como redirección a `/productividad/tareas`, para no
romper enlaces ya guardados.

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

## Registro de tiempo

**El tiempo mide, no puntúa.** Parar el cronómetro no suma a ninguna meta. El avance ya
entra por dos puertas — los +/− de la meta diaria y `completar_bloque` — y una tercera
haría que la misma media hora contase dos veces. Esta tabla responde a "¿en qué se me
fue el día?", no a "¿cuánto llevo hecho?".

Sólo puede haber **un cronómetro abierto** por responsable, garantizado por un índice
único parcial en la BD. Arrancar uno nuevo cierra el anterior en la misma transacción,
en vez de fallar: es lo que espera quien salta de tarea sin acordarse de parar.

La `fecha` de un tramo (la jornada a la que se imputa) la pone el cliente, igual que en
`completar_bloque`: el servidor está en UTC y a las 21:00 en Santo Domingo ya es mañana.
La `duracion_seg` se deriva siempre de `inicio`/`fin` en un trigger que salta en
cualquier `update`, así que no se puede escribir a mano desde el cliente.

Se cronometra desde la página **Tiempo** (descripción libre + meta opcional) o desde el
botón ▶ de un bloque del **Horario**, que arranca el cronómetro con el título del bloque
y guarda el enlace al bloque y a su meta — así las Métricas podrán cruzar el plan (lo
que el horario decía) con la realidad (lo que se midió). Un tramo olvidado se escribe a
mano y queda marcado como `manual`, para poder distinguir lo medido de lo estimado.

## Métricas

El mes visto por detrás. Lee `v_tiempo_diario` (agregado en la BD) y `goals`, y los
cruza **sin mezclarlos**: el tiempo mide y las metas puntúan, así que una meta al 100%
con pocas horas es información, no un descuadre.

Enseña cinco números del mes (tiempo medido, jornadas con registro, media por jornada,
qué porcentaje del tiempo estaba ligado a una meta y tareas cumplidas), un gráfico de
horas por día — con los días de cero incluidos, porque los huecos también dicen algo —
y tres bloques más:

- **Metas del mes y horas dedicadas**: el progreso al lado de lo que costó.
- **Plan contra realidad**: qué porcentaje de los bloques del horario se marcó como
  hecho y cuántas horas se midieron sobre las planificadas. `horario_bloques` no
  guarda fechas sino días de la semana, así que el plan del mes se *proyecta* día a
  día (ISO dow) sumando los bloques activos. Se mide **sólo hasta hoy**: contar como
  incumplidos los bloques de días que no han llegado convertiría el día 1 en un 3%.
  Pasar del 100% en horas no es un error, es trabajar más de lo previsto. El plan
  también sale en el gráfico como línea discontinua de referencia.
- **Por responsable**: tiempo, jornadas y metas cumplidas de cada uno. `responsable`
  es texto libre, así que se agrupa normalizado y lo que no lo tiene cae en «Sin
  asignar» — que es información, no un error: dice cuánto del mes no tiene dueño.
  Tiempo y metas se cuentan por separado, por la misma razón de siempre (0016).
- **Lo que más tiempo se llevó**: los tramos cerrados del mes agrupados por
  descripción, con su peso sobre el total. Esto no sale de `v_tiempo_diario`, que
  agrupa por meta y perdería el detalle: dos actividades distintas de la misma meta
  caerían en una sola fila. Se calcula en el cliente sobre `getEntradasDelRango`,
  porque un mes de tramos son pocos cientos de filas.
- **Lo que no salió**: metas diarias vencidas sin alcanzar y tareas vencidas sin
  cerrar. El corte es `min(fin de mes, hoy)` — lo que aún no ha llegado no ha
  fallado. Se resume por *déficit* (cuánto se dejó de hacer), no por número de metas:
  20 llamadas de 100 y 99 de 100 no son el mismo problema. Este bloque se enseña
  aunque no haya nada de tiempo registrado, porque no depende de él.

La media por jornada se calcula sobre los días *con registro*, no sobre los días del
mes: dividir entre 30 cuando se trabajaron 18 no describe ninguna jornada real.

«Tareas cumplidas» necesita `tasks.completada_en` (0017). Con el booleano `completada`
y `updated_at` no se podía responder «cuántas cerré en julio» sin mentir: cualquier
edición posterior movía la fecha.

## Descripciones (0017)

Todo lo que se planifica en Productividad —tarea, meta y bloque de horario— lleva una
descripción libre. Un título cabe en una línea y por eso no explica nada: «Prospección»
no dice a quién, ni cómo, ni qué cuenta como hecho.

El campo es un `AutoTextarea` (`src/components/ui/AutoTextarea.tsx`): crece con el
texto hasta un máximo y a partir de ahí hace scroll interno. En lectura se recorta con
`line-clamp` y el texto completo va en el `title`.

En metas la descripción **baja a toda la rama**. La cascada la genera la BD dentro de
`crear_meta_mensual`, así que cuando se escribe la descripción las hijas ya existen y
un trigger `before insert` no las alcanza; de ahí el RPC `set_descripcion_cascada`, que
el servicio llama al crear y al editar. Es el mismo objetivo visto a tres alturas, no
tres objetivos distintos.

## Fases del módulo

Numeración **propia de Productividad**, distinta de las Fases 1-4 de
`docs/ROADMAP.md` (que son del CRM entero).

| Fase | Qué | Estado |
|---|---|---|
| 1-5 | Metas en cascada, horario diario, tareas sueltas, calendario, menú por ruta | Hecho |
| 6 | Migración 0016: `time_entries` + `v_tiempo_diario` | Hecho (aplicada) |
| 7 | Cronómetro y registro de tiempo (vista Tiempo) | Hecho |
| 8 | Métricas del mes | Hecho |
| 9 | Migración 0017: descripciones + `completada_en`, y su UI | Hecho (aplicada) |
| 10 | Cruzar plan contra realidad y métricas por responsable | Hecho |
| 11 | Productividad como acordeón único en el menú | Hecho |
| 12 | Migración 0018: `eventos` + calendario de cuatro vistas | Hecho (**falta aplicar la 0018**) |
| 13 | Migración 0019: categorías de tiempo y cronómetro sin tarea | Hecho (**falta aplicar la 0019**) |
| 14 | Migración 0021: `enlaces` + `duracion_min`, y el modal Editar tarea | Hecho (**falta aplicar la 0021**) |
| 15 | Arrastrar y soltar en el calendario | Hecho |
| 16 | Sincronización con Google Calendar vía n8n | Pendiente |

## Calendario

Cuatro vistas —**día, semana, mes y año**— sobre los mismos datos. La cabecera
navega de verdad: adelante/atrás salta lo que dura la vista, y hay selector de
mes, de año, botón de hoy y salto a una fecha concreta. Atajos: `D` `S` `M` `A`
cambian de vista, `T` vuelve a hoy, las flechas navegan.

**La regla que ordena el módulo entero: el calendario tiene UNA tabla propia y
CUATRO fuentes prestadas.** `eventos` (0018) guarda lo que no tenía dónde vivir
—eventos, reuniones y recordatorios, con inicio y fin reales—. Las metas, los
bloques del horario, las tareas y los seguimientos siguen en su tabla; el
calendario los lee y los pinta. Nada se duplica.

Por eso desde el calendario se pueden **crear seis cosas pero sólo tres se
guardan aquí**: una tarea creada desde el calendario va a `tasks`, una meta a
`goals` y un bloque a `horario_bloques`. Y por eso sólo los eventos se editan
desde el calendario: mover una meta «a las 11:00» sería inventarle una hora que
su tabla no tiene, y arrastrar un bloque cambiaría la plantilla de **todas** las
semanas, no la de ese día. Lo demás, al pulsarlo, lleva a su módulo.

**Arrastrar y soltar** (fase 15) va en las vistas de día y semana, y sólo sobre lo
editable —los eventos—. Se mueve el bloque entero (en la vista de semana, también de
un día a otro: la columna sale de la posición horizontal del ratón) y se estira por su
borde inferior para cambiar la duración. Todo engancha a 15 minutos. Mientras se
arrastra, el item se recoloca de verdad en su destino en lugar de dibujar un fantasma,
así que los solapes de llegada se ven antes de soltar. Al soltar va por `mover_evento`,
la RPC, no por un `update` suelto: inicio y fin tienen que cambiar en la misma
sentencia. `Esc` cancela. Está hecho con eventos de puntero y no con el arrastre nativo
de HTML5 porque hace falta la posición en píxeles para traducirla a minutos.

La pieza que lo hace posible es `itemCalendario.ts`: normaliza las cinco
fuentes a un único `ItemCalendario`. Las vistas sólo conocen esa forma, así que
añadir una sexta fuente es escribir un `desde<X>()` y no tocar ninguna vista.
Ahí viven también la geometría de la rejilla horaria y el reparto de columnas
entre eventos que se solapan.

## Datos

`supabase/migrations/0015_goals_module.sql`, `0016_time_tracking.sql`,
`0017_descripciones_y_cumplimiento.sql`, `0018_eventos_calendario.sql` y
`0019_tiempo_categorias.sql` (aditivas: no borran ni renombran nada).

- **`goals`** — `nombre`, `descripcion` (0017), `periodo` (mes/semana/dia), `parent_id`, `tipo`
  (contador/toggle), `target`, `valor_actual`, `unidad`, `fecha_inicio`, `fecha_fin`,
  `responsable`, soft-delete.
  Invariantes en BD: jerarquía coherente (día→semana→mes) y dentro del rango de la
  madre; una mensual es siempre raíz; un toggle es target 1 y valor 0/1.
- **`horario_bloques`** — `titulo`, `descripcion` (0017), `hora_inicio`, `hora_fin`, `dias_semana[]`,
  `goal_id`, `aporte`, `activo`.
- **`horario_completions`** — `bloque_id` + `fecha` (único), con `goal_aplicado_id` y
  `aporte_aplicado` para deshacer exacto. Sólo se escribe por RPC.
- **`tasks`** — se le añaden `seccion` (prioritaria/secundaria/idea), `goal_id` y
  `completada_en` (0017: lo sella el trigger `sync_task_completada` la primera vez que
  la tarea pasa a hecha, y lo borra si se reabre). `descripcion` ya existía desde la
  0001; la 0017 sólo la iguala en `goals` y `horario_bloques`.
  **No se toca `prioridad`** (baja/media/alta/urgente), que ya tiene datos vivos y la
  usa el resto del CRM.
- **`time_entries`** (0016) — `descripcion`, `fecha`, `inicio`, `fin`, `duracion_seg`,
  `fuente` (cronometro/manual), enlaces opcionales e independientes a `goal_id`,
  `bloque_id` y `task_id` (todos `on delete set null`: borrar una meta no borra la
  historia), `responsable`, soft-delete.
  Invariantes en BD: `fin > inicio`; una entrada abierta no tiene duración y una
  cerrada siempre la tiene; un solo cronómetro abierto por responsable.
- **`v_tiempo_diario`** (0016) — vista agregada por día, responsable y meta
  (`security_invoker`, para que respete la RLS de quien consulta). Es la base de
  Métricas: agrega en la BD en vez de traerse miles de filas. Sólo cuenta tramos
  cerrados — el cronómetro en marcha no aparece hasta que se para.

### RPCs

| Función | Qué hace |
|---|---|
| `crear_meta_mensual(...)` | Crea la mensual y su cascada en una transacción |
| `generar_cascada_goal(id, dias[])` | Crea semanas + días de una mensual que se creó sin cascada |
| `generar_dias_de_semana(id, dias[])` | Días de una semana concreta |
| `redistribuir_hijos(id)` | Reparte de nuevo el objetivo entre las hijas existentes, sin perder progreso |
| `registrar_avance(id, delta)` | Suma/resta en una meta hoja; la BD lo sube en cascada |
| `completar_bloque(id, fecha)` / `descompletar_bloque(id, fecha)` | Marca el bloque y ajusta la meta diaria ligada |
| `iniciar_tiempo(descripcion, fecha, goal, bloque, task, responsable, categoria)` | Arranca el cronómetro; cierra el que hubiese abierto. La 0019 le añade `categoria` y **deja caer la firma de 6 parámetros** (dos firmas harían ambigua cualquier llamada con parámetros nombrados) |
| `parar_tiempo(id?, responsable?)` | Cierra el tramo (el indicado o el abierto) y devuelve los segundos |
| `registrar_tiempo_manual(...)` | Tramo escrito a mano, marcado como `manual` |
| `set_descripcion_cascada(id, texto)` | Escribe la descripción en la meta y en toda su descendencia |
| `mover_evento(id, inicio, fin?)` | Mueve o redimensiona un evento. Sin `fin` conserva la duración; hace los dos cambios en una operación para que un fallo no deje el evento medio movido |
| `duplicar_evento(id, inicio?)` | Copia todo menos la identidad y el rastro de Google: heredar `google_event_id` convertiría el duplicado en un intento de sobrescribir la cita original |

RLS con el mismo patrón que el resto (`auth_role()`: admin/vendedor escriben, viewer
lee). Todas las funciones van con `search_path` fijo y revocadas de `anon` desde el
principio — la lección de la 0014.

## Archivos

- `supabase/migrations/0015_goals_module.sql` — tablas, triggers, RPCs, RLS
- `supabase/migrations/0016_time_tracking.sql` — `time_entries`, `v_tiempo_diario`, RPCs
- `supabase/migrations/0017_descripciones_y_cumplimiento.sql` — descripciones y `completada_en`
- `supabase/migrations/0018_eventos_calendario.sql` — `eventos`, `mover_evento`, `duplicar_evento`
- `supabase/migrations/0019_tiempo_categorias.sql` — `time_entries.categoria`, `v_tiempo_categoria`
- `supabase/migrations/0021_tareas_editables.sql` — `tasks.enlaces`, `tasks.duracion_min`
- `src/features/productividad/tareas/EditarTareaModal.tsx` — edición completa de una
  tarea existente (título, estado, fecha, prioridad, bloque, responsable, duración
  estimada, meta, descripción, notas, enlaces) sin borrarla y recrearla
- `src/services/eventosService.ts` — CRUD + RPCs del calendario
- `src/components/ui/AutoTextarea.tsx` — el campo de descripción que crece con el texto
- `src/services/goalsService.ts` — CRUD + RPCs de metas y horario
- `src/services/timeService.ts` — CRUD + RPCs del registro de tiempo
- `src/hooks/useData.ts` — `useGoals`, `useRegistrarAvance`, `useHorarioDia`,
  `useToggleBloque`, `useEntradasDelDia`, `useEntradaAbierta`, `useIniciarTiempo`,
  `useResumenTiempo`, `useEntradasDelRango`, `usePlanDelRango`, …
- `src/features/productividad/` — un directorio por módulo, más `shared/goalMeta.ts`:
  `metas/` (`MetasPage`, `MetasPeriodoView`, `MetasDiaView`, `GoalCard`,
  `NuevaMetaModal`), `horario/`, `tareas/`, `tiempo/`, `metricas/` y
  `calendario/` (`CalendarioView` orquesta; `itemCalendario.ts` normaliza;
  `useCalendario.ts` es el único que sabe qué tablas leer; `CabeceraCalendario`,
  `RejillaHoras` —día y semana comparten cuadrícula—, `VistaMes`, `VistaAnio`,
  `ItemModal`)
- `src/App.tsx` — una ruta con su `lazy()` por módulo
- `src/components/layout/navItems.ts` — estructura del menú (`link`/`group`/`section`)
- `src/types/index.ts` — `Goal`, `HorarioBloque`, `HorarioBloqueDia`, `TareaSeccion`,
  `TimeEntry`, `Evento` (+ `EventoTipo`, `EventoPrioridad`, `EventoEstado`)

## Pendiente

- **Tiempo real por bloque**: el cronómetro guarda `bloque_id`, pero «Plan contra
  realidad» compara todavía a nivel de día. Con ese enlace se podría decir qué bloque
  concreto se desborda siempre.
- **Arrastre táctil**: el de la rejilla es de ratón y lápiz a propósito. Con el dedo,
  el gesto de arrastrar y el de hacer scroll en la rejilla son el mismo movimiento, y
  quien gana se decide antes de saber cuál querías; en móvil el formulario del modal
  hace el trabajo sin ambigüedad. Si hiciera falta, el camino es una pulsación larga
  que arme el arrastre antes de mover.
- **Google Calendar**: no está conectado. `eventos` ya lleva desde el primer día
  `google_event_id`, `google_calendar_id`, `google_etag` y `sincronizado_en`, más el
  índice único parcial que impide duplicados — añadirlos después habría obligado a una
  migración de datos justo cuando ya hubiese eventos que migrar.
  El camino elegido es **n8n como intermediario**: ya tiene las credenciales de Google
  y ya es el puente del CRM. El punto difícil no es escribir en Calendar, sino
  enterarse de los cambios hechos desde el móvil (webhook de Google → n8n → Supabase).
- **Archivos adjuntos en las tareas**: fuera de la 0021 a propósito. Subir ficheros
  exige un bucket de Supabase Storage con sus políticas de acceso, que es
  infraestructura nueva y depende del despliegue final. Mientras tanto, el campo
  `enlaces` (`text[]`) cubre el caso real: pegar el enlace de Drive, Notion o Figma.
  Cuando exista el bucket, el modal `EditarTareaModal` ya tiene el hueco donde va.
- Recordatorio matutino (workflow n8n que lea las metas del día y te avise a ti).
