// A-W5 on real MetaMask (fix stage 3). Does not take the live lock itself; run it as
//   flock -w 900 /tmp/sealdrop-live.lock node qa-fix3/w5.mjs <run-name>
// Records: every EIP-1193 call the page makes to window.ethereum (wrapped in the page, with times), the status
// line and the result card (MutationObserver in the page, no polling), and every MetaMask popup (screenshots).
// The tx popup is held HOLD_MS before Confirm is clicked; only a tx popup that appears while the app's own
// eth_sendTransaction is open is confirmed.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const RUN = process.argv[2] ?? 'run1'
const W = `${process.env.HOME}/qa-cache/fix3`
const OUT = `${W}/w5/${RUN}`
fs.mkdirSync(OUT, { recursive: true })
const PROFILE = process.env.PROFILE ?? `${W}/prof-w5a`
const EXT = `${W}/mm`
const EXT_ID = fs.readFileSync(`${W}/w5/ext-id.txt`, 'utf8').trim()
const LINK = 'http://127.0.0.1:47392/#/send/0x5116fB80527C12b04e3281594971Abf51276cb22/inbox-jwejqk'
const HOLD_MS = 10_000
const PORT = 9397
// The throwaway QA wallet's password is read from R's script at run time and never logged.
const PW = /pw\.type\('([^']+)'\)/.exec(fs.readFileSync('/tmp/fq-R/repo/qa-net/w5.mjs', 'utf8'))[1]

const t0 = Date.now()
const events = []
const log = (kind, o = {}, at = Date.now()) => {
  const e = { t: new Date(at).toISOString().slice(11, 23), ms: at - t0, kind, ...o }
  events.push(e)
  fs.appendFileSync(`${OUT}/events.jsonl`, JSON.stringify(e) + '\n')
  console.log(`${e.t} +${(e.ms / 1000).toFixed(2)}s ${kind} ${JSON.stringify(o).slice(0, 240)}`)
  return e
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rel = (u) => u.replace(/^chrome-extension:\/\/[a-p]{32}/, '')

const chrome = spawn('/usr/bin/chromium', [`--user-data-dir=${PROFILE}`, `--remote-debugging-port=${PORT}`, '--no-first-run', '--no-default-browser-check', '--no-sandbox',
  '--window-size=1300,900', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, 'about:blank'],
  { env: { ...process.env, DISPLAY: ':97' }, stdio: ['ignore', fs.openSync(`${OUT}/chrome.log`, 'w'), fs.openSync(`${OUT}/chrome.err.log`, 'w')] })
let b
for (let i = 0; i < 60 && !b; i++) { b = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null }).catch(() => undefined); if (!b) await sleep(500) }
const finish = async (code) => { fs.writeFileSync(`${OUT}/summary.txt`, summary()); await b?.close().catch(() => {}); chrome.kill(); process.exit(code) }

b.on('targetcreated', (t) => { if (t.url().includes(EXT_ID)) log('mm-target', { type: t.type(), url: rel(t.url()) }) })
b.on('targetchanged', (t) => { if (t.url().includes(EXT_ID)) log('mm-target-changed', { type: t.type(), url: rel(t.url()) }) })

let ext
for (let i = 0; i < 40 && !ext; i++) { ext = b.targets().find((t) => t.url().startsWith(`chrome-extension://${EXT_ID}/`)); if (!ext) await sleep(500) }
log('extension', { found: Boolean(ext), url: ext && rel(ext.url()), type: ext?.type(), otherExtensions: b.targets().filter((t) => t.url().startsWith('chrome-extension://') && !t.url().includes(EXT_ID)).map((t) => t.url().slice(0, 60)) })
if (!ext) { log('abort', { why: 'MetaMask did not load under the expected id' }); await finish(2) }

