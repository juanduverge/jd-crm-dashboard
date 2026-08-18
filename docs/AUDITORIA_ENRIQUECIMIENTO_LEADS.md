# Auditoría — Captación y enriquecimiento de leads (Apify → n8n → CRM)

Fecha: 2026-08-12. Sin cambios de código: esto es sólo el diagnóstico.

## Alcance de lo comprobado

Verificado leyendo el código, no por suposición:

- `src/features/leads/LeadSearchModal.tsx`, `src/services/crmApi.ts`, `src/services/leadsService.ts`,
  `src/features/leads/LeadDrawer.tsx`, `src/types/index.ts`, `src/lib/config.ts`
- `supabase/migrations/0025_import_leads.sql` (y el esquema previo)
- `n8n-migracion/workflows.json` — export completo de los 15 workflows (nodos, parámetros y conexiones)
- `apify.com/compass/crawler-google-places` — esquema de entrada real del actor

**Caveat importante sobre el export de n8n.** `n8n-migracion/workflows.json` está fechado el
10-jul-2026 y en él la Fase 1 escribe en **Google Sheets**, no en Supabase. La migración 0025
(posterior) da por hecho que n8n escribe en Supabase y deja anotado como *pendiente* cambiar los
nodos. No he podido confirmar contra el n8n vivo (la API responde 401 con la clave disponible,
igual que en la auditoría anterior). **Todo lo que se refiere al destino de escritura hay que
confirmarlo re-exportando los workflows.** Lo que sigue marcado como CONFIRMADO no depende de eso.

---

## FASE 1 — Arquitectura actual

```
LeadSearchModal  (tipo_negocio, ciudad, max, fuente)
  → crmApi.buscarLeads → POST /n8n-hook/crm-buscar-leads   (nginx inyecta X-CRM-TOKEN)
     → n8n «Fase 1 - Captación de Prospectos (Apify)»
        webhook → responde OK inmediatamente (fire-and-forget)
        → Preparar Busqueda (Code)      normaliza y acota max a 1..50
        → Log Busqueda                  append a la hoja search_log
        → ¿Es Google Maps? ─sí→ Apify compass~crawler-google-places (run-sync-get-dataset-items)
                           └no→ ¿Es Google Web? ─sí→ Apify apify~google-search-scraper
                                                 └no→ No-Op
        → (rama Maps) Append or update row in sheet «prospects»
        → Get rows → Loop → PageSpeed móvil + desktop → SSL → Claude diagnóstico + score
        → Update row in sheet
     n8n «Fase 2 - Enriquecimiento de Contacto»   ← trigger MANUAL, workflow separado
        lee prospects → si tiene web y NO tiene email → fetch HTML
        → si HTML < 500 chars → Apify website-content-crawler
        → Extraer Contactos (regex: emails, wa.me, IG, FB, LinkedIn)
        → Guardar en Sheets
CRM  ← lee `leads` de Supabase (leadsService), nunca Sheets
```

El frontend no participa en el guardado: hace una llamada y termina. No es la causa de nada.

## FASE 2 — Problemas encontrados

**P1 — CAUSA RAÍZ. El actor de Apify nunca recibe la orden de buscar contactos.**
El body que Fase 1 envía es exactamente:

```js
{ searchStringsArray, locationQuery, maxCrawledPlacesPerSearch, language }
```

El esquema del actor exige `scrapeContacts: true` para que devuelva emails y perfiles sociales, y
`scrapePlaceDetailPage: true` como puerta para los detalles ampliados (`openingHours`,
`reviewsDistribution`…). Ninguno de los dos se envía. **Apify no está devolviendo emails ni redes
porque nadie se los está pidiendo.** No es un fallo de mapeo: el dato no existe en la respuesta.
Esto invalida por sí solo el enriquecimiento y explica el síntoma principal.

