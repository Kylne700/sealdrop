// usage: node shoot.mjs <dist dir> <out dir> [state ids, comma separated]
// Screenshots every route/state of a mock-backed build (see build-mock.sh) at 1280x800 and 390x844, light and dark.
// Time is frozen, motion is reduced, and the console/page errors of every state are counted (the CSP is active).
import { mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import { privateKeyToAccount } from 'viem/accounts'
import { serve, launch, sleep } from '../qa-scripts/lib.mjs'
import { auditPage } from '../qa-scripts/a11y-lib.mjs'

const [dist, out, only] = process.argv.slice(2)
mkdirSync(out, { recursive: true })

const evm = '0x' + '11'.repeat(32) // a synthetic key; the mock never signs with it
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
const b64 = (u) => Buffer.from(u).toString('base64')
const IDENTITY = { v: 1, kind: 'local', address: privateKeyToAccount(evm).address, evmPrivateKey: evm, boxSecretKey: b64(secret), boxPublicKey: b64(nacl.box.keyPair.fromSecretKey(secret).publicKey), inboxId: 'inbox-3k9f2a', createdAt: '2026-10-17T09:00:00.000Z' }
const SEND = `#/send/${IDENTITY.address}/${IDENTITY.inboxId}`
const FIXED = Date.UTC(2026, 9, 17, 9, 30)
const BUDGET = [6, 600]

const TIPS = [
  { text: 'SYNTHETIC TEST TIP: the loading dock camera at the east gate has been off since Monday. A made-up message for the demo.', ageMin: 3, days: 14, live: true },
  { text: 'SYNTHETIC TEST TIP: a second made-up message, sent from the shared demo key.\nIt has two lines.', ageMin: 190, days: 7 },
  { text: 'SYNTHETIC TEST TIP (RTL sample): זוהי הודעת בדיקה מומצאת.', ageMin: 1500, days: 30, mine: false },
  { text: '', ageMin: 2900, days: 1, bad: true },
]
const LONG = 'SYNTHETIC TEST TIP: this is a made-up message used to show the size meter. '.repeat(24)
const fill = (page, text) => page.$eval('[data-testid=message]', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')) }, text)
const sentVisible = (page) => page.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]'); return Boolean(r && !r.hidden) })

// A11Y=1: the rendered contrast of every visible text element (computed colour over the effective background), per state and theme.
const scanContrast = () => {
  const num = (c) => { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 } }
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  const mix = (top, under, a = top.a) => ({ r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 })
  const bgOf = (el) => {
    const layers = []
    for (let n = el; n; n = n.parentElement) { const c = num(getComputedStyle(n).backgroundColor); layers.push(c); if (c.a === 1) break }
    let base = layers[layers.length - 1].a === 1 ? layers.pop() : { r: 255, g: 255, b: 255, a: 1 }
    while (layers.length) base = mix(layers.pop(), base)
    return base
  }
  const opacityOf = (el) => { let o = 1; for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity); return o }
  const out = []
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') || el.disabled) continue
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    const ph = (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.getAttribute('placeholder') && !el.value
    if (!own && !ph) continue
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el)
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') continue
    const fgc = num(ph ? getComputedStyle(el, '::placeholder').color : cs.color)
    const bg = bgOf(el)
    const fg = mix(fgc, bg, fgc.a * opacityOf(el))
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    const ratio = (a + 0.05) / (b + 0.05)
    const px = parseFloat(cs.fontSize), large = px >= 24 || (px >= 18.66 && Number(cs.fontWeight) >= 700)
    out.push({ ratio, need: large ? 3 : 4.5, who: `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''} "${(ph ? el.getAttribute('placeholder') : el.textContent).trim().slice(0, 24)}"` })
  }
  out.sort((x, y) => x.ratio - y.ratio)
  return { n: out.length, low: out.filter((x) => x.ratio < x.need).slice(0, 5), min: out[0] }
}
const scans = []

const STATES = [
  { id: '01-home', hash: '#/' },
  { id: '02-home-notice', hash: '#/send/bad' },
  { id: '03-newsroom-onboarding', hash: '#/newsroom' },
  { id: '04-newsroom-setup', hash: '#/newsroom', identity: true, mock: { inbox: 'setup' } },
  { id: '05-newsroom-empty', hash: '#/newsroom', identity: true, mock: { tips: [] } },
  { id: '06-newsroom-tips', hash: '#/newsroom', identity: true, mock: { tips: TIPS } },
  { id: '07-newsroom-reconnecting', hash: '#/newsroom', identity: true, mock: { tips: TIPS.slice(1, 3), live: 'reconnecting' } },
  { id: '08-newsroom-limited', hash: '#/newsroom', identity: true, mock: { inbox: 'limited' } },
  { id: '09-send-loading', hash: SEND, mock: { inbox: 'hang' } },
  { id: '10-send-compose', hash: SEND },
  { id: '11-send-typed', hash: SEND, act: (p) => fill(p, LONG) },
  { id: '12-send-sending', hash: SEND, mock: { sendMs: 600000 }, act: async (p) => { await fill(p, LONG); await p.click('[data-testid=send]'); await sleep(300) } },
  { id: '13-send-sent', hash: SEND, act: async (p) => { await fill(p, LONG.slice(0, 600)); await p.click('[data-testid=send]'); await sentVisible(p); await sleep(300) } },
  { id: '14-send-warnings', hash: SEND, mock: { inbox: 'risky' } },
  { id: '15-send-notfound', hash: SEND, mock: { inbox: 'none' } },
  { id: '16-send-limited', hash: SEND, mock: { inbox: 'limited' } },
  { id: '17-send-world', hash: SEND, mock: { tips: TIPS }, act: async (p) => { await p.click('details.world-panel > summary'); await sleep(400) } },
  { id: '18-send-toolong', hash: SEND, act: (p) => fill(p, 'SYNTHETIC TEST TIP: this made-up message is far too long. '.repeat(1300)) },
]