// ---- unlock in the full-page UI, then close it so the confirmation opens the way it does for a user ----
const mm = await b.newPage()
await mm.goto(`chrome-extension://${EXT_ID}/home.html`)
await sleep(4000)
const pw = await mm.$('input[type=password]')
if (pw) { await pw.type(PW); await mm.keyboard.press('Enter'); await sleep(5000) }
const home = (await mm.evaluate(() => document.body.innerText.replace(/\s+/g, ' ')).catch(() => '')).slice(0, 300)
log('mm-home', { typedPassword: Boolean(pw), text: home })
await mm.screenshot({ path: `${OUT}/mm-unlocked.png` })
if (!/0xba699/i.test(home)) { log('abort', { why: 'not unlocked on Account 1 0xba69..' }); await finish(2) }
await mm.close()
// MetaMask opens its own home.html tab when it sees itself as newly installed (new id); a user has none open.
for (const p of await b.pages()) if (p.url().includes(EXT_ID)) { log('mm-page-closed', { url: rel(p.url()) }); await p.screenshot({ path: `${OUT}/mm-left-open.png` }).catch(() => {}); await p.close() }
// run 1: MetaMask 13.52 put the confirmation in sidepanel.html, which browser.pages() did not return, so look at targets.
const asPages = new Map()
const mmPages = async () => {
  const out = []
  for (const t of b.targets()) {
    if (!t.url().includes(EXT_ID) || !/(notification|sidepanel|home)\.html/.test(t.url())) continue
    if (!asPages.has(t)) asPages.set(t, await t.asPage().catch((e) => { log('asPage-failed', { url: rel(t.url()), type: t.type(), e: String(e).slice(0, 120) }); return null }))
    if (asPages.get(t)) out.push(asPages.get(t))
  }
  return out
}

// ---- the app page: hooks before any page script runs ----
const app = (await b.pages()).find((p) => p.url() === 'about:blank') ?? await b.newPage()
await app.exposeFunction('__w5', (s) => { const { kind, pt, ...o } = JSON.parse(s); log(kind, { ...o, src: 'page' }, pt) })
await app.evaluateOnNewDocument(() => {
  const send = (o) => { try { window.__w5(JSON.stringify({ pt: Date.now(), ...o })) } catch { /* binding not ready */ } }
  const short = (v, k) => typeof v === 'string' ? (k === 'data' ? `<${(v.length - 2) / 2} bytes>` : v.length > 30 ? `${v.slice(0, 14)}…${v.slice(-6)}` : v)
    : Array.isArray(v) ? v.map((x) => short(x)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, short(x, kk)])) : v
  let n = 0
  const hook = () => {
    const eth = window.ethereum
    if (!eth) return false
    if (eth.__w5) return true
    const orig = eth.request
    eth.request = function (args) {
      const id = ++n, method = args?.method
      send({ kind: 'eip1193', phase: 'call', id, method, params: short(args?.params) })
      return Promise.resolve().then(() => orig.call(this ?? eth, args)).then(
        (r) => { send({ kind: 'eip1193', phase: 'ok', id, method, result: short(r) }); return r },
        (e) => { send({ kind: 'eip1193', phase: 'error', id, method, code: e?.code, message: String(e?.message ?? e).slice(0, 200) }); throw e })
    }
    eth.__w5 = true
    send({ kind: 'hook', note: 'window.ethereum.request wrapped', isMetaMask: Boolean(eth.isMetaMask) })
    return true
  }
  const iv = setInterval(() => { if (hook()) clearInterval(iv) }, 5)
  let last, lastResult
  const check = () => {
    const p = document.querySelector('[data-testid=progress]')
    const text = p ? p.textContent.trim() : null
    if (text !== last) { last = text; send({ kind: 'status', text, cls: p?.className ?? null }) }
    const r = document.querySelector('[data-testid=send-result]')
    const vis = r ? !r.hidden : null
    if (vis !== lastResult) { lastResult = vis; send({ kind: 'result', visible: vis }) }
  }
  new MutationObserver(check).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] })
})
await app.bringToFront()
await app.goto(LINK)
await app.waitForSelector('[data-testid=inbox]', { timeout: 120_000 })
const served = await app.evaluate(() => [...document.scripts].map((s) => s.src).filter(Boolean))
log('send-page-ready', { served, walletRadioDisabled: await app.$eval('[data-testid=mode-wallet]', (e) => e.disabled) })
if (!events.some((e) => e.kind === 'hook')) { log('abort', { why: 'window.ethereum.request was not wrapped' }); await finish(2) }

const statusNow = () => app.$eval('[data-testid=progress]', (e) => e.textContent.trim()).catch(() => '(none)')
const open = () => { const m = new Map(); for (const e of events) if (e.kind === 'eip1193') e.phase === 'call' ? m.set(e.id, e.method) : m.delete(e.id); return [...m.values()] }

