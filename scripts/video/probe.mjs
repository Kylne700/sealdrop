// Zero-RPC check of a deployed site before a live take: SITE_URL=https://<owner>.github.io/<repo>/ node scripts/video/probe.mjs
// Opens the home page and the newsroom page the way take.mjs does, checks the selectors the take waits for, the clipboard
// round trip it relies on and that no local address is on the page. Sends no RPC call (the ledger must stay empty).
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { RAW } from './config.mjs'
import { Cam, Ledger, launch, remoteSite } from './recorder.mjs'

if (!process.env.SITE_URL) throw new Error('usage: SITE_URL=https://<owner>.github.io/<repo>/ node scripts/video/probe.mjs')
const site = remoteSite(process.env.SITE_URL)
const OUT = resolve(RAW, 'probe')
mkdirSync(OUT, { recursive: true })
const ledger = new Ledger('probe')
const { browser, close } = await launch()
let failed = ''
try {
  const P = await Cam.create(browser, 'P', OUT, { origin: site.url, ledger })
  P.forbid = /127\.0\.0\.1|localhost|\[::1\]/i
  await P.goto(`${site.url}${site.base}#/`, '[data-testid=open-newsroom]')
  await P.waitFor('.flow-h')
  await P.privacy('home')
  await P.still(resolve(OUT, 'home.png'))
  await P.click('[data-testid=open-newsroom]')
  await P.waitFor('[data-testid=create-newsroom]')
  await P.privacy('newsroom')
  await P.still(resolve(OUT, 'newsroom.png'))
  const echoed = await P.page.evaluate(async () => { await navigator.clipboard.writeText('sealdrop probe'); return navigator.clipboard.readText() })
  if (echoed !== 'sealdrop probe') throw new Error(`clipboard round trip returned "${echoed}"`)
  if (P.forbidHits) throw new Error(`${P.forbidHits} page-text dump(s) name a local address`)
  if (P.errors.length) throw new Error(`console errors: ${P.errors.join(' | ')}`)
  if (ledger.counts.requests) throw new Error(`the probe sent ${ledger.counts.requests} POST request(s): ${JSON.stringify(ledger.counts)}`)
  console.log(`probe ok on ${site.url}${site.base}: home + newsroom selectors, clipboard round trip, 0 RPC calls, 0 local addresses, 0 console errors`)
} catch (e) {
  failed = e.message
  console.error(`probe FAILED: ${failed}`)
} finally { await close() }
process.exit(failed ? 1 : 0)
