# Estabilidad de la conexión con n8n

Investigación del síntoma reportado: *"la conexión con n8n se desconecta con
frecuencia y tengo que volver a conectarla manualmente"*.

Fecha: 1-ago-2026 · Rama `feat/productividad` · **Nada de lo que depende del
despliegue está aplicado**: la parte del servidor está sólo documentada abajo,
en la checklist previa a producción.

---

## 1. Cómo viaja hoy una llamada a n8n

El frontend **nunca** tiene secretos. Llama a dos rutas relativas del mismo
origen y alguien las firma por él:

| Ruta del cliente | Destino real | Quién pone la credencial |
|---|---|---|
| `/n8n-api/*` | n8n `/api/v1/*` | nginx inyecta `X-N8N-API-KEY` |
| `/n8n-hook/*` | n8n `/webhook/*` | nginx inyecta `X-CRM-TOKEN` |

- En **producción**: `deploy/nginx.conf.template`, con `envsubst` al arrancar
  el contenedor del dashboard. Delante hay **Cloudflare Access**.
- En **desarrollo**: el proxy de `vite.config.ts`.

Clientes: `src/services/n8nService.ts` (API) y `src/services/crmApi.ts`
(webhooks). Estado visible en `src/features/settings/SettingsPage.tsx`.

---

## 2. Causas encontradas, de más a menos probable

### 2.1 El proxy de desarrollo no mandaba ninguna credencial ⬅ causa principal en local

`vite.config.ts` reenviaba a n8n **sin** `X-N8N-API-KEY` y **sin** cabeceras de
Cloudflare Access. Contra un n8n real esto da `401` siempre, y contra un n8n
detrás de Access da la **página HTML de login**, no JSON. Como el proxy de Vite
corre en Node, no tiene cookie de sesión del navegador: no hay forma de que
"herede" tu login. De ahí la sensación de tener que reconectar a mano.

**Corregido** (es local, no toca el despliegue): el proxy lee el `.env` con
`loadEnv` y añade `X-N8N-API-KEY` y, si existen, `CF-Access-Client-Id` /
`CF-Access-Client-Secret`. Nada de esto entra en el bundle: se ejecuta en Node.

Variables nuevas de `.env` (todas opcionales, sólo desarrollo):

```
N8N_API_KEY_DEV=...            # preferida; sin prefijo VITE_ no puede filtrarse al bundle
CF_ACCESS_CLIENT_ID=...        # service token de Cloudflare Access
CF_ACCESS_CLIENT_SECRET=...
```

> `VITE_N8N_API_KEY` sigue aceptándose por compatibilidad, pero **hay que
> renombrarla**: cualquier variable `VITE_*` acaba en el bundle en cuanto
> alguien la referencie desde `src/`.

### 2.2 La sesión de Cloudflare Access caduca

Access emite una sesión con duración fija (por defecto 24 h). Cuando vence, el
navegador recibe un redirect a la pantalla de login **con `Content-Type:
text/html`**. El CRM esperaba JSON, la petición fallaba, y la única salida era
volver a autenticarse: literalmente "reconectar a mano".

Esto no es un bug, es el diseño de Access. Lo que sí era un bug es que el CRM no
lo distinguiera de una caída.

### 2.3 La API key de n8n puede caducar

n8n permite crear API keys **con fecha de expiración**. Si la key del despliegue
se creó con expiración (7/30/90 días), el día que vence todas las llamadas pasan
a `401` sin ningún aviso previo. **Hay que verificarlo en el panel de n8n** —
ver checklist.

Agravante: nginx sustituye la key con `envsubst` **al arrancar el contenedor**.
Rotar la key no basta; hay que **reiniciar el contenedor del dashboard** o
seguirá mandando la vieja.

### 2.4 El cliente no reintentaba y colapsaba todos los fallos en un booleano

`ping()` era `try { ... return true } catch { return false }`. Un 401 por key
caducada, un HTML de Access, un timeout de 12 s y n8n reiniciándose se veían
todos como el mismo **"Sin conexión"**, sin pista de qué arreglar. Tampoco había
reintento: un reinicio de n8n de 5 segundos dejaba la UI en rojo hasta el
siguiente refetch.

**Corregido en cliente**:
- `n8nService.diagnosticar()` devuelve `{ ok, estado, detalle, status }` con
  estados `acceso | credencial | timeout | red | ruta | servidor | desconocido`
  y un texto que dice la acción concreta.
- Interceptor de reintento con espera creciente (600 ms, 1200 ms), **sólo en
  GET y sólo para fallos transitorios** (timeout, red caída, 5xx). Un 401 no se
  reintenta: no mejora y multiplica intentos fallidos contra Access. Un POST
  tampoco: repetir `/run` lanzaría el workflow dos veces.
- La fila de estado en Configuración ya muestra el motivo bajo la etiqueta.

### 2.5 Configuración de nginx sin tiempos ni keepalive (pendiente, es de despliegue)

