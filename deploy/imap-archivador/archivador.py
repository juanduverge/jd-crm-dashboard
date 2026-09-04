"""
Archivador IMAP — deja en la carpeta «Enviados» del buzón una copia de cada
correo que manda el CRM.

POR QUE EXISTE
Mandar por SMTP solo entrega el mensaje al destinatario; no guarda nada en
tu buzon. Los programas de correo (Gmail, Outlook, el webmail de Hostinger)
hacen DOS cosas al enviar: hablan SMTP para entregar y luego se conectan por
IMAP para depositar una copia en Enviados. n8n solo hacia la primera, asi que
lo que salia del CRM no aparecia en Enviados por ningun lado.

Esto es la segunda mitad: un servicio minimo al que n8n llama despues de
enviar, y que reconstruye el mensaje y lo deposita con IMAP APPEND.

Solo usa la biblioteca estandar de Python: nada que instalar, nada que se
rompa en la proxima actualizacion.

CONFIGURACION (variables de entorno)
  IMAP_HOST      imap.hostinger.com
  IMAP_PORT      993
  IMAP_USER      info@jddeveloper.com
  IMAP_PASS      la contrasena del buzon
  IMAP_CARPETA   INBOX.Sent   (asi se llama en Hostinger; el webmail lo
                               confirma en su propia URL)
  PUERTO         8090

SEGURIDAD
El servicio escucha solo dentro de la red de Docker; no se publica ningun
puerto al exterior. Aun asi exige una cabecera `X-Token` que debe coincidir
con TOKEN, para que nada mas del servidor pueda usarlo por accidente.
"""

import email.utils
import imaplib
import json
import os
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, HTTPServer

HOST = os.environ.get('IMAP_HOST', 'imap.hostinger.com')
PUERTO_IMAP = int(os.environ.get('IMAP_PORT', '993'))
USUARIO = os.environ.get('IMAP_USER', '')
CLAVE = os.environ.get('IMAP_PASS', '')
CARPETA = os.environ.get('IMAP_CARPETA', 'INBOX.Sent')
TOKEN = os.environ.get('TOKEN', '')
PUERTO = int(os.environ.get('PUERTO', '8090'))

# Un correo del CRM son unos pocos KB; 5 MB es de sobra y evita que una
# peticion enorme se coma la memoria del contenedor.
MAX_CUERPO = 5 * 1024 * 1024


def construir_mensaje(d):
    """Rehace el correo tal y como salio, para que la copia sea fiel."""
    msg = EmailMessage()
    msg['From'] = d['from']
    msg['To'] = d['to']
    msg['Subject'] = d.get('subject', '')
    # Se reutiliza el Message-ID del envio real: asi la copia y el correo que
    # recibio el cliente son el mismo mensaje a ojos de cualquier programa.
    msg['Message-ID'] = d.get('messageId') or email.utils.make_msgid(domain='jddeveloper.com')
    msg['Date'] = d.get('date') or email.utils.formatdate(localtime=True)

    html = d.get('html') or ''
    texto = d.get('text') or ''
    if html:
        # El alternativo en texto plano no es un adorno: sin el, algunos
        # clientes y buscadores no encuentran nada dentro del correo.
        msg.set_content(texto or 'Este mensaje requiere un lector con HTML.')
        msg.add_alternative(html, subtype='html')
    else:
        msg.set_content(texto)
    return msg


def archivar(d):
    if not USUARIO or not CLAVE:
        raise RuntimeError('IMAP_USER o IMAP_PASS sin configurar')

    msg = construir_mensaje(d)
    crudo = msg.as_bytes()

    con = imaplib.IMAP4_SSL(HOST, PUERTO_IMAP)
    try:
        con.login(USUARIO, CLAVE)
        # \\Seen para que la copia no aparezca como no leida: es tuya, no te
        # la tiene que avisar nadie.
        estado, respuesta = con.append(
            CARPETA, '(\\Seen)', imaplib.Time2Internaldate(time.time()), crudo
        )
        if estado != 'OK':
            raise RuntimeError('APPEND devolvio %s: %r' % (estado, respuesta))
        return {'ok': True, 'carpeta': CARPETA, 'bytes': len(crudo)}
    finally:
        try:
            con.logout()
        except Exception:
            pass


class Manejador(BaseHTTPRequestHandler):
    def _responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo).encode('utf-8')
        self.send_response(codigo)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        # Para comprobar de un vistazo que el servicio esta vivo.
        if self.path == '/salud':
            self._responder(200, {'ok': True, 'carpeta': CARPETA, 'usuario': USUARIO})
        else:
            self._responder(404, {'error': 'no existe'})

    def do_POST(self):
        if self.path != '/archivar':
            return self._responder(404, {'error': 'no existe'})

        if TOKEN and self.headers.get('X-Token') != TOKEN:
            return self._responder(401, {'error': 'token invalido'})

        try:
            largo = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            return self._responder(400, {'error': 'longitud invalida'})
        if largo <= 0 or largo > MAX_CUERPO:
            return self._responder(400, {'error': 'cuerpo vacio o demasiado grande'})

        try:
            d = json.loads(self.rfile.read(largo).decode('utf-8'))
        except Exception as e:
            return self._responder(400, {'error': 'json invalido: %s' % e})

        faltan = [c for c in ('from', 'to') if not d.get(c)]
        if faltan:
            return self._responder(400, {'error': 'faltan campos: %s' % ', '.join(faltan)})

        try:
            return self._responder(200, archivar(d))
        except Exception as e:
            # El correo YA se envio cuando n8n llama aqui. Que falle el
            # archivado es molesto, no grave: se devuelve el motivo para que
            # quede en la ejecucion y se pueda ver.
            return self._responder(500, {'ok': False, 'error': str(e)})

    def log_message(self, formato, *args):
        print('[archivador] ' + formato % args, flush=True)


if __name__ == '__main__':
    print('[archivador] escuchando en :%d, carpeta %s, usuario %s'
          % (PUERTO, CARPETA, USUARIO or '(sin configurar)'), flush=True)
    HTTPServer(('0.0.0.0', PUERTO), Manejador).serve_forever()
