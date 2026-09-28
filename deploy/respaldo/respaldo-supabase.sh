#!/usr/bin/env bash
# Copia de la base de Supabase (esquema public: tablas, datos, funciones,
# politicas). La llama ~/jd-backups/backup.sh cada noche con el directorio del
# dia como argumento. Sale 0 si todo fue bien o si aun no hay credencial
# (entonces solo avisa), y 1 si habia credencial y la copia fallo.
#
# pg_dump va en el contenedor postgres:17 para coincidir con Supabase (17): un
# cliente mas viejo se niega a volcar un servidor mas nuevo.
set -uo pipefail
DIR="${1:?falta el directorio de destino}"
CRED="$HOME/jd-backups/.supabase-respaldo"
PROYECTO="octzlhcwqlvxzrjgaptk"

if [ ! -s "$CRED" ]; then
  echo "AVISO copia de Supabase pendiente: falta $CRED (ver deploy/respaldo/crear-clave.sh)"
  exit 0
fi
PGPASSWORD="$(grep '^PGPASSWORD=' "$CRED" | cut -d= -f2-)"

# El pooler en modo sesion (5432) habla IPv4; la conexion directa de Supabase
# es solo IPv6. No se sabe de antemano en cual de los dos vive el proyecto.
for HOST in aws-0-ca-central-1.pooler.supabase.com aws-1-ca-central-1.pooler.supabase.com; do
  if docker run --rm -e PGPASSWORD="$PGPASSWORD" postgres:17 \
       pg_dump -h "$HOST" -p 5432 -U "respaldo.$PROYECTO" -d postgres \
       --schema=public --no-owner --no-privileges 2>"$DIR/supabase.err" \
     | gzip > "$DIR/supabase-db.sql.gz" \
     && [ "$(stat -c%s "$DIR/supabase-db.sql.gz")" -gt 10000 ]; then
    rm -f "$DIR/supabase.err"
    echo "OK  base Supabase ($HOST) -> $(du -h "$DIR/supabase-db.sql.gz" | cut -f1)"
    exit 0
  fi
done
echo "FALLO copia de Supabase: $(tail -1 "$DIR/supabase.err" 2>/dev/null)"
exit 1
