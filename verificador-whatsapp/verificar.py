#!/usr/bin/env python3
"""
Verificador de WhatsApp — automatiza la comprobación que hoy se hace a mano.

QUÉ SUSTITUYE:

Abrir la ficha de un lead, copiar el teléfono, pegarlo en WhatsApp y mirar si
sale «Chatear con +1 809…». Eso, por cada lead. Aquí lo hace un Android que
corre en el servidor con una cuenta desechable.

CÓMO FUNCIONA:

WhatsApp marca, de los contactos de la agenda del teléfono, cuáles son
usuarios suyos. No hay que enviar nada ni abrir ningún chat: basta con meter
los números como contactos y leer lo que WhatsApp concluye. Eso es exactamente
lo mismo que pasa cuando alguien instala WhatsApp en un móvil nuevo.

  1. Pedir el lote a `leads_para_verificar_wa()`.
  2. Meter los teléfonos como contactos en el Android.
  3. Esperar a que WhatsApp sincronice.
  4. Leer `wa_contacts.is_whatsapp_user` de su base de datos.
  5. Devolver el veredicto con `registrar_whatsapp()`.

LO QUE ESTE PROGRAMA NO HACE, A PROPÓSITO:

No envía mensajes. No abre chats. No contacta a nadie. El contacto real lo
sigue haciendo una persona desde su propio WhatsApp, o algún día la API
oficial de Meta. Este número desechable sólo mira.

LA REGLA QUE MANDA SOBRE TODO LO DEMÁS:

Si algo falla —la sesión caída, el Android a medias, la base de datos de
WhatsApp ilegible— el resultado es «no lo sé», nunca «no tiene WhatsApp».
Un fallo silencioso que marque 60 leads buenos como inservibles es mucho peor
que una pasada perdida. Por eso, cuando la lectura no se puede hacer, este
programa aborta sin escribir NADA en la base de datos.
"""

import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import quote

import requests

ADB_HOST = os.environ.get("ADB_HOST", "android:5555")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
LOTE = int(os.environ.get("LOTE", "60"))
PUERTO = int(os.environ.get("PUERTO", "8899"))

# Cuánto se le da a WhatsApp para sincronizar antes de leer. Es generoso a
# propósito: leer antes de tiempo no da error, da un «no aparece» falso, que
# es justo el resultado que no queremos.
ESPERA_SYNC = int(os.environ.get("ESPERA_SYNC", "90"))

WA_DB = "/data/data/com.whatsapp/databases/wa.db"


class FalloDeLectura(Exception):
    """La comprobación no se pudo hacer. No se concluye nada de nadie."""


# --- Android ---------------------------------------------------
def adb(*args, binario=False, timeout=120):
    r = subprocess.run(
        ["adb", "-s", ADB_HOST, *args],
        capture_output=True, timeout=timeout,
    )
    if r.returncode != 0:
        raise FalloDeLectura(
            f"adb {' '.join(args)} falló: {r.stderr.decode('utf-8', 'replace').strip()}"
        )
    return r.stdout if binario else r.stdout.decode("utf-8", "replace")


# Tocar la pantalla hay que hacerlo escribiendo eventos crudos en el
# touchscreen (`sendevent`), no con `input tap`. `input tap` inyecta el evento
# por otra vía que aquí llega a medias: los botones responden, pero un campo
# de texto nunca gana el foco, así que era imposible escribir nada.
#
# Los códigos son los de Linux: 3=EV_ABS, 1=EV_KEY, 0=EV_SYN; 53/54 son las
# coordenadas multitáctiles, 330 es BTN_TOUCH.
GUION_TOCAR = "/data/local/tmp/tap.sh"
GUION_TECLA = "/data/local/tmp/key.sh"

_TOCAR = """#!/system/bin/sh
DEV=$1
X=$2
Y=$3
sendevent $DEV 3 53 $X
sendevent $DEV 3 54 $Y
sendevent $DEV 3 0 $X
sendevent $DEV 3 1 $Y
sendevent $DEV 1 330 1
sendevent $DEV 0 0 0
sleep 0.1
sendevent $DEV 1 330 0
sendevent $DEV 0 0 0
"""

