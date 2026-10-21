import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button, Input, Textarea } from '@/components/ui'
import type { CmsCierre, CmsFaq, CmsLang } from '@/types/cms'

/**
 * Las partes fijas del artículo, cada una en su casilla (0062), como las colecciones de
 * Webflow. La web les pone el título y el diseño: caja de resumen, preguntas desplegables
 * y caja final. Quien escribe solo rellena el texto.
 */

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return <section className="card space-y-3">
    <div><h3 className="t-card">{titulo}</h3><p className="t-hint">{ayuda}</p></div>
    {children}
  </section>
}

/** Mueve un elemento de la lista una posición arriba o abajo. */
const mover = <T,>(lista: T[], i: number, d: -1 | 1) => {
  const j = i + d
  if (j < 0 || j >= lista.length) return lista
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]]
  return copia
}

function Orden({ i, total, onMove, onRemove, disabled, label }: {
  i: number; total: number; onMove: (d: -1 | 1) => void; onRemove: () => void; disabled?: boolean; label: string
}) {
  return <div className="flex shrink-0 gap-0.5">
    <Button type="button" variant="ghost" size="icon" disabled={disabled || i === 0} aria-label={`Subir ${label}`} onClick={() => onMove(-1)}><ArrowUp size={15} /></Button>
    <Button type="button" variant="ghost" size="icon" disabled={disabled || i === total - 1} aria-label={`Bajar ${label}`} onClick={() => onMove(1)}><ArrowDown size={15} /></Button>
    <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Quitar ${label}`} onClick={onRemove}><Trash2 size={15} /></Button>
  </div>
}

export function CasillaResumen({ value, onChange, disabled, lang }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean; lang: CmsLang }) {
  return <Bloque titulo={lang === 'es' ? 'Resumen («En resumen»)' : 'Summary («TL;DR»)'}
    ayuda="Sale en una caja después del primer párrafo, numerada 01, 02, 03. De 3 a 5 puntos cortos.">
    {value.map((t, i) => <div key={i} className="flex items-start gap-2">
      <span className="mt-2.5 w-6 shrink-0 text-xs font-bold text-primary-600">{String(i + 1).padStart(2, '0')}</span>
      <Input value={t} disabled={disabled} aria-label={`Punto ${i + 1}`} onChange={e => onChange(value.map((x, j) => j === i ? e.target.value : x))} />
      <Orden i={i} total={value.length} label={`punto ${i + 1}`} disabled={disabled}
        onMove={d => onChange(mover(value, i, d))} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, ''])}><Plus size={14} />Punto</Button>
  </Bloque>
}

export function CasillaPreguntas({ value, onChange, disabled, lang }: { value: CmsFaq[]; onChange: (v: CmsFaq[]) => void; disabled?: boolean; lang: CmsLang }) {
  const set = (i: number, k: keyof CmsFaq, v: string) => onChange(value.map((f, j) => j === i ? { ...f, [k]: v } : f))
  return <Bloque titulo={lang === 'es' ? 'Preguntas frecuentes' : 'FAQ'}
    ayuda="Cada pregunta se abre y se cierra en la web. Las que la gente busca de verdad, con respuesta corta.">
    {value.map((f, i) => <div key={i} className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-start gap-2">
        <Input value={f.q} disabled={disabled} placeholder={lang === 'es' ? '¿Pregunta?' : 'Question?'} aria-label={`Pregunta ${i + 1}`}
          className="font-medium" onChange={e => set(i, 'q', e.target.value)} />
        <Orden i={i} total={value.length} label={`pregunta ${i + 1}`} disabled={disabled}
          onMove={d => onChange(mover(value, i, d))} onRemove={() => onChange(value.filter((_, j) => j !== i))} />
      </div>
      <Textarea value={f.a} disabled={disabled} placeholder={lang === 'es' ? 'Respuesta' : 'Answer'} aria-label={`Respuesta ${i + 1}`}
        className="min-h-[72px]" onChange={e => set(i, 'a', e.target.value)} />
    </div>)}
    <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange([...value, { q: '', a: '' }])}><Plus size={14} />Pregunta</Button>
  </Bloque>
}

export function CasillaCierre({ value, onChange, disabled, lang }: { value: CmsCierre | null; onChange: (v: CmsCierre | null) => void; disabled?: boolean; lang: CmsLang }) {
  const c = value ?? { titulo: '', texto: '' }
  return <Bloque titulo="Cierre"
    ayuda="Va al final en una caja con borde: qué hacer ahora y el enlace al servicio. Respondemos el mismo día.">
    <Input value={c.titulo} disabled={disabled} placeholder={lang === 'es' ? '¿Por dónde empezar?' : 'What should you do next?'} aria-label="Título del cierre"
      className="font-medium" onChange={e => onChange({ ...c, titulo: e.target.value })} />
    <Textarea value={c.texto} disabled={disabled} aria-label="Texto del cierre" className="min-h-[96px]"
      placeholder={lang === 'es' ? 'Cuéntanos… En JD Developer, nuestro [servicio](/es/servicios/…) … Respondemos el mismo día.' : 'Tell us… At JD Developer, our [service](/services/…) … We reply the same day.'}
      onChange={e => onChange({ ...c, texto: e.target.value })} />
    <p className="t-hint">Para un enlace: [texto](dirección).</p>
  </Bloque>
}
