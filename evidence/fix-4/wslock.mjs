// Ran from qa-net/ in the fix-4 scratch clone of the repo (L's harness, see harness.diff), so its imports are relative to that folder.
// Does Chromium queue a second WebSocket to the same host:port while the first handshake hangs (RFC 6455 4.1)? And does closing the hung one release it?
import http from 'node:http'
import { launch, sleep } from '../evidence/qa-scripts/lib.mjs'
let upgrades = 0
const server = http.createServer((_q, r) => r.end('x')).on('upgrade', () => { upgrades++ }) // never answers the upgrade
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const url = `ws://127.0.0.1:${server.address().port}/`
const browser = await launch('chromium', { headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${server.address().port}/`)
console.log('chromium', await browser.version())
await page.evaluate((u) => { window.ws1 = new WebSocket(u) }, url); await sleep(1500)
console.log('after ws1 (hangs):', upgrades)
await page.evaluate((u) => { window.ws2 = new WebSocket(u) }, url); await sleep(3000)
console.log('after ws2, ws1 still connecting:', upgrades, 'ws2.readyState', await page.evaluate(() => ws2.readyState))
await page.evaluate(() => ws1.close()); await sleep(2000)
console.log('after ws1.close():', upgrades)
await browser.close(); server.close(); server.closeAllConnections?.(); process.exit(0)
