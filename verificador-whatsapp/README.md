# Verificación de WhatsApp

Automatiza la comprobación que hasta ahora se hacía ficha por ficha: coger el
teléfono de un lead, abrirlo en WhatsApp y mirar si aparece «Chatear con
+1 809…».

## Qué hace y qué no

Un Android que corre en el servidor de casa, con **un número desechable**,
mete los teléfonos de los leads en su agenda. WhatsApp marca solo cuáles de
esos contactos son usuarios suyos —lo mismo que pasa al estrenar un móvil— y
el verificador lee ese resultado y lo guarda en el CRM.

**No envía mensajes. No abre chats. No contacta a nadie.** El contacto real lo
sigue haciendo una persona desde su propio WhatsApp, o algún día la API
oficial de Meta. Este número sólo mira.

Ese número está aislado a propósito: nada de esto toca el WhatsApp personal ni
el de la empresa, y los miles de contactos del CRM no acaban en un teléfono de
nadie.

## La regla que manda sobre todo lo demás

**Un fallo nunca se guarda como «no tiene WhatsApp».**

Si la sesión se cae, si el Android se queda a medias o si la agenda no se
sincroniza, el resultado es «no lo sé», y el lead vuelve a la cola. Está
puesto en tres sitios distintos a propósito:

- `registrar_whatsapp()` (migración 0035) deja `sin_verificar` y **no** sella
  la fecha cuando el lote llega vacío, así que el lead reaparece en la cola.
- `verificar.py` aborta sin escribir nada si no puede leer la agenda o `wa.db`.
- El workflow comprueba que hay sesión **antes** de mover un solo número.

Y `no_aparece` tampoco significa «no tiene WhatsApp»: significa «no apareció
al comprobarlo». La privacidad del número puede ocultarlo. Es una señal de
prioridad, no un hecho.

## Las piezas

| Dónde | Qué |
|---|---|
| `docker-compose.whatsapp.yml` | Proyecto Docker `jd-wa`, **aparte del de producción** |
| `verificar.py` | La pasada, el panel y el servidor HTTP que llama n8n |
| `vigilante.py` | Ronda cada 5 min y avisa por WhatsApp si algo se rompió |
| `../supabase/migrations/0035_verificacion_whatsapp.sql` | Dónde se guarda y la cola |
| `../n8n/verificacion-whatsapp.json` | Los disparadores |

## Por qué el Android necesita dos cosas raras

`devices: /dev/uinput` y `androidboot.use_redroid_stream=1` en el compose.
Sin las dos, `/dev/input` queda vacío: redroid no crea el touchscreen virtual
y el sistema arranca sin pantalla táctil. Los botones parecen responder igual
—un clic no exige foco— pero **ningún campo de texto se puede rellenar**, así
que no hay forma de registrar el número.

Por lo mismo, tocar y teclear va con `sendevent` sobre `/dev/input/event5`, no
con `input tap` / `input text`: esos inyectan por otra vía que aquí llega a
medias. Los guiones viven dentro de `verificar.py` y se suben en cada
`conectar()`.

## Avisos

`vigilante.py` mira la sesión de WhatsApp, los contenedores, la batería del
portátil, el disco y Supabase. Cuando algo se rompe manda un WhatsApp a los
números de `AVISAR_A`, una sola vez por problema, y otro cuando se arregla.

**Es la única parte del sistema que envía mensajes, y nunca a un lead.**

Lo que **no** puede: avisar de un apagón o de una caída de internet — el aviso
viajaría por lo mismo que se cayó. Eso sólo lo detecta algo externo que note
nuestro silencio; para eso está `LATIDO_URL` (healthchecks.io o similar): el
vigilante hace ping cada ronda, y cuando deja de llegar, ese servicio avisa.

Vive en un compose propio porque es un Android en modo privilegiado: tiene que
poder reiniciarse, reconstruirse o borrarse sin rozar el CRM, n8n ni Postgres.
Los `mem_limit` no son una optimización — son lo que impide que se los coma.

