// Fix stage 7, R2-S3: a failed Keep or Burn says so inside its own row (headless Chromium, offline, mock Arkiv).
// usage: node row-note.mjs <clone-dir> <dist dir of a mock build> <out dir>
//   (clone dir: only for node_modules and evidence/qa-scripts/lib.mjs; the dist is a build with the R3 mock arkiv, evidence/final-qa/R3/scripts/screens/)
// Scaffolding (synthetic identity, frozen clock, mock options) copied from R3's stale.mjs; the states are the harness's 34 (Burn, unknown outcome
// with a hash), 35 (Keep, unknown outcome without one) and 55/56 (success). The mock reads window.__MOCK at call time, so a retry can succeed.
// Checks per viewport (1280x800 and 390x844, light): the note exists in each own row and is hidden until a failure; after a failed Keep or Burn
// it shows in that row (not in the others), names the action, carries the status text, is plain text (no role, no aria-live, no live ancestor),
// sits within reach of the buttons (the status is a screen away), does not overflow sideways; the next action on that row clears it; an action
// on another row does not; a success leaves every note hidden.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [CLONE, dist, out] = process.argv.slice(2)
if (!CLONE || !dist || !out) { console.error('usage: node row-note.mjs <clone-dir> <dist dir> <out dir>'); process.exit(1) }
mkdirSync(out, { recursive: true })
const imp = (rel) => import(pathToFileURL(join(CLONE, rel)).href)
const nacl = (await imp('node_modules/tweetnacl/nacl-fast.js')).default
const { privateKeyToAccount } = await imp('node_modules/viem/_esm/accounts/index.js')
const { serve, launch, sleep } = await imp('evidence/qa-scripts/lib.mjs')

// the harness's synthetic identity (shoot-r2.mjs lines 20-40)
const evm = '0x' + '11'.repeat(32)
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
const b64 = (u) => Buffer.from(u).toString('base64')
const IDENTITY = { v: 1, kind: 'local', address: privateKeyToAccount(evm).address, evmPrivateKey: evm, boxSecretKey: b64(secret), boxPublicKey: b64(nacl.box.keyPair.fromSecretKey(secret).publicKey), inboxId: 'inbox-3k9f2a', createdAt: '2026-10-17T09:00:00.000Z' }
const FIXED = Date.UTC(2026, 9, 17, 9, 30)
const BUDGET = [6, 600]
const T = (n, days = 14, extra = {}) => ({ text: `SYNTHETIC TEST TIP number ${n}: a made-up message.`, ageMin: 20 * n, days, ...extra })

const server = await serve(dist)
const browser = await launch()
let fails = 0
const check = (ok, label, detail = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  :: ' + String(detail).slice(0, 260) : ''}`) }
const NOTE = '[data-testid=tip-action-error]'

const rowInfo = (page, i) => page.evaluate((i, sel) => {
  const li = document.querySelectorAll('[data-testid=tip]')[i]
  if (!li) return { row: false }
  const n = li.querySelector(sel)
  const r = n?.getBoundingClientRect()
  const btn = li.querySelector('.actions')?.getBoundingClientRect() // both buttons: at 390 px Burn wraps under Keep
  const keep = [...li.querySelectorAll('button')].find((b) => /^Keep until/.test(b.textContent))?.getBoundingClientRect()
  const st = document.querySelector('[data-testid=status]').getBoundingClientRect()
  return {
    row: true,
    exists: Boolean(n),
    visible: Boolean(n && r.height > 0 && getComputedStyle(n).display !== 'none'),
    text: n?.textContent ?? '',
    attrs: n ? n.getAttributeNames().join(',') : '',
    liveAncestor: n ? Boolean(n.closest('[aria-live],[role=status],[role=alert]')) : null,
    height: Math.round(r?.height ?? 0),
    gapBelowButtons: r && btn ? Math.round(r.top - btn.bottom) : null,
    statusAbove: keep ? Math.round(keep.top - st.bottom) : null,
    sideways: n ? n.scrollWidth - n.clientWidth : null,
  }
}, i, NOTE)
const snap = (page) => page.evaluate(() => ({
  status: document.querySelector('[data-testid=status]')?.textContent ?? '',
  statusClass: document.querySelector('[data-testid=status]')?.className ?? '',
  rows: document.querySelectorAll('[data-testid=tip]').length,
  visibleNotes: [...document.querySelectorAll('[data-testid=tip-action-error]')].filter((n) => n.getBoundingClientRect().height > 0).length,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
}))
const poll = async (page, pred, ms = 8000) => { const t0 = Date.now(); for (;;) { const s = await snap(page); if (pred(s) || Date.now() - t0 > ms) return s; await sleep(100) } }
const press = (page, i, re) => page.evaluate((i, src) => { const li = document.querySelectorAll('[data-testid=tip]')[i]; [...li.querySelectorAll('button')].find((b) => new RegExp(src).test(b.textContent))?.click() }, i, re.source)

async function open(w, h, mock) {
  const page = await browser.newPage()
  page.setDefaultTimeout(10000)
  page.on('dialog', (d) => d.accept()) // "Burn this tip?"
  await page.evaluateOnNewDocument((o) => {
    const RealDate = Date
    window.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(o.fixed); else super(...a) } static now() { return o.fixed } }
    window.__MOCK = o.mock
    try { localStorage.clear(); localStorage.setItem('sealdrop:newsroom:v1', o.identity) } catch { /* no storage */ }
  }, { mock, identity: JSON.stringify(IDENTITY), fixed: FIXED })
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  await page.goto(server.url + '#/newsroom')
  await page.waitForSelector('h1')
  await poll(page, (s) => s.rows >= 2)
  return page
}

