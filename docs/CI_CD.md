# CI/CD — Cómo se publica el CRM

## Dónde corre

El CRM, n8n y Postgres corren en el **servidor de casa**
(`jd-developer-home-service`, `192.168.18.26`), en `~/jd-prod`, y salen a internet
por el túnel de Cloudflare (`workspace.jddeveloper.com`, detrás de Access).

El servidor de Oracle Cloud (`129.159.191.41`) quedó bloqueado por Oracle el
31-ago-2026 y se retiró el 28-sep-2026: ya no hay nada que publique ahí.

## Qué hace GitHub

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `.github/workflows/ci.yml` | cada push/PR a main | `npm ci` + typecheck + build. Red de seguridad. |

**Un push a `main` NO publica nada.** GitHub no puede llegar al servidor de casa,
que está en la red local.

## Cómo publicar

Desde el portátil, en la misma red que el servidor y después de hacer push:

```bash
bash deploy/publicar.sh
```

El script entra por SSH (`~/.ssh/jd_home_service`), hace `git pull` del clon en
`~/jd-crm-dashboard` y reconstruye **solo** el contenedor `crm-dashboard`. n8n y
Postgres no se tocan.

A mano es lo mismo:

```bash
ssh -i ~/.ssh/jd_home_service juanduverge@192.168.18.26
cd ~/jd-crm-dashboard && git pull --ff-only origin main
cd ~/jd-prod && docker compose -f docker-compose.dominio.yml up -d --build crm-dashboard
```

Ojo: los `VITE_*` son build-args en `~/jd-prod/docker-compose.dominio.yml`. Un valor
de negocio (teléfono, correos) hay que cambiarlo también ahí, no solo en el repo.

## Reversión

En el servidor: `cd ~/jd-crm-dashboard && git checkout <commit-bueno>` y volver a
lanzar el `docker compose … up -d --build crm-dashboard`. Al terminar,
`git checkout main` para que el próximo `git pull` funcione.
