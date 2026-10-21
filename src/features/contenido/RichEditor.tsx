import { useEffect } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Undo2, Redo2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import './rich-editor.css'
import type { CmsLang } from '@/types/cms'

/**
 * Editor visual del contenido, como el texto enriquecido de Webflow: negrita, subtítulos y
 * enlaces con botones, sin ver ningún símbolo. Por dentro sigue guardando Markdown, que es lo
 * que la web convierte (render.mjs); por eso no cambia nada más.
 */
type MdStorage = { markdown: { getMarkdown: () => string } }

export function RichEditor({ value, onChange, disabled, lang }: {
  value: string; onChange: (markdown: string) => void; disabled?: boolean; lang: CmsLang
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      Markdown.configure({ html: false, tightLists: true, linkify: true, breaks: false }),
    ],
    content: value,
    editable: !disabled,
    editorProps: { attributes: { class: 'cms-rich focus:outline-none', lang, spellcheck: 'true' } },
    onUpdate: ({ editor }) => onChange((editor.storage as unknown as MdStorage).markdown.getMarkdown()),
  })
  useEffect(() => { editor?.setEditable(!disabled) }, [editor, disabled])

  const estado = useEditorState({
    editor,
    selector: ({ editor: e }) => e ? {
      h2: e.isActive('heading', { level: 2 }), h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'), italic: e.isActive('italic'), link: e.isActive('link'),
      ul: e.isActive('bulletList'), ol: e.isActive('orderedList'), quote: e.isActive('blockquote'),
    } : null,
  })
  if (!editor) return null

  const enlace = () => {
    const actual = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(lang === 'es' ? 'Dirección del enlace (vacío para quitarlo)' : 'Link address (empty to remove)', actual ?? 'https://')
    if (url === null) return
    if (!url.trim()) editor.chain().focus().unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
  }
  const botones = [
    { icon: Heading2, label: 'Subtítulo', on: estado?.h2, run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { icon: Heading3, label: 'Subtítulo menor', on: estado?.h3, run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { icon: Bold, label: 'Negrita', on: estado?.bold, run: () => editor.chain().focus().toggleBold().run() },
    { icon: Italic, label: 'Cursiva', on: estado?.italic, run: () => editor.chain().focus().toggleItalic().run() },
    { icon: Link2, label: 'Enlace', on: estado?.link, run: enlace },
    { icon: List, label: 'Lista', on: estado?.ul, run: () => editor.chain().focus().toggleBulletList().run() },
    { icon: ListOrdered, label: 'Lista numerada', on: estado?.ol, run: () => editor.chain().focus().toggleOrderedList().run() },
    { icon: Quote, label: 'Cita', on: estado?.quote, run: () => editor.chain().focus().toggleBlockquote().run() },
    { icon: Undo2, label: 'Deshacer', on: false, run: () => editor.chain().focus().undo().run() },
    { icon: Redo2, label: 'Rehacer', on: false, run: () => editor.chain().focus().redo().run() },
  ]

  return <div>
    <div className="sticky top-[calc(var(--topbar-h)+var(--safe-top)+49px)] z-10 -mx-1 border-b border-border bg-bg/95 px-1 py-1 backdrop-blur">
      <div role="toolbar" aria-label="Formato" className="flex items-center gap-0.5 overflow-x-auto sin-barra">
        {botones.map(b => <button key={b.label} type="button" disabled={disabled} title={b.label} aria-label={b.label} aria-pressed={!!b.on}
          onMouseDown={e => e.preventDefault()} onClick={b.run}
          className={cn('inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-40',
            b.on ? 'bg-fg text-bg' : 'text-muted hover:bg-surface-2 hover:text-fg')}>
          <b.icon size={16} />
        </button>)}
      </div>
    </div>
    <EditorContent editor={editor} className="mt-4 min-h-[40vh]" />
  </div>
}
