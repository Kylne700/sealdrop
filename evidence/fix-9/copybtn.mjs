// R5 item 6: the "Copy inbox link" button in Chromium at 1280 and 390, clipboard allowed / refused / absent.
// Fix stage 9: R5's file cut down to Chromium (the engine of the video), the clone taken from the command line, plus the double-click cases of R5-I2:
// two clicks 1 s apart on "Copy inbox link" and on the hex copy button ("Copy newsroom address"); the first "Copied" must last until 1.8 s after the second click.
// usage: node copybtn.mjs <dist dir of the MOCK build> <out dir> <clone dir>   (Playwright 1.64.1 Chromium, headless; run it with `env -u DISPLAY`
//        from a directory whose node_modules holds playwright, e.g. a scratch dir with a symlink: a bare import('playwright') resolves from the script's own directory)
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mkdirSync } from 'node:fs'
const [DIST, OUT, CLONE] = process.argv.slice(2)
if (!DIST || !OUT || !CLONE) { console.error('usage: node copybtn.mjs <mock dist> <out dir> <clone dir>'); process.exit(1) }
mkdirSync(OUT, { recursive: true })
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/tmp/fq-W/pw/browsers'
const { chromium, devices } = await import('playwright')
const lib = await import(pathToFileURL(join(CLONE, 'evidence/qa-scripts/lib.mjs')).href)
const req = createRequire(join(CLONE, 'package.json'))
const { privateKeyToAccount } = req('viem/accounts')
const nacl = req('tweetnacl')
const evm = '0x' + '11'.repeat(32)
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
const b64 = (u) => Buffer.from(u).toString('base64')
const IDENTITY = JSON.stringify({ v: 1, kind: 'local', address: privateKeyToAccount(evm).address, evmPrivateKey: evm, boxSecretKey: b64(secret), boxPublicKey: b64(nacl.box.keyPair.fromSecretKey(secret).publicKey), inboxId: 'inbox-3k9f2a', createdAt: '2026-10-17T09:00:00.000Z' })
const MOCK = { budget: [6, 600], tips: [{ text: 'SYNTHETIC TEST TIP number 1: a made-up message.', ageMin: 20, days: 14 }] }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const server = await lib.serve(DIST)
const strip = ({ defaultBrowserType, ...p }) => p
const envNoDisplay = () => { const e = { ...process.env }; delete e.DISPLAY; delete e.WAYLAND_DISPLAY; return e }

// ---- the page-side pieces ------------------------------------------------------------------------------------------
const INIT = ({ mock, identity, mode }) => {
  window.__MOCK = mock
  try { localStorage.clear(); localStorage.setItem('sealdrop:newsroom:v1', identity) } catch { /* no storage */ }
  window.__copied = []
  if (mode !== 'real') {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, get() {
      if (mode === 'undefined') return undefined
      return { writeText: async (t) => { if (mode === 'reject') throw new DOMException('blocked', 'NotAllowedError'); window.__copied.push(t) } }
    } })
  }
}
const SNAP = () => {
  const i = document.querySelector('#inbox-link'), b = document.querySelector('.linkrow button')
  const r = (e) => { const x = e.getBoundingClientRect(); return { x: x.x + scrollX, y: x.y + scrollY, w: x.width, h: x.height } }
  return { label: b.querySelector('span')?.textContent ?? b.textContent, input: r(i), button: r(b), active: document.activeElement === b, activeTag: document.activeElement?.tagName, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, copied: window.__copied.length, disp: getComputedStyle(b).display, row: r(b.parentElement) }
}
const LABEL_NOT = (l) => { const b = document.querySelector('.linkrow button'); return (b.querySelector('span')?.textContent ?? b.textContent) !== l }
const LABEL_IS = (l) => { const b = document.querySelector('.linkrow button'); return (b.querySelector('span')?.textContent ?? b.textContent) === l }

// ---- a thin driver with five verbs -----------------------------------------------------------------------------------
const pwDriver = (page) => ({
  goto: (u) => page.goto(u), ev: (f, a) => page.evaluate(f, a), click: (s) => page.click(s), focus: (s) => page.focus(s), press: (k) => page.keyboard.press(k),
  until: async (f, a, ms = 4000) => { const t0 = Date.now(); for (;;) { if (await page.evaluate(f, a)) return true; if (Date.now() - t0 > ms) return false; await sleep(25) } },
  shot: (sel, path) => page.locator(sel).first().screenshot({ path, animations: 'allow', caret: 'initial' }).catch(() => {}),
  names: async (n) => page.getByRole('button', { name: n, exact: true }).count(),
})

const px = (n) => Math.round(n * 100) / 100
const worst = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.w - b.w), Math.abs(a.h - b.h))
let bad = 0
const lines = []
const say = (s) => { console.log(s); lines.push(s) }

