import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { gzipSync } from 'node:zlib'

// Run after `next build`. Measures route entry chunks, not unused async chunks.
const root = path.resolve('.next')
const common = JSON.parse(fs.readFileSync(path.join(root, 'build-manifest.json'), 'utf8')).rootMainFiles
const totals = (files) =>
  [...new Set(files.map((file) => decodeURIComponent(file.replace(/^\/?_next\//, ''))))].reduce(
    (sum, file) => {
      const content = fs.readFileSync(path.join(root, file))
      sum.bytes += content.length
      sum.gzipBytes += gzipSync(content).length
      sum.files++
      return sum
    },
    { files: 0, bytes: 0, gzipBytes: 0 },
  )

const routes = {}
const appPaths = JSON.parse(fs.readFileSync(path.join(root, 'server/app-paths-manifest.json'), 'utf8'))
for (const [page, entry] of Object.entries(appPaths)) {
  if (!page.endsWith('/page')) continue
  const file = path.join(root, 'server', entry.replace(/page\.js$/, 'page_client-reference-manifest.js'))
  if (!fs.existsSync(file)) continue
  const context = {}
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context)
  for (const [name, manifest] of Object.entries(context.__RSC_MANIFEST ?? {})) {
    if (name !== page) continue
    const chunks = [...common]
    for (const mod of Object.values(manifest.clientModules)) {
      chunks.push(...(mod.chunks ?? []).filter((chunk) => chunk.endsWith('.js')))
    }
    const route = name.replace(/\/\([^/]+\)/g, '').replace(/\/page$/, '') || '/'
    routes[route] = totals(chunks)
  }
}
const media = fs.readdirSync(path.join(root, 'static/media')).filter((file) => file.endsWith('.woff2'))
const report = {
  measuredAt: new Date().toISOString(),
  method:
    'Production route entry JS from client-reference manifests plus common runtime; gzip measured per chunk. Excludes async chunks until requested.',
  routes: Object.fromEntries(Object.entries(routes).sort(([a], [b]) => a.localeCompare(b))),
  fontFiles: media.length,
  fontBytesOnDisk: media.reduce((sum, file) => sum + fs.statSync(path.join(root, 'static/media', file)).size, 0),
}
const output = process.argv[2]
if (output) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