# Códigos evdev, no los de Android: KEY_1=2 … KEY_9=10, KEY_0=11.
_TECLA = """#!/system/bin/sh
DEV=$1
CODE=$2
sendevent $DEV 1 $CODE 1
sendevent $DEV 0 0 0
sleep 0.05
sendevent $DEV 1 $CODE 0
sendevent $DEV 0 0 0
"""


def _subir_guiones():
    """Deja los guiones de toque en el Android. Repetirlo no molesta."""
    with tempfile.TemporaryDirectory() as tmp:
        for nombre, cuerpo, destino in (
            ("tap.sh", _TOCAR, GUION_TOCAR),
            ("key.sh", _TECLA, GUION_TECLA),
        ):
            local = os.path.join(tmp, nombre)
            with open(local, "w", newline="\n") as f:
                f.write(cuerpo)
            adb("push", local, destino)


def conectar():
    subprocess.run(["adb", "connect", ADB_HOST], capture_output=True, timeout=30)
    # `wait-for-device` evita la carrera de mandar comandos a un Android que
    # aún está arrancando: fallarían, y un fallo aquí se parece demasiado a
    # «este lead no tiene WhatsApp».
    subprocess.run(["adb", "-s", ADB_HOST, "wait-for-device"], timeout=120)
    subprocess.run(["adb", "-s", ADB_HOST, "root"], capture_output=True, timeout=30)
    time.sleep(2)
    subprocess.run(["adb", "connect", ADB_HOST], capture_output=True, timeout=30)
    _subir_guiones()


def whatsapp_registrado():
    """
    ¿Hay una CUENTA registrada? No basta con que exista wa.db: WhatsApp la
    crea nada más arrancar, aunque nunca se haya puesto un número. Tomar eso
    por «listo» haría que las pasadas leyeran una agenda vacía y parecieran
    funcionar. El número propio (`ph` en las preferencias) sólo aparece
    cuando el registro se ha completado de verdad.
    """
    try:
        if WA_DB not in adb("shell", "ls", WA_DB):
            return False
        salida = adb(
            "shell",
            'grep -ohE "<string name=\\"ph\\">[^<]+" '
            "/data/data/com.whatsapp/shared_prefs/*.xml 2>/dev/null",
        )
        return bool(salida.strip())
    except FalloDeLectura:
        return False


# --- Teléfonos -------------------------------------------------
def digitos(tel):
    return re.sub(r"\D", "", tel or "")


# Norteamérica (EE.UU., Canadá, República Dominicana) comparte el prefijo +1 y
# se escribe a diario sin él: «305 680 5662». Son diez dígitos con la forma
# NXX-NXX-XXXX — ni el código de área ni la central empiezan por 0 ni por 1.
# Esa forma es la que permite reponer el +1 sin adivinar.
NANP = re.compile(r"^[2-9][0-9]{2}[2-9][0-9]{6}$")


def normalizar(tel):
    """
    A E.164. Un número sin prefijo de país no se puede comprobar: WhatsApp
    necesita el internacional. Se descarta en vez de inventarle un prefijo,
    que produciría veredictos sobre un número que no es el del lead.

    La única excepción es el +1: diez dígitos con forma norteamericana. Sin
    ella, `3056805662` se convertiría en `+3056805662` —Grecia— y el veredicto
    sería sobre un teléfono que no es el del lead. Diez dígitos que NO tienen
    esa forma no se tocan: no se sabe de dónde son.
    """
    d = digitos(tel)
    if len(d) == 10:
        return "+1" + d if NANP.match(d) else None
    if len(d) < 11 or len(d) > 15:
        return None
    return "+" + d


