# Verificador de WhatsApp.
#
# Sólo necesita tres cosas: hablar adb con el Android de al lado, abrir el
# `wa.db` que se trae de allí, y llamar a las RPC de Supabase.
FROM python:3.12-slim

# `alsa-utils` es para el aviso del cargador: `aplay` hace sonar la alarma
# por los altavoces del portatil sin necesitar PulseAudio ni sesion grafica.
RUN apt-get update \
 && apt-get install -y --no-install-recommends adb sqlite3 alsa-utils \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir requests==2.32.3

WORKDIR /app
COPY verificar.py vigilante.py cargador.py ./

CMD ["python", "-u", "verificar.py", "servidor"]
