# Robot de contactos

Lee la web de un lead y saca correos, teléfonos, WhatsApp y redes. Sustituye
a la parte «Company contacts enrichment» de Apify. Corre en el servidor de
casa, sin IA y sin coste.

## Cómo encaja

```
CRM (botón «Buscar contactos en su web» o «Desde Google Maps»)
  → cola contactos_web en Supabase (migración 0070)
  → este robot la lee cada 15 s, de uno en uno
  → guarda con enriquecer_lead (suma, nunca pisa)
```

El enlace de Google Maps lo resuelve la Edge Function `importar-desde-maps`
(API oficial de Google Places, secreto `GOOGLE_PLACES_KEY`).

## Dónde vive

`~/jd-contactos` en el servidor de casa, **fuera de git** como `~/jd-wa`:
copiar los archivos de aquí antes de reconstruir.

```bash
scp contactos-web/{robot.py,Dockerfile,docker-compose.yml} juanduverge@192.168.18.26:~/jd-contactos/
ssh juanduverge@192.168.18.26 'cd ~/jd-contactos && docker compose up -d --build'
docker logs -f jd-contactos-robot
# Probar una web sin tocar Supabase:
docker compose run --rm robot python robot.py prueba https://una-web.com
```

`.env`: `SUPABASE_URL` y `SUPABASE_SERVICE_KEY`, los mismos que `~/jd-wa`.

## Estados que deja en `leads.enrichment_status`

| Estado | Qué significa |
|---|---|
| `ok` | Encontró contactos (aunque el lead ya los tuviera) |
| `sin_datos` | La web carga pero no publica ninguno |
| `web_caida` | La web no responde |
| `dominio_aparcado` | Página de relleno del hosting: el negocio no tiene web real |
| `robots_prohibe` | Su robots.txt no permite leerla |
| `error` | Falló 3 veces seguidas |

## Recuperar leads que Apify dejó a medias

```sql
select contactos_web_encolar_pendientes(200);  -- solo admin
```
