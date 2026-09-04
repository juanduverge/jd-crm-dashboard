"""
Anade al workflow «CRM API - Enviar Respuesta» el nodo que archiva una copia
del correo en la carpeta Enviados del buzon.

POR QUE
SMTP solo entrega el mensaje; no guarda nada en tu buzon. Los programas de
correo hacen DOS cosas al enviar: SMTP para entregar y luego IMAP APPEND para
dejar la copia en Enviados. n8n solo hacia la primera, asi que lo que salia
del CRM no aparecia en Enviados por ningun sitio.

Este nodo es la segunda mitad: llama al servicio `imap-archivador`, que vive
en la misma red de Docker y hace el APPEND contra imap.hostinger.com.

DETALLES QUE IMPORTAN
 - Cuelga de los DOS nodos de envio (sales@ e info@), en paralelo con
   «Respond»: el webhook responde al CRM sin esperar al archivado.
 - `onError: continueRegularOutput`. Cuando este nodo corre, el correo YA
   salio: que falle el archivado no puede tumbar el envio. El fallo queda
   visible en la ejecucion, que es justo lo que faltaba en el nodo de
   registro y costo un dia entero de diagnostico.
 - El token va por `$env`, no escrito en el workflow. La clave de Supabase
   escrita a mano en 33 nodos ya ensenio como acaba eso.

Uso:  python anadir-archivado-enviados.py entrada.json salida.json
"""
import json, sys

NOMBRE = 'Archivar en Enviados'
ENVIOS = ['Enviar Email', 'Enviar Email (Info)']

# El remitente real depende de la rama, asi que se lee del propio nodo de
# envio; el resto sale de «Construir Email», que es quien armo el mensaje.
CUERPO = (
    "={{ JSON.stringify({ "
    "from: $json.envelope && $json.envelope.from ? $json.envelope.from : 'info@jddeveloper.com', "
    "to: $('Construir Email').item.json.to, "
    "subject: $('Construir Email').item.json.subject, "
    "html: $('Construir Email').item.json.html, "
    "messageId: $json.messageId || '' "
    "}) }}"
)

NODO = {
    'parameters': {
        'method': 'POST',
        'url': 'http://imap-archivador:8090/archivar',
        'sendHeaders': True,
        'headerParameters': {'parameters': [
            {'name': 'X-Token', 'value': '={{ $env.ARCHIVADOR_TOKEN }}'},
        ]},
        'sendBody': True,
        'specifyBody': 'json',
        'jsonBody': CUERPO,
        'options': {},
    },
    'type': 'n8n-nodes-base.httpRequest',
    'typeVersion': 4.2,
    'position': [1180, 820],
    'name': NOMBRE,
    'onError': 'continueRegularOutput',
}

entrada, salida = sys.argv[1], sys.argv[2]

with open(entrada, encoding='utf-8') as f:
    datos = json.load(f)

wf = datos[0] if isinstance(datos, list) else datos
nodos = wf.setdefault('nodes', [])
conexiones = wf.setdefault('connections', {})

nodos[:] = [n for n in nodos if n.get('name') != NOMBRE]
nodos.append(dict(NODO))
print('Nodo "%s" puesto.' % NOMBRE)

for envio in ENVIOS:
    if not any(n.get('name') == envio for n in nodos):
        print('AVISO: falta el nodo "%s"' % envio)
        continue
    salidas = conexiones.setdefault(envio, {}).setdefault('main', [[]])
    if not salidas:
        salidas.append([])
    destinos = salidas[0]
    if not any(d.get('node') == NOMBRE for d in destinos):
        destinos.append({'node': NOMBRE, 'type': 'main', 'index': 0})
    print('  %s  ->  %s' % (envio, ', '.join(d['node'] for d in destinos)))

with open(salida, 'w', encoding='utf-8') as f:
    json.dump(datos, f, ensure_ascii=False, indent=2)
print('Guardado.')
