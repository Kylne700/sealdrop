// Fix stage 8, W-6: the key-file input in the "Saved newsroom" card at several viewport widths, both engines, light and dark.
// usage: node w6-sweep.mjs <clone-dir> <dist dir of a mock build> <label> [shots-dir]
// Prints the input's width next to its engine's default width, and saves a crop of the third card per width (viewed as images: the label
// text of the empty input must be complete, "No file chosen" in Chromium, "no file selected" in WebKit).
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const [CLONE, DIST, LABEL, SHOTS = `/tmp/fq-F8/shots-${LABEL}`] = process.argv.slice(2)
if (!CLONE || !DIST || !LABEL) { console.error('usage: node w6-sweep.mjs <clone-dir> <dist dir> <label> [shots-dir]'); process.exit(1) }
const PW = process.env.PW_DIR ?? '/tmp/fq-W/pw'
process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/tmp/fq-W/pw/browsers'
const { webkit, chromium } = await import(pathToFileURL(join(PW, 'node_modules/playwright/index.mjs')).href)
const { serve } = await import(pathToFileURL(join(CLONE, 'evidence/qa-scripts/lib.mjs')).href)
mkdirSync(SHOTS, { recursive: true })
const server = await serve(DIST)
const env = { ...process.env }; delete env.DISPLAY; delete env.WAYLAND_DISPLAY
const WIDTHS = [320, 360, 390, 600, 800, 1280]
for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch({ headless: true, env })
  for (const scheme of ['light', 'dark']) {
    for (const w of WIDTHS) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 }, colorScheme: scheme, reducedMotion: 'reduce', serviceWorkers: 'block' })
      const page = await ctx.newPage()
      await page.addInitScript(() => { window.__MOCK = {}; try { localStorage.clear() } catch { /* no storage */ } })
      await page.goto(server.url + '#/newsroom')
      await page.waitForSelector('#import'); await page.evaluate(() => document.fonts.ready)
      const m = await page.evaluate(() => {
        const f = document.querySelector('#import'), a = f.getBoundingClientRect().width
        const p = f.cloneNode(); p.removeAttribute('id'); p.style.cssText = 'width:auto;max-width:none;position:absolute;visibility:hidden;left:0;top:0'
        f.parentElement.append(p); const need = p.getBoundingClientRect().width; p.remove()
        const card = f.closest('.card').getBoundingClientRect()
        return { input: Math.round(a * 10) / 10, defaultWidth: Math.round(need * 10) / 10, card: Math.round(card.width), fontSize: getComputedStyle(f).fontSize, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
      })
      console.log(`${engine} ${scheme} ${w}px: input ${m.input}px (engine default ${m.defaultWidth}px), card ${m.card}px, font ${m.fontSize}, page overflow ${m.overflow}`)
      await page.locator('.cards > .card:last-child').screenshot({ path: join(SHOTS, `w6-${engine}-${scheme}-${w}.png`), scale: 'css', animations: 'disabled' })
      await ctx.close()
    }
  }
  await browser.close()
}
server.close?.()
