// Nodo «Armar consulta» del workflow «Radar - Investigar empresa».
// Convierte los datos del registro en la pregunta para Gemini con búsqueda en Google.
const b = $input.first().json.body || {};
if (!b.nombre) throw new Error('falta el nombre de la empresa');

const lugar = [b.ciudad, b.estado].filter(Boolean).join(', ');
const dominios = (b.dominios || []).filter((d) => d.estado === 'ocupado').map((d) => d.dominio);

const datos = [
  'Nombre legal: ' + b.nombre,
  lugar ? 'Ubicacion: ' + lugar + ', Estados Unidos' : '',
  b.direccion ? 'Direccion registrada: ' + b.direccion : '',
  b.fecha_registro ? 'Fecha de registro: ' + b.fecha_registro : '',
  b.actividad ? 'Actividad probable: ' + b.actividad : '',
  b.contacto_nombre ? 'Persona en el registro (' + (b.contacto_rol || 'contacto') + '): ' + b.contacto_nombre : '',
  dominios.length ? 'Dominios que existen con ese nombre (pueden ser de otra empresa): ' + dominios.join(', ') : '',
].filter(Boolean).join('\n');

const prompt = [
  'Eres un investigador comercial. Busca en Google informacion publica de esta empresa recien registrada en Estados Unidos.',
  '',
  datos,
  '',
  'Averigua: si tiene pagina web propia, perfiles en redes (Instagram, Facebook, LinkedIn, TikTok, Yelp), ficha en Google Maps, telefono y correo publicos del negocio, y si la persona del registro es el dueno.',
  '',
  'REGLAS ESTRICTAS:',
  '- Hay muchas empresas con nombres parecidos en otros estados. Solo cuenta un resultado si coincide la ciudad, el estado, la direccion o la persona. Si no puedes confirmarlo, marcalo "dudosa" o no lo incluyas.',
  '- No inventes nada. Cada dato debe llevar la URL exacta de la pagina donde lo viste. Sin URL, no lo incluyas.',
  '- Directorios que copian registros mercantiles (opencorporates, bizapedia, dnb, zoominfo y similares) NO cuentan como web de la empresa ni como fuente de contacto.',
  '- Si no encuentras nada fiable, dilo: es una respuesta valida y frecuente en empresas tan nuevas.',
  '',
  'Responde SOLO con un objeto JSON, sin texto antes ni despues y sin bloque de codigo, con esta forma exacta:',
  '{',
  '  "que_hace": "una frase en espanol sobre a que se dedica, o cadena vacia si no se sabe",',
  '  "webs": [{"url": "", "confianza": "segura|probable|dudosa", "motivo": "por que crees que es suya"}],',
  '  "redes": [{"red": "instagram|facebook|linkedin|tiktok|yelp|otra", "url": "", "confianza": "segura|probable|dudosa", "motivo": ""}],',
  '  "telefonos": [{"valor": "", "fuente_url": "", "confianza": "segura|probable|dudosa"}],',
  '  "correos": [{"valor": "", "fuente_url": "", "confianza": "segura|probable|dudosa"}],',
  '  "google_maps": {"url": "", "resenas": 0},',
  '  "dueno": {"nombre": "", "es_el_del_registro": true, "perfil_url": "", "confianza": "segura|probable|dudosa", "motivo": ""},',
  '  "veredicto": "sin_web|web_floja|tiene_web|sin_rastro",',
  '  "resumen": "dos frases en espanol: que encontraste y si merece la pena contactarla para venderle una pagina web"',
  '}',
  'Usa listas vacias y null cuando no haya dato. "sin_rastro" = no aparece nada de esta empresa. "sin_web" = existe actividad (redes, ficha) pero no web propia. "web_floja" = tiene web pero es de plantilla, esta a medias o muy pobre.',
].join('\n');

return [{
  json: {
    id: b.id || null,
    nombre: b.nombre,
    modelo: b.modelo || 'gemini-flash-latest',
    cuerpo: {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 },
    },
  },
}];
