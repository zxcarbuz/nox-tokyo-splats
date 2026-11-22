import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }
export default defineConfig({
  define: { __NOX_VERSION__: JSON.stringify(version) },
  base: './',
  build: { chunkSizeWarningLimit: 700 },
})
