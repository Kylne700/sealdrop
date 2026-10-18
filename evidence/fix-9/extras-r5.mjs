// R5 item 8 extra cases (mock Arkiv variant mock-arkiv-r5.ts, headless Chromium, localhost only):
// X1 an unknown-outcome Burn that did NOT go through stays listed after Refresh with its text; X2 a live tip that arrives while a sweep is in flight is never dropped; X3 a truncated sweep drops nothing.
// Fix stage 9: R5's file plus one status-line check in X2a and X3a (R5-L1: the number must be the number of rows listed; expected FAIL on dd76bcd) and
// three controls after a drop (X1c, X2b, X3b: the same check; they pass on both). Nothing else is changed.
// usage: node extras-r5.mjs <clone-dir> <dist dir of the R5 mock build> <out dir>  (run with `env -u DISPLAY`)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [CLONE, dist, out] = process.argv.slice(2)
if (!CLONE || !dist || !out) { console.error('usage: node rownote-extra.mjs <clone-dir> <dist dir> <out dir>'); process.exit(1) }
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
// Fix stage 9: the sweep's status line, spelled out from the number of rows listed. Compared exactly, so a stale line from an earlier sweep cannot pass.
const wantStatus = (rows, truncated = false) => (rows ? `${rows} tip${rows === 1 ? '' : 's'} on Arkiv${truncated ? ' (showing the first pages only)' : ''}.` : 'No tips yet.')

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