const THEMES = ['light', 'dark']
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
const server = await serve(dist)
const browser = await launch()
const problems = []
const audit = [] // A11Y=1: labels, names, Tab walk and focus rings per state (desktop, light)
for (const st of STATES) {
  if (only && !only.split(',').some((k) => st.id.startsWith(k))) continue
  const page = await browser.newPage()
  page.on('pageerror', (e) => problems.push(`${st.id} pageerror: ${e.message.slice(0, 200)}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${st.id} console.error: ${m.text().slice(0, 200)}`) })
  await page.evaluateOnNewDocument((mock, identity, fixed) => {
    const RealDate = Date
    window.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(fixed); else super(...a) } static now() { return fixed } }
    window.__MOCK = mock
    try { localStorage.clear(); if (identity) localStorage.setItem('sealdrop:newsroom:v1', JSON.stringify(identity)) } catch { /* no storage */ }
  }, { budget: BUDGET, ...(st.mock ?? {}) }, st.identity ? IDENTITY : null, FIXED)
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }])
  await page.setViewport({ ...VIEWPORTS.desktop, deviceScaleFactor: 1 })
  await page.goto(server.url + st.hash)
  await page.waitForSelector('h1')
  await sleep(900)
  if (st.act) await st.act(page)
  await page.evaluate(() => document.fonts.ready)
  if (process.env.TEXT) writeFileSync(join(out, `${st.id}.txt`), await page.evaluate(() => document.body.innerText)) // TEXT=1: the visible words of each state, to diff before/after
  for (const theme of THEMES) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: theme }])
    for (const [vp, size] of Object.entries(VIEWPORTS)) {
      await page.setViewport({ ...size, deviceScaleFactor: 1 })
      await sleep(150)
      if (process.env.A11Y && vp === 'desktop') scans.push({ id: st.id, theme, ...(await page.evaluate(scanContrast)) })
      const file = join(out, `${st.id}-${vp}-${theme}.png`)
      await page.screenshot({ path: file, fullPage: true })
      const wide = await page.evaluate(() => {
        const w = innerWidth, over = document.documentElement.scrollWidth - w
        if (over <= 0) return ''
        const who = [...document.body.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > w + 0.5 && e.getClientRects().length).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${e.className && e.className.baseVal === undefined ? e.className : ''}`)
        return `${over}px wider than the viewport: ${who.join(', ')}`
      })
      if (wide) problems.push(`${st.id} ${vp} ${theme} overflow ${wide}`)
      execFileSync('magick', [file, '-dither', 'None', '-colors', '64', '-strip', '-define', 'png:compression-level=9', `PNG8:${file}`])
    }
  }
  if (process.env.A11Y) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: 'light' }])
    await page.setViewport({ ...VIEWPORTS.desktop, deviceScaleFactor: 1 })
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur()) // the success heading holds script focus (tabindex -1, dropped on blur); it is not a Tab stop
    const a = await auditPage(page)
    audit.push(`${st.id}: lang=${a.facts.lang} title="${a.facts.title}" h1=${a.facts.h1} main=${a.facts.main} fields=${a.facts.fields} unlabeled=${a.facts.unlabeled.length} unnamed=${a.facts.unnamed.length} tabStops=${a.stops.length}/${a.reachable} noRing=${a.noRing.length}`)
    for (const [k, v] of [['unlabeled', a.facts.unlabeled], ['unnamed', a.facts.unnamed], ['no ring', a.noRing]]) if (v.length) audit.push(`  ${k}: ${v.join(' | ')}`)
  }
  await page.close()
}
await browser.close(); await server.close()
const files = readdirSync(out).filter((f) => f.endsWith('.png'))
const bytes = files.reduce((n, f) => n + statSync(join(out, f)).size, 0)
console.log(`${files.length} screenshots, ${(bytes / 1e6).toFixed(2)} MB in ${out}`)
console.log(problems.length ? `console/page problems (${problems.length}):\n${problems.slice(0, 12).join('\n')}` : 'console/page problems: 0')
if (audit.length) console.log(audit.join('\n'))
if (scans.length) {
  for (const theme of THEMES) {
    const t = scans.filter((x) => x.theme === theme)
    const worst = t.map((x) => ({ id: x.id, ...x.min })).sort((x, y) => x.ratio - y.ratio)[0]
    const bad = t.flatMap((x) => x.low.map((l) => `${x.id} ${l.ratio.toFixed(2)} < ${l.need} ${l.who}`))
    console.log(`contrast scan ${theme}: ${t.reduce((n, x) => n + x.n, 0)} text elements in ${t.length} states, lowest ${worst.ratio.toFixed(2)} (${worst.id}: ${worst.who}), below AA: ${bad.length}${bad.length ? '\n  ' + bad.slice(0, 8).join('\n  ') : ''}`)
  }
}
