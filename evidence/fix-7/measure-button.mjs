// Fix stage 7, R3-L2: how many lines does "Create a throwaway newsroom" take, and where do the three onboarding cards sit?
// usage: node measure-button.mjs <clone-dir> <dist dir of a mock build> [label]   (clone dir: only for node_modules and evidence/qa-scripts/lib.mjs)
// Headless Chromium, localhost only. Per viewport (1280x800, 390x844) and theme: the button's box and number of text lines (client rects of
// its text, one per line), the three cards' boxes (a card alone on a row must span it), horizontal scroll.
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const [CLONE, dist, label = ''] = process.argv.slice(2)
if (!CLONE || !dist) { console.error('usage: node measure-button.mjs <clone-dir> <dist dir> [label]'); process.exit(1) }
const { serve, launch } = await import(pathToFileURL(join(CLONE, 'evidence/qa-scripts/lib.mjs')).href)
const server = await serve(dist)
const browser = await launch()
let fails = 0
try {
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage()
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }]) // main fades in with a 8 px rise; no motion = stable y
      await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
      await page.evaluateOnNewDocument(() => { window.__MOCK = {}; try { localStorage.clear() } catch { /* no storage */ } })
      await page.goto(server.url + '#/newsroom')
      await page.waitForSelector('[data-testid=create-newsroom]')
      await page.evaluate(() => document.fonts.ready)
      const m = await page.evaluate(() => {
        const b = document.querySelector('[data-testid=create-newsroom]')
        const r = b.getBoundingClientRect()
        const range = document.createRange(); range.selectNodeContents(b)
        const lines = new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size
        const cards = [...document.querySelectorAll('.cards > .card')].map((c) => { const q = c.getBoundingClientRect(); return { x: Math.round(q.x), y: Math.round(q.y), w: Math.round(q.width), h: Math.round(q.height) } })
        const grid = document.querySelector('.cards').getBoundingClientRect()
        return { label: b.textContent, w: Math.round(r.width), h: Math.round(r.height), lines, cards, gridW: Math.round(grid.width), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
      })
      // a card alone on its row must span the grid; cards that share a row must have the same width
      const rows = new Map()
      for (const c of m.cards) rows.set(c.y, [...(rows.get(c.y) ?? []), c])
      const balanced = [...rows.values()].every((r) => r.length > 1 ? new Set(r.map((c) => c.w)).size === 1 : r[0].w === m.gridW) || w < 600
      const ok = m.lines <= 2 && m.overflow <= 0 && balanced
      if (!ok) fails++
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} ${w}x${h} ${scheme}: button ${m.w}x${m.h}px, ${m.lines} line(s), label="${m.label}", cards ${m.cards.map((c) => `${c.w}x${c.h}@${c.x},${c.y}`).join(' | ')}, overflow ${m.overflow}`)
      await page.close()
    }
  }
} finally { await browser.close(); server.close?.() }
console.log(`fails=${fails}`)