const W = 1280, H = 800
const dump = async (tag, page, i) => { const s = await snap(page); const r = await rowInfo(page, i); console.log(`${tag} status[${s.statusClass}]: ${s.status.slice(0, 300)}`); console.log(`${tag} row${i}: visible=${r.visible} text="${r.text.slice(0, 300)}"`); return { s, r } }
const listState = (page) => page.evaluate((sel) => ({
  rows: document.querySelectorAll('[data-testid=tip]').length,
  texts: [...document.querySelectorAll('[data-testid=tip]')].map((li) => ({ tip: (li.querySelector('.tip-text')?.textContent ?? '').slice(0, 40), note: li.querySelector(sel)?.hidden === false ? li.querySelector(sel).textContent.slice(0, 70) : '', meta: (li.querySelector('.meta, header')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 90) })),
}), NOTE)
const refresh = (page) => page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /^Refresh/.test(b.textContent))?.click())
const tipTexts = (page) => page.evaluate(() => [...document.querySelectorAll('[data-testid=tip]')].map((li) => (li.querySelector('[data-testid=tip-text]')?.textContent ?? '').replace(/SYNTHETIC TEST TIP( number)? ?/, '').slice(0, 24)))
const L = { text: 'SYNTHETIC TEST TIP live-arrival: made up.', ageMin: -10, days: 14, live: true } // created 10 min AFTER the head the timing call reports
const sweepNow = async (page, label) => { await refresh(page); const s = await poll(page, (x) => /on Arkiv|No tips/.test(x.status), 12000); console.log(`${label}: status[${s.statusClass}] "${s.status}"`); return s }
try {
  // X1 Burn, unknown outcome, the burn did NOT go through (the tip is still on Arkiv); Refresh; the row must stay, with its text
  let page = await open(W, H, { budget: BUDGET, tips: [T(1), T(2)], burnFail: 'unknown-hash' })
  await press(page, 1, /^Burn now/)
  let s = await poll(page, (x) => x.statusClass.includes('error'))
  const x1a = await listState(page)
  console.log('X1 after the unknown Burn:', JSON.stringify(x1a))
  check(/^Burn may not have completed/.test(x1a.texts[1].note), 'X1a the unknown Burn left its text on the row', x1a.texts[1].note)
  await page.evaluate(() => { window.__MOCK.burnFail = undefined }) // nothing else changes: the tip is still on Arkiv
  s = await sweepNow(page, 'X1 Refresh')
  const x1b = await listState(page)
  console.log('X1 after Refresh:', JSON.stringify(x1b))
  check(x1b.rows === 2 && /number 2/.test(x1b.texts[1].tip) && /^Burn may not have completed/.test(x1b.texts[1].note), 'X1b after Refresh the row is still listed, with its tip text and its Burn text', JSON.stringify(x1b.texts[1]))
  // and a second Refresh after the burn really went through: now it goes
  await page.evaluate(() => { window.__MOCK.tips = window.__MOCK.tips.slice(0, 1) })
  s = await sweepNow(page, 'X1 Refresh after the burn went through')
  check((await listState(page)).rows === 1, 'X1c once the tip is really gone from Arkiv the next complete sweep drops the row', '')
  s = await snap(page)
  check(s.status === wantStatus(s.rows), 'X1c-status after the drop the status line counts the rows listed (control: passes on dd76bcd too)', `status "${s.status}", ${s.rows} row(s)`)
  await page.close()

  // X1d a Burn the node refused for a known reason says "did not complete" (R4-L1), not "may not have completed"
  page = await open(W, H, { budget: BUDGET, tips: [T(1), T(2)], burnFail: 'http500' })
  await press(page, 1, /^Burn now/)
  s = await poll(page, (x) => x.statusClass.includes('error'))
  const x1d = await listState(page)
  console.log('X1d after the refused Burn:', JSON.stringify(x1d.texts[1]))
  check(/^Burn did not complete/.test(x1d.texts[1].note), 'X1d a refused Burn says "did not complete" (R4-L1)', x1d.texts[1].note)
  await page.close()

  // X2a a live tip arrives while a sweep is in flight (the sweep's answer was computed before it arrived): it stays
  page = await open(W, H, { budget: BUDGET, tips: [T(1), T(2)] })
  await page.evaluate(() => { window.__MOCK.sweepMs = 3000 })
  await refresh(page)
  await sleep(600)
  await page.evaluate((l) => { window.__MOCK.tips = [...window.__MOCK.tips, l]; window.__push.tip(window.__MOCK.tips.length - 1) }, L)
  await sleep(500)
  const before = await tipTexts(page)
  check(before.length === 3 && /live-arrival/.test(before[0]), 'X2a the live tip is listed while the sweep is still in flight', JSON.stringify(before))
  s = await poll(page, (x) => /on Arkiv|No tips/.test(x.status), 12000)
  await sleep(300)
  const after = await tipTexts(page)
  console.log(`X2a after the sweep: status[${s.statusClass}] "${s.status}" rows=${JSON.stringify(after)}`)
  check(after.length === 3 && /live-arrival/.test(after[0]), 'X2a the live tip is still listed after the sweep (whose answer lacks it)', JSON.stringify(after))
  check(s.status === wantStatus(s.rows) && s.rows === 3, 'X2a-status the status line counts the rows listed: "3 tips on Arkiv." (R5-L1: expected FAIL on dd76bcd)', `status "${s.status}", ${s.rows} row(s)`)
  await page.screenshot({ path: join(out, 'x2a-after.png') })
  await page.close()

  // X2b the live tip is burned with an unknown outcome while the sweep is in flight; the sweep (timing taken before the tip existed) lacks it: the head guard keeps it
  page = await open(W, H, { budget: BUDGET, tips: [T(1), T(2)] })
  await page.evaluate(() => { window.__MOCK.sweepMs = 3500 })
  await refresh(page)
  await sleep(600)
  await page.evaluate((l) => { window.__MOCK.tips = [...window.__MOCK.tips, l]; window.__push.tip(window.__MOCK.tips.length - 1) }, L)
  await sleep(400)
  await page.evaluate(() => { window.__MOCK.burnFail = 'unknown-hash' })
  await press(page, 0, /^Burn now/)
  await sleep(800)
  const mid = await listState(page)
  console.log('X2b after the unknown Burn on the live tip, sweep still in flight:', JSON.stringify(mid.texts[0]))
  check(/^Burn may not have completed/.test(mid.texts[0].note), 'X2b the live tip row carries the unknown-Burn text', mid.texts[0].note)
  s = await poll(page, (x) => /on Arkiv|No tips/.test(x.status), 12000)
  await sleep(300)
  const x2b = await listState(page)
  console.log(`X2b after the sweep: status[${s.statusClass}] "${s.status}" rows=${x2b.rows}`)
  check(x2b.rows === 3 && /live-arrival/.test(x2b.texts[0].tip) && /^Burn may not have completed/.test(x2b.texts[0].note), 'X2b the live tip burned during the sweep is not dropped by that sweep', JSON.stringify(x2b.texts[0]))
  // control: a later complete sweep that still lacks it (the burn did go through) drops it, because now the head has passed it
  await page.evaluate(() => { window.__MOCK.sweepMs = 0; window.__MOCK.burnFail = undefined; window.__MOCK.tips = window.__MOCK.tips.slice(0, 2); window.__MOCK.headDays = 1 })
  s = await sweepNow(page, 'X2b control Refresh (burn went through, head has moved on)')
  check((await listState(page)).rows === 2, 'X2b control: the next complete sweep, with the head past the tip, drops it', '')
  s = await snap(page)
  check(s.status === wantStatus(s.rows), 'X2b-status after the drop the status line counts the rows listed (control: passes on dd76bcd too)', `status "${s.status}", ${s.rows} row(s)`)
  await page.close()

  // X3 a truncated sweep drops nothing
  page = await open(W, H, { budget: BUDGET, tips: [T(1), T(2), T(3)] })
  await page.evaluate(() => { window.__MOCK.sweepFirst = 1 })
  s = await sweepNow(page, 'X3a truncated sweep (1 of 3)')
  check((await listState(page)).rows === 3 && /first pages only/.test(s.status), 'X3a a truncated sweep (1 of 3 tips) drops no row and says so', `rows=${(await listState(page)).rows}`)
  check(s.status === wantStatus(s.rows, true) && s.rows === 3, 'X3a-status the truncated sweep counts the rows listed: "3 tips on Arkiv (showing the first pages only)." (R5-L1: expected FAIL on dd76bcd)', `status "${s.status}", ${s.rows} row(s)`)
  await page.close()

  page = await open(W, H, { budget: BUDGET, tips: [T(1), T(2), T(3)], burnFail: 'unknown-hash' })
  await press(page, 2, /^Burn now/)
  s = await poll(page, (x) => x.statusClass.includes('error'))
  await page.evaluate(() => { window.__MOCK.burnFail = undefined; window.__MOCK.tips = window.__MOCK.tips.slice(0, 2); window.__MOCK.sweepFirst = 1 }) // the burn went through, and the sweep is truncated
  s = await sweepNow(page, 'X3b truncated sweep after an unknown Burn that went through')
  const x3b = await listState(page)
  check(x3b.rows === 3 && /^Burn may not have completed/.test(x3b.texts[2].note), 'X3b a truncated sweep does not drop the unknown-Burn row, and keeps its text', JSON.stringify(x3b.texts[2]))
  await page.evaluate(() => { window.__MOCK.sweepFirst = undefined })
  s = await sweepNow(page, 'X3b next complete sweep')
  check((await listState(page)).rows === 2, 'X3b the next complete sweep drops it', '')
  s = await snap(page)
  check(s.status === wantStatus(s.rows), 'X3b-status after the drop the status line counts the rows listed (control: passes on dd76bcd too)', `status "${s.status}", ${s.rows} row(s)`)
  await page.close()
} finally {
  await browser.close(); server.close?.()
  console.log(fails ? `${fails} CHECK(S) FAILED` : 'all checks passed')
}