# --- Meter los contactos ---------------------------------------
# Se insertan por el ContentProvider de contactos, que es la vía por la que
# Android avisa a WhatsApp de que hay agenda nueva. Escribir su sqlite a mano
# sería más rápido y no se enteraría nadie.
#
# El guion se sube como FICHERO y se ejecuta dentro del Android. Pasarlo como
# argumento de `adb shell` obliga a que sobreviva a tres shells encadenados
# (el de aquí, el de adb y el del dispositivo), y ahí las comillas del
# `--where` se rompen en silencio: los contactos parecen insertarse y no
# queda ninguno.
#
# La cuenta `CRM` no existe en el gestor de cuentas de Android, así que estos
# contactos pueden ser purgados en un arranque. No es grave: la siguiente
# pasada los vuelve a insertar, porque cada número se comprueba antes.
GUION_INSERTAR = r"""#!/system/bin/sh
for NUM in $(cat /data/local/tmp/wa_numeros.txt); do
  YA=$(content query --uri content://com.android.contacts/data \
        --projection data1 --where "data1='$NUM'" 2>/dev/null | head -1)
  case "$YA" in *"$NUM"*) continue;; esac

  content insert --uri content://com.android.contacts/raw_contacts \
    --bind account_name:s:CRM --bind account_type:s:CRM 2>/dev/null
  ID=$(content query --uri content://com.android.contacts/raw_contacts \
        --projection _id --sort '_id DESC' 2>/dev/null | head -1 |
        sed -n 's/.*_id=\([0-9]*\).*/\1/p')
  [ -n "$ID" ] || continue

  # WhatsApp sólo mira contactos con nombre; uno sin nombre puede no salir.
  content insert --uri content://com.android.contacts/data \
    --bind raw_contact_id:i:$ID \
    --bind mimetype:s:vnd.android.cursor.item/name \
    --bind data1:s:"CRM $NUM" 2>/dev/null
  content insert --uri content://com.android.contacts/data \
    --bind raw_contact_id:i:$ID \
    --bind mimetype:s:vnd.android.cursor.item/phone_v2 \
    --bind data2:i:2 \
    --bind data1:s:"$NUM" 2>/dev/null
done
echo "--- AGENDA ---"
content query --uri content://com.android.contacts/data --projection data1   --where "mimetype='vnd.android.cursor.item/phone_v2'"
echo LISTO
"""


def insertar_contactos(numeros):
    """Mete los números en la agenda y comprueba que quedaron de verdad."""
    if not numeros:
        return
    tmp = tempfile.mkdtemp()
    with open(f"{tmp}/wa_numeros.txt", "w") as f:
        f.write("\n".join(numeros) + "\n")
    with open(f"{tmp}/insertar.sh", "w", newline="\n") as f:
        f.write(GUION_INSERTAR)

    adb("push", f"{tmp}/wa_numeros.txt", "/data/local/tmp/wa_numeros.txt")
    adb("push", f"{tmp}/insertar.sh", "/data/local/tmp/wa_insertar.sh")
    salida = adb("shell", "sh", "/data/local/tmp/wa_insertar.sh", timeout=900)
    if "LISTO" not in salida:
        raise FalloDeLectura(f"la inserción de contactos no terminó: {salida[-300:]}")

    # Comprobación real de que la agenda tiene lo que debe. Sin esto, un fallo
    # del proveedor de contactos se convertiría más tarde en un lote entero de
    # «no aparece» — leads buenos marcados como inservibles.
    #
    # La lista la imprime el propio guion, por la misma razón que se sube como
    # fichero: un `--where` con comillas no sobrevive al viaje por adb.
    agenda = salida.split("--- AGENDA ---", 1)[-1]
    # Cada línea es `Row: 0 data1=+18095550000`. Hay que quedarse con el valor
    # de data1: contar los dígitos de la línea entera arrastra el número de
    # fila y ningún teléfono casaría nunca.
    presentes = {
        d for d in (digitos(m) for m in re.findall(r"data1=(\S+)", agenda)) if d
    }
    faltan = [n for n in numeros if digitos(n) not in presentes]
    if len(faltan) == len(numeros):
        raise FalloDeLectura(
            "ningún número llegó a la agenda: el proveedor de contactos falló"
        )
    if faltan:
        print(f"aviso: {len(faltan)} de {len(numeros)} números no entraron en la agenda")


