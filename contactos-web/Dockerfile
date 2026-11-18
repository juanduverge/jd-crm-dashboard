# Robot de contactos. Python + Chromium (Playwright) para las webs que solo
# muestran su contenido con JavaScript.
# bookworm fijo: `python:3.12-slim` ya es Debian 13 y Playwright 1.49 no sabe
# instalar las dependencias de Chromium ahí (paquetes de fuentes renombrados).
FROM python:3.12-slim-bookworm

RUN pip install --no-cache-dir requests==2.32.3 beautifulsoup4==4.12.3 playwright==1.49.1 \
 && playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY robot.py ./

HEALTHCHECK --interval=2m --timeout=10s --start-period=1m \
  CMD find /tmp/latido -mmin -10 | grep -q latido || exit 1

CMD ["python", "-u", "robot.py"]
