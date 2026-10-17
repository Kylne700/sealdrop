// Ran from qa-net/ in the fix-4 scratch clone of the repo (L's harness, see harness.diff), so its imports are relative to that folder.
// How long does Chromium hold a hung WebSocket handshake before failing it (and releasing the queued socket)?
import http from 'node:http'
import { launch, sleep } from '../evidence/qa-scripts/lib.mjs'
const t0 = Date.now(), at = () => ((Date.now() - t0) / 1000).toFixed(1) + ' s'
let upgrades = 0
const server = http.createServer((_q, r) => r.end('x')).on('upgrade', () => { upgrades++; console.log(`upgrade ${upgrades} at ${at()}`) })
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `127.0.0.1:${server.address().port}/`
const browser = await launch('chromium', { headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
page.on('console', (m) => console.log('page:', m.text(), 'at', at()))
await page.goto(`http://${base}`)
await page.evaluate((u) => { const ws1 = new WebSocket(u); ws1.onerror = () => console.log('ws1 error'); ws1.onclose = () => console.log('ws1 close'); setTimeout(() => { const ws2 = new WebSocket(u); ws2.onerror = () => console.log('ws2 error') }, 1000) }, `ws://${base}`)
while (upgrades < 2 && Date.now() - t0 < 330_000) await sleep(1000)
console.log(`done at ${at()}: upgrades=${upgrades}`)
await browser.close(); server.close(); server.closeAllConnections?.(); process.exit(0)
