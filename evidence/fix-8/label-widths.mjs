// Fix stage 8, W-5: how much room the stable button width leaves. The copy button is as wide as its first label ("Copy inbox link"); "Copied ✓" and the
// fallback label must be no wider than that or the button grows. This prints the width of the label text itself in each state, per engine and profile.
// usage: node label-widths.mjs <clone-dir> <dist dir of a mock build>        (same setup as measure.mjs: mock build, Playwright 1.64.1, WebKit headless, DISPLAY unset)
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [CLONE, DIST] = process.argv.slice(2)
if (!CLONE || !DIST) { console.error('usage: node label-widths.mjs <clone-dir> <dist dir>'); process.exit(1) }
const PW = process.env.PW_DIR ?? '/tmp/fq-W/pw'
const HARNESS = process.env.HARNESS ?? '/tmp/fq-F8/harness'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/tmp/fq-W/pw/browsers'
const { webkit, chromium, devices } = await import(pathToFileURL(join(PW, 'node_modules/playwright/index.mjs')).href)
const { serve } = await import(pathToFileURL(join(CLONE, 'evidence/qa-scripts/lib.mjs')).href)
const req = createRequire(join(CLONE, 'package.json'))
const { privateKeyToAccount } = req('viem/accounts')
const nacl = req('tweetnacl')
const evm = '0x' + '11'.repeat(32)
const secret = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
const b64 = (u) => Buffer.from(u).toString('base64')
const IDENTITY = { v: 1, kind: 'local', address: privateKeyToAccount(evm).address, evmPrivateKey: evm, boxSecretKey: b64(secret), boxPublicKey: b64(nacl.box.keyPair.fromSecretKey(secret).publicKey), inboxId: 'inbox-3k9f2a', createdAt: '2026-10-17T09:00:00.000Z' }
const MOCK = { budget: [6, 600], tips: [{ text: 'SYNTHETIC TEST TIP number 1: a made-up message.', ageMin: 20, days: 14 }] }
void execFileSync, HARNESS
const strip = ({ defaultBrowserType, ...p }) => p
const PROFILES = {
  desktop: (e) => ({ ...strip(e === 'webkit' ? devices['Desktop Safari'] : devices['Desktop Chrome']), viewport: { width: 1280, height: 720 } }),
  phone: () => strip(devices['iPhone 15']),
}
const server = await serve(DIST)
const px = (n) => Math.round(n * 10) / 10
let bad = 0
for (const engine of ['chromium', 'webkit']) {
  const env = { ...process.env }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, env })
  for (const [pid, mk] of Object.entries(PROFILES)) {
    const ctx = await browser.newContext({ ...mk(engine), reducedMotion: 'reduce', serviceWorkers: 'block' })
    const page = await ctx.newPage()
    await page.addInitScript(({ mock, identity }) => {
      window.__MOCK = mock; try { localStorage.clear(); localStorage.setItem('sealdrop:newsroom:v1', identity) } catch { /* no storage */ }
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { if (window.__clipFail) throw new DOMException('blocked', 'NotAllowedError') } } })
    }, { mock: MOCK, identity: JSON.stringify(IDENTITY) })
    await page.goto(server.url + '#/newsroom')
    await page.waitForSelector('.linkrow button'); await page.evaluate(() => document.fonts.ready)
    const snap = () => page.evaluate(() => { const b = document.querySelector('.linkrow button'), s = b.firstElementChild; return { label: s.textContent, text: s.getBoundingClientRect().width, button: b.getBoundingClientRect().width } })
    const normal = await snap()
    await page.click('.linkrow button'); await page.waitForFunction(() => /Copied/.test(document.querySelector('.linkrow button').textContent))
    const copied = await snap()
    await page.waitForFunction(() => /Copy inbox link/.test(document.querySelector('.linkrow button').textContent), null, { timeout: 5000 })
    await page.evaluate(() => { window.__clipFail = true })
    await page.click('.linkrow button'); await page.waitForFunction(() => /^Copy by hand/.test(document.querySelector('.linkrow button').textContent))
    const blocked = await snap()
    // the accessible name must be the label only (the invisible copy in ::after stays out of it): exactly one match in each state
    const names = []
    for (const n of ['Copy by hand']) names.push(`${n}: ${await page.getByRole('button', { name: n, exact: true }).count()}`)
    await page.waitForFunction(() => /Copy inbox link/.test(document.querySelector('.linkrow button').textContent), null, { timeout: 5000 })
    names.push(`Copy inbox link: ${await page.getByRole('button', { name: 'Copy inbox link', exact: true }).count()}`)
    const aria = await page.locator('.linkrow button').ariaSnapshot()
    const roomCopied = px(normal.text - copied.text), roomBlocked = px(normal.text - blocked.text)
    const ok = roomCopied >= 4 && roomBlocked >= 4 && names.every((n) => n.endsWith(': 1')) && /Copy inbox link/.test(aria) && !/Copy inbox link.*Copy inbox link/s.test(aria)
    if (!ok) bad++
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${engine}/${pid}: text widths ${normal.label}=${px(normal.text)} ${copied.label}=${px(copied.text)} ${blocked.label}=${px(blocked.text)} | room left under the first label: Copied ${roomCopied}px, fallback ${roomBlocked}px (need >= 4) | button ${px(normal.button)}/${px(copied.button)}/${px(blocked.button)} | exact accessible-name matches ${names.join(', ')} | aria: ${aria.replace(/\s+/g, ' ').trim()}`)
    await ctx.close()
  }
  await browser.close()
}
server.close?.()
process.exit(bad ? 4 : 0)
