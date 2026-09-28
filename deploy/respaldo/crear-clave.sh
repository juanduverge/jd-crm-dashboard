#!/usr/bin/env bash
# Genera la contrasena del usuario `respaldo` (migracion 0049). Se lanza UNA
# vez, en el servidor de casa:
#
#   bash ~/jd-crm-dashboard/deploy/respaldo/crear-clave.sh
#
# Guarda la contrasena en ~/jd-backups/.supabase-respaldo (solo legible por ti)
# e imprime una linea ALTER ROLE con la contrasena YA CIFRADA (SCRAM). Esa
# linea se pega en Supabase -> SQL Editor -> Run. La contrasena en claro no
# sale nunca del servidor.
set -euo pipefail
umask 077
f="$HOME/jd-backups/.supabase-respaldo"
if [ -s "$f" ]; then
  echo "Ya existe $f. Para regenerarla, borralo primero." >&2
  grep '^VERIFICADOR=' "$f" | cut -d= -f2- | sed "s/.*/alter role respaldo password '&';/"
  exit 0
fi
python3 - "$f" <<'PY'
import secrets, hashlib, hmac, base64, sys
pw = secrets.token_urlsafe(32)
salt = secrets.token_bytes(16); it = 4096
salted = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, it)
ck = hmac.new(salted, b"Client Key", "sha256").digest()
sk = hmac.new(salted, b"Server Key", "sha256").digest()
b = lambda x: base64.b64encode(x).decode()
ver = f"SCRAM-SHA-256${it}:{b(salt)}${b(hashlib.sha256(ck).digest())}:{b(sk)}"
open(sys.argv[1], "w").write(f"PGPASSWORD={pw}\nVERIFICADOR={ver}\n")
PY
chmod 600 "$f"
echo "Contrasena guardada en $f. Pega esta linea en Supabase -> SQL Editor -> Run:"
echo
grep '^VERIFICADOR=' "$f" | cut -d= -f2- | sed "s/.*/alter role respaldo password '&';/"