Los dos `location` de `deploy/nginx.conf.template` no declaran
`proxy_connect_timeout` / `proxy_send_timeout` / `proxy_read_timeout` (quedan en
los 60 s por defecto, mientras el cliente corta a 12 s), no usan un bloque
`upstream` con `keepalive` (cada llamada abre conexión TCP nueva) y no
reintentan contra el upstream.

---

## 3. ¿Puede reconectarse solo, sin intervención?

Depende del fallo, y por eso importa clasificarlo:

| Estado | ¿Se recupera solo? | Qué hace falta |
|---|---|---|
| `timeout`, `red`, `servidor` | **Sí** | Reintento + refetch cada 30 s. Ya implementado. |
| `credencial` | No | Renovar la API key y **reiniciar el contenedor**. Automatizable con una key sin expiración + lectura de la key en cada petición (ver 4.3). |
| `acceso` | No desde el CRM | La sesión de Access la renueva el navegador. Un **service token** de Access para las llamadas máquina-a-máquina lo elimina como problema. |
| `ruta` | No | Configuración mal puesta (`N8N_INTERNAL_URL`). |

Conclusión: con lo aplicado en cliente, los cortes transitorios ya no exigen
nada del usuario. Los dos que sí lo exigen (`credencial` y `acceso`) se resuelven
en el despliegue, y están en la checklist.

---

## 4. Checklist antes de publicar la versión 1.0

> Nada de esto está aplicado. Requiere confirmación explícita antes de tocar el
> despliegue.

### 4.1 Cloudflare Access
- [ ] Crear un **service token** en Access para el dashboard y añadir su par
      `CF-Access-Client-Id` / `CF-Access-Client-Secret` a las llamadas
      servidor→n8n. Elimina de raíz la caducidad de sesión en el camino máquina.
- [ ] Confirmar la **duración de sesión** de la aplicación de Access que protege
      el CRM (subirla a 1 semana / 1 mes si el equipo es interno).
- [ ] Excluir la ruta interna dashboard→n8n de Access si ambos viven en la misma
      red Docker (ver 4.2): entonces no hace falta ni token.

### 4.2 Red y nginx (Oracle / Docker)
- [ ] Comprobar que `N8N_INTERNAL_URL` apunta al **nombre del servicio Docker**
      (p. ej. `http://n8n:5678`) y **no** al dominio público. Si el tráfico sale
      a internet y vuelve, pasa por Cloudflare Access sin necesidad alguna.
- [ ] Añadir a los dos `location` de `deploy/nginx.conf.template`:
      ```nginx
      proxy_connect_timeout 5s;
      proxy_send_timeout    30s;
      proxy_read_timeout    60s;   # 120s en /n8n-hook/: la IA tarda
      proxy_next_upstream   error timeout http_502 http_503 http_504;
      ```
- [ ] Declarar un `upstream` con `keepalive 16;` + `proxy_http_version 1.1;` +
      `proxy_set_header Connection "";` para no reabrir TCP en cada llamada.
- [ ] Verificar que ambos contenedores comparten red y tienen
      `restart: unless-stopped`.
- [ ] Revisar el `healthcheck` de n8n: si Docker no sabe que está caído, no lo
      reinicia.

### 4.3 Credenciales de n8n
- [ ] **Verificar en el panel de n8n si la API key tiene fecha de expiración.**
      Es la causa candidata número uno de una desconexión periódica en
      producción. Si la tiene, recrearla sin expiración.
- [ ] Documentar el procedimiento de rotación: rotar la key **y reiniciar el
      contenedor del dashboard** (`envsubst` sólo corre al arrancar).
- [ ] Alternativa a evaluar: leer la key desde un fichero montado en cada
      petición en vez de hornearla al arranque, para que rotar no exija
      reiniciar.

### 4.4 Workflows (de `docs/AUDITORIA_N8N.md`, sigue pendiente)
- [ ] `Fase 4 - Seguimiento Email` (`ZMQkvDXtD2tdMuYN`) está **inactivo** y la
      app lo sigue invocando desde `CampaignsPage`: activarlo o quitar la
      llamada. Hoy parece "n8n desconectado" cuando en realidad el workflow está
      apagado.
- [ ] `CRM API - Tareas` sigue activo escribiendo en Google Sheets, huérfano
      desde la migración a Supabase: desactivar.

### 4.5 Observabilidad
- [ ] Guardar el resultado de `diagnosticar()` cuando falle (tabla o log), para
      poder ver **si el corte es periódico** — un patrón cada 24 h señala Access,
      cada 7/30 días señala la API key.

---

## 5. Archivos tocados en esta pasada

- `vite.config.ts` — el proxy de desarrollo ya manda credenciales.
- `src/services/n8nService.ts` — `diagnosticar()` + reintento con espera creciente.
- `src/features/settings/SettingsPage.tsx` — el estado dice el motivo del fallo.
- `docs/ESTABILIDAD_N8N.md` — este documento.

Relacionado: `docs/AUDITORIA_N8N.md`, `docs/SEGURIDAD_FASE2.md`, `deploy/nginx.conf.template`.
