#!/usr/bin/env python3
"""
Robot de contactos: lee la web de un negocio y saca sus correos, teléfonos,
WhatsApp y redes sociales. Es lo que hacía Apify («Company contacts
enrichment»), pero corriendo en el servidor de casa y sin coste.

CÓMO TRABAJA
  1. Pide un trabajo a la cola `contactos_web` de Supabase (migración 0070).
  2. Abre la portada de la web. Si sale vacía (webs de Wix y similares que
     pintan todo con JavaScript) o el servidor rechaza la descarga simple, la
     abre con un navegador de verdad (Chromium vía Playwright).
  3. Visita hasta MAX_PAGINAS páginas internas que suenen a contacto
     (contacto, about, nosotros, equipo…).
  4. Guarda lo encontrado con `enriquecer_lead`, que suma sin pisar lo que ya
     tenía el lead, y marca el trabajo como hecho.

Va de uno en uno a propósito: el servidor de casa comparte máquina con n8n y
el Android del verificador. Un trabajo tarda unos segundos; no hay prisa que
justifique tener varios navegadores abiertos a la vez.

Sin IA: solo reglas fijas. 0 tokens, 0 €.
"""

import html as htmlmod
import json
import os
import re
import sys
import time
import urllib.robotparser
from urllib.parse import urljoin, urlparse, unquote, parse_qs

import requests
from bs4 import BeautifulSoup

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ESPERA = int(os.environ.get("ESPERA", "15"))          # segundos entre consultas a la cola si está vacía
MAX_PAGINAS = int(os.environ.get("MAX_PAGINAS", "5"))  # páginas internas además de la portada
PAUSA = float(os.environ.get("PAUSA", "1.0"))          # pausa entre páginas del mismo sitio
LATIDO = "/tmp/latido"                                # para el healthcheck de Docker

# Un navegador normal: muchas webs pequeñas devuelven 403 a cualquier cosa
# que se presente como robot, aunque su robots.txt no prohíba nada.
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
CABECERAS = {"User-Agent": UA, "Accept-Language": "es,en;q=0.8"}


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------
# Supabase
# ---------------------------------------------------------------
def rpc(nombre, cuerpo):
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/{nombre}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Content-Type": "application/json"},
        data=json.dumps(cuerpo), timeout=30,
    )
    if r.status_code >= 300:
        raise RuntimeError(f"{nombre}: {r.status_code} {r.text[:300]}")
    return r.json() if r.text else None


# ---------------------------------------------------------------
# Extraer contactos de un HTML
# ---------------------------------------------------------------
RE_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,24}")
# «info [at] dominio [dot] com» y variantes que se usan contra el spam.
RE_AT = re.compile(r"\s*[\[\(\{]\s*(?:at|arroba)\s*[\]\)\}]\s*", re.I)
RE_DOT = re.compile(r"\s*[\[\(\{]\s*(?:dot|punto)\s*[\]\)\}]\s*", re.I)

EXT_NO_EMAIL = (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".css", ".js", ".ico", ".avif", ".mp4")
# Correos que aparecen en el código de las plantillas y librerías, no del negocio.
DOMINIOS_BASURA = (
    "example.com", "example.org", "domain.com", "email.com", "yourdomain.com", "yoursite.com",
    "mysite.com", "test.com", "sentry.io", "sentry-next.wixpress.com", "wixpress.com", "wix.com",
    "godaddy.com", "squarespace.com", "sentry.wixpress.com", "company.com", "website.com",
    "dominio.com", "tudominio.com", "correo.com", "ejemplo.com", "placeholder.com", "latofonts.com",
    "schema.org", "w3.org", "googlegroups.com", "group.calendar.google.com",
)
LOCALES_BASURA = ("your", "name", "user", "usuario", "email", "correo", "nombre", "john", "jane", "test")

RE_TEL_INT = re.compile(r"\+\d[\d\s().\-]{7,18}\d")
RE_TEL_NANP = re.compile(r"(?<!\d)\(?[2-9]\d{2}\)?[\s.\-]\d{3}[\s.\-]\d{4}(?!\d)")
RE_JSONLD_TEL = re.compile(r'"telephone"\s*:\s*"([^"]{7,30})"')