**P2 — CONFIRMADO. El rating de Google es incorrecto.**
El nodo de escritura mapea `"Rating Google": {{ $json.rank }}`. `rank` es la posición del resultado
en la búsqueda (1, 2, 3…), no la valoración. El campo correcto es `totalScore`. Todo lead captado
tiene el rating mal. (La migración 0025 ya lee `totalScore` correctamente en `importar_leads`.)

**P3 — CONFIRMADO. La rama «Google (búsqueda web)» es un callejón sin salida.**
`HTTP Request Google Web` no tiene ninguna conexión de salida. El usuario puede elegir esa fuente en
el modal, el actor `apify~google-search-scraper` se ejecuta y **consume créditos**, y el resultado se
descarta sin guardarse. Gasto sin resultado.

**P4 — El enriquecimiento (Fase 2) nunca se dispara solo.**
Es un workflow con trigger manual. Una búsqueda desde el CRM jamás lo ejecuta. Aunque Fase 1
funcionara perfecto, los emails/redes sólo aparecen si Juan abre n8n y le da a ejecutar.

**P5 — Fase 2 borra datos existentes.**
`Extraer Contactos` devuelve `""` para Facebook y WhatsApp cuando no encuentra nada (Instagram y
LinkedIn sí caen al valor previo del lead, Facebook y WhatsApp no), y `Guardar en Sheets` escribe
esas columnas siempre. Resultado: un lead que ya tenía Facebook o WhatsApp lo pierde en la siguiente
pasada. Es exactamente el caso «no reemplaces un dato por null».

**P6 — Fase 2 tira emails.** El regex recoge todos y luego hace `.slice(0, 3)`, y de esos sólo
persiste uno en `Email Contacto`. Los demás se pierden aunque haya columna donde ponerlos.

**P7 — Destino de escritura desalineado (a confirmar).** En el export, Fase 1 y Fase 2 escriben en
Sheets; el CRM lee Supabase. Si eso sigue vivo, **ninguna búsqueda llega nunca al CRM**. La RPC
`importar_leads` de la 0025 existe, está bien construida y no la llama nadie desde n8n.

**P8 — Sin trazabilidad por dato.** No hay `*_source`, ni `last_enriched_at`, ni estado de
verificación en ninguna parte. Imposible saber de dónde salió un email.

**P9 — Fase 1 mete a Claude en el bucle de captación.** Un diagnóstico IA + score por cada lead,
dentro del loop, con espera de 2 s. Es el nodo más caro y más lento del proceso, y bloquea la
importación. El CRM ya tiene `puntuarLead`/`analizarLead` bajo demanda para eso.

## FASE 3 — Datos que obtenemos hoy

Nombre empresa, categoría, ciudad, país (`countryCode`), dirección, teléfono (`phone`), sitio web,
URL de Maps, nº de reseñas, `placeId`, fecha de captura, fuente. Más, calculados: PageSpeed
móvil/desktop, SSL, diagnóstico IA, score. Y «Rating Google», que está mal (P2).

## FASE 4 — Datos que estamos perdiendo

Apify **ya devuelve** y no se guardan: `phoneUnformatted` (2º teléfono en formato E.164),
`location.lat/lng`, `totalScore` real, `permanentlyClosed`/`temporarilyClosed`, `neighborhood`,
`postalCode`, `state`, `plusCode`, `imageUrl`.

La 0025 ya creó columna para casi todo esto (`telefono_2`, `telefonos[]`, `emails[]`, `latitud`,
`longitud`, `horario`, `categoria`, `codigo_pais`, `place_id`). **Las columnas existen y están
vacías porque el productor no las llena.**

## FASE 5 — Datos nuevos que podemos obtener

Con `scrapePlaceDetailPage: true`: `openingHours`, `reviewsDistribution`, `reviewsTags`,
`questionsAndAnswers`, `tableReservationLinks`.

