# Explicación completa del proyecto JDDeveloper — para Juan, sin jerga

> Documento de referencia, actualizado el 2026-07-02. Revisado contra el código real,
> `docs/ESTADO.md`, y consultando en vivo la instancia de n8n (14 workflows, todos
> activos) y las hojas de Google Sheets (conteos de filas reales al momento de escribir esto).

---

## 1. ¿Qué es este proyecto, en una frase?

**Es un sistema para conseguir clientes nuevos automáticamente (buscar negocios,
evaluarlos, contactarlos) y un panel de control (dashboard) donde tú ves y manejas
todo ese proceso sin tener que abrir hojas de cálculo ni programas técnicos.**

Piénsalo como dos piezas:
- Un **"trabajador robot"** que sale a buscar prospectos, los califica y les manda mensajes (n8n).
- Una **"pantalla de mando"** donde ves esos prospectos, los mueves por etapas de venta,
  lanzas campañas y respondes mensajes (el Dashboard CRM).

---

## 2. Mapa completo de las dos partes

### A) El pipeline de generación de leads (n8n)

**n8n** es una herramienta de automatización visual — te permite armar "flujos de trabajo"
(workflows) conectando bloques, sin escribir código tradicional. Cada workflow es como
una receta: "cuando pase esto → haz esto → después esto otro".

Consulté tu instancia de n8n en vivo. Hoy existen **14 workflows, todos activos**:

| Workflow | Qué hace |
|---|---|
| **Fase 2 - Enriquecimiento de Contacto** | Toma negocios ya encontrados y busca sus datos de contacto (email, redes, teléfono) |
| **Fase 2.5 - Scoring de Diseño y Revisión** | Usa IA para evaluar qué tan buena/mala es la página web de cada negocio (esto justifica tu oferta: "tu web necesita mejoras") |
| **Fase 3 - Outreach y Notas IA Visual** | Genera notas y diagnóstico de cada prospecto usando IA, antes de contactarlo |
| **Fase 3 - Generar Asunto y Cuerpo Email** | Escribe el email de primer contacto (asunto + cuerpo) usando IA, personalizado por negocio |
| **Fase 3 - Envío de Emails** | Manda ese primer email de verdad (por SMTP, el sistema de envío de correo) |
| **Fase 4 - Seguimiento Email** | Manda emails de seguimiento a quien no ha respondido |
| **Fase 4 - WhatsApp Seguimiento** | Manda mensajes de seguimiento por WhatsApp |
| **Seguimiento - Leer Respuestas Email** | Revisa si alguien respondió a un correo, para no seguir insistiendo con seguimientos |
| **CRM API - Leer Sheets** | Puente: deja que el Dashboard lea los datos de Google Sheets |
| **CRM API - Escribir Sheets** | Puente: deja que el Dashboard guarde cambios en Google Sheets (mover lead, crear campaña, etc.) |
| **CRM API - Leer Inbox** | Trae los correos recibidos (bandeja de entrada real) hacia el Dashboard |
| **CRM API - Enviar Respuesta** | Permite responder un correo desde el Dashboard, de verdad |
| **CRM API - Generar con IA** | Le pide texto a la Inteligencia Artificial (ej. redactar un template de campaña) desde el Dashboard |
| **My workflow** | Sin nombre descriptivo — parece un workflow de prueba/borrador suelto. No se usa en el sistema. Puedes revisarlo y borrarlo si no lo reconoces. |

**Fase, en el pipeline de n8n:** funcionalmente está completo para lo que hace hoy
(buscar → calificar → contactar → dar seguimiento → registrar respuestas). No es "una
fase" con inicio y fin como en el dashboard — es un motor que sigue corriendo.

**Lo que falta / lo que no vi conectado:**
- No hay un workflow que **busque negocios nuevos desde cero** (scraping inicial) activo
  hoy en la lista — probablemente ya corriste esa parte manualmente en su momento (la
  carpeta de trabajo `C:\JDDeveloper\CRM` tiene decenas de scripts de esa etapa inicial,
  usados para construir/depurar los workflows de Fase 1-2, pero no aparecen como
  workflows en n8n hoy). Si quieres seguir agregando prospectos nuevos, probablemente
  necesites retomar o reconstruir esa parte.
- El workflow "My workflow" sin nombre parece basura de alguna prueba — vale la pena
  confirmarlo y borrarlo para no confundir a futuro.

### B) El dashboard CRM (React)

Es la aplicación web que abres en el navegador (`localhost:3000` en desarrollo, o
`jddeveloper.com/crm` cuando la subas). Tiene **9 pestañas**:

