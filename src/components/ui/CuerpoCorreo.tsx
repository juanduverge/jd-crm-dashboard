import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ImageOff, Type, Palette } from 'lucide-react'
import { htmlToText } from '@/lib/utils'
import { useUiStore } from '@/store/uiStore'

/**
 * Cuerpo de un correo.
 *
 * Antes se pasaba todo por `htmlToText` y se pintaba como párrafo suelto: un
 * boletín con tablas y botones se quedaba en blanco o en una escalera de
 * palabras sueltas. Un correo es HTML y hay que enseñarlo como HTML.
 *
 * Va dentro de un iframe con `sandbox` y una CSP propia:
 *  - sin `allow-scripts`, así que nada de lo que llegue por correo se ejecuta;
 *  - `allow-same-origin` solo para poder medir el alto y que no salga un
 *    marco con su propia barra de scroll dentro de la página;
 *  - las imágenes remotas empiezan bloqueadas — en un correo frío casi
 *    siempre son píxeles de rastreo — y se cargan cuando se piden.
 *
 * Dos reglas que costaron un rediseño aprender:
 *
 *  1. Un correo con diseño se pinta sobre BLANCO, siempre, aunque el CRM esté
 *     en oscuro. El primer intento le quitaba los fondos a botones y cabeceras
 *     para que no encendieran un folio en la pantalla; lo que conseguía era
 *     texto blanco sobre nada. Un boletín está hecho para fondo blanco: la
 *     forma de que no se vea raro es enseñarlo tal cual, en su propia tarjeta.
 *  2. Detectar imágenes remotas con una expresión regular sobre `<img src=`
 *     deja fuera media docena de formas que usan los boletines de verdad
 *     (`//cdn…` sin protocolo, `background=`, `url()` en CSS, `srcset`). Y si
 *     no se detectan, la CSP las bloquea sin que salga el aviso: desaparecen
 *     en silencio. Aquí se busca en el árbol ya parseado, no en el texto.
 */

const RE_ETIQUETAS = /<[a-z!/][\s\S]*>/i
/** Lo que hay que quitar sí o sí antes de meterlo en el marco. */
const PROHIBIDO = 'script, link, meta, base, title, iframe, object, embed, applet, form, noscript'
const CLAVE_IMAGENES = 'crm:correo:mostrar-imagenes'

interface Preparado {
  /** HTML listo para el marco: solo el contenido, con sus `<style>` delante. */
  contenido: string
  /** Trae tablas de maquetación, hojas de estilo o fondos: es un correo diseñado. */
  disenado: boolean
  /** Referencias externas que la CSP va a bloquear (imágenes, fondos, tipografías). */
  externas: boolean
  /** Imágenes adjuntas en línea (`cid:`), que el navegador nunca sabe resolver. */
  adjuntas: boolean
}

/**
 * Extrae el cuerpo, tira lo ejecutable y averigua de qué tipo de correo se
 * trata. `DOMParser` no ejecuta nada de lo que parsea, así que es seguro.
 */