REDES = {
    "instagrams": (re.compile(r"(?:^|\.)instagram\.com$"),
                   {"p", "reel", "reels", "explore", "accounts", "stories", "tv", "share", "direct", "about"}),
    "facebooks": (re.compile(r"(?:^|\.)(?:facebook|fb)\.com$"),
                  {"sharer", "sharer.php", "share", "share.php", "dialog", "plugins", "tr", "login", "privacy",
                   "policies", "help", "hashtag", "events", "watch", "groups", "photo", "photo.php", "story.php",
                   "permalink.php", "l.php", "business", "ads"}),
    "linkedIns": (re.compile(r"(?:^|\.)linkedin\.com$"), None),
    "youtubes": (re.compile(r"(?:^|\.)youtube\.com$"), None),
    "tiktoks": (re.compile(r"(?:^|\.)tiktok\.com$"), None),
    "twitters": (re.compile(r"(?:^|\.)(?:twitter|x)\.com$"),
                 {"intent", "share", "home", "hashtag", "search", "i", "login", "privacy", "tos"}),
    "pinterests": (re.compile(r"(?:^|\.)pinterest\.[a-z.]+$"), {"pin", "search", "ideas", "_", "today"}),
}


def limpiar_email(e):
    e = unquote(e).strip().strip(".").lower()
    if e.startswith("mailto:"):
        e = e[7:]
    e = e.split("?")[0]
    if not RE_EMAIL.fullmatch(e):
        return None
    local, _, dominio = e.partition("@")
    if dominio.endswith(EXT_NO_EMAIL) or e.endswith(EXT_NO_EMAIL):
        return None
    if any(dominio == d or dominio.endswith("." + d) for d in DOMINIOS_BASURA):
        return None
    if local in LOCALES_BASURA or len(local) > 64:
        return None
    # Identificadores de Sentry y similares: 32 caracteres hexadecimales.
    if re.fullmatch(r"[0-9a-f]{24,}", local):
        return None
    return e


def decodificar_cfemail(hexa):
    """Cloudflare esconde los correos así: data-cfemail="<clave><bytes xor>"."""
    try:
        clave = int(hexa[:2], 16)
        return "".join(chr(int(hexa[i:i + 2], 16) ^ clave) for i in range(2, len(hexa), 2))
    except Exception:
        return None


def limpiar_telefono(t):
    t = unquote(t).replace("tel:", "").replace("callto:", "").strip()
    digitos = re.sub(r"\D", "", t)
    if not 9 <= len(digitos) <= 15:
        return None
    if len(set(digitos)) <= 2:  # 000000000, 1111111111…
        return None
    # Con prefijo internacional se guarda en el mismo formato que el
    # verificador de WhatsApp (+dígitos). Sin él no se adivina el país: se
    # deja como lo publica el negocio.
    if t.startswith("+") or t.startswith("00"):
        return "+" + (digitos[2:] if t.startswith("00") else digitos)
    return re.sub(r"\s+", " ", t)


def numero_whatsapp(href):
    u = urlparse(href)
    host = u.netloc.lower()
    digitos = None
    if host.endswith("wa.me"):
        digitos = re.sub(r"\D", "", u.path)
    elif "whatsapp.com" in host or u.scheme == "whatsapp":
        digitos = re.sub(r"\D", "", (parse_qs(u.query).get("phone") or [""])[0])
    if digitos and 9 <= len(digitos) <= 15:
        return "+" + digitos
    return None


def red_social(href):
    """Devuelve (clave, url limpia) si el enlace es un perfil, no un botón de compartir."""
    try:
        u = urlparse(href)
    except ValueError:
        return None
    host = u.netloc.lower().split(":")[0]
    if host.startswith("www."):
        host = host[4:]
    if host.startswith(("m.", "web.", "es.", "en.")):
        host = host.split(".", 1)[1]
    partes = [p for p in u.path.split("/") if p]
    for clave, (re_host, prohibidos) in REDES.items():
        if not re_host.search(host):
            continue
        if not partes:
            return None
        primero = partes[0].lower()
        if clave == "linkedIns":
            if primero not in ("company", "in", "school", "showcase") or len(partes) < 2:
                return None
            return clave, f"https://www.linkedin.com/{primero}/{partes[1]}"
        if clave == "youtubes":
            if primero.startswith("@"):
                return clave, f"https://www.youtube.com/{partes[0]}"
            if primero in ("channel", "c", "user") and len(partes) >= 2:
                return clave, f"https://www.youtube.com/{primero}/{partes[1]}"
            return None
        if clave == "tiktoks":
            return (clave, f"https://www.tiktok.com/{partes[0]}") if primero.startswith("@") else None
        if prohibidos and primero in prohibidos:
            return None
        if clave == "facebooks" and primero == "profile.php":
            ident = (parse_qs(u.query).get("id") or [""])[0]
            return (clave, f"https://www.facebook.com/profile.php?id={ident}") if ident else None
        if clave == "facebooks" and primero == "pages" and len(partes) >= 2:
            return clave, "https://www.facebook.com/" + "/".join(partes[:3])
        if not re.fullmatch(r"[A-Za-z0-9_.\-]{2,80}", partes[0]):
            return None
        base = {"instagrams": "https://www.instagram.com/", "facebooks": "https://www.facebook.com/",
                "twitters": "https://x.com/", "pinterests": "https://www.pinterest.com/"}[clave]
        nombre = partes[0].lower() if clave == "instagrams" else partes[0]
        return clave, base + nombre
    return None


