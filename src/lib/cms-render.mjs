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
  const body = datos.body.replace(/\r\n/g, "\n").replace(/^\s*# .*\n/, "").replace(/^\s*By .*\n/m, "").replace(/^\s*Por .*\n/m, "");
  const words = body.split(/\s+/).length;
  const firstPara = body.trim().split("\n\n")[0].replace(/[*_`]/g, "");

  // Una fila de enlaces al final de un párrafo cita las fuentes de lo anterior.
  const label = lang === "en" ? "Sources" : "Fuentes";
  const LINKS = String.raw`(?:<a [^>]*>[^<]*<\/a>(?:,\s*|;\s*)?){2,}`;
  const html = marked
    .parse(body, { async: false })
    .replace(new RegExp(String.raw`<p>((?:(?!<\/p>)[\s\S])*?[.!?])\s+(${LINKS})<\/p>`, "g"), `<p>$1</p><p class="jd-cite"><span>${label}:</span> $2</p>`)
    .replace(new RegExp(String.raw`<p>(${LINKS})<\/p>`, "g"), `<p class="jd-cite"><span>${label}:</span> $1</p>`);

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
    sources: datos.sources,
    gemela: datos.gemela ?? null,
  };
}

export function ordenarPosts(posts) {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date));
}

export function construirNav(posts) {
  const nav = { en: [], es: [] };
  for (const p of posts) nav[p.lang].push({ slug: p.slug, title: p.title, date: p.date });
  return nav;
}
