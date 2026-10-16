// Shared helpers for the QA scripts (not part of the repo).
import http from 'node:http'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import puppeteer from 'puppeteer-core'

export const PROJECT = '/path/to/sealdrop'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }

/** Static server for a dist/ directory. prefix='/sealdrop/' mimics GitHub Pages (nothing is served outside it). */
export async function serve(dir, { prefix = '/', gzip = false, port = 0 } = {}) {
  const stats = { requests: 0, bytes: 0, files: [] }
  const root = normalize(dir.endsWith('/') ? dir : dir + '/')
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    if (!pathname.startsWith(prefix)) return void res.writeHead(404).end('not found')
    const rel = pathname.slice(prefix.length)
    const file = normalize(join(root, rel.endsWith('/') || rel === '' ? rel + 'index.html' : rel))
    if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end('not found')
    let body = readFileSync(file)
    const headers = { 'content-type': types[extname(file)] ?? 'application/octet-stream' }
    if (gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'])) && /\.(html|js|css|svg|json)$/.test(file)) { body = gzipSync(body); headers['content-encoding'] = 'gzip' }
    stats.requests++; stats.bytes += body.length; stats.files.push(`${rel || 'index.html'} ${body.length}`)
    res.writeHead(200, headers).end(body)
  })
  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  const p = server.address().port
  return { url: `http://127.0.0.1:${p}${prefix}`, stats, close: () => new Promise((r) => server.close(r)) }
}

export async function launch(kind = 'chromium', extra = {}) {
  if (kind === 'firefox') {
    return puppeteer.launch({ browser: 'firefox', executablePath: '/usr/bin/firefox', headless: true, protocol: 'webDriverBiDi', ...extra })
  }
  return puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'], ...extra })
}

/** Collect pageerrors and console errors per page; returns the shared problems array. */
export function watch(page, name, problems) {
  page.setDefaultTimeout(90_000)
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console.error: ${m.text().slice(0, 240)}`) })
}

/** Counts arkiv_query cost headers seen by pages; appended to the query ledger. */
export function countQueries(page, ledger) {
  page.on('response', (res) => {
    const cost = Number(res.headers()['arkiv-cost'])
    if (cost > 0) { ledger.queries++; ledger.units += cost }
  })
}

export const ledgerNote = (label, ledger) => appendFileSync('/tmp/qa/queries.log', `${new Date().toISOString()} ${label}: ${ledger.queries} queries, ${ledger.units} units\n`)
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const secs = (ms) => `${(ms / 1000).toFixed(1)} s`
export const textOf = (page, sel) => page.$eval(sel, (el) => el.textContent ?? '')
