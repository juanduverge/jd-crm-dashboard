#!/usr/bin/env bash
# Instala en el servidor de casa el recolector de la pantalla «Servidor» del CRM.
# Se ejecuta UNA vez, en el servidor:  bash ~/jd-crm-dashboard/deploy/estado-servidor/instalar.sh
#
# Hace tres cosas, y repetirlo no duplica nada:
#  1. crea ~/servidor/publico, que es lo que ve el CRM;
#  2. añade a cron una línea que corre estado.py cada minuto desde el clon del
#     repo (así un `git pull` del despliegue actualiza también el recolector);
#  3. monta esa carpeta, solo lectura, en el contenedor crm-dashboard. Eso vive
#     en ~/jd-prod/docker-compose.dominio.yml, que no está en el repo.
set -euo pipefail

REPO="$HOME/jd-crm-dashboard"
PUBLICO="$HOME/servidor/publico"
COMPOSE="$HOME/jd-prod/docker-compose.dominio.yml"
LINEA="* * * * * /usr/bin/python3 $REPO/deploy/estado-servidor/estado.py >/dev/null 2>&1"

mkdir -p "$PUBLICO"

if ! crontab -l 2>/dev/null | grep -qF "estado-servidor/estado.py"; then
  (crontab -l 2>/dev/null; echo "$LINEA") | crontab -
  echo "cron: añadido"
else
  echo "cron: ya estaba"
fi

if ! grep -q "/usr/share/nginx/html/estado-servidor" "$COMPOSE"; then
  cp "$COMPOSE" "$COMPOSE.bak-$(date +%Y%m%d-%H%M)"
  # Inserta el volumen justo antes de los puertos del servicio crm-dashboard.
  python3 - "$COMPOSE" "$PUBLICO" <<'PY'
import sys
ruta, publico = sys.argv[1], sys.argv[2]
lineas = open(ruta).read().split("\n")
dentro = False
for i, l in enumerate(lineas):
    if l.startswith("  crm-dashboard:"):
        dentro = True
    elif dentro and l.startswith("  ") and not l.startswith("    "):
        dentro = False
    if dentro and l.strip() == "ports:":
        lineas[i:i] = [
            "    volumes:",
            f"      - {publico}:/usr/share/nginx/html/estado-servidor:ro",
        ]
        break
else:
    sys.exit("No encontré 'ports:' en crm-dashboard; añade el volumen a mano.")
open(ruta, "w").write("\n".join(lineas))
PY
  echo "compose: volumen añadido (copia de seguridad junto al archivo)"
else
  echo "compose: ya tenía el volumen"
fi

/usr/bin/python3 "$REPO/deploy/estado-servidor/estado.py"
echo "Primera foto escrita en $PUBLICO/estado.json"
