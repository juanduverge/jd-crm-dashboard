// Nodo «Abrir sus paginas» del workflow «Radar - Leer paginas».
//
// Para cada empresa tomada de la cola, abre los dominios que existen con su
// nombre y saca lo que se puede sacar con reglas fijas: título, texto, correos,
// teléfonos y redes. Lo único que queda para la IA es la pregunta que las
// reglas no saben contestar: ¿esta página es de ESTA empresa?
//
// El entorno de código de n8n no trae fetch ni URL: todo va con
// this.helpers.httpRequest y expresiones regulares.

const MAX_PAGINAS = 3;       // dominios por empresa
const MAX_TEXTO = 3500;      // caracteres de texto por página que ve la IA

const APARCADO = /(domain (is )?for sale|buy this domain|this domain (may be|is) (for sale|available)|domain parking|parked (free|domain)|hugedomains|sedo\.com|dan\.com|afternic|godaddy\.com\/domainsearch|is available for purchase|make an offer on this domain|coming soon to this domain)/i;
// Correos de plantillas, librerías y ejemplos, que no son de nadie.
const CORREO_BASURA = /(example\.|sentry|wixpress|godaddy|yourdomain|domain\.com|email\.com|\.png$|\.jpg$|\.gif$|\.webp$|\.svg$|@2x|noreply|no-reply)/i;
const REDES = [
  ['instagram', /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/gi],
  ['facebook', /https?:\/\/(?:www\.|m\.)?facebook\.com\/[A-Za-z0-9_.\-\/]+/gi],
  ['linkedin', /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[A-Za-z0-9_\-%.]+/gi],
  ['tiktok', /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+/gi],
  ['yelp', /https?:\/\/(?:www\.)?yelp\.com\/biz\/[A-Za-z0-9_\-%.]+/gi],
];
// Enlaces de «compartir» y páginas genéricas de la red, no perfiles.
const RED_BASURA = /(sharer|share\.php|\/plugins\/|\/tr\?|\/intent\/|\/policies|\/privacy|\/help|\/login|\/explore\/|facebook\.com\/(?:tr|dialog|home\.php)|instagram\.com\/(?:p|explore|accounts)\b)/i;

