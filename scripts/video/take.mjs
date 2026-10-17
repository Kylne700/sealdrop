// One recorded take of the whole story. Two cameras on one wall clock, plus the public explorer:
//   A = the newsroom (home page footage, create newsroom + inbox, copy the link, the tip arriving live)
//   B = the source   (opens the copied link, types a made-up tip, sends it, shows the receipt)
//   E = the Arkiv Data Explorer showing the real tip entity
// node scripts/video/take.mjs mock [name]   rehearsal on the mock build (media/raw/site-mock): no RPC
// node scripts/video/take.mjs live [name]   the real take against Tiramisu (media/raw/site): about 10 RPC queries
// Writes media/raw/takes/<name>/{A,B,E}/clip.mp4 + take.json (events on the shared wall clock) for cut.mjs.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { RAW, SEALDROP } from './config.mjs'
import { Cam, Ledger, launch, now, queriesInLast, serveSite, sleep, step } from './recorder.mjs'

const [mode = 'mock', takeName] = process.argv.slice(2)
if (!['mock', 'live'].includes(mode)) throw new Error('usage: take.mjs mock|live [name]')
const name = takeName ?? `${mode}-${new Date().toISOString().slice(11, 19).replaceAll(':', '')}`
const DIR = resolve(RAW, 'takes', name)
rmSync(DIR, { recursive: true, force: true })
mkdirSync(DIR, { recursive: true })
const STILLS = resolve(DIR, 'stills')
mkdirSync(STILLS, { recursive: true })

const TIP_TEXT = 'SYNTHETIC TEST TIP: made-up message, nothing real.'
const REHEARSAL_ENTITY = '0xc70a2ae78c9434a6625fc148f98e01111570b15afa0991217e4a4d71a00c66ad' // an existing demo tip, for the explorer rehearsal
const cfg = readFileSync(resolve(SEALDROP, 'src/config.ts'), 'utf8')
const RPC_HTTP = cfg.match(/RPC_HTTP = '([^']+)'/)[1]
const DEMO_ADDR = cfg.match(/DEMO_SENDER_ADDRESS = '(0x[0-9a-fA-F]{40})'/)[1]
const T0 = now()
const meta = { mode, name, tip_text: TIP_TEXT, started: new Date().toISOString() }
const ledger = new Ledger(name)

