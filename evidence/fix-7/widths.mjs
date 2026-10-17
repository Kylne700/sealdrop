// Fix stage 7, R3-L2 (extra): the onboarding button and cards at widths between the two the harness shoots.
// usage: node widths.mjs <clone-dir> <dist dir of a mock build>   (clone dir: only for evidence/qa-scripts/lib.mjs). Output: widths-before.txt (885f5b2), widths-after.txt (d2f092c).
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const [CLONE, dist] = process.argv.slice(2)
const { serve, launch } = await import(pathToFileURL(join(CLONE, 'evidence/qa-scripts/lib.mjs')).href)
const server = await serve(dist); const browser = await launch()
try {
  for (const w of [360, 480, 560, 561, 600, 700, 768, 900, 1024, 1920]) {
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await page.setViewport({ width: w, height: 900, deviceScaleFactor: 1 })
    await page.evaluateOnNewDocument(() => { window.__MOCK = {}; try { localStorage.clear() } catch {} })
    await page.goto(server.url + '#/newsroom'); await page.waitForSelector('[data-testid=create-newsroom]'); await page.evaluate(() => document.fonts.ready)
    const m = await page.evaluate(() => {
      const b = document.querySelector('[data-testid=create-newsroom]'); const r = document.createRange(); r.selectNodeContents(b)
      const lines = new Set([...r.getClientRects()].map((q) => Math.round(q.top))).size
      const cards = [...document.querySelectorAll('.cards > .card')].map((c) => { const q = c.getBoundingClientRect(); return `${Math.round(q.width)}x${Math.round(q.height)}@${Math.round(q.x)},${Math.round(q.y)}` })
      return { lines, bw: Math.round(b.getBoundingClientRect().width), cards, grid: Math.round(document.querySelector('.cards').getBoundingClientRect().width), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }
    })
    console.log(`${String(w).padStart(4)}px grid ${m.grid} button ${m.bw}px ${m.lines} line(s) overflow ${m.over} cards ${m.cards.join(' | ')}`)
    await page.close()
  }
} finally { await browser.close(); server.close?.() }