Nada sale a internet: el adb y el panel escuchan sólo en la LAN de casa y
Cloudflare Tunnel no los publica.

## Puesta en marcha

```bash
# En el servidor, una vez (el kernel necesita binder para correr Android):
sudo modprobe binder_linux devices=binder,hwbinder,vndbinder
sudo mkdir -p /dev/binderfs && sudo mount -t binder binder /dev/binderfs

cd ~/jd-wa
docker compose -p jd-wa -f docker-compose.whatsapp.yml up -d
```

Falta poner la clave en `~/jd-wa/.env`:

```
SUPABASE_SERVICE_KEY=<la service_role de Supabase>
```

La `anon` no vale: la 0035 le deniega el acceso a las RPC a propósito.

### Registrar el número

Se hace una sola vez, desde el navegador (funciona también desde el móvil):

**http://192.168.18.26:8899/panel**

Se ve la pantalla del Android, se toca sobre ella y se escribe con el cuadro de
texto. Hay que aceptar los términos, poner el número y teclear el código que
llegue por SMS. El emulador no tiene módem: la eSIM va en un teléfono normal y
el código se copia a mano — WhatsApp sólo pide la SIM para ese SMS, después la
cuenta funciona sin ella (igual que WhatsApp Web).

Comprobar que quedó registrado:

```bash
curl http://192.168.18.26:8899/salud    # {"ok": true}
```

`ok` mira que exista el número propio en las preferencias de WhatsApp, no que
exista `wa.db` — esa la crea la app al arrancar aunque no haya cuenta.

## Cómo se usa

Sola. Se dispara al terminar cada enriquecimiento (o sea, tras cada tanda de
Apify) y además tres veces al día, que es lo que va repasando poco a poco todo
el histórico del CRM.

A mano:

```bash
curl -X POST http://192.168.18.26:8899/verificar -d '{"limite": 60}'
docker exec jd-wa-verificador python verificar.py pasada
```

## WhatsApp tiene un tope diario de contactos nuevos

Comprobado el 3-sep-2026: tras sincronizar ~150 números en un día, los
siguientes **dejan de aparecer en `wa_contacts`**. Están en la agenda del
Android, pero WhatsApp ya no los consulta. No lo arregla reiniciar la app, ni
abrir la lista de contactos, ni quitar y devolver el permiso: es un límite del
lado de WhatsApp, no un fallo nuestro.

No hay nada que hacer, y tampoco hace falta: esos leads se quedan
`sin_verificar`, vuelven a la cola solos, y la pasada del día siguiente los
coge. Por eso las tres pasadas diarias son suficientes — ir más rápido no
verifica más leads, sólo gasta el cupo antes y llama la atención.

Si una pasada devuelve muchos `sin_verificar` de golpe y los números **sí**
están en la agenda, es esto, no una avería.

## Sobre el riesgo de que cierren la cuenta

Existe. Consultar contactos en bloque desde una cuenta automatizada va contra
los términos de WhatsApp, y la consecuencia es perder ese número. Es un asunto
contractual, no legal, y por eso el número es desechable y está separado de
todo lo demás.

Lo que llama la atención no es el tamaño del lote —sincronizar cientos de
contactos de golpe es lo normal en cualquier móvil— sino un goteo constante de
números nuevos a todas horas desde una cuenta que no habla con nadie. De ahí:

- Tres pasadas al día, no un bucle continuo.
- **Los contactos se acumulan, no se borran.** Meter y quitar sin parar es
  justo el patrón que delata.
- Volumen bajo las primeras dos semanas, mientras la cuenta es nueva.
- Alguna conversación real desde ese número de vez en cuando.

Si el número cae, se pierde el número y nada más: los datos están en Supabase,
el CRM sigue igual y los leads ya verificados conservan su resultado.