async function rpc(method, params) {
  ledger.counts[method] = (ledger.counts[method] ?? 0) + 1
  const r = await fetch(RPC_HTTP, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  if (r.status === 429) { ledger.limited = true; throw new Error('RPC answered 429') }
  return (await r.json()).result
}

if (mode === 'live') {
  const used = queriesInLast(60)
  if (used > 40) throw new Error(`the ledger shows ${used} arkiv_query calls in the last hour: wait before a live take`)
  const wei = BigInt(await rpc('eth_getBalance', [DEMO_ADDR, 'latest']))
  meta.demo_sender_balance_glm = Number(wei / 10n ** 12n) / 1e6
  console.log(`live preflight: ledger ${used} queries/h, demo sender balance ${meta.demo_sender_balance_glm} GLM`)
  if (wei < 20n * 10n ** 15n) throw new Error('the shared demo sender has under 0.02 GLM: a full take needs about 0.01')
}

const site = await serveSite(resolve(RAW, mode === 'mock' ? 'site-mock' : 'site'))
const { browser, close } = await launch()
const HOME = `${site.url}${site.base}#/`
const watchdog = setTimeout(() => { console.error('take exceeded 9 minutes: aborting'); process.exit(3) }, 9 * 60 * 1000)
let A, B, E
const hexTitles = (cam, sel) => cam.page.$$eval(sel, (els) => els.map((e) => e.title || e.textContent))
const both = (label) => Promise.all([A, B].filter((c) => c?.page && !c.page.isClosed()).map((c) => c.privacy(label)))
const dwell = async (cam, label, seconds, action) => {
  const t = performance.now()
  cam.ev('dwell', { label, seconds })
  if (action) await action()
  await sleep(Math.max(0, seconds * 1000 - (performance.now() - t)))
}
const S = (label, fn, ms) => step(label, async () => { const r = await fn(); if (ledger.limited) throw new Error('RPC rate limit seen'); return r }, ms, ledger)

try {
  A = await Cam.create(browser, 'A', DIR, { origin: site.url, ledger })
  B = await Cam.create(browser, 'B', DIR, { origin: site.url, ledger })
  if (mode === 'mock') {
    const mock = (m) => ({ live: 'live', ...m })
    await A.page.evaluateOnNewDocument((m) => { window.__MOCK = m }, mock({ inbox: 'setup', sendMs: 2500, tips: [] }))
    await B.page.evaluateOnNewDocument((m) => { window.__MOCK = m }, mock({ inbox: 'ok', sendMs: 5600, tips: [] }))
  }

  // ===== step 2 footage: the real home page, one dwell per sentence ======================================
  await S('A: open home', async () => { await A.goto(HOME, '[data-testid=open-newsroom]'); await A.privacy('home'); await A.still(resolve(STILLS, 'home.png')) }, 30000)
  await A.startRecording()
  await dwell(A, 'h1', 9)
  const flow = await A.page.$eval('.flow-h', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
  const at = (f) => [flow.x + flow.w * f, flow.y + flow.h * 0.5]
  await dwell(A, 'diagram-a', 10, async () => {
    for (const f of [0.111, 0.369, 0.889]) { await A.glide(...at(f), 0.8); await sleep(1100) }
  })
  await dwell(A, 'diagram-b', 10, async () => { await sleep(1300); await A.glide(...at(0.629), 0.9) })
  await dwell(A, 'how', 9, async () => {
    const y = await A.page.evaluate(() => Math.round([...document.querySelectorAll('h2')].find((h) => h.textContent === 'How it works').getBoundingClientRect().top + scrollY - 90))
    await A.scrollY(y)
  })
  await A.scrollY(0)
  await sleep(700)
  A.ev('create_begin')

  // ===== step 3: live demo ==============================================================================
  await S('A: open newsroom page', async () => { await A.click('[data-testid=open-newsroom]'); await A.waitFor('[data-testid=create-newsroom]'); A.ev('newsroom_open') }, 30000)
  await sleep(1300)
  await S('A: create throwaway newsroom', async () => { await A.click('[data-testid=create-newsroom]'); await A.waitFor('[data-testid=create-inbox]'); A.ev('console_ready') }, 60000)
  await A.privacy('console')
  await sleep(2600) // the console top: newsroom address, generated in this browser, balance
  await A.scrollToEl('form.compose', 0.08)
  await sleep(1200)
  await S('A: create inbox', async () => {
    await A.click('[data-testid=create-inbox]')
    A.ev('chain_wait_start')
    await sleep(500)
    await A.scrollY(0) // the status line and the balance sit at the top
    await A.waitFor('[data-testid=inbox]', 90000)
    A.ev('inbox_ready')
  }, 100000)
  await A.page.mouse.move(A.x + 1, A.y)
  meta.inbox_key = (await hexTitles(A, '[data-testid=inbox] dl.facts .hex-v'))[2]
  await A.privacy('inbox ready')
  await sleep(1500)
  await A.scrollToEl('[data-testid=inbox]', 0.05)
  await sleep(4500)

  await S('A: copy the inbox link', async () => {
    await A.click('.linkrow button')
    await A.waitText('.linkrow button', /Copied/, 5000)
    A.ev('copied')
    meta.link = await A.page.evaluate(() => navigator.clipboard.readText())
    if (!/#\/send\/0x[0-9a-fA-F]{40}\//.test(meta.link)) throw new Error('the clipboard does not hold an inbox link')
  }, 20000)
  await sleep(1000)

  // B opens the copied link as a source (recording starts on the loaded page)
  await S('B: open the link', async () => { await B.goto(meta.link, '[data-testid=message]'); await B.privacy('source page'); await B.still(resolve(STILLS, 'source.png')); B.ev('b_loaded') }, 40000)
  await B.startRecording()

  // A moves to the tips list: the live arrival is filmed there
  const aTips = (async () => {
    await A.scrollToEl('.tips-section', 0.1)
    await A.waitText('[data-testid=live-status]', /Live/, 20000)
    A.ev('tips_view')
    await A.privacy('tips view')
    await A.glide(1130, 430, 0.8) // park the pointer on blank page, away from the buttons the scroll moved under it
  })()
  // B: the page verifies the inbox before anything is sent. The pointer visits the creator chip, the owner chip, the lease row.
  const rect = (sel, within, nth = 0) => B.page.evaluate((s, w, n) => {
    const root = document.querySelector('[data-testid=inbox]')
    const el = w ? [...root.querySelectorAll(s)].filter((e) => new RegExp(w).test(e.textContent))[n] : root.querySelector(s)
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, sel, within, nth)
  await dwell(B, 'verify', 9.6, async () => {
    await sleep(4400)
    const c = await rect('.inbox-head .chip'); await B.glide(c.x, c.y, 0.7); B.ev('point_creator'); await sleep(450)
    const o = await rect('dd .chip', 'Owner is the creator'); await B.glide(o.x, o.y, 0.7); B.ev('point_owner_chip'); await sleep(450)
    const l = await rect('dd', 'Inbox is alive for|alive for|\\(until'); await B.glide(l.x, l.y - 6, 0.7); B.ev('point_lease_row')
  })
  await aTips

  await S('B: write the tip', async () => {
    await B.scrollToEl('[data-testid=message]', 0.16) // textarea, lifetime pills and the send button all in view: no scrolling while the pointer works
    await B.type('[data-testid=message]', TIP_TEXT, { cps: 30, seconds: 0.55 })
    await sleep(150)
    await B.click('[data-testid=days] .choice:nth-child(2)', { seconds: 0.45 }) // 7 days
    await sleep(150)
    await both('before send')
  }, 40000)

  const arrived = A.waitFor('[data-testid=tip]', 120000).then(() => A.ev('tip_visible'))
  arrived.catch(() => {})
  // 'arrive' beat (6.5 s after the tip shows): the pointer follows the sentence: the new card, the Live line, then the opened text.
  // On the chain the newsroom page shows the tip some seconds before the sender's page finishes, so this starts when the tip shows
  // (beside the sender's step), not when the script gets back to this page.
  const choreo = arrived.then(async ({ t: TV }) => {
    const until = (s) => sleep(Math.max(0, (TV + s - now()) * 1000))
    const box = (sel, pick) => A.page.$$eval(sel, (els, p) => { const el = els.find((e) => new RegExp(p).test(e.textContent)) ?? els[0]; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y + r.height / 2, w: r.width } }, pick)
    const head = await box('[data-testid=tip] .meta > *', 'UTC'), live = await box('[data-testid=live-status]', 'Live'), text = await box('[data-testid=tip-text]', '')
    await until(0.2); await A.glide(head.x + 40, head.y, 0.6); A.ev('point_card')
    await until(1.3); await A.glide(live.x + 90, live.y, 0.7); A.ev('point_live')
    await until(3.5); await A.glide(text.x + Math.min(text.w * 0.45, 260), text.y, 0.7); A.ev('point_text')
    await until(6.5)
  })
  choreo.catch(() => {})
  await S('B: seal and send', async () => {
    await B.click('[data-testid=send]', { seconds: 0.45 })
    B.ev('chain_wait_start')
    // rehearsal only: like the chain, the newsroom's page gets the tip about 2.7 s after the click, before the sender's page finishes
    if (mode === 'mock') setTimeout(() => A.page.evaluate((t) => { window.__MOCK.tips = [t]; window.__push.tip(0) }, { text: TIP_TEXT, ageMin: 0, days: 7, live: true }).catch(() => {}), 2700)
    await B.waitFor('[data-testid=send-result]', 120000)
    B.ev('sent')
  }, 130000)
  await S('A: the tip arrives over the WebSocket', async () => { await arrived }, 120000)
  const shown = await A.page.$eval('[data-testid=tip-text]', (e) => e.textContent)
  if (shown !== TIP_TEXT) throw new Error(`the newsroom shows "${shown}" instead of the tip text`)
  meta.tip_key = await A.page.$eval('[data-testid=tip]', (e) => e.getAttribute('data-key'))
  await A.privacy('tip arrived')
  await choreo

  // lease and $owner on the tip card
  await dwell(A, 'lease', 10, async () => {
    const boxes = await A.page.$$eval('[data-testid=tip] .meta > *', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 } }))
    const lease = boxes.find((b) => /Expires in/.test(b.t)), owner = boxes.find((b) => /owned by you/.test(b.t))
    if (!lease || !owner) throw new Error('the tip card has no lease chip or owner badge')
    await A.glide(lease.x, lease.y, 0.8); A.ev('point_lease'); await sleep(1700)
    await A.glide(owner.x, owner.y, 0.8); A.ev('point_owner')
  })
  await A.glide(1100, 640, 0.8)

  // B: the receipt
  const keys = await hexTitles(B, '[data-testid=send-result] dl.receipt .hex-v')
  meta.sent_entity_key = keys[0]
  meta.sent_tx_hash = keys[1]
  if (mode === 'live' && meta.sent_entity_key !== meta.tip_key) throw new Error('the receipt entity key differs from the tip the newsroom received')
  await B.privacy('receipt')
  await dwell(B, 'receipt', 5, async () => B.scrollToEl('[data-testid=send-result]', 0.05))
  await S('B: open "What Arkiv stores"', async () => {
    await B.click('.stores summary')
    await B.waitFor('.stores dl.facts', 5000)
    B.ev('stores_open')
  }, 15000)
  await B.privacy('what arkiv stores')
  await dwell(B, 'stores', 10, async () => {
    const rows = await B.page.$$eval('.stores dl.facts dt', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent, x: r.x + 160, y: r.y + r.height / 2 } }))
    for (const r of rows) { await B.glide(r.x, r.y, 0.45); await sleep(600) }
  })

  const aInfo = await A.stopAndEncode(), bInfo = await B.stopAndEncode()
  meta.cams = { A: aInfo, B: bInfo }
  // two more screenshots of the finished states (cameras are stopped, so the cursor flicker never reaches a take)
  await A.scrollToEl('[data-testid=tip]', 0.2); await A.privacy('still tip'); await A.still(resolve(STILLS, 'newsroom-tip.png'))
  await B.scrollToEl('[data-testid=send-result]', 0.12); await B.privacy('still receipt'); await B.still(resolve(STILLS, 'receipt.png'))

  // ===== the explorer: a separate take, once the chain has had time to index the new entity =====================
  const entity = mode === 'live' ? meta.tip_key : REHEARSAL_ENTITY
  E = await Cam.create(browser, 'E', DIR, { ledger })
  if (mode === 'live') {
    console.log('waiting 40 s for the explorer to index the new entity')
    await sleep(40000)
  }
  let found = false
  for (let tries = 1; tries <= 3 && !found; tries++) {
    await S(`E: open the explorer (try ${tries})`, async () => {
      await E.goto(`https://data.arkiv.network/entity/${entity}`)
      await E.page.waitForFunction(() => /Showing \d+ of \d+ entit|No entities/i.test(document.body.innerText), { timeout: 30000 })
      found = /Showing 1 of 1 entity/.test(await E.page.evaluate(() => document.body.innerText))
    }, 45000)
    if (!found) { console.log('  not indexed yet; waiting 30 s'); await sleep(30000) }
  }
  if (!found) throw new Error('the explorer does not show the entity')
  await E.privacy('explorer loaded')
  meta.explorer_url = `https://data.arkiv.network/entity/${entity}`
  await E.startRecording()
  await dwell(E, 'top', 7)
  await E.scrollY(10000)
  E.ev('explorer_scrolled')
  await E.privacy('explorer scrolled')
  await dwell(E, 'bottom', 9)
  meta.cams.E = await E.stopAndEncode()
  meta.explorer_text_has_ciphertext = /BINARY/.test(await E.page.evaluate(() => document.body.innerText))

  meta.finished = new Date().toISOString()
  meta.seconds = Math.round(now() - T0)
  meta.ledger = { ...ledger.counts, limited: ledger.limited }
  writeFileSync(resolve(DIR, 'take.json'), JSON.stringify({ meta, events: [...A.events, ...B.events, ...E.events].sort((a, b) => a.t - b.t) }, null, 1))
  console.log(`take ${name} ok in ${meta.seconds} s; ledger ${JSON.stringify(meta.ledger)}`)
  console.log(JSON.stringify({ A: meta.cams.A.seconds, B: meta.cams.B.seconds, E: meta.cams.E.seconds, max_gap: [meta.cams.A.max_gap, meta.cams.B.max_gap, meta.cams.E.max_gap], errors: [A.errors, B.errors, E.errors] }))
} catch (e) {
  console.error('TAKE FAILED:', e.message)
  for (const c of [A, B, E]) if (c) { writeFileSync(resolve(DIR, `${c.name}-fail-events.json`), JSON.stringify(c.events, null, 1)); await c.page.screenshot({ path: resolve(DIR, `${c.name}-fail.png`) }).catch(() => {}) }
  process.exitCode = 1
} finally {
  clearTimeout(watchdog)
  ledger.save()
  await close()
  site.close()
}
