# Fase 2 — Base sólida: Seguridad, Auth y Conexión Web↔CRM

> Continuación de `docs/AUDITORIA_TECNICA.md`. Este documento fija las decisiones
> de arquitectura de la Fase 2, registra los cambios ya aplicados y detalla los
> pasos manuales (los que requieren tus cuentas de Cloudflare / Oracle / n8n).

---

## Decisiones de CTO (justificadas)

**Contexto:** alcance = **solo equipo interno** (tú + empleados), presupuesto = **coste cero**.

### Decisión 1 — Autenticación: Cloudflare Access (no construir auth de contraseñas)
Construir registro/reset/verificación/2FA de contraseñas sería **sobre-ingeniería** para un equipo interno. Con **Cloudflare Access** (gratis hasta 50 usuarios) la identidad la provee Google/OTP y desaparecen esos flujos:

| Requisito pedido | Cómo lo cubre Access |
|---|---|
| Google Sign-In | Nativo |
| Registro de usuarios | Añadir email a la política (segundos) |
| Recuperación/cambio/verificación de contraseña | **N/A** — no hay contraseña |
| Sesiones seguras, logout, recordar sesión | Nativo (JWT firmado, TTL configurable) |
| Fuerza bruta / bloqueo temporal | Nativo |
| Roles (admin/vendedor/viewer) | Se mapea email→rol en la app |

**Beneficio colateral:** cierra los 3 bloqueadores críticos de la auditoría a la vez, porque nadie carga siquiera la SPA (ni el bundle con la API key) sin pasar Access.

**Supabase** queda reservado para cuando se abra **portal de clientes externos** (usuarios de producto reales). No antes: añadiría un Postgres y complejidad que hoy no aportan valor.

### Decisión 2 — Infra como código versionada
La config real de nginx/Docker vivía en `n8n-migracion/` (gitignorado) → la infra **no estaba en Git**. Se crea `deploy/` versionado como fuente de verdad.

### Decisión 3 — La API key de n8n sale del cliente (roadmap, no inmediato)
A medio plazo, nginx (o un backend delgado) proxia `/n8n-api` inyectando `X-N8N-API-KEY` server-side, para que deje de estar en el bundle. Requiere reconfigurar el frontend para llamar a una ruta relativa. Planificado en "Próxima fase".

---

## Cambios YA aplicados en esta sesión

| Archivo | Qué cambió | Por qué |
|---|---|---|
| `.gitignore` | Ignora `n8n-oracle/`, `*.key`, `*.pem`, `credentials.json`, `encryption-key.txt`, `graphify-out/` | La clave SSH privada (`n8n-oracle/Private key.key`) estaba **sin ignorar** — un `git add .` la habría subido a GitHub. Verificado: nunca llegó a trackearse. |
| `deploy/nginx.conf` | nginx endurecido: HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP, **CSP**, `server_tokens off`, bloqueo de dotfiles | El nginx de producción no tenía **ninguna** cabecera de seguridad. Ahora es la fuente de verdad versionada. |
| `.env.example` | Advertencias explícitas de que `VITE_*` es público; quita la contraseña real de ejemplo; apunta n8n a HTTPS | Los comentarios anteriores normalizaban poner secretos en el cliente. |

**Ningún cambio es destructivo** y ninguno toca lógica de negocio ni la UI.

### Cómo mantenerlo
- El `deploy/nginx.conf` es la fuente de verdad: al desplegar, el Dockerfile debe copiar **este** archivo, no la copia suelta.
- Si añades un dominio nuevo al que el frontend llama (p. ej. una API propia), actualiza `connect-src` en la CSP.

---

## Pasos manuales que debes hacer tú (requieren tus cuentas)

### A. Cloudflare Access (≈10 min, cierra los 3 críticos hoy)
1. Cloudflare Dashboard → **Zero Trust** → Access → **Applications** → Add application → **Self-hosted**.
2. Application domain: `workspace.jddeveloper.com`.
3. Identity provider: añade **Google** (o "One-time PIN" por email si no quieres configurar Google aún).
4. Policy: **Allow** → Include → *Emails* → lista los correos del equipo (`juanmanuelduverge@gmail.com`, etc.). Esto es tu "registro de usuarios".
5. Repite para `backoffice.jddeveloper.com` (el editor de n8n) — **igual de crítico**, hoy está abierto.
6. Sesión: Session Duration = p. ej. 24h ("recordar sesión").

Tras esto: cualquier visita a esos dominios exige login Google/OTP antes de servir nada.

### B. Forzar `X-CRM-TOKEN` en los webhooks de escritura (n8n)
En cada webhook de escritura/envío/scraping (`crm-sheets-write`, `crm-send-reply`, `crm-buscar-leads`, `crm-generate-ai`), añade un nodo IF al inicio que rechace (`403`) si el header `X-CRM-TOKEN` no coincide con el valor de config. Pon ese valor en `VITE_N8N_HOOK_TOKEN` (build) y en n8n.