| Pestaña | Qué es |
|---|---|
| **Resumen** | Panel principal: números clave del negocio, gráficos, actividad reciente |
| **Leads** | Tabla de todos los prospectos, con búsqueda y filtros |
| **Pipeline** | Tablero visual (Kanban) para mover leads por etapas de venta, arrastrando tarjetas |
| **Campañas** | Crear y lanzar campañas de contacto masivo a varios leads a la vez |
| **Automatizaciones** | Panel para ver/controlar los workflows de n8n desde aquí mismo |
| **Bandeja** | Tu correo de negocio (`sales@jddeveloper.com`) leído dentro del dashboard |
| **Mensajes** | Historial de conversación por lead, agrupado (qué se envió, qué respondieron) |
| **Analíticas** | Gráficos de rendimiento: tasa de respuesta, embudo de ventas, etc. |
| **Configuración** | Datos de tu agencia, firma de email, estado de las conexiones |

**Fase del dashboard:** completó su **Fase 6** (la más reciente fue corrección de errores
visuales + mejoras de rendimiento). Todas las 9 pestañas están funcionales con datos
reales, no de ejemplo.

---

## 3. ¿Cómo se conecta todo? (explicado simple)

### ¿Dónde vive la información?

Toda la información de negocio vive en **una hoja de Google Sheets** (como un Excel en
la nube). Adentro hay varias "pestañas" (hojas), cada una con un propósito distinto.
Aquí el estado real de cada una, revisado en vivo:

| Hoja (pestaña del Sheet) | Qué guarda | Filas hoy |
|---|---|---|
| **prospects** | Todos los negocios encontrados: nombre, contacto, redes sociales, calificación de su web, score de qué tan buen prospecto es | 36 |
| **pipeline** | En qué etapa de venta está cada lead (nuevo, contactado, propuesta, cerrado…), valor estimado, próximo seguimiento | 11 |
| **outreach** | El primer contacto: qué email se le mandó a cada prospecto y cuándo | 19 |
| **messages** | Historial de mensajes enviados y respuestas recibidas, por canal | 22 |
| **config** | Configuración de tu agencia: emails, WhatsApp, firma, link para agendar reuniones | 3 |
| **campaigns** | Las campañas que creaste desde el Dashboard (a quién, con qué template, cuándo) | 1 |
| **inbox** | Copia de los correos que te llegan a `sales@jddeveloper.com`, leídos automáticamente | 0 (bandeja vacía ahora mismo) |

> Nota honesta: la hoja `inbox` está vacía en este momento — no significa que esté rota,
> solo que no hay correos nuevos capturados todavía, o que el workflow que la llena
> (`CRM API - Leer Inbox`) aún no ha corrido desde que se creó esa hoja.

### ¿Qué hace n8n exactamente?

n8n es **el trabajador automático de fondo**. Corre 24/7 en tu servidor (no en tu
computadora), y hace tareas repetitivas sin que tú tengas que hacer clic en nada:
manda correos, revisa si alguien respondió, escribe en la hoja de cálculo, etc.
El Dashboard **no habla directamente con Google Sheets** — todo pasa por n8n, que actúa
de intermediario seguro (así el Dashboard nunca necesita tener contraseñas de Google
guardadas en el navegador).

### ¿Cómo el dashboard le pide datos a n8n?

n8n expone unas "puertas de entrada" llamadas **webhooks** — son direcciones web
específicas (URLs) a las que el Dashboard le puede tocar la puerta y decir "dame los
leads" o "guarda este cambio". Por ejemplo, cuando abres la pestaña Leads, el Dashboard
le pregunta a n8n "¿qué hay en la hoja prospects?" y n8n le responde con los datos.
Cuando arrastras un lead a otra columna en Pipeline, el Dashboard le dice a n8n "actualiza
esta fila", y n8n lo escribe en Google Sheets.

### ¿Qué es Claude API y para qué se usa dentro del proyecto?

**Claude** es la Inteligencia Artificial (de Anthropic, la misma que estás usando ahora)
que el sistema usa en varios puntos:
- Para **evaluar el diseño de la página web** de cada prospecto y generar un diagnóstico.
- Para **redactar el email o mensaje de primer contacto**, personalizado por negocio.
- Para **generar templates de campaña** cuando le das clic al botón "Generar con IA"
  en el asistente de campañas del Dashboard.

n8n es quien le habla a Claude (usando una credencial guardada ahí), no el Dashboard
directamente — otra vez, por seguridad: las claves de acceso a servicios externos
quedan solo en el servidor, nunca en el navegador.

### ¿Qué es IMAP y para qué sirve la Bandeja?

