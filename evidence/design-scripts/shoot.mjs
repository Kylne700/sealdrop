// usage: node shoot.mjs <dist dir> <out dir> [state ids, comma separated]
// Screenshots every route/state of a mock-backed build (see build-mock.sh) at 1280x800 and 390x844, light and dark.
// Time is frozen, motion is reduced, and the console/page errors of every state are counted (the CSP is active).
import { mkdirSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import nacl from 'tweetnacl'
import { privateKeyToAccount } from 'viem/accounts'
import { serve, launch, sleep } from '../qa-scripts/lib.mjs'

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
]

const THEMES = ['light', 'dark']
const VIEWPORTS = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
const server = await serve(dist)
const browser = await launch()
const problems = []
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
  for (const theme of THEMES) {
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: theme }])
    for (const [vp, size] of Object.entries(VIEWPORTS)) {
      await page.setViewport({ ...size, deviceScaleFactor: 1 })
      await sleep(150)
      const file = join(out, `${st.id}-${vp}-${theme}.png`)
      await page.screenshot({ path: file, fullPage: true })
      execFileSync('magick', [file, '-dither', 'None', '-colors', '64', '-strip', '-define', 'png:compression-level=9', `PNG8:${file}`])
    }
  }
  await page.close()
}
await browser.close(); await server.close()
const files = readdirSync(out).filter((f) => f.endsWith('.png'))
const bytes = files.reduce((n, f) => n + statSync(join(out, f)).size, 0)
console.log(`${files.length} screenshots, ${(bytes / 1e6).toFixed(2)} MB in ${out}`)
console.log(problems.length ? `console/page problems (${problems.length}):\n${problems.slice(0, 12).join('\n')}` : 'console/page problems: 0')
