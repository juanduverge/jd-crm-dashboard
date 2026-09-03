# Verificador de WhatsApp.
#
# Sólo necesita tres cosas: hablar adb con el Android de al lado, abrir el
# `wa.db` que se trae de allí, y llamar a las RPC de Supabase.
FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends adb sqlite3 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir requests==2.32.3

WORKDIR /app
COPY verificar.py vigilante.py ./

CMD ["python", "-u", "verificar.py", "servidor"]
