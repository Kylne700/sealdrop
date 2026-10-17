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
const env = { ...process.env }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY
for (const engine of ['webkit', 'chromium']) {
  const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true, env })
  const ctx = await browser.newContext({ ...PROFILES.phone(), reducedMotion: 'reduce', serviceWorkers: 'block' })
  const page = await ctx.newPage()
  await page.addInitScript(({ mock, identity }) => { window.__MOCK = mock; try { localStorage.clear(); localStorage.setItem('sealdrop:newsroom:v1', identity) } catch { /* no storage */ } }, { mock: MOCK, identity: JSON.stringify(IDENTITY) })
  await page.goto(server.url + '#/newsroom')
  await page.waitForSelector('[data-testid=tip]'); await page.evaluate(() => document.fonts.ready)
  await page.locator('[data-testid=tip]').first().screenshot({ path: `/tmp/fq-F8/phone-tip-${engine}.png` })
  await page.locator('.linkrow').first().screenshot({ path: `/tmp/fq-F8/phone-link-${engine}.png` })
  await browser.close()
}
server.close?.()
process.exit(0)