def forzar_sync():
    """
    Abrir WhatsApp dispara su sincronización de contactos. No se toca ningún
    chat: sólo se levanta la app.
    """
    adb("shell", "monkey", "-p", "com.whatsapp",
        "-c", "android.intent.category.LAUNCHER", "1")


# --- Avisar a una persona --------------------------------------
# ESTO SÍ ENVÍA UN MENSAJE, y es la única parte del programa que lo hace.
# No va nunca a un lead: sólo a los números de AVISAR_A, que son los del
# equipo. Sirve para enterarse de que algo se rompió sin tener que mirar.
#
# Enviar de vez en cuando a un contacto conocido, además, le sienta bien a la
# cuenta: una cuenta que sólo sincroniza agenda y jamás habla con nadie es
# justo el patrón que llama la atención.
AVISAR_A = [n.strip() for n in os.environ.get("AVISAR_A", "").split(",") if n.strip()]

def _buscar_boton(patron_id, intentos=6):
    """
    Devuelve el centro (x, y) del primer elemento cuyo resource-id case con
    el patrón, o None. Se mira la pantalla de verdad en vez de tocar
    coordenadas fijas: así un cambio de diseño de WhatsApp no acaba pulsando
    cualquier otra cosa —una vez abrió los ajustes de mensajes temporales—.
    """
    for _ in range(intentos):
        try:
            adb("shell", "uiautomator", "dump", "/sdcard/ui_aviso.xml")
            xml = adb("shell", "cat", "/sdcard/ui_aviso.xml")
            for nodo in re.finditer(r"<node[^>]*/>", xml):
                t = nodo.group(0)
                if re.search(patron_id, t) and 'bounds="' in t:
                    x1, y1, x2, y2 = map(int, re.search(
                        r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', t).groups())
                    return ((x1 + x2) // 2, (y1 + y2) // 2)
        except Exception:
            pass
        time.sleep(1.5)
    return None


def avisar(texto):
    """
    Manda un WhatsApp a cada número de AVISAR_A. Devuelve a cuántos llegó.

    Si falla no levanta excepción: un aviso que no sale no puede, además,
    tumbar la tarea que intentaba avisar de otra cosa.
    """
    enviados = 0
    for numero in AVISAR_A:
        try:
            conectar()
            # `whatsapp://` y no `wa.me`: el segundo es un enlace web normal
            # y se lo queda el navegador, que aquí abría la página de
            # WhatsApp en vez del chat. Este esquema sólo lo entiende la app.
            #
            # La URL va entre comillas simples porque el `&` lo lee el shell
            # del Android como «ejecuta en segundo plano» y parte el comando
            # justo antes del texto del mensaje.
            url = f"whatsapp://send?phone={digitos(numero)}&text={quote(texto)}"
            adb("shell", "am", "start", "-a", "android.intent.action.VIEW",
                "-d", f"'{url}'")
            time.sleep(4)

            # Un chat recién abierto puede traer una hoja informativa encima
            # (mensajes temporales, cifrado) con su botón de OK.
            ok = _buscar_boton(r'resource-id="[^"]*(button1|ok_btn)"', intentos=1)
            if ok:
                adb("shell", "sh", GUION_TOCAR, "/dev/input/event5",
                    str(ok[0]), str(ok[1]))
                time.sleep(1.5)

            enviar = _buscar_boton(r'resource-id="com\.whatsapp:id/send"')
            if not enviar:
                print(f"aviso a {numero}: no apareció el botón de enviar",
                      flush=True)
                continue
            adb("shell", "sh", GUION_TOCAR, "/dev/input/event5",
                str(enviar[0]), str(enviar[1]))
            time.sleep(2)
            enviados += 1
        except Exception as e:
            print(f"aviso a {numero} falló: {e}", flush=True)
    return enviados


# --- Leer el veredicto -----------------------------------------
def _copiar_wa_db():
    """
    Trae una copia de wa.db + su WAL y devuelve la ruta local.

    Se trabaja sobre una COPIA. Abrir el original mientras WhatsApp lo usa
    puede corromperlo y costar el registro del número.

    Los dos ficheros se copian en UNA sola orden. Copiarlos por separado abría
    una ventana en la que WhatsApp podía volcar el WAL entre una copia y otra:
    la pareja quedaba descuadrada y sqlite abría con «database disk image is
    malformed» (visto el 3-sep-2026, dos pasadas seguidas perdidas).

    El `-shm` no se copia a propósito: es memoria compartida entre procesos,
    no dato. Un `-shm` de otra ejecución estorba a la recuperación del WAL;
    sqlite lo reconstruye solo a partir del WAL.
    """
    tmp = tempfile.mkdtemp()
    # Si no hubiera WAL, el `||` deja al menos el fichero principal.
    adb("shell", f"cp {WA_DB} {WA_DB}-wal /sdcard/ 2>/dev/null || cp {WA_DB} /sdcard/wa.db")
    adb("pull", "/sdcard/wa.db", f"{tmp}/wa.db", timeout=300)
    subprocess.run(
        ["adb", "-s", ADB_HOST, "pull", "/sdcard/wa.db-wal", f"{tmp}/wa.db-wal"],
        capture_output=True, timeout=300,
    )
    return tmp


def leer_veredictos():
    """
    Devuelve {dígitos: True/False} según `wa_contacts.is_whatsapp_user`.

    Si la copia sale descuadrada se reintenta: es un problema del instante en
    que se copió, no del Android. Rendirse a la primera tira la pasada entera
    y deja sesenta leads sin verificar por un fallo de medio segundo.
    """
    ultimo = None
    for intento in range(1, 4):
        tmp = _copiar_wa_db()
        try:
            return _leer_veredictos_de(tmp)
        except sqlite3.DatabaseError as e:
            ultimo = e
            print(f"copia de wa.db ilegible (intento {intento}/3): {e}", flush=True)
            time.sleep(5)
    raise FalloDeLectura(f"wa.db no se pudo leer en tres intentos: {ultimo}")


def _leer_veredictos_de(tmp):
    con = sqlite3.connect(f"file:{tmp}/wa.db?mode=ro", uri=True)
    try:
        cols = {r[1] for r in con.execute("pragma table_info(wa_contacts)")}
        if "is_whatsapp_user" not in cols:
            raise FalloDeLectura(
                "wa_contacts no tiene is_whatsapp_user: WhatsApp cambió su esquema"
            )
        # El identificador del contacto cambió de nombre entre versiones.
        col_id = "jid" if "jid" in cols else "raw_string_jid"
        if col_id not in cols:
            raise FalloDeLectura(f"wa_contacts no tiene ni jid ni raw_string_jid: {cols}")
        filas = con.execute(
            f"select {col_id}, is_whatsapp_user from wa_contacts where {col_id} is not null"
        ).fetchall()
    finally:
        con.close()

    veredictos = {}
    for jid, es_usuario in filas:
        # Sólo cuentan las cuentas de persona. Los grupos (@g.us) y los
        # difusiones no son números que se puedan comprobar.
        if "@s.whatsapp.net" not in str(jid):
            continue
        d = digitos(str(jid).split("@")[0])
        if d:
            veredictos[d] = bool(es_usuario)
    if not veredictos:
        raise FalloDeLectura("wa_contacts vino vacía: la sincronización no ocurrió")
    return veredictos


# --- Supabase --------------------------------------------------
def rpc(nombre, cuerpo):
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise FalloDeLectura("faltan SUPABASE_URL o SUPABASE_SERVICE_KEY")
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{nombre}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
        json=cuerpo, timeout=60,
    )
    r.raise_for_status()
    return r.json()


# --- La pasada -------------------------------------------------
def pasada(limite=None):
    limite = limite or LOTE
    conectar()
    if not whatsapp_registrado():
        raise FalloDeLectura(
            "no hay sesión de WhatsApp en el Android: hay que registrar el número"
        )

    leads = rpc("leads_para_verificar_wa", {"p_limite": limite})
    if not leads:
        return {"leads": 0, "nota": "no hay nada pendiente de verificar"}

    # Un número puede repetirse entre leads; se comprueba una vez.
    por_lead = {}
    todos = set()
    for lead in leads:
        # dict.fromkeys quita repetidos sin perder el orden: el mismo teléfono
        # suele venir dos veces, en crudo y con el +1 ya puesto.
        nums = list(
            dict.fromkeys(
                n for n in (normalizar(t) for t in (lead.get("telefonos") or [])) if n
            )
        )
        if nums:
            por_lead[lead["id"]] = nums
            todos.update(nums)

    if not todos:
        return {"leads": len(leads), "nota": "ningún teléfono del lote era comprobable"}

    insertar_contactos(sorted(todos))
    forzar_sync()
    time.sleep(ESPERA_SYNC)

    # Si esto revienta, la excepción sube y NO se escribe nada. Es
    # deliberado: sin lectura no hay veredicto, y sin veredicto no se toca
    # la base de datos.
    veredictos = leer_veredictos()

    # La RPC responde en singular ('confirmado'); el resumen cuenta en plural.
    # Sin esta traducción los confirmados no se sumaban y la pasada informaba
    # de cero aunque el CRM se estuviera llenando bien.
    CLAVE = {
        "confirmado": "confirmados",
        "no_aparece": "no_aparece",
        "sin_verificar": "sin_verificar",
    }
    resumen = {"leads": 0, "confirmados": 0, "no_aparece": 0, "sin_verificar": 0}
    for lead_id, numeros in por_lead.items():
        resultados = [
            {"numero": n, "tiene": veredictos[digitos(n)]}
            for n in numeros
            if digitos(n) in veredictos
        ]
        # Un lead cuyos números no llegaron a sincronizarse se queda sin
        # veredicto. La RPC lo deja «sin_verificar» y vuelve a la cola.
        salida = rpc("registrar_whatsapp", {
            "p_id": lead_id,
            "p_resultados": resultados,
            "p_fuente": "wa_probe",
        })
        resumen["leads"] += 1
        estado = salida.get("estado", "sin_verificar")
        clave = CLAVE.get(estado)
        if clave:
            resumen[clave] += 1
        else:
            # Un estado que no reconocemos significa que la RPC cambió y
            # este resumen ya no dice la verdad. Mejor enterarse.
            print(f"estado inesperado de registrar_whatsapp: {estado!r}",
                  flush=True)
    return resumen


# --- El panel --------------------------------------------------
# Para registrar el número hay que teclear en la pantalla del Android una vez.
# Esto es lo mínimo que hace falta: una captura, un toque y un teclado. No es
# vídeo en directo; se refresca sola cada dos segundos y sobra.
PANEL = """<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Android del verificador</title>
<style>
 body{background:#111;color:#eee;font:14px system-ui;margin:0;padding:12px;
      display:flex;flex-direction:column;align-items:center;gap:10px}
 img{max-width:100%;max-height:70vh;border:1px solid #444;border-radius:8px}
 .fila{display:flex;gap:6px;width:100%;max-width:420px}
 input,button{padding:10px;border-radius:6px;border:1px solid #555;
      background:#222;color:#eee;font-size:15px}
 input{flex:1} button{cursor:pointer}
</style>
<img id="p" onclick="tocar(event)">
<div class="fila">
  <input id="t" placeholder="texto a escribir" autocapitalize=off autocomplete=off>
  <button onclick="escribir()">Escribir</button>
</div>
<div class="fila">
  <button onclick="tecla(66)">Enter</button>
  <button onclick="tecla(67)">Borrar</button>
  <button onclick="tecla(4)">Atras</button>
  <button onclick="tecla(3)">Inicio</button>
</div>
<script>
 const img=document.getElementById('p');
 function refrescar(){img.src='/pantalla?'+Date.now()}
 refrescar(); setInterval(refrescar,2000);
 // El toque se traduce de las coordenadas de la imagen mostrada a las
 // reales del Android; si no, cada clic caería en otro sitio.
 function tocar(e){
   const r=img.getBoundingClientRect();
   const x=Math.round((e.clientX-r.left)/r.width*img.naturalWidth);
   const y=Math.round((e.clientY-r.top)/r.height*img.naturalHeight);
   fetch('/tocar',{method:'POST',body:JSON.stringify({x,y})}).then(refrescar);
 }
 function escribir(){
   const t=document.getElementById('t');
   fetch('/escribir',{method:'POST',body:JSON.stringify({texto:t.value})})
     .then(()=>{t.value='';refrescar()});
 }
 function tecla(k){fetch('/tecla',{method:'POST',body:JSON.stringify({tecla:k})}).then(refrescar)}
</script>"""


def captura():
    r = subprocess.run(
        ["adb", "-s", ADB_HOST, "exec-out", "screencap", "-p"],
        capture_output=True, timeout=60,
    )
    if r.returncode != 0 or not r.stdout:
        raise FalloDeLectura("no se pudo capturar la pantalla")
    return r.stdout


# --- Cómo lo llama n8n -----------------------------------------
class Manejador(BaseHTTPRequestHandler):
    def _responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _crudo(self, tipo, datos):
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(datos)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        ruta = self.path.split("?")[0]
        if ruta == "/salud":
            try:
                conectar()
                self._responder(200, {"ok": whatsapp_registrado()})
            except Exception as e:
                self._responder(200, {"ok": False, "error": str(e)})
        elif ruta == "/panel":
            self._crudo("text/html; charset=utf-8", PANEL.encode())
        elif ruta == "/pantalla":
            try:
                conectar()
                self._crudo("image/png", captura())
            except Exception as e:
                self._responder(500, {"error": str(e)})
        else:
            self._responder(404, {"error": "no existe"})

    def _cuerpo(self):
        largo = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(largo) or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_POST(self):
        ruta = self.path.split("?")[0]
        cuerpo = self._cuerpo()

        # --- El panel ---
        if ruta in ("/tocar", "/escribir", "/tecla"):
            try:
                conectar()
                if ruta == "/tocar":
                    adb("shell", "input", "tap",
                        str(int(cuerpo["x"])), str(int(cuerpo["y"])))
                elif ruta == "/tecla":
                    adb("shell", "input", "keyevent", str(int(cuerpo["tecla"])))
                else:
                    # `input text` no admite espacios sin escapar y trata el
                    # texto como argumento de shell: se pasa entrecomillado.
                    texto = str(cuerpo.get("texto", "")).replace("'", "")
                    if texto:
                        adb("shell", f"input text '{texto.replace(' ', '%s')}'")
                self._responder(200, {"ok": True})
            except Exception as e:
                self._responder(500, {"error": str(e)})
            return

        # --- El trabajo ---
        if ruta != "/verificar":
            return self._responder(404, {"error": "no existe"})
        try:
            self._responder(200, pasada(cuerpo.get("limite")))
        except Exception as e:
            # 500 para que n8n lo vea como fallo y no como «0 leads con
            # WhatsApp», que es una lectura muy distinta del mismo suceso.
            self._responder(500, {"error": str(e)})

    def log_message(self, formato, *args):
        print("http:", formato % args)


def main():
    modo = sys.argv[1] if len(sys.argv) > 1 else "pasada"
    if modo == "servidor":
        print(f"verificador escuchando en :{PUERTO} (adb -> {ADB_HOST})")
        # Servidor con hilos: si no, cada captura de pantalla (~1s) bloquea
        # cualquier toque o texto que llegue mientras tanto, y el panel
        # parece colgado aunque el Android responda bien.
        ThreadingHTTPServer(("0.0.0.0", PUERTO), Manejador).serve_forever()
    elif modo == "estado":
        conectar()
        print(json.dumps({
            "adb": ADB_HOST,
            "whatsapp_registrado": whatsapp_registrado(),
        }, indent=2, ensure_ascii=False))
    else:
        print(json.dumps(pasada(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
