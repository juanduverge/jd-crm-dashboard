#!/usr/bin/env python3
"""
El vigilante: mira que todo siga en pie y avisa por WhatsApp cuando no.

LO QUE NO PUEDE HACER, Y HAY QUE TENERLO CLARO:

Si el servidor se queda sin internet o se apaga, este programa NO puede
avisar de nada — el aviso viaja por el mismo internet que se cayó. Eso sólo
lo detecta algo que mire desde fuera y note que dejamos de dar señales
(healthchecks.io o similar). Este vigilante cubre lo otro: lo que se rompe
mientras la máquina sigue viva y conectada.

QUÉ VIGILA:
  - La sesión de WhatsApp (si se cae, el verificador queda ciego).
  - Que los contenedores sigan levantados.
  - La batería del portátil: si se desenchufa, avisa antes de que muera.
  - Espacio en disco.
  - Que Supabase conteste.

CADA AVISO SE MANDA UNA VEZ. Repetir el mismo aviso cada cinco minutos
convierte la alerta en ruido y acaba ignorándose; además, una cuenta de
WhatsApp mandando el mismo mensaje en bucle es justo el patrón que hace que
la cierren. Cuando el problema se arregla, se avisa también — así se sabe
que volvió sin tener que ir a mirar.
"""

import json
import os
import re
import socket
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verificar as v

# Dónde se recuerda qué ya se avisó, para no repetirlo.
ESTADO = os.environ.get("ESTADO_VIGILANTE", "/datos/vigilante.json")

BATERIA_MINIMA = int(os.environ.get("BATERIA_MINIMA", "60"))
DISCO_MINIMO_GB = int(os.environ.get("DISCO_MINIMO_GB", "5"))

# Ping a un servicio externo tipo healthchecks.io. Mientras llegue, alguien
# de fuera sabe que seguimos vivos; cuando deje de llegar, ese servicio avisa.
# Es lo único que cubre un apagón o una caída de internet.
LATIDO_URL = os.environ.get("LATIDO_URL", "")


def leer_estado():
    try:
        with open(ESTADO) as f:
            return json.load(f)
    except Exception:
        return {}


def guardar_estado(estado):
    try:
        os.makedirs(os.path.dirname(ESTADO), exist_ok=True)
        with open(ESTADO, "w") as f:
            json.dump(estado, f)
    except Exception as e:
        print(f"no se pudo guardar el estado: {e}", flush=True)


# --- Las comprobaciones ----------------------------------------
# Cada una devuelve None si todo va bien, o el texto del problema.
def revisar_whatsapp():
    try:
        v.conectar()
        if not v.whatsapp_registrado():
            return "WhatsApp perdió la sesión en el Android. Hasta que se vuelva a registrar, no se verifica ningún lead."
    except Exception as e:
        return f"No se puede hablar con el Android: {e}"
    return None


def revisar_contenedores():
    """
    Habla con el socket de Docker a pelo, sin instalar el cliente: es una
    petición HTTP normal, sólo que por un fichero en vez de por red.
    """
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(20)
        s.connect("/var/run/docker.sock")
        s.sendall(b"GET /containers/json HTTP/1.1\r\nHost: docker\r\n"
                  b"Connection: close\r\n\r\n")
        crudo = b""
        while True:
            trozo = s.recv(65536)
            if not trozo:
                break
            crudo += trozo
        s.close()
        cuerpo = crudo.split(b"\r\n\r\n", 1)[1].decode(errors="replace")
        vivos = {n.strip("/") for m in re.finditer(r'"Names":\[(.*?)\]', cuerpo)
                 for n in re.findall(r'"([^"]+)"', m.group(1))}
    except Exception:
        # Sin acceso al socket esta comprobación no aplica; no es un fallo
        # del sistema vigilado, así que no se avisa de nada.
        return None

    faltan = [c for c in ("jd-wa-android", "jd-wa-verificador") if c not in vivos]
    if faltan:
        return f"Contenedores caídos: {', '.join(faltan)}"
    return None


# Quien avisa de QUE se ha desenchufado es `cargador.py`, en el acto y con
# alarma sonora. Esto es el escalon siguiente: lleva un rato desenchufado y
# la bateria ya esta baja. Son dos avisos distintos, no el mismo repetido.
def revisar_bateria():
    base = "/sys/class/power_supply"
    try:
        with open(f"{base}/AC/online") as f:
            enchufado = f.read().strip() == "1"
        with open(f"{base}/BAT0/capacity") as f:
            nivel = int(f.read().strip())
    except Exception:
        return None  # equipo sin batería: nada que vigilar
    if not enchufado and nivel < BATERIA_MINIMA:
        return (f"El servidor está DESENCHUFADO y va por {nivel}% de batería. "
                f"Cuando se acabe, se cae el CRM entero.")
    return None


def revisar_disco():
    try:
        s = os.statvfs("/")
        libres = s.f_bavail * s.f_frsize / (1024 ** 3)
        if libres < DISCO_MINIMO_GB:
            return f"Queda poco disco en el servidor: {libres:.1f} GB libres."
    except Exception:
        return None
    return None


def revisar_supabase():
    try:
        v.rpc("leads_para_verificar_wa", {"p_limite": 1})
    except Exception as e:
        return f"Supabase no contesta: {e}"
    return None


REVISIONES = {
    "whatsapp": revisar_whatsapp,
    "contenedores": revisar_contenedores,
    "bateria": revisar_bateria,
    "disco": revisar_disco,
    "supabase": revisar_supabase,
}


def latido():
    """Le dice a un vigilante externo que seguimos vivos."""
    if not LATIDO_URL:
        return
    try:
        urllib.request.urlopen(LATIDO_URL, timeout=15).read()
    except Exception as e:
        print(f"latido falló: {e}", flush=True)


def ronda():
    estado = leer_estado()
    avisados = estado.get("avisados", {})
    todo_bien = True

    for nombre, revisar in REVISIONES.items():
        try:
            problema = revisar()
        except Exception as e:
            problema = f"la propia comprobación falló: {e}"

        if problema:
            todo_bien = False
            if nombre not in avisados:
                print(f"[{nombre}] {problema}", flush=True)
                v.avisar(f"Hola Juan. Problema en el servidor:\n\n{problema}")
                avisados[nombre] = int(time.time())
        elif nombre in avisados:
            print(f"[{nombre}] resuelto", flush=True)
            v.avisar(f"Hola Juan. Ya se arregló solo: {nombre}. Todo vuelve a estar bien.")
            del avisados[nombre]

    if todo_bien:
        latido()

    estado["avisados"] = avisados
    estado["ultima_ronda"] = int(time.time())
    guardar_estado(estado)
    return avisados


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "prueba":
        n = v.avisar("Hola Juan. Prueba del vigilante: si lees esto, los avisos del servidor funcionan.")
        print(f"avisos enviados: {n}")
    else:
        pendientes = ronda()
        print("problemas abiertos:", list(pendientes) or "ninguno")
