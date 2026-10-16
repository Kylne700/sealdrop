// One origin that serves dist/ and also proxies the Arkiv RPC (HTTP and WebSocket), with fault injection.
// Same origin keeps the page's own CSP (connect-src 'self') valid, so the tests run with the real CSP.
// The page is pointed at it with localStorage 'sealdrop:rpc' = this server's URL (the app derives ws:// from it).
import http from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { gzipSync } from 'node:zlib'
import WebSocket, { WebSocketServer } from 'ws'

const UP_HTTP = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'
const UP_WS = 'wss://rpc.tiramisu.db-chain.testnet.arkiv.network'
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }

export async function startProxy(dir, { prefix = '/', gzip = false, port = 0 } = {}) {
  /** Counters: `forwarded` arkiv_query calls really reached the public RPC (they cost budget). */
  const st = { forwarded: 0, units: 0, cached: 0, injected429: 0, injectedFunds: 0, methods: {}, wsOpened: 0, wsRefused: 0, log: [] }
  /** Switches the test flips while it runs. */
  const ctl = { fail429: 0, retryAfter: 60, refuseWs: false, freeze: false, cacheQueries: false, noFunds: '' /* error message to answer sends with */ }
  const cache = new Map()
  const pairs = new Set()
  const root = normalize(dir.endsWith('/') ? dir : dir + '/')
  const note = (m) => st.log.push(`${new Date().toISOString().slice(11, 19)} ${m}`)

  async function rpc(req, res) {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks).toString()
    let calls
    try { const j = JSON.parse(body); calls = Array.isArray(j) ? j : [j] } catch { calls = [] }
    for (const c of calls) st.methods[c.method] = (st.methods[c.method] ?? 0) + 1
    const isQuery = calls.some((c) => c.method === 'arkiv_query')
    const send = (status, headers, payload) => { res.writeHead(status, { 'content-type': 'application/json', ...headers }); res.end(payload) }
    if (isQuery && ctl.fail429 > 0) {
      ctl.fail429--; st.injected429++; note('injected 429 on arkiv_query')
      return send(429, { 'retry-after': String(ctl.retryAfter) }, JSON.stringify({ error: 'rate limited (injected by the QA proxy)' }))
    }
    if (ctl.noFunds && calls.some((c) => c.method === 'eth_sendRawTransaction' || c.method === 'eth_estimateGas')) {
      st.injectedFunds++
      const errs = calls.map((c) => ({ jsonrpc: '2.0', id: c.id, error: { code: -32000, message: ctl.noFunds } }))
      return send(200, {}, JSON.stringify(body.trim().startsWith('[') ? errs : errs[0]))
    }
    if (isQuery && ctl.cacheQueries && cache.has(body)) { st.cached++; const c = cache.get(body); return send(200, { 'arkiv-cost': '0' }, c) }
    const up = await fetch(UP_HTTP, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': UA }, body })
    const text = await up.text()
    const cost = Number(up.headers.get('arkiv-cost'))
    if (isQuery) { st.forwarded++; if (cost > 0) st.units += cost }
    if (up.status === 429) note(`REAL 429 from the public RPC, retry-after ${up.headers.get('retry-after')}`)
    if (isQuery && ctl.cacheQueries && up.status === 200) cache.set(body, text)
    const h = {}
    for (const k of ['arkiv-cost', 'retry-after']) if (up.headers.get(k)) h[k] = up.headers.get(k)
    send(up.status, h, text)
  }

  const server = http.createServer((req, res) => {
    if (req.method === 'POST') return void rpc(req, res).catch((e) => { note(`proxy error ${e.message}`); res.writeHead(502).end('proxy error') })
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
    if (!pathname.startsWith(prefix)) return void res.writeHead(404).end('not found')
    const rel = pathname.slice(prefix.length)
    const file = normalize(join(root, rel.endsWith('/') || rel === '' ? rel + 'index.html' : rel))
    if (!file.startsWith(root) || !existsSync(file)) return void res.writeHead(404).end('not found')
    let out = readFileSync(file)
    const headers = { 'content-type': types[extname(file)] ?? 'application/octet-stream' }
    if (gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'])) && /\.(html|js|css|svg|json)$/.test(file)) { out = gzipSync(out); headers['content-encoding'] = 'gzip' }
    res.writeHead(200, headers).end(out)
  })

  const wss = new WebSocketServer({ noServer: true })
  server.on('upgrade', (req, socket, head) => {
    if (ctl.refuseWs) { st.wsRefused++; socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return void socket.destroy() }
    wss.handleUpgrade(req, socket, head, (client) => {
      const up = new WebSocket(UP_WS, { headers: { 'User-Agent': UA, Origin: 'https://kylne700.github.io' } })
      const pending = []
      const pair = { client, up }
      pairs.add(pair); st.wsOpened++; note('ws client connected')
      client.on('message', (d, bin) => { if (ctl.freeze) return; up.readyState === WebSocket.OPEN ? up.send(d, { binary: bin }) : pending.push([d, bin]) })
      up.on('open', () => { for (const [d, bin] of pending) up.send(d, { binary: bin }) })
      up.on('message', (d, bin) => { if (ctl.freeze) return; if (client.readyState === WebSocket.OPEN) client.send(d, { binary: bin }) })
      client.on('close', () => { pairs.delete(pair); up.terminate() })
      client.on('error', () => {})
      up.on('close', () => client.close())
      up.on('error', () => client.terminate())
    })
  })
  await new Promise((r) => server.listen(port, '127.0.0.1', r))
  const p = server.address().port
  return {
    url: `http://127.0.0.1:${p}${prefix}`,
    origin: `http://127.0.0.1:${p}`,
    st, ctl, note,
    openSockets: () => pairs.size,
    /** Kill every proxied socket abruptly (the browser sees an abnormal close, code 1006). */
    drop: () => { note(`dropping ${pairs.size} socket(s)`); for (const { client, up } of pairs) { client.terminate(); up.terminate() } pairs.clear() },
    close: () => new Promise((r) => { for (const { client, up } of pairs) { client.terminate(); up.terminate() } server.close(r); server.closeAllConnections?.() }),
  }
}
