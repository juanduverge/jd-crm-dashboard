#!/usr/bin/env bash
# Publica el CRM en el servidor de casa (jd-developer-home-service).
#
# Por qué es un script y no un GitHub Action: el servidor está en la red de
# casa (192.168.18.26) y GitHub no puede llegar a él. Se lanza desde el
# portátil, conectado a la misma red, después de hacer push a main:
#
#   bash deploy/publicar.sh
#
# Reconstruye SOLO el contenedor crm-dashboard; n8n y Postgres no se tocan.
set -euo pipefail

HOST="${JD_HOST:-juanduverge@192.168.18.26}"
KEY="${JD_KEY:-$HOME/.ssh/jd_home_service}"

local_head="$(git rev-parse --short origin/main)"
echo "Publicando origin/main ($local_head) en $HOST…"

ssh -i "$KEY" -o ConnectTimeout=10 "$HOST" '
  set -e
  cd ~/jd-crm-dashboard
  # main en el servidor no tiene upstream: hay que decir origin main.
  git pull --ff-only origin main
  echo "Servidor en: $(git log -1 --oneline)"
  cd ~/jd-prod
  docker compose -f docker-compose.dominio.yml up -d --build crm-dashboard
  sleep 3
  docker ps --filter name=crm-dashboard --format "{{.Names}} {{.Status}}"
'

echo "Listo: https://workspace.jddeveloper.com (recarga con F5)."