PALABRAS_CONTACTO = ("contact", "contacto", "contactanos", "contactenos", "contáctanos", "about", "nosotros",
                     "quienes", "quiénes", "sobre", "equipo", "team", "staff", "ubicacion", "location",
                     "citas", "appointment", "visit", "find-us", "donde", "dónde", "aviso-legal", "legal",
                     "impressum", "privacidad")


def mismo_sitio(a, b):
    ha = urlparse(a).netloc.lower().removeprefix("www.")
    hb = urlparse(b).netloc.lower().removeprefix("www.")
    return ha == hb


def extraer(html_txt, url_base, acc):
    """Suma a `acc` lo que encuentre en la página y devuelve los enlaces internos de contacto."""
    soup = BeautifulSoup(html_txt, "html.parser")
    internos = []

    for el in soup.select("[data-cfemail]"):
        e = limpiar_email(decodificar_cfemail(el.get("data-cfemail", "")) or "")
        if e:
            acc["emails"][e] = None

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        bajo = href.lower()
        if bajo.startswith("mailto:"):
            e = limpiar_email(href)
            if e:
                acc["emails"][e] = None
            continue
        if bajo.startswith(("tel:", "callto:")):
            t = limpiar_telefono(href)
            if t:
                acc["telefonos"][t] = None
            continue
        absoluto = urljoin(url_base, href)
        wa = numero_whatsapp(absoluto)
        if wa:
            acc["whatsapp"][wa] = None
            continue
        r = red_social(absoluto)
        if r:
            acc[r[0]][r[1]] = None
            continue
        if absoluto.startswith("http") and mismo_sitio(absoluto, url_base):
            texto = (a.get_text(" ") or "").lower()
            ruta = urlparse(absoluto).path.lower()
            if any(p in ruta or p in texto for p in PALABRAS_CONTACTO):
                internos.append(absoluto.split("#")[0])

    # El JSON-LD sí trae datos del negocio (teléfono, redes en sameAs).
    for s in soup.find_all("script", attrs={"type": "application/ld+json"}):
        contenido = s.string or ""
        for t in RE_JSONLD_TEL.findall(contenido):
            tl = limpiar_telefono(t)
            if tl:
                acc["telefonos"][tl] = None
        for u in re.findall(r'https?://[^"\s]+', contenido):
            r = red_social(u)
            if r:
                acc[r[0]][r[1]] = None
    # Una lista primero: un <script> dentro de un <noscript> ya borrado se
    # queda sin atributos y rompía el bucle (servingimmigrants.com).
    for s in list(soup(["script", "style", "noscript"])):
        try:
            s.decompose()
        except Exception:
            pass

    texto = soup.get_text(" ")
    texto_desofuscado = RE_DOT.sub(".", RE_AT.sub("@", texto))
    for e in RE_EMAIL.findall(texto_desofuscado):
        e = limpiar_email(e)
        if e:
            acc["emails"][e] = None
    for t in RE_TEL_INT.findall(texto) + RE_TEL_NANP.findall(texto):
        t = limpiar_telefono(t)
        if t:
            acc["telefonos"][t] = None

    return internos, len(texto.strip())


# ---------------------------------------------------------------
# Descargar páginas
# ---------------------------------------------------------------
class Navegador:
    """Chromium bajo demanda: solo se abre si una web lo necesita y se cierra al acabar el trabajo."""

    def __init__(self):
        self._pw = None
        self._browser = None

    def html(self, url):
        if self._browser is None:
            from playwright.sync_api import sync_playwright
            self._pw = sync_playwright().start()
            self._browser = self._pw.chromium.launch(args=["--disable-dev-shm-usage", "--no-sandbox"])
        ctx = self._browser.new_context(user_agent=UA, locale="es-ES")
        # Sin imágenes, vídeo ni fuentes: no hacen falta para leer contactos y
        # son lo que más memoria y tiempo cuesta.
        ctx.route("**/*", lambda r: r.abort() if r.request.resource_type in ("image", "media", "font") else r.continue_())
        try:
            page = ctx.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(2500)
            return page.content(), page.url
        finally:
            ctx.close()

    def cerrar(self):
        try:
            if self._browser:
                self._browser.close()
            if self._pw:
                self._pw.stop()
        except Exception:
            pass
        self._browser = None
        self._pw = None


