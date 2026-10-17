// Fix stage 8: browser measurements for QA W's W-2 .. W-6 on a mock build (no network except localhost, no key material).
// usage: node measure.mjs <clone-dir> <dist dir of a mock build> <label> [shots-dir]
//   <clone-dir>: only for node_modules and evidence/qa-scripts/lib.mjs. Playwright 1.64.1 comes from $PW_DIR (default /tmp/fq-W/pw), browsers from
//   $PLAYWRIGHT_BROWSERS_PATH (/tmp/fq-W/pw/browsers); WebKit runs headless with DISPLAY unset (WPE hangs when it is set). $HARNESS: R3's screens directory (fp.mts).
// Output: one JSON line per (engine, profile, theme, scenario) to stdout-json file <shots-dir>/facts-<label>.jsonl, a readable summary on stdout.
//   Profiles: desktop = 1280x720 mouse; narrow = 390x844 mouse; phone = the iPhone 15 profile (393x852, touch: pointer coarse).
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [CLONE, DIST, LABEL, SHOTS = `/tmp/fq-F8/shots-${LABEL}`] = process.argv.slice(2)
if (!CLONE || !DIST || !LABEL) { console.error('usage: node measure.mjs <clone-dir> <dist dir> <label> [shots-dir]'); process.exit(1) }
const PW = process.env.PW_DIR ?? '/tmp/fq-W/pw'
const HARNESS = process.env.HARNESS ?? '/tmp/fq-F8/harness'
const ONLY_ENGINES = (process.env.ENGINES ?? 'chromium,webkit').split(',')
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/tmp/fq-W/pw/browsers'
const { webkit, chromium, devices } = await import(pathToFileURL(join(PW, 'node_modules/playwright/index.mjs')).href)
const { serve } = await import(pathToFileURL(join(CLONE, 'evidence/qa-scripts/lib.mjs')).href)
const req = createRequire(join(CLONE, 'package.json'))
const { privateKeyToAccount } = req('viem/accounts')
const nacl = req('tweetnacl')
mkdirSync(SHOTS, { recursive: true })

// ---- the synthetic newsroom the mock console shows (same shape as R3's shoot-r2.mjs) -----------------------------------
const evm = '0x' + '11'.repeat(32)
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
const b64 = (u) => Buffer.from(u).toString('base64')
const IDENTITY = { v: 1, kind: 'local', address: privateKeyToAccount(evm).address, evmPrivateKey: evm, boxSecretKey: b64(secret), boxPublicKey: b64(nacl.box.keyPair.fromSecretKey(secret).publicKey), inboxId: 'inbox-3k9f2a', createdAt: '2026-10-17T09:00:00.000Z' }
const FP = execFileSync(join(CLONE, 'node_modules/.bin/tsx'), [join(HARNESS, 'fp.mts'), CLONE], { encoding: 'utf8' }).trim()
const SEND = `#/send/${IDENTITY.address}/${IDENTITY.inboxId}/${FP}`
const T = (n, days = 14) => ({ text: `SYNTHETIC TEST TIP number ${n}: a made-up message.`, ageMin: 20 * n, days })
const MOCK = { budget: [6, 600], tips: [T(1), T(2), T(3)] }

const strip = ({ defaultBrowserType, ...p }) => p
const PROFILES = {
  desktop: (e) => ({ ...strip(e === 'webkit' ? devices['Desktop Safari'] : devices['Desktop Chrome']), viewport: { width: 1280, height: 720 } }),
  narrow: (e) => ({ ...strip(e === 'webkit' ? devices['Desktop Safari'] : devices['Desktop Chrome']), viewport: { width: 390, height: 844 } }),
  phone: () => strip(devices['iPhone 15']),
}

