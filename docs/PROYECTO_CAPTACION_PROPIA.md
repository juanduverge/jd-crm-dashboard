# Proyecto: captación propia (sustituir Apify)

> Estado: **idea preparada, sin empezar.** Redactado el 30-sep-2026.
> No arrancar sin que Juan lo pida.

## Objetivo

**Primero, copiar exactamente lo que hace Apify** (todos los teléfonos, todos
los correos, todas las redes, los datos de la ficha de Google) corriendo en el
servidor de casa. **Después, mejorarlo.**

- Sin IA en marcha: código normal, 0 tokens por búsqueda.
- Coste por búsqueda: cupo gratis de Google Places en vez de ~$0,008 por
  negocio en Apify (una búsqueda de 50 ≈ $0,40; los $5 del plan gratis se
  agotaron el 30-sep).

## Por qué es viable: el CRM no se entera del cambio

Fase 1 no transforma nada: pasa el lote crudo de Apify a la función de
Supabase `importar_leads(p_lote, p_fuente, p_consulta)`, que lee los campos
por nombre. **Si nuestro sistema devuelve cada negocio con los mismos nombres
de campo que Apify, `importar_leads`, la deduplicación, el nicho, la Fase 2 y
el verificador de WhatsApp siguen funcionando sin tocar una línea.**

Además, `lead_imports.payload` guarda el lote completo de cada búsqueda que
hizo Apify. Eso son **casos de prueba reales**: repetir la misma búsqueda con
nuestro sistema y comparar campo a campo.

## Parte A — Igualar a Apify

### El contrato: qué campos hay que devolver

Los que lee `importar_leads` hoy (nombre Apify → columna en `leads`):

| Campo Apify | Columna CRM | De dónde lo sacamos |
|---|---|---|
| `title` | `empresa` | Places API |
| `placeId` | `place_id` (clave de dedup) | Places API |
| `url` | `google_maps` | Places API (`googleMapsUri`) |
| `categoryName` | `categoria`, `nicho` | Places API (`primaryTypeDisplayName`) |
| `city`, `countryCode` | `ciudad`, `pais`, `codigo_pais` | Places API (`addressComponents`) |
| `address` | `direccion` | Places API (`formattedAddress`) |
| `phone`, `phoneUnformatted` | `telefono`, `telefono_2` | Places API (nacional / internacional) |
| `phones[]` | `telefonos` | Places + **todos** los de la web |
| `emails[]` | `email`, `emails` | Robot web (**todos** los que encuentre) |
| `website` | `web` | Places API (`websiteUri`) |
| `instagrams[]`, `facebooks[]`, `linkedIns[]`, `youtubes[]`, `tiktoks[]`, `twitters[]`, `pinterests[]` | una columna por red | Robot web |
| `totalScore` | `rating_google` | Places API (`rating`) |
| `reviewsCount` | `num_resenas` | Places API (`userRatingCount`) |
| `location.lat/lng` → `lat`, `lng` | `latitud`, `longitud` | Places API |
| `openingHours` | `horario` | Places API (`regularOpeningHours`) |
| `description` | `bio` | Places API (`editorialSummary`) o meta de la web |

Antes de empezar: sacar de `lead_imports.payload` la lista real de campos que
devolvió Apify y confirmar que no se escapa ninguno que el CRM use.

### Pieza A1 — Buscar negocios: Google Places API (oficial)
- `Text Search` con «nicho en ciudad», paginando hasta el máximo pedido.
- Pedir solo los campos de la tabla (la máscara de campos define el precio).
- **Verificar al arrancar:** precios y cupo gratis actuales de Places API
  (New). Se cobra por consulta (hasta 20 resultados), no por negocio.
- Juan: crear proyecto en Google Cloud con tarjeta y sacar la clave.
- Legal. Copiar Google Maps con robots, como hace Apify, lo prohíben las
  condiciones de Google y bloquearía la IP de casa: descartado.

### Pieza A2 — Robot de contactos (lo que Apify llama «Company contacts enrichment»)
Para cada negocio con web:
- Visitar portada + páginas de contacto/about/equipo (enlaces internos que
  digan contact, contacto, about, nosotros, team…), hasta ~5 páginas.
