#!/usr/bin/env python3
"""Foto del estado del servidor de casa para la pantalla «Servidor» del CRM.

Lo lanza cron cada minuto en el servidor (ver instalar.sh) y deja un JSON en
~/servidor/publico/estado.json. Esa carpeta está montada, solo lectura, dentro
del contenedor del CRM, así que el navegador la lee como /estado-servidor/estado.json
detrás del mismo Cloudflare Access que el resto del CRM.

Por qué un JSON escrito por cron y no una API: el contenedor del CRM no puede
(ni debe) ver el socket de Docker. Dárselo sería darle root sobre la máquina.
Así el CRM solo lee un archivo y nada de lo que pase en el navegador toca el servidor.

Solo usa la librería estándar: el servidor tiene python3 y no hay que instalar nada.
No incluye variables de entorno, puertos ni rutas con secretos.
"""
import json
import os
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

HOME = Path.home()
SALIDA = HOME / "servidor" / "publico" / "estado.json"
CACHE_CARPETAS = HOME / "servidor" / "cache-carpetas.json"
# du sobre 40 GB tarda; las carpetas no cambian de tamaño cada minuto.
CARPETAS_CADA_SEG = 3600


def ejecutar(cmd, timeout=20):
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return r.stdout
    except Exception:
        return ""


def leer(ruta, defecto=None):
    try:
        return Path(ruta).read_text().strip()
    except Exception:
        return defecto


def cpu_pct():
    def muestra():
        campos = [int(x) for x in leer("/proc/stat").splitlines()[0].split()[1:]]
        inactivo = campos[3] + campos[4]
        return inactivo, sum(campos)

    i1, t1 = muestra()
    time.sleep(1)
    i2, t2 = muestra()
    total = t2 - t1
    return round(100 * (1 - (i2 - i1) / total), 1) if total else 0.0


def memoria():
    info = {}
    for linea in leer("/proc/meminfo", "").splitlines():
        clave, valor = linea.split(":", 1)
        info[clave] = int(valor.split()[0]) * 1024
    return {
        "total": info.get("MemTotal", 0),
        "disponible": info.get("MemAvailable", 0),
        "swap_total": info.get("SwapTotal", 0),
        "swap_libre": info.get("SwapFree", 0),
    }


def disco(ruta="/"):
    s = os.statvfs(ruta)
    total = s.f_blocks * s.f_frsize
    libre = s.f_bavail * s.f_frsize
    return {"total": total, "libre": libre, "usado": total - s.f_bfree * s.f_frsize}


def temperatura():
    # x86_pkg_temp es la del procesador; las acpitz dan valores raros (0) en este portátil.
    for zona in sorted(Path("/sys/class/thermal").glob("thermal_zone*")):
        if leer(zona / "type") == "x86_pkg_temp":
            t = leer(zona / "temp")
            return round(int(t) / 1000, 1) if t else None
    return None


def bateria():
    base = Path("/sys/class/power_supply")
    bat = next(iter(sorted(base.glob("BAT*"))), None)
    ac = leer(base / "AC" / "online")
    return {
        "enchufado": ac == "1" if ac is not None else None,
        "carga": int(leer(bat / "capacity", "0")) if bat else None,
        "estado": leer(bat / "status") if bat else None,
    }


def a_bytes(texto):
    """'67.32MiB' -> bytes. docker stats da unidades binarias y decimales mezcladas."""
    texto = texto.strip()
    unidades = {
        "KiB": 1024, "MiB": 1024**2, "GiB": 1024**3, "TiB": 1024**4,
        "kB": 1000, "KB": 1000, "MB": 1000**2, "GB": 1000**3, "TB": 1000**4, "B": 1,
    }
    for u in sorted(unidades, key=len, reverse=True):
        if texto.endswith(u):
            try:
                return int(float(texto[: -len(u)]) * unidades[u])
            except ValueError:
                return 0
    return 0


def contenedores():
    lista = []
    for linea in ejecutar(["docker", "ps", "-a", "--format", "{{json .}}"]).splitlines():
        try:
            c = json.loads(linea)
        except ValueError:
            continue
        etiquetas = dict(
            e.split("=", 1) for e in c.get("Labels", "").split(",") if "=" in e
        )
        estado_txt = c.get("Status", "")
        salud = None
        if "(healthy)" in estado_txt:
            salud = "sano"
        elif "(unhealthy)" in estado_txt:
            salud = "enfermo"
        elif "(health: starting)" in estado_txt:
            salud = "arrancando"
        lista.append({
            "nombre": c.get("Names", ""),
            "imagen": c.get("Image", ""),
            "estado": c.get("State", ""),
            "detalle": estado_txt,
            "salud": salud,
            "proyecto": etiquetas.get("com.docker.compose.project") or "suelto",
            "servicio": etiquetas.get("com.docker.compose.service"),
            "creado": c.get("CreatedAt", ""),
        })

    stats = {}
    for linea in ejecutar(
        ["docker", "stats", "--no-stream", "--format", "{{json .}}"], timeout=30
    ).splitlines():
        try:
            s = json.loads(linea)
        except ValueError:
            continue
        uso = s.get("MemUsage", "").split("/")
        stats[s.get("Name")] = {
            "cpu": float(s.get("CPUPerc", "0%").rstrip("%") or 0),
            "ram": a_bytes(uso[0]) if uso else 0,
            "ram_limite": a_bytes(uso[1]) if len(uso) > 1 else 0,
        }
    for c in lista:
        c.update(stats.get(c["nombre"], {"cpu": None, "ram": None, "ram_limite": None}))
    return lista


