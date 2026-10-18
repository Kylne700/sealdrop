// R5 item 8 extra cases (mock Arkiv variant mock-arkiv-r5.ts, headless Chromium, localhost only):
// X1 an unknown-outcome Burn that did NOT go through stays listed after Refresh with its text; X2 a live tip that arrives while a sweep is in flight is never dropped; X3 a truncated sweep drops nothing.
// Fix stage 9: R5's file plus one check at the end of X2c (R5-L1: the status line must say "1 tip on Arkiv."; expected FAIL on dd76bcd). Nothing else is changed.
// usage: node extras-r5c.mjs <clone-dir> <dist dir of the R5 mock build> <out dir>  (run with `env -u DISPLAY`)
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
// Fix stage 9: the sweep's status line, spelled out from the number of rows listed. Compared exactly.
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
  // X2c (R5-L1, zero-tip variant): a brand-new inbox (the sweep answers with NO tips) and a live tip that arrives while a Refresh sweep is in flight
  let s
  const page = await open(W, H, { budget: BUDGET, tips: [] })
  await page.evaluate(() => { window.__MOCK.sweepMs = 3000 })
  await refresh(page)
  await sleep(600)
  await page.evaluate((l) => { window.__MOCK.tips = [...window.__MOCK.tips, l]; window.__push.tip(window.__MOCK.tips.length - 1) }, L)
  await sleep(500)
  const before = await tipTexts(page)
  const mid = await snap(page)
  console.log(`X2c while the sweep is in flight: status[${mid.statusClass}] "${mid.status}" rows=${JSON.stringify(before)}`)
  check(before.length === 1 && /live-arrival/.test(before[0]), 'X2c the live tip is listed while the sweep is in flight', JSON.stringify(before))
  s = await poll(page, (x) => /on Arkiv|No tips/.test(x.status), 12000)
  await sleep(300)
  const after = await tipTexts(page)
  console.log(`X2c after the sweep: status[${s.statusClass}] "${s.status}" rows=${JSON.stringify(after)}`)
  check(after.length === 1 && /live-arrival/.test(after[0]), 'X2c the live tip is still listed after the sweep (nothing dropped)', JSON.stringify(after))
  check(!/No tips yet/.test(s.status), 'X2c the status line does not say "No tips yet." while a tip is listed (R5-L1: expected FAIL on dd76bcd)', `status "${s.status}", ${after.length} row(s)`)
  check(s.status === wantStatus(s.rows) && s.rows === 1, 'X2c-status the status line counts the rows listed: "1 tip on Arkiv." (R5-L1: expected FAIL on dd76bcd)', `status "${s.status}", ${s.rows} row(s)`)
  await page.close()
} finally {
  await browser.close(); server.close?.()
  console.log(fails ? `${fails} CHECK(S) FAILED` : 'all checks passed')
}

