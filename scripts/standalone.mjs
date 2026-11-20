import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

// The city atlas is a data URI in the production entry. Inline the remaining two assets.
const dist = resolve('dist')
let html = await readFile(resolve(dist, 'index.html'), 'utf8')
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/)
const css = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)
if (!script || !css)
  throw new Error('Expected a single Vite entry and a single style sheet')
const js = await readFile(resolve(dist, script[1]), 'utf8')
const styles = await readFile(resolve(dist, css[1]), 'utf8')
const notice = await readFile('node_modules/three/LICENSE', 'utf8')
html = html
  .replace(script[0], '')
  .replace(css[0], () => '<style>' + styles + '</style>')
html = html.replace(
  '</body>',
  () =>
    '<script type="module">\n/*! ' +
    notice +
    ' */\n' +
    js.replace(/<\/script/gi, '<\\/script') +
    '\n</script></body>',
)
const target = resolve(process.argv[2] || 'dist/NOX-Tokyo.html')
await writeFile(target, html)
console.log('Standalone viewer saved in', dirname(target))
