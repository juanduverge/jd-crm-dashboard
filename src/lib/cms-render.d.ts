declare module '@/lib/cms-render.mjs' {
  interface RenderInput {
    lang: 'en' | 'es'
    slug: string
    title_h1: string
    title_seo: string
    meta_description: string
    article_type: string
    fecha: string
    author: string
    related_service: string
    cover: string
    body: string
    sources: string[]
    gemela?: { lang: 'en' | 'es'; slug: string } | null
  }
  interface RenderedPost {
    slug: string; lang: 'en' | 'es'; title: string; titleSeo: string; description: string
    type: string; cat: string; date: string; dateLabel: string; readMin: number
    author: string; serviceLink: string; cover: string; html: string; excerpt: string
    sources: string[]; gemela: { lang: 'en' | 'es'; slug: string } | null
  }
  export function renderArticulo(datos: RenderInput): RenderedPost
  export function ordenarPosts(posts: RenderedPost[]): RenderedPost[]
  export function fuentesHtml(post: Pick<RenderedPost, 'lang' | 'sources'>): string
  export function construirNav(posts: RenderedPost[]): Record<'en' | 'es', { slug: string; title: string; date: string }[]>
  export const TYPE_LABEL: Record<string, Record<'en' | 'es', string>>
  export const MONTHS: Record<'en' | 'es', string[]>
}
