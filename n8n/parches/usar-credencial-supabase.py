"""
Pasa los nodos HTTP que hablan con Supabase a usar la credencial de n8n en
vez de llevar la clave `service_role` escrita a mano en las cabeceras.

El dia que esa clave dejo de valer, habia que cambiarla en doce workflows y
en decenas de nodos. Con la credencial vive en un solo sitio: se cambia ahi
y todo lo demas sigue funcionando.

Uso:  python usar-credencial-supabase.py entrada.json salida.json
"""
import json, sys

CRED_ID = 'jdSupabaseSvcRole'
CRED_NOMBRE = 'Supabase - JDDeveloper'
# Cabeceras que llevaban la clave a mano y que ahora pone la credencial.
CABECERAS_CLAVE = {'apikey', 'authorization'}

entrada = sys.argv[1]
salida = sys.argv[2]

with open(entrada, encoding='utf-8') as f:
    datos = json.load(f)

wfs = datos if isinstance(datos, list) else [datos]
cambiados = []

for wf in wfs:
    for n in wf.get('nodes', []):
        if n.get('type') != 'n8n-nodes-base.httpRequest':
            continue
        params = n.get('parameters', {})
        if 'supabase.co' not in str(params.get('url', '')):
            continue

        # Fuera las cabeceras que llevaban la clave.
        cabeceras = params.get('headerParameters', {}).get('parameters', [])
        quedan = [h for h in cabeceras if (h.get('name') or '').lower() not in CABECERAS_CLAVE]
        quitadas = len(cabeceras) - len(quedan)

        if quedan:
            params['headerParameters']['parameters'] = quedan
        else:
            # Sin cabeceras propias no hay nada que enviar a mano.
            params.pop('headerParameters', None)
            params['sendHeaders'] = False

        params['authentication'] = 'predefinedCredentialType'
        params['nodeCredentialType'] = 'supabaseApi'
        n['credentials'] = {'supabaseApi': {'id': CRED_ID, 'name': CRED_NOMBRE}}

        cambiados.append('%s / %s (cabeceras quitadas: %d)' % (wf.get('name'), n.get('name'), quitadas))

if not cambiados:
    print('Nada que cambiar.')
    sys.exit(2)

with open(salida, 'w', encoding='utf-8') as f:
    json.dump(datos, f, ensure_ascii=False, indent=2)

print('Nodos pasados a credencial: %d' % len(cambiados))
for c in cambiados:
    print('  -', c)

# Red de seguridad: si queda un sb_secret suelto, avisar.
with open(salida, encoding='utf-8') as f:
    if 'sb_secret' in f.read():
        print('\nAVISO: todavia queda un sb_secret en el fichero. Revisalo.')