### C. Backups automáticos
Cron diario en el servidor Oracle: `pg_dump` del Postgres de n8n → subir a almacenamiento externo (R2/S3). Y export semanal del Google Sheet.

### D. Completar pendientes heredados
DMARC (`rua`), `direccion_fisica`, `n8n_public_url` (ver `ESTADO.md`).

---

## Formulario web pública → CRM (arquitectura limpia)

**Objetivo:** el formulario de contacto de `jddeveloper.com` crea un lead en el CRM, sin duplicados, con trazabilidad.

**Arquitectura recomendada (desacoplada, coste cero):**

```
Formulario web (jddeveloper.com)
      │  POST fetch()
      ▼
Webhook n8n dedicado:  crm-web-lead   (NUEVO, público pero con:)
      │   - honeypot anti-spam + Cloudflare Turnstile (gratis)
      │   - rate limit
      │   - validación de campos
      ▼
Dedup por email en hoja `prospects` (buscar antes de append)
      ▼
Append con metadatos:
   fecha_hora, fuente="web", url_origen, formulario="contacto",
   estado_inicial="nuevo", utm_* si vienen
      ▼
(futuro) dispara automatización de bienvenida / notificación
```

**Por qué así:**
- **Desacoplado:** la web no conoce el CRM; solo postea a un webhook. Si mañana cambias de backend, cambias un endpoint.
- **Anti-duplicados:** el workflow busca el email en `prospects` antes de crear; si existe, actualiza `ultimo_contacto` en vez de duplicar.
- **Anti-spam:** honeypot + Turnstile (widget gratis de Cloudflare) frenan bots sin fricción para humanos.
- **Escalable:** cuando exista el backend propio, este webhook se reemplaza por un endpoint del backend sin tocar la web (misma forma de payload).

**Conexión con GitHub/deploy:** el código del formulario vive en el repo de la web (Webflow tiene su propio flujo). Si la web es un proyecto en este mismo repo o en otro, el endpoint del webhook se configura por variable de entorno, y el deploy no cambia. **No mezclar** el deploy de la web con el del CRM: son artefactos distintos.

> Este formulario es una **feature nueva** — según la regla de "auditoría continua" (abajo), no se implementa hasta cerrar los ítems críticos de seguridad. Queda especificado y listo para ejecutar en la fase actual, después de A/B/C.

---

## Roadmap actualizado

### 🔴 Fase actual (ahora — base de seguridad)
1. **Cloudflare Access** en `workspace` y `backoffice` (paso A). — *tú, 10 min*
2. **Forzar token** en webhooks de escritura (paso B). — *tú/n8n*
3. **Backups automáticos** Postgres + Sheets (paso C). — *tú, servidor*
4. ✅ Infra versionada + nginx endurecido + higiene de secretos — *hecho esta sesión*
5. **Formulario web → CRM** con dedup + anti-spam (spec arriba) — *implementable ya tras 1–3*

### 🟠 Próxima fase (base técnica)
6. **Sacar `VITE_N8N_API_KEY` del bundle** → proxy server-side en nginx.
7. **CI/CD GitHub Actions** (CI en push + CD a Oracle).
8. **Rate limiting** en webhooks + cap al `max` de Apify.
9. **Monitoreo + alertas** (UptimeRobot/Healthchecks + logs centralizados).
10. **Mapeo email→rol** en el frontend leyendo la identidad de Access (RBAC real aplicado).

### 🟡 Futuras versiones (valor a largo plazo)
11. **Migrar datos CRM: Sheets → Postgres** (transacciones, concurrencia, agregaciones server-side).
12. **Portal de clientes externos** → aquí sí entra **Supabase Auth** (usuarios de producto, RLS por cliente).
13. **Facturación (Stripe)** y multi-tenant.
14. **Ideas de valor nuevas:**
    - **Lead scoring con IA en tiempo real** al entrar por el formulario (ya tienes Claude en n8n) → prioriza automáticamente.
    - **Panel de deliverability** (tasa de rebote/spam por dominio) para proteger la reputación de envío.
    - **Plantillas de automatización versionadas** (workflows n8n exportados a Git y desplegados por CI) → infra de automatización reproducible.
    - **Auditoría/log de acciones** (quién movió qué lead) — imprescindible al haber varios usuarios.

---

## Proceso de auditoría continua (obligatorio antes de cada feature nueva)
Antes de implementar cualquier funcionalidad, se evalúa y documenta:
1. ¿Ya existe una solución/parte reutilizable?
2. Impacto técnico (complejidad, deuda).
3. Impacto en **seguridad** (¿nueva superficie de ataque? ¿secretos?).
4. Impacto en **rendimiento** (¿más llamadas a Sheets/n8n?).
5. Impacto en **escalabilidad** (¿aguanta más usuarios/datos?).
6. Impacto en **mantenimiento** (¿quién lo mantiene, cómo se versiona?).

Solo tras ese análisis se implementa. Este documento y `AUDITORIA_TECNICA.md` son el registro vivo de esas decisiones.
</content>