**IMAP** es el protocolo (idioma técnico) que usan los servidores de correo para que
un programa pueda leer una bandeja de entrada, como la usa tu app de correo (Outlook,
Gmail, etc.). El workflow `CRM API - Leer Inbox` se conecta por IMAP a
`sales@jddeveloper.com`, revisa si hay correos nuevos, y los copia a la hoja `inbox` en
Sheets — sin borrar ni marcar como leído el correo original. Así la pestaña **Bandeja**
del Dashboard puede mostrarte esos correos sin que tengas que abrir tu cliente de correo.

### ¿Cómo funciona el envío de emails? ¿Y WhatsApp?

- **Emails**: n8n usa **SMTP** (el protocolo estándar para enviar correo, lo mismo que
  usa cualquier programa de correo) con las credenciales de tu cuenta de negocio. Cuando
  lanzas una campaña o respondes un correo desde el Dashboard, la orden viaja a n8n, y
  n8n manda el correo real.
- **WhatsApp**: se usa la **API oficial de WhatsApp Business (Meta/Graph API)**. El
  workflow "Fase 4 - WhatsApp Seguimiento" manda mensajes de seguimiento por ese canal,
  usando el número de teléfono de negocio configurado (el "Phone Number ID", un
  identificador técnico que tuvo que corregirse recientemente porque apuntaba al número
  equivocado — ya está arreglado).

---

## 4. Estado fase por fase

### Lado Dashboard (React)

| Fase | Qué incluye | ¿Completa? | Qué falta |
|---|---|---|---|
| **Datos reales** | Que todo el Dashboard use datos reales de Sheets, sin inventar nada | ✅ Sí | Nada — se eliminó todo dato de ejemplo/mock |
| **Fase 1** | Login, layout, tema claro/oscuro, búsqueda global, pestañas Resumen + Leads | ✅ Sí | Nada |
| **Fase 2** | Pipeline (Kanban), Automatizaciones, Campañas | ✅ Sí | Nada |
| **Fase 3** | Bandeja (correo IMAP), Mensajes (historial multicanal) | ✅ Sí | El estado "leído/no leído" de un correo solo se guarda en tu navegador, no en la hoja — si abres el Dashboard desde otra computadora, vuelve a verse como "no leído" |
| **Fase 4** | Campañas conectadas a Sheets de verdad, generación de texto con IA, envío de respuestas real, pestañas Analíticas y Configuración | ✅ Sí | El botón de "enviar respuesta" real desde Bandeja no se probó con un envío de prueba real (para no mandarle un correo de prueba a un desconocido) — funcionalmente está listo, pero nunca se disparó en la vida real |
| **Fase 5** | Corrección de estilos visuales (textos que no se veían bien, colores en modo oscuro) | ✅ Sí | Falta una revisión visual tuya en el navegador — los cambios se verificaron por código, no viéndolos en pantalla |
| **Fase 6** | Arreglo de tarjetas del Pipeline que se veían rotas, carga más rápida de la app, seguridad del acceso a GitHub | ✅ Sí | Falta también tu revisión visual en pantalla, igual que la Fase 5 |

### Lado n8n (motor de leads)

| Etapa | Qué incluye | ¿Completa? | Qué falta |
|---|---|---|---|
| Enriquecimiento de contacto | Buscar datos de contacto de cada negocio encontrado | ✅ Workflow activo | — |
| Scoring / diagnóstico de diseño | Evaluar la web de cada prospecto con IA | ✅ Workflow activo | — |
| Primer contacto (outreach) | Escribir y enviar el primer email | ✅ Workflow activo | — |
| Seguimiento | Reenviar por email y WhatsApp a quien no respondió | ✅ Workflow activo | — |
| Lectura de respuestas | Detectar si alguien contestó, para no seguir insistiendo | ✅ Workflow activo | — |
| Puente con el Dashboard (leer/escribir Sheets, inbox, IA, respuestas) | 6 workflows "CRM API - …" | ✅ Todos activos | — |
| **Búsqueda de negocios nuevos (captación inicial)** | Encontrar prospectos nuevos desde cero (scraping) | ⚠️ No hay workflow activo visible con ese propósito hoy | Si quieres seguir sumando prospectos nuevos, hay que retomar/reconstruir esa parte — ver sección 6 |

---

## 5. ¿Qué puedo hacer YA, hoy mismo?

Sin tocar código, sin nada técnico, ya puedes:

1. **Entrar al Dashboard** (`localhost:3000` en desarrollo, o la URL de tu hosting) y
   ver los 36 prospectos que ya tienes cargados.
2. **Mover leads por el Pipeline** arrastrando sus tarjetas entre columnas (Nuevo →
   Contactado → … → Cerrado Ganado/Perdido) — esto se guarda automáticamente en Sheets.