try {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    const tag = `${w}px`
    // ---- Keep fails (harness state 35) ----
    let page = await open(w, h, { budget: BUDGET, tips: [T(1), T(2)], pinFail: 'unknown-nohash' })
    let s = await poll(page, (x) => x.rows >= 2)
    let r0 = await rowInfo(page, 0)
    check(!r0.visible, `${tag} before any action: no failure text is visible in the row`, JSON.stringify(r0))
    await press(page, 0, /^Keep until/)
    s = await poll(page, (x) => /error/.test(x.statusClass) && /unknown: it may have gone through/.test(x.status))
    check(/error/.test(s.statusClass), `${tag} Keep failed: the status shows the error`, s.status)
    r0 = await rowInfo(page, 0)
    const r1 = await rowInfo(page, 1)
    check(r0.exists && r0.visible, `${tag} Keep failed: the failure shows inside that row`, JSON.stringify(r0))
    check(r0.text.startsWith('Keep did not complete.') && r0.text.includes(s.status), `${tag} the row text names the action and carries the status text`, r0.text)
    check(r0.exists && !r0.attrs.split(',').some((a) => /^(role|aria-live)$/.test(a)) && r0.liveAncestor === false, `${tag} the row text is plain text (no role, no aria-live, no live ancestor)`, r0.attrs)
    check(r0.gapBelowButtons !== null && r0.gapBelowButtons >= 0 && r0.gapBelowButtons <= 40, `${tag} the row text is next to the buttons (gap ${r0.gapBelowButtons}px; the status is ${r0.statusAbove}px above the Keep button)`)
    check(r0.sideways !== null && r0.sideways <= 0 && s.overflow <= 0, `${tag} no sideways overflow`, `note ${r0.sideways}, page ${s.overflow}`)
    check(!r1.visible, `${tag} the other row shows nothing`, JSON.stringify(r1))
    await (await page.$('[data-testid=tip]')).screenshot({ path: join(out, `keep-failed-row-${tag}.png`) }) // the row, with its text
    // an action on the other row does not clear this row's text
    await page.evaluate(() => { window.__MOCK.pinFail = '' })
    await press(page, 1, /^Keep until/)
    s = await poll(page, (x) => /^Kept:/.test(x.status))
    check(/^Kept:/.test(s.status), `${tag} Keep on the other row worked`, s.status)
    check((await rowInfo(page, 0)).visible, `${tag} ... and the first row still says its Keep failed`)
    // the next action on this row clears it
    await press(page, 0, /^Keep until/)
    s = await poll(page, (x) => /^Kept:/.test(x.status) && x.visibleNotes === 0)
    r0 = await rowInfo(page, 0)
    check(!r0.visible && s.visibleNotes === 0, `${tag} Keep again: the row text is gone`, `status="${s.status}" visibleNotes=${s.visibleNotes}`)
    await page.close()

    // ---- Burn fails with a hash (harness state 34), then Keep on the same row clears it ----
    page = await open(w, h, { budget: BUDGET, tips: [T(1), T(2)], burnFail: 'unknown-hash' })
    await press(page, 0, /^Burn now/)
    s = await poll(page, (x) => /error/.test(x.statusClass) && /unknown: it may have gone through/.test(x.status))
    r0 = await rowInfo(page, 0)
    check(r0.exists && r0.visible && r0.text.startsWith('Burn did not complete.') && /0x[0-9a-f]{64}/.test(r0.text), `${tag} Burn failed: the row says so and shows the hash`, r0.text)
    check(r0.sideways !== null && r0.sideways <= 0 && s.overflow <= 0, `${tag} the 66-character hash wraps (no sideways overflow)`, `note ${r0.sideways}, page ${s.overflow}`)
    await (await page.$('[data-testid=tip]')).screenshot({ path: join(out, `burn-failed-row-${tag}.png`) })
    await page.evaluate(() => { window.__MOCK.burnFail = '' })
    await press(page, 0, /^Keep until/)
    s = await poll(page, (x) => /^Kept:/.test(x.status))
    r0 = await rowInfo(page, 0)
    check(!r0.visible, `${tag} Keep on that row after a failed Burn: the row text is gone`, r0.text)
    await page.close()

    // ---- success screens (harness states 55 and 56): every note stays hidden, nothing takes room ----
    page = await open(w, h, { budget: BUDGET, tips: [T(1), T(2)] })
    await press(page, 0, /^Keep until/)
    s = await poll(page, (x) => /^Kept:/.test(x.status))
    check(s.visibleNotes === 0, `${tag} Keep worked: no failure text anywhere`, s.status)
    const heights = await page.evaluate((sel) => [...document.querySelectorAll(sel)].map((n) => n.getBoundingClientRect().height), NOTE)
    check(heights.every((x) => x === 0), `${tag} the hidden notes take no room`, JSON.stringify(heights))
    await press(page, 0, /^Burn now/)
    s = await poll(page, (x) => /^Burned\./.test(x.status))
    check(s.visibleNotes === 0, `${tag} Burn worked: no failure text anywhere`, s.status)
    await page.close()
  }
} finally {
  await browser.close(); server.close?.()
}
console.log(`fails=${fails}`)
