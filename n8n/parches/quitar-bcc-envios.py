"""
Quita la copia oculta (BCC) de los nodos de envio de correo.

Cada envio del CRM se mandaba a si mismo una copia a la otra direccion de la
casa: los que salian de sales@ iban con BCC a info@ y al reves. Como las dos
descargan en el mismo buzon, cada correo enviado reaparecia en Recibidos —en
Hostinger, en Gmail y en el CRM— como si alguien hubiera escrito.

El BCC no aporta nada: el envio ya queda registrado en `outreach_messages`,
que es lo que lee el modulo Mensajes.

Uso:  python quitar-bcc-envios.py entrada.json salida.json
"""
import json, sys

entrada, salida = sys.argv[1], sys.argv[2]

with open(entrada, encoding='utf-8') as f:
    datos = json.load(f)

wfs = datos if isinstance(datos, list) else [datos]
tocados = []

for wf in wfs:
    for n in wf.get('nodes', []):
        if n.get('type') != 'n8n-nodes-base.emailSend':
            continue
        # n8n guarda cc/bcc dentro de `options`, no en la raiz de parameters.
        opciones = n.get('parameters', {}).get('options', {})
        bcc = opciones.pop('bccEmail', None)
        cc = opciones.pop('ccEmail', None)
        if bcc or cc:
            tocados.append('%s / %s  (bcc: %s)' % (wf.get('name'), n.get('name'), bcc or '-'))

if not tocados:
    print('No habia ninguna copia oculta que quitar.')
    sys.exit(2)

with open(salida, 'w', encoding='utf-8') as f:
    json.dump(datos, f, ensure_ascii=False, indent=2)

print('Copias ocultas eliminadas: %d' % len(tocados))
for t in tocados:
    print('  -', t)
