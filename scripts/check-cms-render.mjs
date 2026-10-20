import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const origin = fileURLToPath(new URL('../../JD Developer/jd-developer-site/src/cms/render.mjs', import.meta.url))
const copy = fileURLToPath(new URL('../src/lib/cms-render.mjs', import.meta.url))
const header = '// Copia exacta de ../JD Developer/jd-developer-site/src/cms/render.mjs; verificar con scripts/check-cms-render.mjs.'
try {
  const original = fs.readFileSync(origin)
  const copied = fs.readFileSync(copy)
  const start = copied.indexOf(10) + 1
  if (!start || copied.subarray(0, start).toString('utf8').replace(/\r?\n$/, '') !== header || !copied.subarray(start).equals(original)) {
    console.error('CMS: la copia del conversor difiere del original de la web. Copia el archivo íntegro conservando solo el comentario inicial de procedencia.')
    process.exitCode = 1
  } else console.log('CMS: conversor idéntico byte a byte al de la web (salvo el comentario de procedencia).')
} catch (error) {
  console.error(`CMS: no se pudo comprobar el conversor: ${error.message}`)
  process.exitCode = 1
}