3. **Editar o crear un lead a mano** desde la pestaña Leads (botón agregar/editar).
4. **Ver el diagnóstico de IA** de cada negocio (qué tan buena/mala es su web) en su ficha.
5. **Crear una campaña nueva** desde el asistente (wizard) de 3 pasos en la pestaña
   Campañas: elegir a quién, con qué mensaje, y cuándo.
6. **Generar el texto de una campaña con IA** con un clic ("Generar con IA" en el wizard).
7. **Lanzar, pausar, reanudar o duplicar** una campaña ya creada.
8. **Ver tu correo real** de negocio (`sales@jddeveloper.com`) dentro de la pestaña Bandeja.
9. **Responder un correo real** desde la pestaña Bandeja (queda registrado en Mensajes).
10. **Ver el historial completo de mensajes** por lead (qué se le mandó, qué contestó), en la pestaña Mensajes.
11. **Prender o apagar** cualquiera de los 14 workflows de n8n desde la pestaña Automatizaciones,
    sin entrar a n8n directamente.
12. **Ejecutar un workflow manualmente** ("Ejecutar ahora") desde esa misma pestaña.
13. **Ver estadísticas de ejecución** de cada workflow: cuántas veces corrió, % de éxito.
14. **Ver analíticas del negocio**: tasa de respuesta, embudo de conversión, leads por
    nicho, mensajes por canal — todo calculado en vivo con tus datos reales.
15. **Editar la configuración de tu agencia** (nombre, emails, WhatsApp, link de
    agendamiento, firma de correo) desde la pestaña Configuración.
16. **Exportar tus leads a CSV** desde la pestaña Leads.
17. **Buscar cualquier cosa** (lead, página) con el atajo Cmd/Ctrl+K.

---

## 6. ¿Qué NO puedo hacer todavía?

En simple, esto es lo que **no está conectado o no funciona hoy**:

1. **No puedes conseguir prospectos nuevos con un botón.** Los 36 que tienes ya fueron
   cargados en su momento; hoy no hay un proceso automático activo en n8n que busque
   negocios nuevos por sí solo. Para sumar más, habría que retomar esa parte del sistema.
2. **El estado "leído/no leído" de la Bandeja no es el mismo en todas las computadoras.**
   Se guarda solo en el navegador donde lo abriste, no en la hoja de cálculo.
3. **El envío de respuesta real desde la Bandeja nunca se probó de verdad** (a propósito,
   para no mandarle un correo de prueba a un cliente real). Deberías probarlo tú mismo una
   vez, con un correo tuyo, para confirmar que llega bien.
4. **WhatsApp e Instagram automatizados como canal de campaña masiva no existen todavía** —
   WhatsApp de seguimiento sí funciona (mensaje individual de seguimiento), pero no hay
   forma de lanzar una campaña de WhatsApp a varios leads a la vez desde el wizard, como sí
   se puede con email.
5. **No hay multi-usuario real.** El Dashboard tiene una sola contraseña de acceso; el
   sistema de "roles" (admin/vendedor/viewer) existe en el código pero no está activado
   para varias personas usándolo a la vez con permisos distintos.
6. **No hay cobros ni firma electrónica** conectados (Stripe, DocuSign, etc.) — si cierras
   un trato, el cobro y el contrato siguen siendo manuales, fuera del sistema.
7. **No hay una vista de calendario/tareas** de seguimientos pendientes — el "próximo
   seguimiento" existe como un dato por lead, pero no hay una vista tipo agenda que te
   avise "hoy te toca seguir a estos 5".
8. **No verifiqué visualmente en pantalla** (solo por código) que los últimos arreglos de
   estilos se vean bien — vale la pena que le eches un ojo en el navegador antes de
   mostrárselo a un cliente.
9. **El workflow "My workflow"** que apareció en la lista de n8n no tiene un propósito
   identificado — probablemente sea una prueba olvidada, pero no se puede confirmar sin
   que tú lo revises.

---

## 7. Integraciones a futuro — qué se podría agregar

