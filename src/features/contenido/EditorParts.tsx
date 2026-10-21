import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Monitor, Quote, Smartphone, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils'
import type { CmsDraft, CmsLang } from '@/types/cms'
import { ArticlePreview } from './ArticlePreview'
import { LANGUAGES, publicUrl } from './model'

/**
 * Bloques con la estructura que la web convierte sola: el resumen en caja numerada, las
 * preguntas desplegables y la caja final (render.mjs). Los títulos tienen que ser estos.
 */
const BLOQUES: Record<CmsLang, { label: string; md: string }[]> = {
  es: [
    { label: 'Resumen', md: '## En resumen\n\n- Primer punto.\n- Segundo punto.\n- Tercer punto.' },
    { label: 'Preguntas frecuentes', md: '## Preguntas frecuentes\n\n### ¿Primera pregunta?\n\nRespuesta.\n\n### ¿Segunda pregunta?\n\nRespuesta.' },
    { label: 'Otra pregunta', md: '### ¿Pregunta?\n\nRespuesta.' },
    { label: 'Cierre', md: '## ¿Por dónde empezar?\n\nQué hacer ahora y el enlace al [servicio](/es/servicios/desarrollo-webflow). Respondemos el mismo día.' },
  ],
  en: [
    { label: 'Summary', md: '## TL;DR\n\n- First point.\n- Second point.\n- Third point.' },
    { label: 'FAQ', md: '## FAQ\n\n### First question?\n\nAnswer.\n\n### Second question?\n\nAnswer.' },
    { label: 'Another question', md: '### Question?\n\nAnswer.' },
    { label: 'Closing', md: '## What should you do next?\n\nWhat to do now and the link to the [service](/services/webflow-development). We reply the same day.' },
  ],
}

/** Un textarea que crece con el texto: así solo hay una barra de desplazamiento, la de la página. */
export function useAutosize(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

/* ---------- Barra de formato ---------- */

type Accion = { icon: typeof Bold; label: string; run: (sel: string) => { text: string; linea?: boolean } }
const ACCIONES: Accion[] = [
  { icon: Heading2, label: 'Subtítulo (H2)', run: s => ({ text: `## ${s || 'Subtítulo'}`, linea: true }) },
  { icon: Heading3, label: 'Subtítulo menor (H3)', run: s => ({ text: `### ${s || 'Subtítulo'}`, linea: true }) },
  { icon: Bold, label: 'Negrita', run: s => ({ text: `**${s || 'texto'}**` }) },
  { icon: Italic, label: 'Cursiva', run: s => ({ text: `*${s || 'texto'}*` }) },
  { icon: Link2, label: 'Enlace', run: s => ({ text: `[${s || 'texto'}](https://)` }) },
  { icon: List, label: 'Lista', run: s => ({ text: (s || 'Elemento').split('\n').map(l => `- ${l}`).join('\n'), linea: true }) },
  { icon: ListOrdered, label: 'Lista numerada', run: s => ({ text: (s || 'Paso').split('\n').map((l, i) => `${i + 1}. ${l}`).join('\n'), linea: true }) },
  { icon: Quote, label: 'Cita', run: s => ({ text: `> ${s || 'Cita'}`, linea: true }) },
]

/**
 * Inserta Markdown en la selección. Quien escribe no tiene por qué saberse la
 * sintaxis; la ve aparecer y la aprende.
 */
export function FormatBar({ target, onChange, disabled, lang }: {
  target: RefObject<HTMLTextAreaElement | null>; onChange: (value: string) => void; disabled?: boolean; lang: CmsLang
}) {
  const aplicar = (accion: Accion) => {
    const el = target.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value } = el
    const { text, linea } = accion.run(value.slice(a, b))
    // Los bloques (subtítulos, listas, citas) necesitan línea propia.
    const antes = linea && a > 0 && value[a - 1] !== '\n' ? '\n\n' : ''
    const despues = linea && value[b] !== undefined && value[b] !== '\n' ? '\n\n' : ''
    const next = value.slice(0, a) + antes + text + despues + value.slice(b)
    onChange(next)
    requestAnimationFrame(() => { el.focus(); const end = a + antes.length + text.length; el.setSelectionRange(end, end) })
  }
  return <div role="toolbar" aria-label="Formato" className="flex items-center gap-0.5 overflow-x-auto sin-barra">
    {ACCIONES.map(accion => <button key={accion.label} type="button" disabled={disabled} title={accion.label} aria-label={accion.label}
      onMouseDown={e => e.preventDefault()} onClick={() => aplicar(accion)}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40">
      <accion.icon size={16} />
    </button>)}
    <span className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
    {BLOQUES[lang].map(b => <button key={b.label} type="button" disabled={disabled} title={`Insertar: ${b.label}`}
      onMouseDown={e => e.preventDefault()} onClick={() => aplicar({ icon: Bold, label: b.label, run: () => ({ text: b.md, linea: true }) })}
      className="h-8 shrink-0 rounded-lg px-2.5 text-xs font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-40">
      + {b.label}
    </button>)}
  </div>
}

