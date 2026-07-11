# CI/CD — Despliegue automático del CRM

> Antes: cada cambio requería subir `src/` al servidor y reconstruir a mano por SSH.
> Ahora: `git push` a `main` construye, verifica y despliega solo.

## Estrategia (por qué así)

**Contexto:** el dashboard se construye en el servidor Oracle desde `dashboard-src`
(copia del código, no un clon de git). El repo es privado. n8n y Postgres corren en el
mismo Docker Compose y **no deben tocarse** en un deploy.

**Decisión:** GitHub Actions replica el proceso manual seguro que ya validamos —
sube `src/`, reconstruye **solo** el contenedor `crm-dashboard`. No migramos el server
a git-clone (añadiría deploy keys y complejidad) porque el método actual ya funciona y
es mínimo. Cuando migremos a Postgres/CI más maduro, se puede evolucionar a build de
imagen en el registry.

## Dos workflows

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `.github/workflows/ci.yml` | cada push/PR a main | `npm ci` + typecheck + build. Red de seguridad. |
| `.github/workflows/deploy.yml` | push a main que toca el frontend (o manual) | CI + sube `src/` + rebuild del dashboard + verifica. |

## ⚠️ Pasos de Juan (una sola vez) para activarlo

En GitHub: repo **jd-crm-dashboard** → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**. Añade estos 3:

| Secret | Valor |
|---|---|
| `SSH_HOST` | `129.159.191.41` |
| `SSH_USER` | `ubuntu` |
| `SSH_KEY` | El contenido **completo** de la clave privada SSH (el archivo `n8n-oracle/Private key.key`, desde `-----BEGIN…` hasta `…END-----`) |

Hasta que existan, el deploy fallará en el paso SSH con un mensaje claro (el CI sí corre).

## Cómo se usa (después de añadir los secretos)
1. Haces cambios en el CRM y `git push` a `main`.
2. GitHub Actions compila, verifica y despliega a Oracle automáticamente.
3. Ves el progreso en la pestaña **Actions** del repo.
4. También puedes lanzarlo a mano con **Run workflow** (workflow_dispatch).

## Reversión
El deploy respalda el `src` anterior en `dashboard-src/src.bak` en cada corrida.
Para revertir: SSH al server → `cd dashboard-src && rm -rf src && mv src.bak src` →
`cd /home/ubuntu/jd-prod && docker compose build crm-dashboard && docker compose up -d crm-dashboard`.

## Mantenimiento / mejora futura
- **Seguridad de la clave:** usa una clave SSH dedicada de deploy (no la personal) con
  acceso solo a este servidor. Rótala si se filtra.
- Cuando el server pase a git-clone o a un registry de imágenes, el paso de "subir src"
  se reemplaza por `git pull` o `docker pull` sin cambiar el resto.
- Añadir un healthcheck HTTP real post-deploy (hoy solo comprueba que el contenedor está Up).