def espacio_docker():
    filas = []
    for linea in ejecutar(["docker", "system", "df", "--format", "{{json .}}"]).splitlines():
        try:
            d = json.loads(linea)
        except ValueError:
            continue
        recuperable = d.get("Reclaimable", "").split(" ")[0]
        filas.append({
            "tipo": d.get("Type", ""),
            "total": int(d.get("TotalCount", 0) or 0),
            "activos": int(d.get("Active", 0) or 0),
            "tamano": a_bytes(d.get("Size", "0B")),
            "recuperable": a_bytes(recuperable),
        })
    return filas


def carpetas():
    """Tamaño de cada carpeta del home. Se recalcula como mucho una vez por hora."""
    try:
        cache = json.loads(CACHE_CARPETAS.read_text())
        if time.time() - cache.get("calculado", 0) < CARPETAS_CADA_SEG:
            return cache
    except Exception:
        pass
    filas = []
    for p in sorted(HOME.iterdir()):
        if p.name.startswith(".") or not p.is_dir():
            continue
        # Algunas carpetas tienen datos de Postgres de otro usuario: du avisa
        # y sigue, y el total que da es lo que sí puede leer.
        salida = ejecutar(["du", "-sb", str(p)], timeout=120)
        try:
            tam = int(salida.split()[0])
        except (IndexError, ValueError):
            tam = None
        try:
            modificada = datetime.fromtimestamp(p.stat().st_mtime, timezone.utc).isoformat()
        except Exception:
            modificada = None
        filas.append({"nombre": p.name, "tamano": tam, "modificada": modificada})
    resultado = {"calculado": time.time(), "lista": filas}
    try:
        CACHE_CARPETAS.write_text(json.dumps(resultado))
    except Exception:
        pass
    return resultado


def copias():
    base = HOME / "jd-backups"
    dias = sorted(
        (p for p in base.iterdir() if p.is_dir() and p.name[:2] == "20"),
        reverse=True,
    ) if base.exists() else []
    ultima = None
    if dias:
        d = dias[0]
        ultima = {
            "dia": d.name,
            "hora": datetime.fromtimestamp(d.stat().st_mtime, timezone.utc).isoformat(),
            "archivos": [
                {"nombre": f.name, "tamano": f.stat().st_size}
                for f in sorted(d.iterdir()) if f.is_file()
            ],
        }
    # ultimo-estado lo escribe backup.sh como "<día> <código de salida>".
    resultado = (leer(base / "ultimo-estado", "") or "").split()
    return {
        "ultima": ultima,
        "dias_guardados": len(dias),
        "codigo_salida": int(resultado[1]) if len(resultado) > 1 and resultado[1].isdigit() else None,
        "vigilante": leer(base / "estado-vigilante"),
    }


def sistema_operativo():
    for linea in (leer("/etc/os-release", "") or "").splitlines():
        if linea.startswith("PRETTY_NAME="):
            return linea.split("=", 1)[1].strip('"')
    return None


def main():
    uptime = float(leer("/proc/uptime", "0").split()[0])
    carga = [float(x) for x in leer("/proc/loadavg", "0 0 0").split()[:3]]
    estado = {
        "version": 1,
        "generado": datetime.now(timezone.utc).isoformat(),
        "equipo": {
            "nombre": socket.gethostname(),
            "sistema": sistema_operativo(),
            "kernel": os.uname().release,
            "ip": (ejecutar(["hostname", "-I"]).split() or [None])[0],
            "nucleos": os.cpu_count(),
            "encendido_seg": int(uptime),
            "carga": carga,
            "cpu": cpu_pct(),
            "memoria": memoria(),
            "disco": disco("/"),
            "temperatura": temperatura(),
            "bateria": bateria(),
        },
        "contenedores": contenedores(),
        "docker": espacio_docker(),
        "carpetas": carpetas(),
        "copias": copias(),
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    # Escribir y renombrar: el navegador nunca lee un JSON a medias.
    tmp = SALIDA.with_suffix(".tmp")
    tmp.write_text(json.dumps(estado, ensure_ascii=False))
    tmp.chmod(0o644)
    tmp.replace(SALIDA)


if __name__ == "__main__":
    main()