- Sacar con reglas fijas, **todos** los que aparezcan, sin quedarse en el
  primero:
  - Correos: `mailto:`, texto, y los ofuscados típicos (`info [at] dominio`).
  - Teléfonos: `tel:`, `wa.me/…`, `api.whatsapp.com/send?phone=…` y texto.
  - Redes: enlaces a instagram.com, facebook.com, linkedin.com, youtube.com,
    tiktok.com, x.com/twitter.com, pinterest.com.
- Limpiar basura: correos de plantillas y librerías (`@sentry`, `@wix`,
  `example@`, `.png`), enlaces de «compartir» de redes, perfiles genéricos.
- Respetar `robots.txt`, un solo hilo por dominio, pausas cortas.

### Pieza A3 — Mismo formato de salida
Devolver un array de objetos con los nombres de la tabla. Fase 1 cambia solo
el nodo «Apify - Google Places» por la llamada a nuestro servicio; el resto
del workflow y `importar_leads` quedan igual. Marcar `email_source` /
`phone_source` / `social_source` con un valor propio (p. ej. `propio_web`)
para poder comparar calidad frente a `apify_contacts`.

### Validación de la Parte A
Con 3–4 búsquedas que ya están en `lead_imports`:
- ¿Encontramos los mismos negocios?
- ¿Mismos o más correos, teléfonos y redes por negocio?
- Solo cuando iguale o supere a Apify, se cambia Fase 1. Apify queda de
  respaldo hasta entonces.

## Parte B — Mejoras sobre Apify (después)

1. **Más contactos que Apify:** mirar también el enlace «link in bio» de
   Instagram/Facebook y el pie de la web; unir y deduplicar teléfonos en
   formato internacional.
2. **Validar correos antes de enviar:** el dominio tiene MX; descartar los
   que rebotarían. Menos rebotes, mejor reputación de envío.
3. **Estado real de la web:** no fiarse de «sin web» de Google. Probar
   dominios con el nombre del negocio y comprobar que la web carga.
   Clasificar: `sin_web`, `web_caida`, `dominio_aparcado`, `solo_redes`,
   `web_vieja`, `web_ok`.
4. **Auditoría rápida sin IA:** PageSpeed Insights (gratis), HTTPS, año del
   copyright, versión móvil, tecnología (Wix, WordPress…), botón de WhatsApp.
   Da una puntuación de oportunidad y datos concretos para el mensaje.
5. **Filtrar cerrados:** descartar `CLOSED_PERMANENTLY` / `CLOSED_TEMPORARILY`
   de Places antes de guardar.
6. **Capturas propias** (Playwright en casa) en vez de `apify~screenshot-url`
   en Fase 2.5, y robot propio en vez de `website-content-crawler` en Fase 2.
7. **Búsquedas programadas:** lista de nichos × ciudades que se recorre sola
   de noche dentro del cupo gratis.

## Dónde vive
Servicio propio en Docker en el servidor de casa, con su propia API (mismo
estilo que `~/jd-wa`), y n8n lo llama desde Fase 1. Alternativa: todo dentro
de n8n; más rápido de montar, más difícil de mantener el robot de contactos.

## Legal (resumen, no es asesoría)
- Places API: uso permitido por Google.
- Webs públicas de negocios: riesgo bajo si se respeta `robots.txt`.
- Envío: EE. UU. (CAN-SPAM) exige dirección física y enlace de baja.
  España/UE (GDPR) es más estricto con correos nominativos: priorizar
  genéricos (`info@`) y ofrecer baja siempre.

## Decisiones pendientes
- Clave de Google Cloud (Juan).
- Docker propio o dentro de n8n.
- Mantener Apify de respaldo o darlo de baja cuando la Parte A esté validada.

## Coste estimado
- Construir la Parte A: ~0,5–1 M tokens (una vez). Parte B, por piezas.
- Usarlo: 0 tokens; solo cupo de Google y la luz del servidor.
