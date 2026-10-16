// D: does the reconnect back off during a LONG outage? A local server refuses every WebSocket handshake (503) for 70 s;
// we log when handshakes arrive and which states the supervisor reports. No public RPC is involved.
// usage (from the repo dir): npx tsx /tmp/qa/backoff.mts
import http from 'node:http'
import { createReader, watchHandovers } from '/path/to/sealdrop/src/arkiv'
const t0 = Date.now()
const rel = () => (Date.now() - t0) / 1000
const attempts: number[] = []
const srv = http.createServer()
srv.on('upgrade', (_req, socket) => { attempts.push(rel()); socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy() })
await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
const port = (srv.address() as { port: number }).port
const reader = createReader({ wsUrl: `ws://127.0.0.1:${port}`, rpcUrl: 'http://127.0.0.1:9' })
const states: string[] = []
let reconnects = 0
const stop = watchHandovers(reader, '0x0000000000000000000000000000000000000001', {
  onHandover: () => {}, onError: (e) => console.log('onError', e.message),
  onState: (s) => states.push(`${rel().toFixed(1)} s ${s}`), onReconnect: () => { reconnects++ },
})
await new Promise((r) => setTimeout(r, 70_000))
stop()
// cluster handshakes that arrive within 1.5 s of each other
const clusters: { at: number; n: number }[] = []
for (const a of attempts) { const c = clusters[clusters.length - 1]; if (c && a - c.at < 1.5) c.n++; else clusters.push({ at: a, n: 1 }) }
console.log(`handshakes refused in 70 s: ${attempts.length}, in ${clusters.length} clusters`)
console.log('cluster start (s) x handshakes:', clusters.map((c) => `${c.at.toFixed(1)}x${c.n}`).join('  '))
console.log(`state reports (${states.length}):`, states.join(' | '))
console.log('onReconnect calls (must be 0 while the node refuses):', reconnects)
srv.close(); process.exit(0)