// ---- in-page measurement -----------------------------------------------------------------------------------------------
function inPageFacts() {
  const px = (n) => Math.round(n * 10) / 10
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.left + scrollX), y: px(r.top + scrollY), w: px(r.width), h: px(r.height) } }
  const name = (el) => el.localName + (el.id ? '#' + el.id : '') + (el.dataset?.testid ? `[${el.dataset.testid}]` : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().replace(/\s+/g, '.') : '')
  const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
  const tiny = (el) => { const r = el.getBoundingClientRect(); return r.width <= 1.5 && r.height <= 1.5 } // .vh / .hex-mid / .sr-only boxes
  const out = { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth }
  out.fields = [...document.querySelectorAll('input, textarea, select')].filter((e) => !['radio', 'checkbox', 'hidden'].includes(e.type)).map((e) => ({ who: name(e), size: parseFloat(getComputedStyle(e).fontSize), ro: e.readOnly, ...rect(e) }))
  out.details = [...document.querySelectorAll('details')].map((d) => {
    d.open = true
    const D = d.getBoundingClientRect(); let worst = { over: 0 }, n = 0
    for (const el of d.querySelectorAll('*')) {
      if (!el.getClientRects().length || tiny(el)) continue
      const r = el.getBoundingClientRect()
      const over = Math.max(r.right - D.right, D.left - r.left, r.bottom - D.bottom, D.top - r.top)
      if (over > 0.5) { n++; if (over > worst.over) worst = { over: px(over), who: name(el) } }
    }
    return { box: name(d), w: px(D.width), sticking: n, worst }
  })
  const interactive = [...document.querySelectorAll('a, button, input, select, textarea, summary')].filter(shown)
  out.links = [...document.querySelectorAll('a')].filter(shown).map((a) => {
    const r = a.getBoundingClientRect(), p = a.parentElement
    const hits = interactive.filter((o) => o !== a && !a.contains(o) && !o.contains(a)).filter((o) => { const q = o.getBoundingClientRect(); return Math.min(r.right, q.right) - Math.max(r.left, q.left) > 1 && Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top) > 1 }).map(name)
    const words = [...p.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').split(/\s+/).filter(Boolean).length
    return { who: name(a), text: a.textContent.trim().slice(0, 26), w: px(r.width), h: px(r.height), parent: name(p).slice(0, 36), sentenceWords: words, overlaps: hits.slice(0, 3) }
  })
  const idx = (el) => { const p = []; for (let e = el; e && e !== document.body; e = e.parentElement) p.unshift([...e.parentElement.children].indexOf(e)); return p.join('/') }
  out.layout = Object.fromEntries([...document.body.querySelectorAll('*')].filter((e) => e.getClientRects().length && !tiny(e)).map((e) => { const r = rect(e); return [idx(e), [name(e).slice(0, 60), r.x, r.y, r.w, r.h]] }))
  return out
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const slug = (...a) => a.join('-')
async function newPage(ctx, hash, { identity = null, mock = {} } = {}) {
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.addInitScript(({ mock, identity }) => {
    window.__MOCK = mock
    try { localStorage.clear(); if (identity) localStorage.setItem('sealdrop:newsroom:v1', identity) } catch { /* no storage */ }
    // a stand-in clipboard that works until window.__clipFail is set (the same in both engines; the real one needs a permission)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { if (window.__clipFail) throw new DOMException('blocked', 'NotAllowedError'); window.__clip = t } } })
  }, { mock, identity })
  await page.goto(server.url + hash)
  return page
}
const facts = (page) => page.evaluate(inPageFacts)
const cut = (loc, file) => loc.screenshot({ path: file, scale: 'css', animations: 'disabled' })

// the copy button cycle: sizes of the link input and the button in each state
async function copyCycle(page, tag, shots) {
  const snap = (state) => page.evaluate((state) => {
    const i = document.querySelector('#inbox-link').getBoundingClientRect(), b = document.querySelector('.linkrow button'), q = b.getBoundingClientRect()
    return { state, label: b.innerText, input: [Math.round(i.width * 10) / 10, Math.round(i.height * 10) / 10], button: [Math.round(q.width * 10) / 10, Math.round(q.height * 10) / 10] }
  }, state)
  const row = page.locator('#inbox-link').locator('xpath=ancestor::div[1]/..')
  const states = [await snap('normal')]
  await cut(row, join(shots, `linkrow-${tag}-1normal.png`))
  await page.click('.linkrow button')
  await page.waitForFunction(() => /Copied/.test(document.querySelector('.linkrow button').innerText))
  states.push(await snap('copied')); await cut(row, join(shots, `linkrow-${tag}-2copied.png`))
  await page.waitForFunction(() => /Copy inbox link/.test(document.querySelector('.linkrow button').innerText), null, { timeout: 5000 })
  states.push(await snap('back'))
  await page.evaluate(() => { window.__clipFail = true })
  await page.click('.linkrow button')
  await page.waitForFunction(() => !/^(Copy inbox link|Copied)/.test(document.querySelector('.linkrow button').innerText))
  states.push(await snap('blocked')); await cut(row, join(shots, `linkrow-${tag}-3blocked.png`))
  await page.waitForFunction(() => /Copy inbox link/.test(document.querySelector('.linkrow button').innerText), null, { timeout: 5000 })
  states.push(await snap('back2'))
  await page.evaluate(() => { window.__clipFail = false })
  return states
}
// the small copy button next to an address (hex()): size of the whole value and of the button
async function hexCycle(page) {
  const snap = (state) => page.evaluate((state) => {
    const h = document.querySelector('.hex'), b = h.querySelector('.icon-btn'), r = h.getBoundingClientRect(), q = b.getBoundingClientRect(), vh = h.querySelector('.vh')
    return { state, said: vh.textContent, hex: [Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10], button: [Math.round(q.width * 10) / 10, Math.round(q.height * 10) / 10] }
  }, state)
  const states = [await snap('normal')]
  await page.click('.hex .icon-btn'); await page.waitForFunction(() => document.querySelector('.hex .vh').textContent !== '')
  states.push(await snap('copied'))
  await page.waitForFunction(() => document.querySelector('.hex .vh').textContent === '', null, { timeout: 5000 })
  states.push(await snap('back'))
  await page.evaluate(() => { window.__clipFail = true })
  await page.click('.hex .icon-btn'); await page.waitForFunction(() => document.querySelector('.hex .vh').textContent !== '')
  states.push(await snap('blocked'))
  await page.waitForFunction(() => document.querySelector('.hex .vh').textContent === '', null, { timeout: 5000 })
  await page.evaluate(() => { window.__clipFail = false })
  return states
}
// does the file input have the room its engine's own default width gives it? (a probe copy with width:auto, same cascade)
const fileProbe = (page) => page.evaluate(() => {
  const f = document.querySelector('#import'), a = f.getBoundingClientRect().width
  const p = f.cloneNode(); p.removeAttribute('id'); p.style.cssText = 'width:auto;max-width:none;position:absolute;visibility:hidden;left:0;top:0'
  f.parentElement.append(p); const need = p.getBoundingClientRect().width; p.remove()
  return { actual: Math.round(a * 10) / 10, defaultWidth: Math.round(need * 10) / 10 }
})

