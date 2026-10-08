// Nodo «Leer respuesta» del workflow «Radar - Investigar empresa».
// Saca el JSON de la respuesta de Gemini y marca qué datos están respaldados
// por una página que el buscador de verdad consultó.
const r = $input.first().json;
const previo = $('Armar consulta').first().json;
const base = { id: previo.id, nombre: previo.nombre, modelo: previo.modelo };

// El nodo HTTP sigue adelante aunque Gemini falle (cupo agotado, modelo
// retirado): aquí se convierte en un fallo con mensaje legible.
if (r.error || !r.candidates) {
  const e = r.error || {};
  const msg = (typeof e === 'string' ? e : e.message) || r.message || 'Gemini no devolvio respuesta';
  return [{ json: { ...base, ok: false, error: String(msg).slice(0, 500), sin_cupo: /quota|rate|429|exhausted/i.test(String(msg)) } }];
}

const cand = r.candidates[0] || {};
const texto = ((cand.content || {}).parts || []).map((p) => p.text || '').join('');

let datos = null;
const m = texto.match(/\{[\s\S]*\}/);
try { datos = JSON.parse(m ? m[0] : texto); } catch (e) { datos = null; }
if (!datos) return [{ json: { ...base, ok: false, error: 'la respuesta no era JSON', crudo: texto.slice(0, 800) } }];

// Páginas que Google consultó de verdad para esta respuesta. El título de cada
// una suele ser su dominio; la URL es una redirección de Google.
const meta = cand.groundingMetadata || {};
const fuentes = (meta.groundingChunks || [])
  .map((c) => c.web || {})
  .filter((w) => w.uri)
  .map((w) => ({ titulo: w.title || '', url: w.uri }));
const dominiosCitados = new Set(fuentes.map((f) => f.titulo.toLowerCase().replace(/^www\./, '')));

const dominio = (u) => {
  try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; }
};
// «citada» = el dominio del dato aparece entre las páginas consultadas. Un dato
// no citado no se borra, pero el CRM lo enseña como no verificado y no puntúa.
const citada = (u) => {
  const d = dominio(u);
  if (!d) return false;
  for (const c of dominiosCitados) if (c === d || c.endsWith('.' + d) || d.endsWith('.' + c)) return true;
  return false;
};
const lista = (v) => (Array.isArray(v) ? v : []);
const conUrl = (arr, campo) => lista(arr)
  .filter((x) => x && typeof x[campo] === 'string' && /^https?:\/\//i.test(x[campo]))
  .map((x) => ({ ...x, citada: citada(x[campo]) }));

const investigacion = {
  que_hace: String(datos.que_hace || ''),
  webs: conUrl(datos.webs, 'url'),
  redes: conUrl(datos.redes, 'url'),
  telefonos: conUrl(datos.telefonos, 'fuente_url').filter((x) => x.valor),
  correos: conUrl(datos.correos, 'fuente_url').filter((x) => x.valor),
  google_maps: datos.google_maps && /^https?:\/\//i.test(datos.google_maps.url || '') ? datos.google_maps : null,
  dueno: datos.dueno && datos.dueno.nombre ? datos.dueno : null,
  resumen: String(datos.resumen || ''),
  fuentes,
  busquedas: meta.webSearchQueries || [],
};

const VEREDICTOS = ['sin_web', 'web_floja', 'tiene_web', 'sin_rastro'];
const veredicto = VEREDICTOS.includes(datos.veredicto) ? datos.veredicto : 'sin_rastro';

return [{ json: { ...base, ok: true, veredicto, investigacion } }];