| Integración | Qué aportaría | Qué tan complicado |
|---|---|---|
| **Retomar la búsqueda automática de prospectos nuevos** | Que el "trabajador robot" nunca deje de traer negocios nuevos, sin que tengas que hacerlo manual | Medio — ya existe la base (workflows de enriquecimiento/scoring), falta reconectar la etapa de búsqueda inicial |
| **Campañas de WhatsApp masivas** (no solo seguimiento individual) | Poder lanzar una campaña a 50 leads por WhatsApp igual que ya haces por email | Medio — la conexión con WhatsApp ya existe, falta el flujo de "campaña" en vez de "un mensaje a la vez" |
| **Instagram DM** | Otro canal de contacto, útil para nichos visuales (restaurantes, fitness) | Alto — requiere una integración nueva con la API de Instagram, que es más restrictiva |
| **Calendario de seguimientos / tareas** | Una vista tipo agenda: "hoy te toca seguir a estos leads" | Bajo-medio — los datos (próximo seguimiento) ya existen, falta la vista |
| **Cobros con Stripe** | Cobrar a un cliente directo desde el sistema, sin salir a otra plataforma | Medio — requiere cuenta de Stripe y conectar el flujo de "cerrado ganado" a un cobro |
| **Firma electrónica (DocuSign / Dropbox Sign)** | Mandar y firmar contratos sin imprimir/escanear nada | Medio |
| **Multi-usuario real con permisos** | Que tu equipo use el mismo Dashboard, cada quien viendo solo lo suyo | Medio — la base (roles) ya está en el código, falta activarla con una base de datos de usuarios real |
| **Base de datos más robusta (en vez de Google Sheets)** | Más rápido y más seguro con muchos datos (hoy funciona bien porque el volumen es chico) | Alto — significa migrar todo lo que hoy vive en Sheets a un sistema tipo base de datos real |
| **Notificaciones automáticas** (ej. avisos cuando alguien responde) | Enterarte al instante sin tener que estar revisando el Dashboard | Bajo-medio |
| **Reportes en PDF programados** | Que te llegue un resumen semanal/mensual automático | Bajo-medio |

---

## 8. Glosario simple

| Término | Qué significa |
|---|---|
| **n8n** | Programa de automatización visual: conecta bloques para que una computadora haga tareas repetitivas sola (buscar, mandar correos, guardar datos) |
| **Workflow** | Una "receta" dentro de n8n: una secuencia de pasos automáticos |
| **Webhook** | Una dirección web especial a la que un programa le puede "tocar la puerta" para pedir o mandar información |
| **API** | Forma en que dos programas se hablan entre sí (como un mesero que lleva pedidos entre tú y la cocina) |
| **Google Sheets** | La hoja de cálculo en la nube (como Excel) donde vive toda la información del negocio |
| **IMAP** | El protocolo (idioma técnico) que usa un programa para leer una bandeja de correo, como lo hace tu app de email |
| **SMTP** | El protocolo que se usa para enviar correos electrónicos |
| **Claude / IA** | La Inteligencia Artificial que redacta textos y evalúa cosas (como el diseño de una web) dentro del sistema |
| **Dashboard / CRM** | El panel de control donde ves y manejas todo — "CRM" significa "sistema de gestión de relación con clientes" |
| **Kanban** | El tipo de tablero visual con columnas y tarjetas que se arrastran (usado en la pestaña Pipeline) |
| **Lead / prospecto** | Un negocio o persona que podría convertirse en cliente |
| **Score** | Una calificación numérica (0-100) que dice qué tan buen prospecto es un lead |
| **Endpoint** | La "dirección exacta" a la que se le pide algo a un servidor (parte de una API) |
| **Frontend** | La parte visual que tú ves y usas en el navegador (el Dashboard) |
| **Backend / servidor** | La parte que corre detrás de cámaras, sin que la veas (aquí: n8n) |
| **Credencial** | Usuario/clave que un sistema guarda para conectarse a otro (ej. tu cuenta de Google, de correo) de forma segura |
| **Deploy / desplegar** | Subir la aplicación a internet para que cualquiera pueda usarla desde una URL real |
| **Git / GitHub** | El sistema donde se guarda el historial de todo el código, como un "control de cambios" con respaldo |
| **Token** | Una clave secreta que da acceso a algo (como una contraseña de un solo propósito) |

---

## En una foto: así está el proyecto hoy

El motor de leads (n8n) tiene **14 workflows activos** que enriquecen, califican,
contactan y dan seguimiento a prospectos por email y WhatsApp, todo conectado a una
hoja de Google Sheets con **36 prospectos, 11 en pipeline activo, 19 primeros contactos
enviados y 22 mensajes registrados**. El Dashboard (React) tiene sus **9 pestañas
completas y funcionando con datos reales**, terminó su sexta ronda de mejoras (visuales
y de velocidad de carga), y ya puedes usarlo de punta a punta para mover leads, lanzar
campañas, y responder correos sin tocar código. Lo único que falta de raíz es un
proceso automático para **traer prospectos nuevos** (hoy es manual/pausado), y una
revisión visual tuya en pantalla de los últimos ajustes de estilo antes de mostrárselo
a un cliente.
