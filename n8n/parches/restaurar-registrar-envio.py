"""
Devuelve el nodo «Registrar Envio» al workflow «CRM API - Enviar Respuesta»,
y esta vez lo deja CONECTADO.

Sin ese nodo, el CRM manda el correo y no lo apunta en ningun sitio: sale por
SMTP, le llega al cliente, y en el modulo Mensajes no aparece nada. El envio
existe pero el CRM no se entera.

Dos cosas que arregla respecto a como estaba:

 1. El nodo colgaba de la nada. Ni «Enviar Email» ni «Enviar Email (Info)»
    apuntaban a el: los dos iban directos a «Respond». Aunque el nodo
    estuviera en el lienzo, no se ejecutaba nunca. Ahora los dos envios
    apuntan a Respond Y a Registrar Envio.

 2. El insert no ponia `status`, asi que la fila caia con el valor por
    defecto de la columna y el hilo mostraba el mensaje como pendiente para
    siempre. Si hemos llegado a este nodo es que el correo ya salio: va
    'enviado'.

Se deja con `onError: continueRegularOutput` a proposito: si Supabase falla,
el correo YA se envio y no tiene sentido dar el webhook por fallido. La
diferencia es que ahora el fallo queda a la vista en la ejecucion, en vez de
desaparecer sin dejar rastro.

Uso:  python restaurar-registrar-envio.py entrada.json salida.json
"""
import json, sys

NOMBRE = 'Registrar Envio'
ENVIOS = ['Enviar Email', 'Enviar Email (Info)']

CUERPO = (
    "={{ JSON.stringify({ lead_id: ($('Construir Email').item.json.leadId || null), "
    "destinatario: $('Construir Email').item.json.to, "
    "asunto: $('Construir Email').item.json.subject, "
    "cuerpo: $('Construir Email').item.json.html, "
    "status: 'enviado', "
    "sent_at: new Date().toISOString() }) }}"
)

NODO = {
    'parameters': {
        'method': 'POST',
        'url': 'https://octzlhcwqlvxzrjgaptk.supabase.co/rest/v1/outreach_messages',
        'authentication': 'predefinedCredentialType',
        'nodeCredentialType': 'supabaseApi',
        'sendHeaders': True,
        'headerParameters': {'parameters': [{'name': 'Prefer', 'value': 'return=minimal'}]},
        'sendBody': True,
        'specifyBody': 'json',
        'jsonBody': CUERPO,
        'options': {},
    },
    'type': 'n8n-nodes-base.httpRequest',
    'typeVersion': 4.2,
    'position': [1180, 620],
    'name': NOMBRE,
    'credentials': {'supabaseApi': {'id': 'jdSupabaseSvcRole', 'name': 'Supabase - JDDeveloper'}},
    'onError': 'continueRegularOutput',
}

entrada, salida = sys.argv[1], sys.argv[2]

with open(entrada, encoding='utf-8') as f:
    datos = json.load(f)

wf = datos[0] if isinstance(datos, list) else datos
nodos = wf.setdefault('nodes', [])
conexiones = wf.setdefault('connections', {})

# El nodo se recrea siempre desde cero: si quedaba una version vieja, se
# sustituye para no acabar con dos.
nodos[:] = [n for n in nodos if n.get('name') != NOMBRE]
nodos.append(dict(NODO))
print('Nodo "%s" puesto en el lienzo.' % NOMBRE)

for envio in ENVIOS:
    if not any(n.get('name') == envio for n in nodos):
        print('AVISO: no existe el nodo "%s"; me lo salto.' % envio)
        continue
    salidas = conexiones.setdefault(envio, {}).setdefault('main', [[]])
    if not salidas:
        salidas.append([])
    destinos = salidas[0]
    if any(d.get('node') == NOMBRE for d in destinos):
        print('  %s ya apuntaba a %s' % (envio, NOMBRE))
        continue
    destinos.append({'node': NOMBRE, 'type': 'main', 'index': 0})
    print('  %s  ->  %s  (conectado)' % (envio, NOMBRE))

with open(salida, 'w', encoding='utf-8') as f:
    json.dump(datos, f, ensure_ascii=False, indent=2)

# Repaso final: que los dos envios sigan respondiendo al webhook.
for envio in ENVIOS:
    destinos = [d['node'] for d in conexiones.get(envio, {}).get('main', [[]])[0]]
    print('%s termina en: %s' % (envio, ', '.join(destinos) or 'NADA'))
