// Copies dist/index.html to dist/404.html so static hosts without rewrites (GitHub Pages)
// still load the app on deep links such as /trip/<id>/plan.
import { copyFileSync, existsSync } from 'node:fs'

const index = new URL('../dist/index.html', import.meta.url)
if (!existsSync(index)) {
  console.error('dist/index.html not found — run the build first')
  process.exit(1)
}
copyFileSync(index, new URL('../dist/404.html', import.meta.url))
console.log('wrote dist/404.html')