async function scenario(d, tag, { mode, action, firstLabel = 'Copy inbox link' }) {
  const expectLabel = mode === 'allow' || mode === 'real' ? 'Copied ✓' : 'Copy by hand'
  await d.goto(server.url + '#/newsroom')
  await d.until(() => !!document.querySelector('.linkrow button'), null, 15000)
  await d.ev(() => document.fonts.ready.then(() => 1))
  await sleep(300)
  const s0 = await d.ev(SNAP)
  if ((mode === 'allow') && action === 'click') await d.shot('.linkrow', `${OUT}/copy-${tag.replace(/\//g, '-')}-normal.png`)
  if (action === 'click') await d.click('.linkrow button')
  else { await d.focus('.linkrow button'); await d.press(action === 'enter' ? 'Enter' : 'Space') }
  const changed = await d.until(LABEL_NOT, firstLabel, 3000)
  const s1 = await d.ev(SNAP)
  const name1 = await d.names(s1.label)
  if ((mode === 'allow' || mode === 'reject') && action === 'click') await d.shot('.linkrow', `${OUT}/copy-${tag.replace(/\//g, '-')}-during.png`)
  await sleep(150)
  const s1b = await d.ev(SNAP) // 150 ms later: still in the same state, still the same sizes
  const back = await d.until(LABEL_IS, firstLabel, 4000)
  await sleep(100)
  const s2 = await d.ev(SNAP)
  const name0 = await d.names(firstLabel)
  const dIn1 = worst(s0.input, s1.input), dBt1 = worst(s0.button, s1.button), dIn2 = worst(s0.input, s2.input), dBt2 = worst(s0.button, s2.button), dRow = worst(s0.row, s1.row)
  const dInB = worst(s0.input, s1b.input), dBtB = worst(s0.button, s1b.button)
  const okSize = Math.max(dIn1, dBt1, dIn2, dBt2, dInB, dBtB, dRow) <= 1
  const okLabel = changed && s1.label === expectLabel && back && s2.label === firstLabel
  const okFocus = action === 'click' ? true : s1.active && s2.active
  const okCopied = mode === 'allow' ? s1.copied === 1 : mode === 'real' ? true : s1.copied === 0
  const okOverflow = s0.scrollW <= s0.innerW && s1.scrollW <= s1.innerW
  const okName = name0 === 1 || name0 === -1 // -1: this engine's driver cannot query accessible names
  const ok = okSize && okLabel && okFocus && okCopied && okOverflow && okName
  if (!ok) bad++
  say(`${ok ? 'PASS' : 'FAIL'}  ${tag}: labels "${s0.label}" -> "${s1.label}" -> "${s2.label}" | input ${px(s0.input.w)}x${px(s0.input.h)} @${px(s0.input.x)},${px(s0.input.y)}; button ${px(s0.button.w)}x${px(s0.button.h)} display=${s0.disp} | max delta px: input ${px(dIn1)}/${px(dIn2)} button ${px(dBt1)}/${px(dBt2)} row ${px(dRow)} (during/after) | focus kept ${s1.active && s2.active} (${s1.activeTag}) | writeText calls ${s1.copied} | overflow ${s1.scrollW > s1.innerW ? 'YES' : 'no'} | accessible-name matches first "${name0}", during "${name1}"`)
  return { s0, s1, s2 }
}

// ---- Fix stage 9, R5-I2: two clicks 1 s apart -----------------------------------------------------------------------------
// The first click's timer goes back at 1.8 s, which is 0.8 s after the second click. After the second click the state is sampled at about 1.2 s ("Copied" must still be
// there; dd76bcd has already gone back) and at about 2.4 s (it must be back). Both samples carry their measured distance; one outside 1.0-1.7 s / 1.9-3.5 s means
// a stalled machine and counts as a FAILURE, not as a verdict. The hex button is the icon button beside the newsroom address: the hidden status text and the icon (check = 1 path, copy = 2).
const BTN = { copyButton: '.linkrow button', hex: 'button.icon-btn[aria-label="Copy newsroom address"]' }
const READ = {
  copyButton: (sel) => document.querySelector(sel + ' span').textContent,
  hex: (sel) => { const b = document.querySelector(sel); return `${b.parentElement.querySelector('.vh').textContent}|${b.querySelectorAll('svg path').length === 1 ? 'check' : 'copy'}` },
}
async function doubleClick(d, tag, { mode, which }) {
  const sel = BTN[which], read = READ[which]
  const normal = which === 'hex' ? '|copy' : 'Copy inbox link'
  const shown = which === 'hex' ? (mode === 'allow' ? 'Copied|check' : 'Select and copy manually|copy') : (mode === 'allow' ? 'Copied ✓' : 'Copy by hand')
  await d.goto(server.url + '#/newsroom')
  await d.until(() => !!document.querySelector('.linkrow button'), null, 15000)
  await sleep(300)
  const s0 = await d.ev(read, sel)
  await d.click(sel)
  await sleep(150)
  const s1 = await d.ev(read, sel)
  await sleep(850)
  await d.click(sel)
  const t2 = Date.now()
  await sleep(1200)
  const mid = await d.ev(read, sel), dMid = Date.now() - t2
  await sleep(1200)
  const end = await d.ev(read, sel), dEnd = Date.now() - t2
  const okTiming = dMid >= 1000 && dMid <= 1700 && dEnd >= 1900 && dEnd <= 3500
  const ok = s0 === normal && s1 === shown && mid === shown && end === normal && okTiming
  if (!ok) bad++
  say(`${ok ? 'PASS' : 'FAIL'}  ${tag}: "${s0}" -> click -> "${s1}" -> second click 1 s later -> +${dMid} ms "${mid}" (must still be shown) -> +${dEnd} ms "${end}" (must be back)${okTiming ? '' : ' | TIMING OUT OF RANGE (stalled machine?)'}`)
}

