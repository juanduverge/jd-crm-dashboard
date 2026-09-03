#!/usr/bin/env python3
"""
El aviso del cargador: si alguien desenchufa el servidor, se entera todo el mundo.

POR QUÉ EXISTE APARTE DEL VIGILANTE:

El servidor es un portátil en casa. Si se desenchufa —un tirón al cable, una
regleta que alguien apaga— nadie se entera hasta que la batería se acaba y el
CRM se cae entero, sin aviso previo. El vigilante ya miraba la batería, pero
sólo protestaba por debajo del 60% y sólo cada cinco minutos: para cuando
avisaba, podían haber pasado horas desde el tirón.

Esto mira el cargador cada diez segundos y hace dos cosas distintas a
propósito:

  - SUENA en el propio portátil, y no para hasta que el cable vuelva a su
    sitio. Es lo único que funciona sin internet y sin móvil a mano. Un
    pitido único a las tres de la mañana no lo oye nadie; una alarma que no
    se calla sola obliga a ir a mirar, que es justo lo que se quiere.
  - AVISA por WhatsApp, una sola vez, por si no estás en casa.

Cuando se vuelve a enchufar, el ruido para solo y llega el mensaje de que ya
está. Así no hay que venir a mirar si se arregló.

LO QUE NO CUBRE: un apagón de luz. Ahí el portátil pasa a batería igual que
con un tirón de cable y esto avisa —bien—, pero si además se va internet, el
WhatsApp no sale. El pitido sí. Para el apagón completo sigue haciendo falta
un vigilante de fuera (LATIDO_URL en `vigilante.py`).
"""

import math
import os
import struct
import subprocess
import sys
import threading
import time
import wave

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verificar as v

AC = os.environ.get("RUTA_AC", "/sys/class/power_supply/AC/online")
BAT = os.environ.get("RUTA_BAT", "/sys/class/power_supply/BAT0/capacity")

# Cada cuánto se mira el cable. Diez segundos es de sobra: lo que se quiere
# evitar es enterarse horas después, no milisegundos después.
INTERVALO = int(os.environ.get("INTERVALO_CARGADOR", "10"))
# El aparato de ALSA. `default` vale salvo que el portátil tenga varias
# tarjetas y la primera sea el HDMI (que no suena si no hay pantalla).
ALSA = os.environ.get("ALSA_DEVICE", "default")

TONO = "/tmp/alarma-cargador.wav"


def _crear_tono():
    """
    Un dos-tonos tipo alarma, generado aquí para no depender de ningún
    fichero de sonido del sistema (esta imagen no trae ninguno).
    """
    ritmo = 44100
    muestras = bytearray()
    for _ in range(3):                      # tres parejas de pitidos
        for hz in (880, 660):
            for i in range(int(ritmo * 0.18)):
                # Entrada y salida suaves: un tono que empieza en seco
                # chasquea en los altavoces y suena a avería, no a alarma.
                t = i / (ritmo * 0.18)
                vol = min(1.0, min(t, 1 - t) * 12)
                val = int(22000 * vol * math.sin(2 * math.pi * hz * i / ritmo))
                muestras += struct.pack("<h", val)
            muestras += b"\x00\x00" * int(ritmo * 0.06)
    with wave.open(TONO, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(ritmo)
        w.writeframes(bytes(muestras))


def _subir_volumen():
    """
    Al máximo. Una alarma a medio volumen no despierta a nadie, y el portátil
    vive con la tapa cerrada en un rincón. Falla en silencio si el mando no se
    llama así en esta tarjeta: no es motivo para no intentar el pitido.
    """
    for mando in ("Master", "PCM", "Speaker"):
        subprocess.run(["amixer", "-q", "sset", mando, "100%", "unmute"],
                       capture_output=True, timeout=10)


def sonar():
    """Una tanda de pitidos. Si no hay sonido no se levanta nada: quedarse sin
    pitido no puede impedir que salga el WhatsApp."""
    try:
        if not os.path.exists(TONO):
            _crear_tono()
        subprocess.run(["aplay", "-q", "-D", ALSA, TONO],
                       capture_output=True, timeout=30)
    except Exception as e:
        print(f"no se pudo hacer sonar la alarma: {e}", flush=True)


class Alarma:
    """
    Suena sin parar hasta que se la manda callar.

    Vive en su propio hilo porque `aplay` bloquea mientras suena: en el hilo
    principal, el programa dejaría de mirar el cable justo mientras pita, y
    tardaría en enterarse de que ya lo enchufaste. Así el pitido se corta al
    momento.
    """

    def __init__(self):
        self._sonando = threading.Event()
        threading.Thread(target=self._bucle, daemon=True).start()

    def _bucle(self):
        while True:
            self._sonando.wait()
            _subir_volumen()
            # Se vuelve a comprobar dentro: subir el volumen tarda, y en ese
            # rato el cable puede haber vuelto. Nada de un pitido de despedida.
            while self._sonando.is_set():
                sonar()

    def arrancar(self):
        self._sonando.set()

    def parar(self):
        self._sonando.clear()


def enchufado():
    """True/False, o None si no se puede leer (no se concluye nada)."""
    try:
        with open(AC) as f:
            return f.read().strip() == "1"
    except Exception:
        return None


def nivel():
    try:
        with open(BAT) as f:
            return int(f.read().strip())
    except Exception:
        return None


def main():
    # El estado de partida es el de ahora mismo: arrancar el servicio con el
    # portátil ya desenchufado no debe disparar la alarma como si acabara de
    # pasar. Sólo avisan los CAMBIOS.
    anterior = enchufado()
    print(f"vigilando el cargador (ahora {'enchufado' if anterior else 'DESENCHUFADO'})",
          flush=True)
    alarma = Alarma()

    while True:
        time.sleep(INTERVALO)
        ahora = enchufado()
        if ahora is None:
            continue  # no se pudo leer: ni alarma ni aviso, se reintenta

        if anterior is not False and ahora is False:
            bat = nivel()
            print("¡DESENCHUFADO! alarma sonando hasta que vuelva el cable", flush=True)
            # Primero el ruido y luego el mensaje: mandar el WhatsApp tarda
            # (abre la app en el Android, busca el botón), y el pitido tiene
            # que empezar ya.
            alarma.arrancar()
            v.avisar(
                "Hola Juan. El servidor se ha DESENCHUFADO de la corriente."
                + (f" Va por {bat}% de batería." if bat is not None else "")
                + " Cuando se acabe, el CRM se cae. La alarma seguirá sonando"
                  " en casa hasta que lo enchufes."
            )
        elif anterior is False and ahora is True:
            print("vuelve a estar enchufado: se calla la alarma", flush=True)
            alarma.parar()
            v.avisar("Hola Juan. El servidor ya está enchufado otra vez. Todo en orden.")

        anterior = ahora


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "prueba":
        # Una tanda suelta, para comprobar que se oye sin dejar el portátil
        # pitando para siempre.
        print("sonando…")
        _subir_volumen()
        sonar()
        print("estado del cargador:", enchufado(), "batería:", nivel())
    else:
        main()
