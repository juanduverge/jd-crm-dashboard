# T05 + T07 · Botón Publicar y estados

**Hecho por:** Claude (Juan pidió que no lo hiciera ChatGPT) · **Estado:** HECHA · 20-oct-2026

## Qué hay
- **GitHub Action** `jd-developer-site/.github/workflows/publicar.yml`: compila con los artículos de
  Supabase y despliega el Worker. Solo `workflow_dispatch` (desde el CRM o «Run workflow»); un push
  no publica. Secretos: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- **Edge Function `cms-publicar`** (solo admin): publicar / despublicar (→ archivado) / reconstruir.
  Cambia el estado, apunta la fila en `cms_publicaciones` con un código de un solo uso y lanza la
  Action. Si GitHub no acepta, devuelve el artículo a su estado anterior.
  Secreto: `GITHUB_TOKEN_PUBLICAR` (fine-grained, solo jd-developer-site, Actions: read/write,
  caduca el 20-oct-2027).
- **Edge Function `cms-publicacion-estado`** (pública, protegida por el código): la Action avisa
  compilando → ok / fallo.
- **Migración 0059**: `aviso_hash`, `accion`, `iniciado_en` en `cms_publicaciones`.
- **CRM**: botón principal según el estado (Pasar a borrador → Enviar a revisión → Publicar /
  Programar → Actualizar la web / Retirar), aviso «Publicando… / Web actualizada / Falló».

## Prueba de punta a punta (20-oct, 19:38)
«Actualizar la web» desde el CRM: pedido 19:38:16 → GitHub empezó 19:38:24 → ok 19:40:06.

## Pendiente
- «Programar» guarda la fecha, pero **todavía nada publica a esa hora**: falta el workflow de n8n
  (T10), que necesitará poder llamar a `cms-publicar` como sistema.
