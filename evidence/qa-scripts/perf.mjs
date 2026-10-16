// H: gzip size and Fast 3G (Chrome DevTools preset: 180000 B/s down, 84375 B/s up, 562.5 ms latency) load time of the home page, cold cache.
import { serve, launch, sleep, PROJECT } from '/tmp/qa/lib.mjs'
import { readdirSync, statSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const dist = PROJECT + '/dist'
const rows = []
for (const f of readdirSync(dist + '/assets')) { const b = readFileSync(`${dist}/assets/${f}`); rows.push(`${f}: ${b.length} B raw, ${gzipSync(b).length} B gzip`) }
const html = readFileSync(dist + '/index.html'); rows.push(`index.html: ${html.length} B raw, ${gzipSync(html).length} B gzip`)
console.log(rows.join('\n'))

const srv = await serve(dist, { gzip: true })
const browser = await launch('chromium')
const results = []
for (const cpu of [1, 4]) {
  for (let i = 0; i < 3; i++) {
    const page = await browser.newPage()
    const cdp = await page.createCDPSession()
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, downloadThroughput: 180000, uploadThroughput: 84375, latency: 562.5 })
    if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu })
    srv.stats.requests = 0; srv.stats.bytes = 0
    const t0 = Date.now()
    await page.goto(srv.url, { waitUntil: 'load' })
    const loadMs = Date.now() - t0
    await page.waitForSelector('h1')
    const readyMs = Date.now() - t0
    const paint = await page.evaluate(() => { const p = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint'); return p ? Math.round(p.startTime) : -1 })
    results.push({ cpu, loadMs, readyMs, fcp: paint, requests: srv.stats.requests, bytes: srv.stats.bytes })
    await page.close()
  }
}
await browser.close(); await srv.close()
for (const r of results) console.log(`cpu x${r.cpu}: load event ${(r.loadMs / 1000).toFixed(2)} s, h1 visible ${(r.readyMs / 1000).toFixed(2)} s, FCP ${(r.fcp / 1000).toFixed(2)} s, ${r.requests} requests, ${r.bytes} B over the wire`)
