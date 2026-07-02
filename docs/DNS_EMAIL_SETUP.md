# DNS_EMAIL_SETUP.md — Autenticación de email para jddeveloper.com

Fase 7 (Blindaje). Este documento es una guía de copiar-y-pegar para Juan. Claude **no tiene credenciales de Hostinger** y no puede acceder al panel — todos los cambios de DNS deben hacerse manualmente por Juan. Tiempo estimado: ~10 minutos.

Estado verificado por consulta DNS directa (`nslookup`) el 2026-07-02.

## 1. SPF — ✅ Ya configurado correctamente

No requiere ninguna acción. El registro TXT en la raíz del dominio ya existe y es correcto para Hostinger:

```
v=spf1 include:_spf.mail.hostinger.com include:_spf.reach.hostinger.com ~all
```

> Nota: el brief original de esta fase asumía un valor de SPF distinto/genérico de Hostinger. Se verificó el registro real vía DNS y ya está bien configurado — no lo toques ni lo dupliques (tener dos registros SPF en el mismo dominio rompe la validación).

## 2. DKIM — ✅ Ya está activo

También verificado por consulta DNS directa — Hostinger ya está firmando el dominio con DKIM. Selector activo:

```
hostingermail1._domainkey.jddeveloper.com
```

Esto confirma que DKIM está **activado en el panel de Hostinger** para jddeveloper.com. No se requiere ninguna acción adicional aquí tampoco.

Si en algún momento quieres volver a verificarlo manualmente en el panel: Hostinger → Emails → tu dominio → Configuración DNS / Autenticación de email → debería mostrar DKIM como "Activo".

## 3. DMARC — ⚠️ Acción recomendada (opcional pero recomendada)

Registro actual:

```
_dmarc.jddeveloper.com TXT "v=DMARC1; p=none"
```

Esto ya existe y es válido, pero le falta la dirección de reporte (`rua`) y el porcentaje explícito. Se recomienda actualizarlo a:

```
Tipo:  TXT
Host:  _dmarc
Valor: v=DMARC1; p=none; rua=mailto:info@jddeveloper.com; pct=100
TTL:   Auto / 3600
```

### Pasos exactos en Hostinger:
1. Entra a hPanel → **Dominios** → `jddeveloper.com` → **DNS / Nameservers**.
2. Busca el registro TXT existente con host `_dmarc`.
3. Edítalo (no crees uno nuevo — solo debe haber un registro DMARC por dominio) y reemplaza el valor por:
   `v=DMARC1; p=none; rua=mailto:info@jddeveloper.com; pct=100`
4. Guarda. La propagación normalmente tarda entre unos minutos y unas horas.

`p=none` significa modo de solo observación (no bloquea ni pone en spam nada todavía) — es lo correcto para empezar. Cuando quieras endurecer la política más adelante (a `p=quarantine` o `p=none`), avísame y lo evaluamos con los reportes que lleguen a `info@jddeveloper.com`.

## 4. Verificación de propagación

Cuando hagas el cambio de DMARC, avísame y verifico la propagación por DNS con:

```
nslookup -type=TXT _dmarc.jddeveloper.com
```

## Resumen para Juan

| Registro | Estado | Acción requerida |
|---|---|---|
| SPF | ✅ Correcto | Ninguna |
| DKIM | ✅ Activo (selector `hostingermail1`) | Ninguna |
| DMARC | ⚠️ Existe pero incompleto | Editar el TXT `_dmarc` con el valor de arriba (~2 min en el panel de Hostinger) |