/* ---------- Portada ---------- */

export function Cover({ url, uploading, disabled, onUpload, onRemove }: {
  url: string | null; uploading: boolean; disabled?: boolean; onUpload: (file: File) => void; onRemove: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const pick = <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
    onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = '' }} />
  if (!url) return <>
    {pick}
    <button type="button" disabled={disabled || uploading} onClick={() => input.current?.click()}
      className="flex h-11 items-center gap-2 rounded-xl px-1 text-sm text-muted transition-colors hover:text-fg disabled:opacity-50">
      <ImagePlus size={18} />{uploading ? 'Subiendo portada…' : 'Añadir portada'}
    </button>
  </>
  return <div className="group relative aspect-[21/9] overflow-hidden rounded-2xl bg-surface-2">
    {pick}
    <img src={url} alt="" className="h-full w-full object-cover" />
    {!disabled && <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
      <Button type="button" size="sm" variant="outline" className="bg-surface/90 backdrop-blur" disabled={uploading} onClick={() => input.current?.click()}>
        <ImagePlus size={14} />{uploading ? 'Subiendo…' : 'Cambiar'}
      </Button>
      <Button type="button" size="sm" variant="outline" className="bg-surface/90 backdrop-blur" aria-label="Quitar portada" onClick={onRemove}><Trash2 size={14} /></Button>
    </div>}
  </div>
}

/* ---------- Cómo se verá en Google ---------- */

export function GoogleSnippet({ draft, lang }: { draft: CmsDraft; lang: CmsLang }) {
  const title = draft.title_seo || draft.title_h1 || 'Título del artículo'
  const url = publicUrl(lang, draft.slug).replace('https://', '').split('/').join(' › ')
  return <div className="rounded-xl border border-border bg-surface p-3" aria-label="Así se verá en Google">
    <p className="truncate text-xs text-muted">{url}</p>
    {/* Google corta hacia los 60 caracteres: se corta igual aquí para que se vea el efecto. */}
    <p className="mt-1 line-clamp-1 text-[1.0625rem] leading-snug text-[#1a0dab] dark:text-[#8ab4f8]">{title.length > 62 ? `${title.slice(0, 60)}…` : title}</p>
    <p className="mt-1 line-clamp-2 text-[0.8125rem] leading-snug text-muted">
      {draft.meta_description || 'Sin descripción: Google elegirá un trozo del texto.'}
    </p>
  </div>
}

/** Contador con barra: verde dentro del rango, ámbar fuera. */
export function Counter({ value, min, max }: { value: number; min: number; max: number }) {
  const ok = value >= min && value <= max
  return <span className="flex items-center gap-2">
    <span className="h-1 w-16 overflow-hidden rounded-full bg-surface-2">
      <span className={cn('block h-full rounded-full', ok ? 'bg-green-600' : 'bg-amber-500')} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </span>
    <span className={cn('tabular-nums', !ok && value > 0 && 'text-amber-700 dark:text-amber-400')}>{value}/{max}</span>
  </span>
}

/* ---------- Vista previa a pantalla completa ---------- */

export function PreviewOverlay({ draft, lang, note, onClose }: { draft: CmsDraft; lang: CmsLang; note?: string; onClose: () => void }) {
  const [movil, setMovil] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [onClose])
  return <div role="dialog" aria-modal="true" aria-label="Vista previa" className="fixed inset-0 z-50 flex flex-col bg-bg">
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2 pt-[calc(0.5rem+var(--safe-top,0px))] sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">Vista previa · {LANGUAGES[lang]}</p>
        <p className="truncate text-xs text-muted">{note ?? 'Así se verá en la web. Los enlaces se abren en otra pestaña.'}</p>
      </div>
      <div className="hidden rounded-xl bg-surface-2 p-0.5 sm:flex">
        {([[false, Monitor, 'Escritorio'], [true, Smartphone, 'Móvil']] as const).map(([value, Icon, label]) =>
          <button key={label} type="button" onClick={() => setMovil(value)} aria-pressed={movil === value}
            className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium', movil === value ? 'bg-surface shadow-card' : 'text-muted')}>
            <Icon size={14} />{label}
          </button>)}
      </div>
      <Button type="button" variant="outline" size="icon" aria-label="Cerrar vista previa" onClick={onClose}><X size={18} /></Button>
    </div>
    <div className="min-h-0 flex-1 bg-surface-2">
      <div className={cn('mx-auto h-full bg-[#FBF3EB] transition-[max-width] duration-300', movil ? 'max-w-[390px] border-x border-border' : 'max-w-full')}>
        <ArticlePreview draft={draft} lang={lang} />
      </div>
    </div>
  </div>
}
