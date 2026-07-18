# Deploy a Hostinger — jddeveloper.com/crm

El CRM es una SPA estática (Vite). Se compila a `/dist` y se sube a Hostinger
bajo el subdirectorio `/crm`.

## 1. Build de producción

```bash
npm run build
```

Genera `/dist`. El proyecto usa `base: './'` en `vite.config.ts`, por lo que
las rutas de assets son relativas y funcionan en cualquier subcarpeta.

## 2. Variables de entorno en producción

Las variables `VITE_*` se **embeben en el build**. Antes de compilar, asegúrate
de que `.env` tenga los valores de producción:

- `VITE_N8N_URL` debe ser una URL **pública HTTPS** (no `localhost`).
  Ej.: `https://n8n.jddeveloper.com`. n8n debe ser accesible desde el navegador
  del cliente, o exponerse mediante un reverse proxy / túnel.
- `VITE_GOOGLE_API_KEY` con restricción por dominio (`jddeveloper.com`).
- `VITE_APP_PASSWORD` con la contraseña real.

> ⚠️ Recuerda: cualquier variable `VITE_*` queda visible en el bundle del cliente.
> No pongas secretos de servidor (usa n8n como backend para esos).

## 3. Subir a Hostinger

### Opción A — File Manager (panel hPanel)
1. Entra a hPanel → **Administrador de archivos**.
2. Ve a `public_html/` y crea la carpeta `crm/`.
3. Sube **todo el contenido de `/dist`** (no la carpeta `dist` en sí) dentro de `public_html/crm/`.
4. Verifica que `public_html/crm/.htaccess` exista (viene incluido desde `/public/.htaccess`).

### Opción B — FTP (FileZilla)
1. Conéctate con tus credenciales FTP de Hostinger.
2. Sube el contenido de `/dist` a `/public_html/crm/`.

## 4. Routing SPA (.htaccess)

El archivo `.htaccess` ya se incluye en el build (`public/.htaccess` → `dist/.htaccess`):

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /crm/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /crm/index.html [L]
</IfModule>
```

Esto hace que las rutas internas (`/crm/leads`, `/crm/pipeline`, …) carguen la SPA
en vez de devolver 404.

## 5. Verificación

- Visita **https://jddeveloper.com/crm** → debe cargar el login.
- Navega entre tabs y recarga la página en una ruta interna (debe seguir funcionando).
- Revisa la consola del navegador por errores de mixed-content (HTTP vs HTTPS).

## 6. Actualizaciones futuras

Cada vez que cambies código:

```bash
npm run build
# Sube de nuevo el contenido de /dist a public_html/crm/
```

> Tip: puedes automatizar el deploy con GitHub Actions + FTP-Deploy una vez que el
> repo esté en GitHub (ver ROADMAP).