function preparar(bruto: string): Preparado {
  const vacio: Preparado = { contenido: bruto, disenado: false, externas: false, adjuntas: false }
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(bruto, 'text/html')
  } catch {
    return vacio
  }
  if (!doc?.body) return vacio

  doc.querySelectorAll(PROHIBIDO).forEach((el) => el.remove())
  // Un `target` propio dentro del marco no lleva a ninguna parte: sin
  // `allow-top-navigation` el clic se pierde. El `<base>` los manda todos fuera.
  doc.querySelectorAll('a[target]').forEach((a) => a.removeAttribute('target'))

  // Los `<style>` del `<head>` se pierden al quedarnos solo con el cuerpo.
  const estilos = [...doc.head.querySelectorAll('style')].map((s) => s.outerHTML).join('')

  let externas = false
  let adjuntas = false
  const marcaFuente = (valor: string | null) => {
    if (!valor) return
    const v = valor.trim().toLowerCase()
    if (v.startsWith('cid:')) adjuntas = true
    // `//host/x.png` hereda el esquema de la página: es remota igual.
    else if (/^https?:/.test(v) || v.startsWith('//')) externas = true
  }

  doc.body.querySelectorAll('[src], [srcset], [background], [style]').forEach((el) => {
    marcaFuente(el.getAttribute('src'))
    marcaFuente(el.getAttribute('background'))
    const srcset = el.getAttribute('srcset')
    if (srcset) srcset.split(',').forEach((p) => marcaFuente(p.trim().split(/\s+/)[0]))
    const style = el.getAttribute('style')
    if (style) [...style.matchAll(/url\(\s*['"]?([^'")]+)/gi)].forEach((m) => marcaFuente(m[1]))
  })
  if (/url\(\s*['"]?(https?:)?\/\//i.test(estilos)) externas = true

  // Un correo "diseñado" es el que trae maquetación propia. Al que solo tiene
  // <p> y <a> no hace falta ponerle un folio blanco debajo: se lee mejor con
  // los colores del CRM.
  const disenado =
    !!estilos ||
    !!doc.body.querySelector('table, [bgcolor], [background], center') ||
    /background(-color)?\s*:/i.test(doc.body.getAttribute('style') || '') ||
    [...doc.body.querySelectorAll('[style]')].some((el) =>
      /background(-color)?\s*:/i.test(el.getAttribute('style') || ''),
    )

  return { contenido: estilos + doc.body.innerHTML, disenado, externas, adjuntas }
}

function documento(prep: Preparado, imagenes: boolean, oscuro: boolean) {
  const csp = [
    "default-src 'none'",
    `img-src data: cid:${imagenes ? ' https: http:' : ''}`,
    "style-src 'unsafe-inline'",
    'font-src data:',
    "frame-src 'none'",
  ].join('; ')

  // Correo diseñado → su propio mundo, sobre blanco. Correo simple → el tema
  // del CRM, como cualquier otro texto de la app.
  const sobreBlanco = prep.disenado
  const fondo = sobreBlanco ? '#ffffff' : 'transparent'
  const fg = sobreBlanco ? '#161616' : oscuro ? '#f5f3f0' : '#161616'
  const muted = sobreBlanco ? '#71717a' : oscuro ? '#9c9ca6' : '#71717a'
  const enlace = sobreBlanco ? '#c5510f' : oscuro ? '#ff9a78' : '#c5510f'
  const borde = sobreBlanco ? '#e8e0da' : oscuro ? '#2d2d32' : '#e8e0da'

  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html{overflow-y:hidden}
  html,body{margin:0;padding:0;background:${fondo}}
  body{
    color:${fg};
    font:400 14px/1.65 Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;
    ${sobreBlanco ? 'padding:16px;' : ''}
    /* Un boletín de 700px no puede empujar la página: se desplaza aquí dentro. */
    overflow-x:auto;
  }
  /* Sin \`!important\`: las imágenes con ancho propio dentro de una tabla se
     descuadran si se les fuerza el tamaño. Solo se les pone techo. */
  img,video{max-width:100%;height:auto}
  table{max-width:100%}
  a{color:${enlace}}
  blockquote{margin:.5em 0;padding-left:1em;border-left:2px solid ${borde};color:${muted}}
  pre{white-space:pre-wrap;word-break:break-word}
  hr{border:0;border-top:1px solid ${borde};margin:1.25em 0}
  /* Una URL larga sin espacios es lo único que justifica partir una palabra. */
  p,td,div,span,li{overflow-wrap:break-word}
</style>
</head><body>${prep.contenido}</body></html>`
}

export function CuerpoCorreo({ html, className }: { html: string; className?: string }) {
  const oscuro = useUiStore((s) => s.theme) === 'dark'
  const ref = useRef<HTMLIFrameElement>(null)
  const [comoTexto, setComoTexto] = useState(false)
  const [alto, setAlto] = useState(0)

  // La preferencia se recuerda: quien decide una vez que quiere ver las
  // imágenes no tiene por qué volver a pulsar en cada correo.
  const [imagenes, setImagenes] = useState(() => {
    try {
      return localStorage.getItem(CLAVE_IMAGENES) === '1'
    } catch {
      return false
    }
  })
  const cambiarImagenes = (v: boolean) => {
    setImagenes(v)
    try {
      localStorage.setItem(CLAVE_IMAGENES, v ? '1' : '0')
    } catch { /* modo privado: vale con el estado de esta sesión */ }
  }

  const bruto = html || ''
  const esHtml = RE_ETIQUETAS.test(bruto)
  const texto = useMemo(() => htmlToText(bruto), [bruto])
  const prep = useMemo(() => (esHtml ? preparar(bruto) : null), [bruto, esHtml])

  const srcDoc = useMemo(
    () => (prep ? documento(prep, imagenes, oscuro) : ''),
    [prep, imagenes, oscuro],
  )

  // El alto se mide desde fuera: el iframe no puede crecer solo y un marco con
  // scroll propio dentro de un panel con scroll es de las peores cosas que se
  // le pueden hacer a alguien leyendo un correo.
  useEffect(() => {
    if (!prep) return
    const marco = ref.current
    if (!marco) return
    let obs: ResizeObserver | undefined
    let temporizador: number | undefined

    const medir = () => {
      try {
        const doc = marco.contentDocument
        if (!doc?.body) return
        setAlto(Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight))
      } catch {
        setAlto(420)
      }
    }

    const alCargar = () => {
      medir()
      try {
        const doc = marco.contentDocument
        if (doc?.documentElement && 'ResizeObserver' in window) {
          obs = new ResizeObserver(medir)
          obs.observe(doc.documentElement)
        }
        // Las imágenes llegan después del `load` y estiran el correo. El
        // observer coge la mayoría; el repaso tardío coge las lentas.
        doc?.querySelectorAll('img').forEach((img) => {
          img.addEventListener('load', medir)
          img.addEventListener('error', medir)
        })
        temporizador = window.setTimeout(medir, 1200)
      } catch { /* sin acceso, ya hay un alto por defecto */ }
    }

    marco.addEventListener('load', alCargar)
    return () => {
      marco.removeEventListener('load', alCargar)
      obs?.disconnect()
      if (temporizador) clearTimeout(temporizador)
    }
  }, [srcDoc, prep])

  if (!bruto.trim())
    return <p className="t-hint italic">Este correo llegó sin cuerpo de texto.</p>

  if (!prep || comoTexto)
    return (
      <div className={className}>
        {prep && (
          <BarraAviso
            icono={<Palette className="h-3.5 w-3.5" />}
            texto="Viendo el texto plano del correo."
            accion="Ver el diseño original"
            onClick={() => setComoTexto(false)}
          />
        )}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-fg">
          {texto || 'Este correo llegó sin cuerpo de texto.'}
        </p>
      </div>
    )

  return (
    <div className={className}>
      {prep.externas && !imagenes && (
        <BarraAviso
          icono={<ImageOff className="h-3.5 w-3.5" />}
          texto="Imágenes bloqueadas para que el remitente no sepa que lo abriste."
          accion="Mostrar imágenes"
          onClick={() => cambiarImagenes(true)}
        />
      )}
      {prep.adjuntas && (
        <BarraAviso
          icono={<ImageOff className="h-3.5 w-3.5" />}
          texto="Este correo trae imágenes incrustadas como adjunto; el CRM todavía no las descarga."
        />
      )}
      {/* El correo con diseño va sobre blanco y dentro de su propio marco: se
          ve como lo mandaron, y se nota dónde acaba el correo y empieza el CRM. */}
      <div className={prep.disenado ? 'overflow-hidden rounded-xl border border-border bg-white' : undefined}>
        <iframe
          ref={ref}
          title="Contenido del correo"
          srcDoc={srcDoc}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="w-full border-0"
          style={{ height: alto ? `${alto}px` : '200px' }}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <button
          onClick={() => setComoTexto(true)}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-fg"
        >
          <Type className="h-3.5 w-3.5" /> Ver como texto plano
        </button>
        {/* El interruptor está siempre a mano, no solo cuando el aviso salta:
            si la detección falla, sigue habiendo por dónde arreglarlo. */}
        <button
          onClick={() => cambiarImagenes(!imagenes)}
          className="inline-flex items-center gap-1.5 text-[0.8125rem] text-muted transition-colors hover:text-fg"
        >
          <ImageOff className="h-3.5 w-3.5" />
          {imagenes ? 'Bloquear imágenes remotas' : 'Mostrar imágenes'}
        </button>
      </div>
    </div>
  )
}

function BarraAviso({
  icono,
  texto,
  accion,
  onClick,
}: {
  icono: ReactNode
  texto: string
  accion?: string
  onClick?: () => void
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-surface-2 px-3 py-2 text-[0.8125rem] text-muted">
      <span className="flex items-center gap-1.5">
        {icono} {texto}
      </span>
      {accion && onClick && (
        <button onClick={onClick} className="font-medium text-primary-600 hover:underline dark:text-primary-300">
          {accion}
        </button>
      )}
    </div>
  )
}