Con `scrapeContacts: true`: `emails[]`, `phones[]`, `instagrams[]`, `facebooks[]`, `linkedIns[]`,
`youtubes[]`, `tiktoks[]`, `twitters[]`, `pinterests[]` — todos como arrays. Excluye grandes cadenas
(McDonald's, Starbucks…), lo cual para prospección B2B local no molesta.

Opcional y caro: `scrapeSocialMediaProfiles` (seguidores, verificación) y
`maximumLeadsEnrichmentRecords` (contactos personales: nombre, cargo, email, LinkedIn). Este último
son **datos personales** — RGPD aplica. Recomiendo dejarlo apagado por ahora.

### WhatsApp — qué es viable de verdad

No existe forma legítima de comprobar si un número cualquiera tiene WhatsApp. La API oficial de
WhatsApp Business no ofrece un endpoint de verificación de terceros, y las librerías que sondean
`wa.me` numéricamente violan los términos de servicio y arriesgan bloqueo. **No lo vamos a hacer.**

Lo que sí es lícito y fiable: detectar la presencia **declarada públicamente** por la propia empresa.
Fase 2 ya lo hace bien con el regex de `wa.me` / `api.whatsapp.com/send?phone=`. Eso es un enlace
que la empresa puso en su web: es una invitación explícita al contacto. Propongo formalizarlo:

- `whatsapp` (ya existe) — el número normalizado
- `whatsapp_source` — `'wa_link_web'` | `'apify_contacts'` | `'manual'`
- `whatsapp_verificado_en` — fecha
- Nada de `whatsapp_available` inferido: si no hay enlace público, el campo queda vacío. No se
  adivina.

Ampliaría el regex a `chat.whatsapp.com` (grupos), `wa.link` y a `href` de botones flotantes, y
buscaría también en el JSON-LD de la web (`sameAs`), que es donde muchas webs declaran sus redes de
forma estructurada y limpia.

## FASE 6 — Arquitectura recomendada

Sí a la cadena que planteas, con un matiz: **el enriquecimiento no debe vivir dentro de la captación**.

```
CRM  →  webhook n8n «captar-leads»
          → Apify google-places  (scrapeContacts + scrapePlaceDetailPage)   ← 1 sola llamada
          → RPC importar_leads(lote completo)  ← Supabase normaliza y deduplica
          → devuelve {recibidos, insertados, actualizados, descartados}
        (fin. Segundos, no minutos.)

n8n «enriquecer-leads»  (cron cada X, o disparado al terminar la captación)
          → selecciona leads con web y sin email/redes
          → fetch web + JSON-LD + regex (emails, teléfonos, redes, wa.me)
          → RPC enriquecer_lead(id, datos, fuente)   ← sólo rellena huecos, nunca borra
```

Por qué separarlos: la captación debe ser rápida, barata y determinista. El enriquecimiento es
lento, falla a menudo y debe poder reintentarse sin volver a pagar Apify. Hoy están fusionados y por
eso un fallo de PageSpeed o de Claude arrastra al lote entero.

La normalización va **en Postgres, no en un nodo Code**. `importar_leads` ya demostró por qué: un
renombrado de campo en un nodo Code deja una columna vacía en silencio; en la función SQL los alias
están declarados y versionados.

## FASE 7 — Cambios en Supabase

La 0025 cubre el 80 %. Falta una 0026 con:

1. Columnas de redes que no existen: `youtube`, `tiktok`, `twitter`, `pinterest`.
   (`instagram`, `facebook`, `linkedin`, `whatsapp` ya existen.)
2. Arrays para redes múltiples, o `redes jsonb` — me inclino por columnas escalares para las 7
   conocidas (el CRM ya las pinta así) + `redes_extra jsonb` para lo raro. Menos churn en el front.
3. Procedencia: `email_source`, `phone_source`, `social_source`, `whatsapp_source`,
   `last_enriched_at`, `enrichment_status`.
4. `enriquecer_lead(uuid, jsonb, text)` — hermana de `importar_leads`, con la misma regla
   `coalesce(existente, nuevo)`. Un solo sitio donde se decide qué pisa qué.
5. Ampliar `importar_leads` para leer los arrays nuevos de `scrapeContacts` (`instagrams[0]`,
   `facebooks[0]`…). Los alias ya están preparados, sólo hay que añadir los plurales.

No hacen falta tablas nuevas. `leads` + `contacts` ya modelan empresa y personas. Crear
`Emails`/`Phones`/`SocialNetworks` como tablas separadas sería correcto en abstracto y un coste real
en el front sin beneficio a este volumen: los arrays de la 0025 ya resuelven la multiplicidad.

## FASE 8 — Cambios en n8n

En Fase 1:
- Añadir `scrapeContacts: true` y `scrapePlaceDetailPage: true` al body de Apify. (P1)
- Sustituir los nodos de Sheets por **una** llamada HTTP a `importar_leads` con el lote completo,
  en modo *Execute Once*. La 0025 ya documenta el nodo exacto al final del fichero. (P7)
- Corregir `rank` → `totalScore`, o mejor: dejar de mapear campo a campo y pasar el JSON crudo de
  Apify a la RPC. (P2)
- Conectar o desactivar la rama `google_web`. (P3)
- Sacar PageSpeed + Claude del bucle de captación a un workflow aparte. (P9)

En Fase 2:
- Cambiar el trigger manual por cron o por llamada desde Fase 1. (P4)
- Escribir vía `enriquecer_lead`, nunca con `update` de columnas fijas. Elimina P5 y P6 de raíz.
- Ampliar el regex: `chat.whatsapp.com`, `wa.link`, YouTube, TikTok, X, Pinterest, y JSON-LD `sameAs`.

Nodos a documentar antes de tocar (no borrar aún): `Fuente No Disponible (No-Op)`,
`HTTP Request Google Web` y toda la cadena de Sheets de Fase 1/2 si se confirma que Supabase ya es
el destino vivo.

## FASE 9 — Cambios en Apify

Seguimos con `compass~crawler-google-places`: es el actor correcto y ya tiene todo lo que
necesitamos: no hace falta cambiarlo ni añadir un segundo actor. `apify~website-content-crawler` de
Fase 2 también se queda como respaldo para webs JS.

`scrapeContacts` cubre lo que hoy intenta Fase 2 a mano, con más cobertura. Lo razonable es activarlo
y dejar Fase 2 como **segunda pasada** para lo que Apify no encontró, no como fuente principal.

## FASE 10 — Cambios en el CRM

`LeadDrawer` ya pinta emails múltiples, teléfonos múltiples y WhatsApp. Falta:
- Campos y renderizado de YouTube, TikTok, X, Pinterest.
- Mostrar procedencia y `last_enriched_at` (un discreto «vía web · hace 3 días»).
- El toast dice «aparecerán en unos minutos» y no hay confirmación. Con la RPC devolviendo
  `{recibidos, insertados, …}` se puede decir «12 encontrados, 9 nuevos, 3 ya los tenías».
- Quitar o marcar honestamente la fuente «Google (búsqueda web)» mientras no funcione.

## FASE 11 — Oracle

En este flujo **Oracle no participa**: no aparece en ningún nodo de Fase 1 ni Fase 2, y el CRM lee
sólo Supabase. Oracle es la VM donde corre n8n y el propio dashboard, no un almacén de datos. No hay
nada que migrar ni que eliminar aquí; la pregunta «¿Supabase o Oracle?» no aplica a la captación.

## FASE 12 — Seguridad

- La API key de Google PageSpeed está **en claro** dentro del workflow (`AIzaSy…`), repetida en dos
  nodos. Comprobado: `n8n-migracion/` está en `.gitignore`, el fichero no está trackeado y la clave
  **nunca se ha commiteado** (`git log -S` no da resultados). El riesgo es del lado de n8n, no del
  repo. Debe pasar a credencial de n8n y **rotarse**, porque ha viajado en exports.
- El token de Apify sí está bien: credencial `httpHeaderAuth`, no inline.
- La service_role de Supabase que necesitará el nodo nuevo tiene que ser credencial de n8n, jamás
  literal en el body.
- El front está correcto: ni API key de n8n ni service_role llegan al bundle (nginx las inyecta).

## FASE 13 — Pruebas

`importar_leads` ya trae su batería al final de la 0025 y es idempotente, así que los casos 1–9 se
prueban con SQL, sin gastar Apify. Los que hay que añadir para lo nuevo:

- Lead existente con email a mano + resultado nuevo con email vacío → **el email a mano sobrevive** (P5).
- Empresa con 4 emails → los 4 en `emails[]`, uno en `email` (P6).
- Web con `wa.me` → `whatsapp` + `whatsapp_source='wa_link_web'`. Web sin él → `whatsapp` vacío, no inventado.
- Una única búsqueda real de 5 leads contra Apify con `scrapeContacts` para medir coste real y
  cobertura efectiva antes de subir el volumen.

## FASE 14 — Costes

Base del actor: $1,50 / 1.000 places. Sobre eso, por cada 100 places (plan FREE / SILVER):
detalles de sitio $0,20 / $0,15; contactos de empresa $0,20 / $0,15.

Una búsqueda de 20 leads con ambas opciones ≈ **$0,11**, frente a ≈ $0,03 hoy. Cuadruplica un coste
que es despreciable, y elimina la pasada manual de Fase 2 para la mayoría de leads.

Lo que **no** recomiendo por precio: `scrapeSocialMediaProfiles` en plan FREE cuesta $10 por 100
perfiles (en SILVER, $0,70). Y `maximumLeadsEnrichmentRecords` es un multiplicador: con 10 leads por
empresa y 100 empresas son 1.000 búsquedas. Ambos, apagados.

## FASE 15 — Arquitectura final

```
CRM ─────► n8n «captar»  ──► Apify (contacts+details)  ──► Supabase.importar_leads(lote)
                                                              │
n8n «enriquecer» (cron) ◄─────────────────────────────────────┘
   web + JSON-LD + wa.me  ──► Supabase.enriquecer_lead(id, datos, fuente)
                                                              │
n8n «diagnosticar» (bajo demanda)  PageSpeed + Claude  ───────┤
                                                              ▼
                                                          CRM lee Supabase
```

Tres workflows pequeños en lugar de uno de 21 nodos; una sola puerta de escritura (RPCs de Supabase);
Sheets fuera; Oracle sigue siendo sólo infraestructura. Menos puntos de fallo y cada pieza
reintentable por separado.

---

## Estado (12-ago-2026)

Aplicado:
- `supabase/migrations/0026_enriquecimiento_leads.sql` — **ejecutada en producción por Juan.**
- CRM: redes nuevas, procedencia y estado de enriquecimiento en `types`, `leadsService` y
  `LeadDrawer`. `tsc -b` limpio.

Entregado y **sin importar todavía** en n8n:
- `n8n/fase1-captacion-apify.json`
- `n8n/fase2-enriquecimiento.json`

Ambos resuelven P1, P2, P3, P4, P5, P6, P7 y P9. Falta importarlos, rellenar la URL del proyecto
Supabase en tres nodos y crear la credencial `Supabase API` con la `service_role`.

P8 (trazabilidad) queda cubierto por la 0026. Pendiente aparte: rotar la API key de PageSpeed, que
sigue en claro dentro del workflow de diagnóstico.

## Antes de implementar

Hay una incógnita que cambia el trabajo de sitio: **si el Fase 1 vivo ya escribe en Supabase o
todavía en Sheets.** El export local dice Sheets; la 0025 lo daba como pendiente. Con un export
fresco de n8n (o acceso a la API) esto se resuelve en un minuto y el resto del plan no cambia.