def descargar(url):
    """(html, url_final, codigo). Lanza excepción si no hay forma de conectar."""
    r = requests.get(url, headers=CABECERAS, timeout=20, allow_redirects=True)
    tipo = r.headers.get("content-type", "")
    if "html" not in tipo and "text" not in tipo:
        return "", r.url, r.status_code
    r.encoding = r.encoding or r.apparent_encoding
    return r.text, r.url, r.status_code


def permitido(robots, url):
    try:
        return robots is None or robots.can_fetch("*", url)
    except Exception:
        return True


def cargar_robots(url):
    p = urlparse(url)
    rp = urllib.robotparser.RobotFileParser()
    try:
        r = requests.get(f"{p.scheme}://{p.netloc}/robots.txt", headers=CABECERAS, timeout=10)
        if r.status_code >= 400:
            return None  # sin robots.txt = sin restricciones
        rp.parse(r.text.splitlines())
        return rp
    except Exception:
        return None


# Páginas de relleno del hosting o del registrador: no son la web del negocio,
# y sus enlaces a redes son los del hosting. Para ventas es oro: el negocio
# pagó un dominio y no tiene web.
SENALES_APARCADO = (
    "welcome to your new website", "this domain is for sale", "domain is for sale", "buy this domain",
    "this domain may be for sale", "domain is parked", "parked domain", "parked free", "parkingcrew",
    "sedoparking", "bodis.com", "hugedomains", "dan.com/buy-domain", "afternic", "future home of",
    "account suspended", "this account has been suspended", "dominio está a la venta", "dominio en venta",
    "apache2 ubuntu default page", "welcome to nginx", "default web site page", "web server's default page",
)


def es_aparcado(html_txt):
    bajo = html_txt[:20000].lower()
    return any(s in bajo for s in SENALES_APARCADO)


def normalizar_web(web):
    web = web.strip()
    if not re.match(r"^https?://", web, re.I):
        web = "https://" + web.lstrip("/")
    return web


# ---------------------------------------------------------------
# Un trabajo
# ---------------------------------------------------------------
def leer_web(web):
    acc = {k: {} for k in ("emails", "telefonos", "whatsapp", *REDES.keys())}
    url = normalizar_web(web)

    # Hay negocios cuya «web» en Google es su Instagram o su Facebook. No hay
    # nada que leer (esas páginas exigen sesión); se guarda el perfil y listo.
    r = red_social(url)
    if r:
        acc[r[0]][r[1]] = None
        return acc, "solo_redes"

    nav = Navegador()
    try:
        html_txt, final, codigo = "", url, 0
        try:
            html_txt, final, codigo = descargar(url)
        except requests.exceptions.SSLError:
            # Certificado caducado: muy común en webs pequeñas. Se prueba por http.
            try:
                html_txt, final, codigo = descargar(url.replace("https://", "http://", 1))
            except Exception:
                pass
        except Exception:
            pass

        robots = cargar_robots(final)
        if not permitido(robots, final):
            return acc, "robots_prohibe"

        if html_txt and es_aparcado(html_txt):
            return acc, "dominio_aparcado"

        internos, largo = ([], 0)
        if html_txt and codigo < 400:
            internos, largo = extraer(html_txt, final, acc)

        # Vacía, bloqueada o caída para la descarga simple: navegador de verdad.
        if codigo >= 400 or largo < 300 or not html_txt:
            try:
                html_txt, final = nav.html(url)
                if es_aparcado(html_txt):
                    return acc, "dominio_aparcado"
                internos2, largo = extraer(html_txt, final, acc)
                internos = internos or internos2
            except Exception as e:
                if not html_txt:
                    log(f"  sin respuesta: {str(e)[:120]}")
                    return acc, "web_caida"

        # Contacto primero: es donde suelen estar los correos.
        vistos = {final.split("#")[0].rstrip("/")}
        internos = sorted(dict.fromkeys(internos), key=lambda u: 0 if "contac" in u.lower() else 1)
        visitadas = 0
        for u in internos:
            clave = u.rstrip("/")
            if clave in vistos or visitadas >= MAX_PAGINAS:
                continue
            vistos.add(clave)
            if not permitido(robots, u):
                continue
            time.sleep(PAUSA)
            visitadas += 1
            try:
                h, f, c = descargar(u)
                if c >= 400 or not h:
                    continue
                _, largo = extraer(h, f, acc)
                if largo < 300:
                    h, f = nav.html(u)
                    extraer(h, f, acc)
            except Exception:
                continue
        return acc, None
    finally:
        nav.cerrar()


