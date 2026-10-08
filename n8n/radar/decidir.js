// Nodos «Decidir con IA» y «Decidir sin IA» del workflow «Radar - Leer paginas».
// Mismo código en los dos: la diferencia es si llega o no una respuesta de Gemini.
//
// Junta lo que se leyó de cada página con el juicio de la IA y deja el
// veredicto, la nota final y los contactos encontrados, listo para guardar.

const previo = $('Abrir sus paginas').item.json;
const { empresa, paginas } = previo;
const gemini = previo.cuerpo ? $input.item.json : null;

const ahora = new Date().toISOString();

// Gemini falló (modelo saturado, cupo): la empresa vuelve a la cola, hasta
// tres intentos. No se inventa un veredicto con media información.
if (gemini && (gemini.error || !gemini.candidates)) {
  const e = gemini.error || {};
  const msg = String((typeof e === 'string' ? e : e.description || e.message) || 'Gemini no respondio').slice(0, 300);
  const agotada = empresa.intentos >= 3;
  return {
    json: {
      id: empresa.id,
      cambios: {
        investigacion_estado: agotada ? 'fallo' : 'en_cola',
        investigacion_error: msg,
        updated_at: ahora,
      },
    },
  };
}

let juicios = [];
if (gemini) {
  const texto = (((gemini.candidates[0] || {}).content || {}).parts || []).map((p) => p.text || '').join('');
  // Gemini responde unas veces {"paginas":[...]} y otras la lista a secas.
  let leido = null;
  try { leido = JSON.parse(texto); } catch (err) {
    const m = texto.match(/[\[{][\s\S]*[\]}]/);
    try { leido = m ? JSON.parse(m[0]) : null; } catch (err2) { leido = null; }
  }
  const lista = Array.isArray(leido) ? leido : ((leido && leido.paginas) || []);
  juicios = lista.filter((j) => j && j.dominio);
}
const juicioDe = (dominio) => juicios.find((j) => String(j.dominio).toLowerCase().replace(/^www\./, '') === dominio);

const webs = paginas.map((p) => {
  const j = juicioDe(p.dominio);
  let es = 'no_abre';
  if (p.estado === 'abierta') es = p.aparcado ? 'aparcado' : (p.largo < 80 ? 'sin_contenido' : ((j && j.es_suya) || 'sin_juicio'));
  return {
    dominio: p.dominio,
    url: 'https://' + p.dominio,
    es_suya: es,
    calidad: (j && j.calidad) || 'no_aplica',
    motivo: (j && j.motivo) || (es === 'aparcado' ? 'Dominio aparcado o en venta.' : es === 'no_abre' ? 'El dominio existe pero la pagina no abre.' : es === 'sin_contenido' ? 'Pagina vacia o en construccion.' : ''),
    que_hace: (j && j.que_hace) || '',
    titulo: p.titulo || '',
  };
});

// Solo «si» cuenta como suya. Una «probable» se enseña para que alguien la
// abra, pero ni decide el veredicto ni presta sus contactos: en la primera
// corrida real una «probable» resultó tener teléfono de otro estado.
const suyas = webs.filter((w) => w.es_suya === 'si');
const propia = suyas[0];
const dudosa = webs.find((w) => w.es_suya === 'probable');

let veredicto;
if (propia) veredicto = propia.calidad === 'buena' ? 'tiene_web' : 'web_floja';
else if (dudosa || webs.some((w) => w.es_suya === 'sin_juicio')) veredicto = 'sin_decidir';
else if (webs.some((w) => w.es_suya === 'sin_contenido')) veredicto = 'web_en_construccion';
else veredicto = 'dominio_ajeno';

// La nota por reglas ya restó puntos por «hay una página con su nombre». Ahora
// que se sabe de quién es, se deshace ese ajuste y se pone el que corresponde.
const ocupados = empresa.dominios.filter((d) => d.estado === 'ocupado');
const restado = ocupados.some((d) => /\.com$/.test(d.dominio)) ? -3 : (ocupados.length ? -1 : 0);
// Una página vacía o un dominio en venta puntúan igual que no tener dominio:
// no se sabe de quién son, solo que ahí no hay web.
const AJUSTE = { tiene_web: -4, web_floja: 1, web_en_construccion: 2, dominio_ajeno: 2, sin_decidir: 0 };
const nota = Math.max(1, Math.min(10, (empresa.nota_reglas || 4) - restado + AJUSTE[veredicto]));

// Los contactos solo cuentan si salen de una página que se dio por suya.
const dePaginasSuyas = (campo) => {
  const vistos = [];
  for (const w of suyas) {
    const p = paginas.find((x) => x.dominio === w.dominio) || {};
    for (const v of (p[campo] || [])) {
      const clave = typeof v === 'string' ? v : v.url;
      if (!vistos.some((x) => (x.valor || x.url) === clave)) {
        vistos.push(typeof v === 'string'
          ? { valor: v, fuente_url: w.url, confianza: 'segura' }
          : { ...v, fuente_url: w.url, confianza: 'segura' });
      }
    }
  }
  return vistos;
};

const FRASE = {
  tiene_web: 'Ya tiene una web propia y cuidada.',
  web_floja: 'Tiene web propia, pero floja o a medias: hay margen para ofrecerle una mejor.',
  web_en_construccion: 'Hay un dominio con su nombre y la pagina esta vacia o en construccion. No se sabe si es suyo, pero web hecha no tiene.',
  dominio_ajeno: 'Los dominios con su nombre estan en venta, no abren o son de otra empresa: no se le encontro web propia.',
  sin_decidir: 'Hay una pagina que podria ser suya, pero nada lo confirma. Abrela antes de contactar.',
};

return {
  json: {
    id: empresa.id,
    cambios: {
      investigacion_estado: 'hecha',
      investigacion_error: null,
      investigada_en: ahora,
      updated_at: ahora,
      veredicto,
      nota_final: nota,
      investigacion: {
        metodo: gemini ? 'paginas+ia' : 'paginas',
        resumen: FRASE[veredicto],
        que_hace: (propia && propia.que_hace) || '',
        webs,
        correos: dePaginasSuyas('correos'),
        telefonos: dePaginasSuyas('telefonos'),
        redes: dePaginasSuyas('redes'),
      },
    },
  },
};