const unicos = (a) => [...new Set(a)];
const entidades = (s) => s
  .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
  .replace(/&#0?39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

function leer(html, dominio) {
  const titulo = entidades(((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim()).slice(0, 200);
  const descripcion = entidades(((html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i) || [])[1] || '').trim()).slice(0, 400);
  const texto = entidades(html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();

  const correos = unicos((html.match(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g) || [])
    .map((c) => c.toLowerCase()).filter((c) => !CORREO_BASURA.test(c))).slice(0, 5);

  // Primero los enlaces tel:, que son intencionados; después los del texto.
  const tel = (html.match(/href=["']tel:([^"']+)["']/gi) || []).map((t) => t.replace(/href=["']tel:/i, '').replace(/["']$/, ''));
  const enTexto = texto.match(/(?:\+?1[\s.\-]?)?\(?\b[2-9]\d{2}\)?[\s.\-]\d{3}[\s.\-]\d{4}\b/g) || [];
  const telefonos = unicos([...tel, ...enTexto].map((t) => t.replace(/%20/g, ' ').trim()).filter((t) => t.replace(/\D/g, '').length >= 10)).slice(0, 4);

  const redes = [];
  for (const [red, patron] of REDES) {
    const url = (html.match(patron) || []).map((u) => u.replace(/[\/"'\\]+$/, '')).find((u) => !RED_BASURA.test(u));
    if (url) redes.push({ red, url });
  }

  const aparcado = APARCADO.test(titulo + ' ' + texto.slice(0, 1500));
  return { dominio, titulo, descripcion, texto: texto.slice(0, MAX_TEXTO), largo: texto.length, correos, telefonos, redes, aparcado };
}

async function abrir(ayudas, dominio) {
  for (const esquema of ['https://', 'http://']) {
    try {
      const r = await ayudas.httpRequest({
        method: 'GET', url: esquema + dominio + '/', json: false, returnFullResponse: true,
        ignoreHttpStatusErrors: true, timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JDDeveloperRadar/1.0; +https://jddeveloper.com)', Accept: 'text/html' },
      });
      const html = typeof r.body === 'string' ? r.body : '';
      if (r.statusCode >= 200 && r.statusCode < 400 && html.length > 0) return { ...leer(html, dominio), estado: 'abierta' };
      if (esquema === 'http://') return { dominio, estado: 'no_abre', detalle: 'respondio ' + r.statusCode };
    } catch (e) {
      if (esquema === 'http://') return { dominio, estado: 'no_abre', detalle: String(e.message || e).slice(0, 120) };
    }
  }
  return { dominio, estado: 'no_abre' };
}

const salida = [];
for (const item of $input.all()) {
  const e = item.json;
  // Con la cola vacía el nodo anterior puede entregar un elemento sin datos.
  if (!e || !e.id) continue;
  const ocupados = (e.dominios || []).filter((d) => d.estado === 'ocupado').map((d) => d.dominio).slice(0, MAX_PAGINAS);
  const paginas = [];
  for (const d of ocupados) paginas.push(await abrir(this.helpers, d));

  // Solo se pregunta a la IA por páginas con contenido real: una aparcada o
  // vacía ya está resuelta sin gastar una llamada.
  const legibles = paginas.filter((p) => p.estado === 'abierta' && !p.aparcado && p.largo >= 80);

  let cuerpo = null;
  if (legibles.length) {
    const lugar = [e.ciudad, e.estado].filter(Boolean).join(', ');
    const prompt = [
      'Una empresa se acaba de registrar en Estados Unidos. Existen dominios con su nombre, pero pueden ser de OTRA empresa homonima de otro estado. Decide, para cada pagina, si pertenece a esta empresa.',
      '',
      'EMPRESA',
      'Nombre legal: ' + e.nombre,
      lugar ? 'Ubicacion: ' + lugar : '',
      e.direccion ? 'Direccion: ' + e.direccion : '',
      'Registrada el: ' + e.fecha_registro,
      e.actividad_nombre ? 'Actividad probable: ' + e.actividad_nombre + (e.categoria ? ' (' + e.categoria + ')' : '') : '',
      e.contacto_nombre ? (e.contacto_rol || 'Persona') + ': ' + e.contacto_nombre : '',
      '',
      'PAGINAS',
      ...legibles.map((p) => [
        '--- ' + p.dominio,
        'Titulo: ' + p.titulo,
        'Descripcion: ' + p.descripcion,
        'Telefonos en la pagina: ' + (p.telefonos.join(', ') || 'ninguno'),
        'Texto: ' + p.texto,
      ].join('\n')),
      '',
      'CRITERIO',
      '- "si": la pagina nombra la misma ciudad o estado, la misma direccion o la misma persona.',
      '- "probable": misma actividad y nada que lo contradiga, pero sin confirmacion de lugar ni persona.',
      '- "no": otra ciudad o estado, otra actividad, o una empresa claramente mas antigua (la nuestra se acaba de registrar).',
      '- "sin_contenido": en construccion, plantilla sin rellenar o pagina vacia.',
      '- calidad: "buena" si es una web terminada y cuidada; "floja" si es de plantilla, pobre o incompleta; "no_aplica" si no es suya.',
      'No supongas: si el texto no da para decidir, responde "probable" o "no" y dilo en el motivo.',
      '',
      'Responde con JSON: {"paginas":[{"dominio":"","es_suya":"si|probable|no|sin_contenido","calidad":"buena|floja|no_aplica","motivo":"una frase en espanol","que_hace":"una frase en espanol sobre a que se dedica esa pagina"}]}',
    ].filter((l) => l !== '').join('\n');

    cuerpo = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        // Con esquema la respuesta no puede salirse de estas opciones.
        responseSchema: {
          type: 'OBJECT',
          required: ['paginas'],
          properties: {
            paginas: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                required: ['dominio', 'es_suya', 'calidad', 'motivo'],
                properties: {
                  dominio: { type: 'STRING' },
                  es_suya: { type: 'STRING', enum: ['si', 'probable', 'no', 'sin_contenido'] },
                  calidad: { type: 'STRING', enum: ['buena', 'floja', 'no_aplica'] },
                  motivo: { type: 'STRING' },
                  que_hace: { type: 'STRING' },
                },
              },
            },
          },
        },
      },
    };
  }

  // A la IA le va el texto; al resultado guardado, no: ocuparía la tabla sin
  // servir para nada una vez decidido.
  salida.push({
    json: {
      empresa: {
        id: e.id, nombre: e.nombre, nota_reglas: e.nota_reglas, dominios: e.dominios || [], intentos: e.intentos || 0,
      },
      paginas: paginas.map(({ texto, ...resto }) => resto),
      cuerpo,
    },
  });
}
return salida;