def sin_repetidos(telefonos):
    """El mismo número sale en la web como «+1 849…» en el enlace y «(849) …» en el texto.
    Se queda uno: si los dígitos de un número son el final de otro más largo, sobra el corto."""
    lista = sorted(dict.fromkeys(telefonos), key=lambda t: (not t.startswith("+"), -len(re.sub(r"\D", "", t))))
    quedan, digitos = [], []
    for t in lista:
        d = re.sub(r"\D", "", t)
        if any(o.endswith(d) or (len(d) >= 10 and o.endswith(d[-10:])) for o in digitos):
            continue
        quedan.append(t)
        digitos.append(d)
    # Se respeta el orden en que aparecieron en la web: el primero suele ser el principal.
    orden = {t: i for i, t in enumerate(telefonos)}
    return sorted(quedan, key=lambda t: orden.get(t, 0))


def unicos_sin_mayusculas(urls):
    vistos, quedan = set(), []
    for u in urls:
        if u.lower() not in vistos:
            vistos.add(u.lower())
            quedan.append(u)
    return quedan


def a_datos(acc, estado):
    """Al formato que entiende `enriquecer_lead` (los mismos nombres que Apify)."""
    wa = list(acc["whatsapp"])
    datos = {
        "emails": list(acc["emails"])[:10],
        "telefonos": sin_repetidos(wa + list(acc["telefonos"]))[:10],
        "whatsapp_numeros": wa,
        # facebook.com/Sweetgreen y facebook.com/sweetgreen son el mismo perfil.
        **{k: unicos_sin_mayusculas(acc[k])[:3] for k in REDES},
    }
    if wa:
        datos["whatsapp"] = wa[0]
        datos["whatsapp_source"] = "wa_link_web"
    if estado in ("web_caida", "robots_prohibe", "dominio_aparcado"):
        datos["status"] = estado
    elif any(isinstance(v, list) and v for v in datos.values()):
        # Encontró contactos aunque el lead ya los tuviera todos: eso es «ok».
        # Sin esto `enriquecer_lead` lo marcaba `sin_datos` y la ficha decía
        # «su web no publica contactos», que es falso.
        datos["status"] = "ok"
    return datos


def trabajar(t):
    inicio = time.time()
    log(f"#{t['id']} {t['empresa']} — {t['web']} (intento {t['intentos']})")
    acc, estado = leer_web(t["web"])
    datos = a_datos(acc, estado)
    r = rpc("enriquecer_lead", {"p_id": t["lead_id"], "p_datos": datos, "p_fuente": "web_propio"})
    rpc("contactos_web_hecha", {"p_id": t["id"]})
    resumen = ", ".join(f"{k}={len(v)}" for k, v in datos.items() if isinstance(v, list) and v)
    log(f"  {estado or 'ok'} en {time.time() - inicio:.1f}s · {resumen or 'nada'} · rellenó {r.get('relleno') if r else '?'}")


def main():
    # Modo prueba: `python robot.py prueba https://web.com` imprime lo que
    # encontraría, sin tocar Supabase.
    if len(sys.argv) >= 3 and sys.argv[1] == "prueba":
        acc, estado = leer_web(sys.argv[2])
        print(json.dumps({"estado": estado, **a_datos(acc, estado)}, indent=2, ensure_ascii=False))
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        sys.exit("Faltan SUPABASE_URL y SUPABASE_SERVICE_KEY")

    log("robot de contactos en marcha")
    while True:
        open(LATIDO, "w").close()
        try:
            trabajos = rpc("contactos_web_leer", {"p_cantidad": 1, "p_segundos": 300}) or []
        except Exception as e:
            log(f"no se pudo leer la cola: {e}")
            time.sleep(60)
            continue
        if not trabajos:
            time.sleep(ESPERA)
            continue
        for t in trabajos:
            try:
                trabajar(t)
            except Exception as e:
                # No se marca hecho: reaparece a los 5 minutos y, al 4º
                # intento, la propia cola lo da por perdido (0070).
                log(f"  falló: {str(e)[:300]}")


if __name__ == "__main__":
    main()
