"""
Sustituye el codigo del nodo «Combinar y Formatear» del workflow
«CRM API - Leer Inbox» por el de leer-inbox-combinar-y-formatear.js.

Se ejecuta contra el JSON que saca `n8n export:workflow`, y el resultado se
vuelve a meter con `n8n import:workflow`. No toca la base de datos a mano.
"""
import json, re, sys

# Las rutas por defecto son las del servidor; se pueden pasar por argumento
# para parchear en local y subir solo el resultado.
WF = sys.argv[1] if len(sys.argv) > 1 else '/tmp/wf-backup.json'
CODIGO = sys.argv[2] if len(sys.argv) > 2 else '/tmp/nuevocodigo.js'
SALIDA = sys.argv[3] if len(sys.argv) > 3 else '/tmp/wf-nuevo.json'
NODO = 'Combinar y Formatear'

with open(WF, encoding='utf-8') as f:
    datos = json.load(f)

wfs = datos if isinstance(datos, list) else [datos]

with open(CODIGO, encoding='utf-8') as f:
    nuevo = f.read()

# El fichero del repo lleva delante un comentario de bloque explicando el
# porque del parche. En n8n solo queremos el codigo.
nuevo = re.sub(r'^\s*/\*\*.*?\*/\s*', '', nuevo, count=1, flags=re.S)

tocados = 0
for wf in wfs:
    for n in wf.get('nodes', []):
        if n.get('name') == NODO:
            if 'textHtml' in n['parameters'].get('jsCode', ''):
                print('AVISO: el nodo ya esta parcheado; no se toca.')
                sys.exit(2)
            n['parameters']['jsCode'] = nuevo
            tocados += 1

if tocados != 1:
    print('ERROR: esperaba 1 nodo "%s", encontre %d' % (NODO, tocados))
    sys.exit(1)

with open(SALIDA, 'w', encoding='utf-8') as f:
    json.dump(datos if isinstance(datos, list) else wfs[0], f, ensure_ascii=False, indent=2)

print('OK nodo parcheado')
print('  textHtml presente     :', 'textHtml' in nuevo)
print('  filtro propios presente:', 'DOMINIOS_PROPIOS' in nuevo)
print('  corte de 3000 fuera   :', '3000' not in nuevo)