// ---- run -------------------------------------------------------------------------------------------------------------------
const server = await serve(DIST)
const lines = []
const emit = (o) => { lines.push(JSON.stringify(o)); }
let failures = 0
try {
  for (const engine of ONLY_ENGINES) {
    const env = { ...process.env }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY
    const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, env })
    for (const [pid, mk] of Object.entries(PROFILES)) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ ...mk(engine), colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block' })
        const tag = slug(engine, pid, scheme)
        const base = { engine, profile: pid, scheme }
        try {
          // home
          let page = await newPage(ctx, '#/')
          await page.waitForSelector('[data-testid=open-desk]'); await page.evaluate(() => document.fonts.ready)
          emit({ ...base, scenario: 'home', ...(await facts(page)) })
          if (scheme === 'light') await page.screenshot({ path: join(SHOTS, `home-${tag}.png`), fullPage: true, scale: 'css', animations: 'disabled' })
          await page.close()
          // onboarding (no newsroom yet): the file input in the third card
          page = await newPage(ctx, '#/newsroom')
          await page.waitForSelector('[data-testid=create-newsroom]'); await page.evaluate(() => document.fonts.ready)
          const f = await facts(page)
          emit({ ...base, scenario: 'onboarding', file: await fileProbe(page), cards: await page.evaluate(() => [...document.querySelectorAll('.cards > .card')].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] })), ...f })
          await cut(page.locator('.cards'), join(SHOTS, `onboarding-cards-${tag}.png`))
          await page.close()
          // console: link row, hex copy, details, links
          page = await newPage(ctx, '#/newsroom', { identity: JSON.stringify(IDENTITY), mock: MOCK })
          await page.waitForSelector('#inbox-link'); await page.waitForSelector('.tip'); await page.evaluate(() => document.fonts.ready)
          const copy = await copyCycle(page, tag, SHOTS)
          const hexc = await hexCycle(page)
          emit({ ...base, scenario: 'console', copy, hexCopy: hexc, ...(await facts(page)) })
          await page.close()
          // send page: Settings open, then after a send the result with its two details
          page = await newPage(ctx, SEND, { mock: MOCK })
          await page.waitForSelector('[data-testid=message]'); await page.evaluate(() => document.fonts.ready)
          const s1 = await facts(page)   // facts() opens every details
          await cut(page.locator('details.settings'), join(SHOTS, `settings-open-${tag}.png`))
          emit({ ...base, scenario: 'send', ...s1 })
          await page.close()
          page = await newPage(ctx, SEND, { mock: MOCK })
          await page.waitForSelector('[data-testid=message]')
          await page.fill('[data-testid=message]', 'SYNTHETIC TEST message for the layout check')
          await page.click('[data-testid=send]')
          await page.waitForSelector('[data-testid=send-result]'); await page.evaluate(() => document.fonts.ready)
          emit({ ...base, scenario: 'sent', ...(await facts(page)) })
          await page.close()
        } catch (e) { failures++; emit({ ...base, scenario: 'ERROR', error: String(e.message).split('\n')[0] }) }
        await ctx.close()
      }
    }
    await browser.close()
  }
} finally { server.close?.() }
writeFileSync(join(SHOTS, `facts-${LABEL}.jsonl`), lines.join('\n') + '\n')
console.log(`label=${LABEL} records=${lines.length} errors=${failures} -> ${join(SHOTS, `facts-${LABEL}.jsonl`)}`)
process.exit(failures ? 4 : 0)
