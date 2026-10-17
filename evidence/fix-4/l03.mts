// Ran from qa-net/ in the fix-4 scratch clone of the repo (L's harness, see harness.diff), so its imports are relative to that folder.
// L-03 experiment: how many WebSocket upgrades does watchHandovers make while every upgrade is refused (503)?
// usage: SECS=35 MODE=refuse|hang npx tsx qa-net/l03.mts
import http from 'node:http'
const t0 = Date.now()
const hits: string[] = []
const Native = globalThis.WebSocket
let made = 0
globalThis.WebSocket = class extends Native {
  constructor(url: string | URL, p?: string | string[]) {
    super(url, p)
    made++
    const site = (new Error().stack ?? '').split('\n').filter((l) => /src\/arkiv\.ts/.test(l)).map((l) => l.replace(/.*arkiv\.ts:(\d+).*/, '$1')).join(',')
    hits.push(`${((Date.now() - t0) / 1000).toFixed(1)}s@${site || '?'}`)
  }
} as typeof WebSocket
const { createReader, watchHandovers } = await import('../src/arkiv')
const server = http.createServer((_q, r) => r.writeHead(404).end())
const mode = process.env.MODE ?? 'refuse'
let upgrades = 0
server.on('upgrade', (_req, socket) => { upgrades++; if (mode === 'hang') return; socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy() })
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const port = (server.address() as { port: number }).port
const reader = createReader({ rpcUrl: `http://127.0.0.1:${port}`, wsUrl: `ws://127.0.0.1:${port}` })
const states: string[] = []
const stop = watchHandovers(reader, '0x000000000000000000000000000000000000dEaD', { onHandover: () => {}, onError: (e) => states.push('error ' + e.message), onState: (s) => states.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${s}`) })
const secs = Number(process.env.SECS ?? 35)
await new Promise((r) => setTimeout(r, secs * 1000))
stop()
console.log(`mode ${mode}: upgrades the server saw in ${secs} s: ${upgrades}; WebSocket objects created: ${made}`)
console.log(`created at (time@arkiv.ts line): ${hits.join(' ')}`)
console.log(`states: ${states.join(' | ')}`)
server.close(); process.exit(0)