const MODES = ['allow', 'reject', 'undefined']
const ACTIONS = ['click', 'enter', 'space']
async function runEngine(engine, mkPage, widths) {
  for (const w of widths) {
    for (const mode of MODES) {
      for (const action of ACTIONS) {
        const { page, done } = await mkPage(w, mode)
        try { await scenario(page, `${engine}/${w}/${mode}/${action}`, { mode, action }) } catch (e) { bad++; say(`FAIL  ${engine}/${w}/${mode}/${action}: ${String(e.message).split('\n')[0]}`) } finally { await done() }
      }
    }
  }
}

const widths = [1280, 390]
for (const engine of ['chromium']) {
  const browser = await chromium.launch({ headless: true, env: envNoDisplay() })
  const base = strip(devices['Desktop Chrome'])
  const mk = async (w, mode) => {
    const ctx = await browser.newContext({ ...base, viewport: { width: w, height: w === 390 ? 844 : 720 }, deviceScaleFactor: 1, serviceWorkers: 'block', reducedMotion: 'no-preference' })
    const page = await ctx.newPage()
    await page.addInitScript(INIT, { mock: MOCK, identity: IDENTITY, mode })
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e.message)))
    page.on('console', (m) => { if (m.type() === 'error' && !/Refused to apply a stylesheet/.test(m.text())) errs.push(m.text()) })
    return { page: pwDriver(page), done: async () => { if (errs.length) { bad++; say(`FAIL  page/console errors: ${errs.slice(0, 3).join(' | ')}`) } await ctx.close() } }
  }
  await runEngine(engine, mk, widths)
  if (engine === 'chromium') {
    // the real clipboard in Chromium: permission granted, then read back what the click copied
    for (const w of widths) {
      const ctx = await browser.newContext({ ...base, viewport: { width: w, height: w === 390 ? 844 : 720 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] })
      const page = await ctx.newPage()
      await page.addInitScript(INIT, { mock: MOCK, identity: IDENTITY, mode: 'real' })
      await page.goto(server.url + '#/newsroom'); await page.waitForSelector('.linkrow button')
      await page.click('.linkrow button'); await page.waitForFunction(LABEL_NOT, 'Copy inbox link', { timeout: 3000 })
      const got = await page.evaluate(async () => ({ clip: await navigator.clipboard.readText(), link: document.querySelector('#inbox-link').value, label: document.querySelector('.linkrow button span').textContent }))
      const ok = got.label === 'Copied ✓' && got.clip === got.link && got.clip.length > 20
      if (!ok) bad++
      say(`${ok ? 'PASS' : 'FAIL'}  chromium/${w}/real-clipboard/click: label "${got.label}", clipboard equals the link field: ${got.clip === got.link} (${got.clip.length} chars)`)
      await ctx.close()
    }
  }
  // R5-I2: the double-click cases
  for (const w of widths) for (const mode of ['allow', 'reject']) for (const which of ['copyButton', 'hex']) {
    const { page, done } = await mk(w, mode)
    try { await doubleClick(page, `chromium/${w}/${mode}/double-click-${which}`, { mode, which }) } catch (e) { bad++; say(`FAIL  chromium/${w}/${mode}/double-click-${which}: ${String(e.message).split('\n')[0]}`) } finally { await done() }
  }
  await browser.close()
}
server.close?.()
say(bad ? `${bad} CHECK(S) FAILED` : 'all copy-button checks passed')
process.exit(bad ? 4 : 0)
