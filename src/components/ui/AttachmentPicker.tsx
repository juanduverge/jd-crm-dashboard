import { Paperclip, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { MAX_ATTACHMENT_MB } from '@/lib/utils'

export function AttachmentPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!f) return
    if (f.size > MAX_ATTACHMENT_MB * 1024 * 1024) {
      toast.error(`El archivo supera el límite de ${MAX_ATTACHMENT_MB}MB`)
      return
    }
    onChange(f)
  }

  if (file) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs">
        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted" />
        <span className="min-w-0 flex-1 truncate" title={file.name}>{file.name}</span>
        <span className="shrink-0 text-muted">{(file.size / 1024 / 1024).toFixed(1)}MB</span>
        <button type="button" onClick={() => onChange(null)} className="shrink-0 text-muted hover:text-red-500">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <label className="btn-outline inline-flex h-9 w-fit cursor-pointer items-center px-3 text-xs">
      <Paperclip className="h-4 w-4" /> Adjuntar archivo
      <input type="file" className="hidden" onChange={pick} />
    </label>
  )
}