await app.click('[data-testid=mode-wallet]')
await app.click('input[name=days][value="1"]')
await app.type('[data-testid=message]', `SYNTHETIC TEST fix-3 W5 real MetaMask ${new Date().toISOString()}`)
log('click-send')
await app.click('[data-testid=send]')
const tSend = Date.now()

let held = 0, confirmed = 0, shots = 0
const seen = new Set()
for (;;) {
  if (events.some((e) => e.kind === 'result' && e.visible) || events.some((e) => e.kind === 'status' && /error/.test(e.cls ?? '') && e.ms > tSend - t0)) break
  if (Date.now() - tSend > 330_000) { log('gave-up', { afterMs: Date.now() - tSend, status: await statusNow(), open: open() }); break }
  for (const q of await mmPages()) {
    const url = rel(q.url())
    const info = await q.evaluate(() => ({ text: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
      ids: ['confirm-footer-button', 'confirm-btn', 'page-container-footer-next', 'confirmation-submit-button'].filter((i) => { const e = document.querySelector(`[data-testid="${i}"]`); return e && !e.disabled }) })).catch(() => null)
    if (!info) continue
    const key = url + info.text.slice(0, 80)
    if (!seen.has(key)) { seen.add(key); log('popup', { url, listedByPages: (await b.pages()).some((p) => p.url() === q.url()), buttons: info.ids, open: open(), text: info.text.slice(0, 300) }); await q.screenshot({ path: `${OUT}/popup-${++shots}.png` }).catch(() => {}) }
    const isTx = /confirm-transaction/.test(url)
    if (isTx && open().includes('eth_sendTransaction') && !confirmed && info.ids.includes('confirm-footer-button')) {
      if (!held) {
        held = Date.now()
        log('tx-popup-waiting', { status: await statusNow() })
        await q.screenshot({ path: `${OUT}/popup-tx-waiting-1.png` }); await app.screenshot({ path: `${OUT}/app-while-popup-1.png` })
      } else if (Date.now() - held > HOLD_MS) {
        log('tx-popup-still-waiting', { heldMs: Date.now() - held, status: await statusNow() })
        await q.screenshot({ path: `${OUT}/popup-tx-waiting-2.png` }); await app.screenshot({ path: `${OUT}/app-while-popup-2.png` })
        await q.$eval('[data-testid=confirm-footer-button]', (e) => e.click())
        confirmed = Date.now()
        log('clicked-confirm')
      }
    } else if (!isTx && info.ids.length && open().some((m) => m !== 'eth_sendTransaction')) {
      log('approve-own-prompt', { url, button: info.ids[0], open: open() })
      await q.evaluate((i) => document.querySelector(`[data-testid="${i}"]`)?.click(), info.ids[0]).catch(() => {})
      await sleep(1500)
    }
  }
  await sleep(250)
}
await sleep(1500)
const links = await app.$$eval('[data-testid=send-result] dd a', (as) => as.map((a) => a.href)).catch(() => [])
log('final', { status: await statusNow(), resultLinks: links, open: open() })
await app.screenshot({ path: `${OUT}/app-final.png` })
await finish(0)

function summary() {
  const lines = [`W5 run ${RUN}, started ${new Date(t0).toISOString()}; times are seconds after the click on Send`]
  const ts = events.find((e) => e.kind === 'click-send')?.ms ?? 0
  for (const e of events) {
    const s = ((e.ms - ts) / 1000).toFixed(2).padStart(8)
    if (e.kind === 'status') lines.push(`${s}  STATUS   ${e.text ?? '(no status line)'}`)
    else if (e.kind === 'eip1193') lines.push(`${s}  WALLET   #${e.id} ${e.method} ${e.phase}${e.phase === 'ok' ? ' ' + JSON.stringify(e.result) : e.phase === 'error' ? ` code=${e.code} ${e.message}` : e.method === 'eth_sendTransaction' ? ' ' + JSON.stringify(e.params) : ''}`)
    else if (['click-send', 'tx-popup-waiting', 'tx-popup-still-waiting', 'clicked-confirm', 'final', 'gave-up', 'abort', 'result', 'popup'].includes(e.kind)) lines.push(`${s}  ${e.kind.toUpperCase().padEnd(8)} ${JSON.stringify({ ...e, t: undefined, ms: undefined, kind: undefined, src: undefined }).slice(0, 300)}`)
  }
  return lines.join('\n') + '\n'
}
