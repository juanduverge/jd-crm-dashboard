import { useMemo } from 'react'
import { renderArticulo } from '@/lib/cms-render.mjs'
import type { CmsDraft, CmsLang } from '@/types/cms'
import textFont from './assets/manrope-500.woff2?inline'
import boldFont from './assets/manrope-700.woff2?inline'
import titleFont from './assets/archivo-black.woff2?inline'
import proseStyles from './article-preview.css?raw'
import { isWebUrl } from './model'

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

export function ArticlePreview({ draft, lang, title = 'Vista previa del artículo', className }: { draft: CmsDraft; lang: CmsLang; title?: string; className?: string }) {
  const document = useMemo(() => {
    const post = renderArticulo({ ...draft, lang,
      fecha: draft.fecha || '2000-01-01', cover: draft.og_image || '',
      article_type: String(draft.fields.article_type ?? ''), related_service: String(draft.fields.related_service ?? '') })
    const e = escapeHtml
    const sources = post.sources.filter(isWebUrl)
    const service = post.serviceLink.replace(/^\/es/, '')
    const servicePath = lang === 'es' ? `/es${service.replace('/services/', '/servicios/')}` : service
    const serviceHtml = service.startsWith('/') && !service.startsWith('//') ? `<p><a href="https://jddeveloper.com${e(servicePath)}">${lang === 'es' ? 'Ver el servicio relacionado →' : 'See the related service →'}</a></p>` : ''
    const footer = `${serviceHtml}<h2>${lang === 'en' ? 'Sources' : 'Fuentes'}</h2><ul>${sources.map(url => `<li><a href="${e(url)}">${e(url.replace(/^https?:\/\/(www\.)?/, ''))}</a></li>`).join('')}</ul>`
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data: blob:; font-src data:; style-src 'unsafe-inline'"><base target="_blank"><style>
      @font-face{font-family:Manrope;src:url('${textFont}');font-weight:500;font-display:swap}
      @font-face{font-family:Manrope;src:url('${boldFont}');font-weight:700;font-display:swap}
      @font-face{font-family:Archivo;src:url('${titleFont}');font-weight:100 900;font-display:swap}
      ${proseStyles}
    </style></head><body><main><header><div class="meta"><span>${e(post.cat || 'Artículo')}</span>${draft.fecha ? `<span>${e(post.dateLabel)}</span>` : ''}<span>${post.readMin} ${lang === 'en' ? 'min read' : 'min de lectura'}</span></div><h1>${e(post.title || 'Título del artículo')}</h1><p class="author">${e(post.author)}</p></header>${isWebUrl(post.cover) ? `<div class="cover"><img alt="${e(post.title)}" src="${e(post.cover)}"></div>` : ''}<article><div class="jd-prose">${post.html}${footer}</div></article></main></body></html>`
  }, [draft, lang])
  // El Markdown admite HTML. El iframe sin permisos evita que ejecute scripts
  // o acceda a la sesión del CRM; las fuentes se incluyen como datos locales.
  return <iframe title={title} sandbox="" referrerPolicy="no-referrer" srcDoc={document} className={className ?? 'block h-full w-full min-w-0 bg-[#FBF3EB]'} />
}
