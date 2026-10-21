// Copia exacta de ../JD Developer/jd-developer-site/src/cms/render.mjs; verificar con scripts/check-cms-render.mjs.
import { marked } from "marked";

export const TYPE_LABEL = {
  comparativo: { en: "Comparison", es: "Comparativa" },
  problema: { en: "Problem and solution", es: "Problema y solución" },
  metodo: { en: "Method", es: "Método" },
};

export const MONTHS = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
};

// Recibe los campos del CMS ya mapeados; sirve tanto para compilar como para la vista previa.
export function renderArticulo(datos) {
  const lang = datos.lang === "es" ? "es" : "en";
  // El H1 y la firma ya se muestran en la cabecera de la página.
  // Solo se quita la firma exacta del autor: con «cualquier línea que empiece por Por»
  // desaparecía de la web un párrafo como «Por eso…» en un artículo sin firma.
  const autor = String(datos.author ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const firma = new RegExp(`^\\s*(?:By|Por) ${autor}[ \\t]*\\n`, "m");
  const contenido = datos.body.replace(/\r\n/g, "\n").replace(/^\s*# .*\n/, "").replace(firma, "");
  // Casillas (0062): resumen, preguntas y cierre van aparte del contenido; aquí se recompone el
  // artículo completo y el resto del proceso (cajas, índice, desplegables) funciona igual.
  const body = componer(contenido, datos, lang);
  const words = body.split(/\s+/).length;
  const firstPara = body.trim().split("\n\n")[0].replace(/[*_`]/g, "");

  // Los enlaces externos que cierran un párrafo, después del punto, son las fuentes de lo
  // anterior. Antes se pintaban como una fila «Fuentes: …» bajo cada párrafo y ensuciaban el
  // texto; ahora son números pequeños (¹ ²) que abren la fuente, y la lista completa va al final
  // con la misma numeración (fuentesHtml). Toda cifra sigue llevando su fuente al lado.
  const refs = [];
  const num = (url) => { let i = refs.indexOf(url); if (i < 0) { refs.push(url); i = refs.length - 1; } return i + 1; };
  const sinEntidades = (s) => s.replace(/&amp;/g, "&");
  const enlaces = (grupo) => [...grupo.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  const sup = (grupo) => `<sup class="jd-ref">${enlaces(grupo).map(([, href, texto]) =>
    `<a href="${href}" title="${texto}" target="_blank" rel="noopener noreferrer">${num(sinEntidades(href))}</a>`).join(", ")}</sup>`;
  // Solo se numeran enlaces externos: un enlace interno al final (a un servicio) se queda como está.
  const externos = (grupo) => enlaces(grupo).every(([, href]) => /^https?:\/\//.test(href));
  const LINKS = String.raw`(?:<a [^>]*>[^<]*<\/a>(?:,\s*|;\s*)?)+`;
  const htmlBase = marked
    .parse(body, { async: false })
    .replace(new RegExp(String.raw`<p>((?:(?!<\/p>)[\s\S])*?[.!?:])\s+(${LINKS})<\/p>`, "g"),
      (todo, texto, grupo) => (externos(grupo) ? `<p>${texto}${sup(grupo)}</p>` : todo))
    .replace(new RegExp(String.raw`<p>(${LINKS})<\/p>`, "g"),
      (todo, grupo) => (externos(grupo) ? `<p class="jd-ref-sola">${sup(grupo)}</p>` : todo));
  // Las preguntas frecuentes se pliegan como en el resto de la web (FaqBlock): cada ### de la
  // sección FAQ pasa a ser un <details> con su respuesta dentro. Así el artículo no se alarga.
  const { html: conIds, toc } = indice(htmlBase);
  // La caja final solo envuelve la casilla Cierre; sin ella, la última sección es contenido normal.
  const html = datos.cierre?.titulo ? cajaFinal(cajaResumen(plegarFaq(conIds))) : cajaResumen(plegarFaq(conIds));
  // La lista final sigue la numeración del texto; las fuentes no citadas van después.
  const sources = [...refs, ...(datos.sources ?? []).filter((u) => !refs.includes(u))];

  const date = datos.fecha;
  const d = new Date(date + "T12:00:00");
  const dateLabel = lang === "en" ? `${MONTHS.en[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}` : `${d.getDate()} ${MONTHS.es[d.getMonth()]} ${d.getFullYear()}`;
  const t = TYPE_LABEL[datos.article_type] || { en: datos.article_type, es: datos.article_type };

  return {
    slug: datos.slug,
    lang,
    title: datos.title_h1,
    titleSeo: datos.title_seo,
    description: datos.meta_description,
    type: datos.article_type,
    cat: t[lang],
    date,
    dateLabel,
    readMin: Math.max(1, Math.round(words / 200)),
    author: datos.author,
    serviceLink: datos.related_service,
    cover: datos.cover,
    html,
    excerpt: firstPara.length > 170 ? firstPara.slice(0, 167).replace(/\s+\S*$/, "").replace(/[.,;:\s]+$/, "") + "…" : firstPara,
    sources,
    toc,
    gemela: datos.gemela ?? null,
  };
}

const TITULOS = { en: { tldr: "TL;DR", faq: "FAQ" }, es: { tldr: "En resumen", faq: "Preguntas frecuentes" } };

/** Contenido + casillas → Markdown completo: resumen tras el primer párrafo, preguntas y cierre al final. */
function componer(contenido, datos, lang) {
  const tldr = (datos.tldr ?? []).filter((t) => String(t).trim());
  const faqs = (datos.faqs ?? []).filter((f) => f && String(f.q ?? "").trim());
  const cierre = datos.cierre?.titulo ? datos.cierre : null;
  if (!tldr.length && !faqs.length && !cierre) return contenido;
  const partes = contenido.trim().split("\n\n");
  const bloques = [partes.shift() ?? ""];
  if (tldr.length) bloques.push(`## ${TITULOS[lang].tldr}`, tldr.map((t) => `- ${String(t).trim()}`).join("\n"));
  if (partes.length) bloques.push(partes.join("\n\n"));
  if (faqs.length) bloques.push(`## ${TITULOS[lang].faq}`, ...faqs.map((f) => `### ${String(f.q).trim()}\n\n${String(f.a ?? "").trim()}`));
  if (cierre) bloques.push(`## ${String(cierre.titulo).trim()}`, String(cierre.texto ?? "").trim());
  return bloques.join("\n\n") + "\n";
}

const sinEtiquetas = (s) => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
const idDe = (texto) => sinEtiquetas(texto).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "seccion";

/** Da un id a cada <h2> y devuelve el índice («En este artículo») a partir de ellos. */
function indice(html) {
  const toc = [];
  const usados = new Set();
  const out = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, texto) => {
    let id = idDe(texto);
    for (let n = 2; usados.has(id); n++) id = `${idDe(texto)}-${n}`;
    usados.add(id);
    toc.push({ id, label: sinEtiquetas(texto) });
    return `<h2 id="${id}">${texto}</h2>`;
  });
  return { html: out, toc };
}

/** «TL;DR» / «En resumen» + su lista → caja gris con la lista numerada (01, 02…). */
function cajaResumen(html) {
  return html.replace(/<h2 id="([^"]+)">(TL;DR|En resumen|Resumen|Quick answer|In short)<\/h2>\s*<ul>([\s\S]*?)<\/ul>/i,
    (_, id, titulo, items) => `<section class="jd-tldr"><h2 id="${id}">${titulo}</h2><ol>${items}</ol></section>`);
}

/** La última sección, si no son las preguntas, es la llamada final: va en una caja con borde. */
function cajaFinal(html) {
  const i = html.lastIndexOf('<h2 id="');
  if (i < 0 || html.slice(i).includes('class="jd-faqs"') || html.slice(i).includes('class="jd-tldr"')) return html;
  return `${html.slice(0, i)}<section class="jd-cta">${html.slice(i)}</section>`;
}

const FAQ_TITULO = /<h2 id="[^"]*">(FAQ|FAQs|Frequently asked questions|Preguntas frecuentes)<\/h2>/i;

/** Convierte los <h3> de la sección FAQ (hasta el siguiente <h2>) en preguntas desplegables. */
function plegarFaq(html) {
  const m = html.match(FAQ_TITULO);
  if (!m) return html;
  const inicio = m.index + m[0].length;
  const resto = html.slice(inicio);
  const fin = resto.search(/<h2[\s>]/);
  const seccion = fin < 0 ? resto : resto.slice(0, fin);
  const preguntas = seccion.split(/(?=<h3[\s>])/).filter((p) => p.trim().startsWith("<h3"));
  if (!preguntas.length) return html;
  const items = preguntas.map((p) => {
    const q = p.match(/^\s*<h3[^>]*>([\s\S]*?)<\/h3>/);
    const respuesta = p.slice(q[0].length).trim();
    return `<details class="jd-faq"><summary><span>${q[1]}</span><i aria-hidden="true">+</i></summary><div>${respuesta}</div></details>`;
  });
  return html.slice(0, inicio) + `<div class="jd-faqs">${items.join("")}</div>` + (fin < 0 ? "" : resto.slice(fin));
}

/** Lista de fuentes al pie, plegada y numerada como los ¹ ² del texto. */
export function fuentesHtml(post) {
  if (!post.sources.length) return "";
  const label = post.lang === "en" ? "Sources" : "Fuentes";
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const items = post.sources.map((u) =>
    `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/, ""))}</a></li>`).join("");
  return `<details class="jd-sources"><summary>${label} (${post.sources.length})</summary><ol>${items}</ol></details>`;
}

export function ordenarPosts(posts) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function construirNav(posts) {
  const nav = { en: [], es: [] };
  for (const p of posts) nav[p.lang].push({ slug: p.slug, title: p.title, date: p.date });
  return nav;
}
