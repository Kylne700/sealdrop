import { serve, launch, PROJECT } from './lib.mjs'
const tag = process.argv[2] ?? 'after'
const s = await serve(PROJECT + '/dist')
const b = await launch()
const out = PROJECT + '/evidence/screens/'
const desktop = await b.newPage(); await desktop.setViewport({ width: 1280, height: 800 })
await desktop.goto(s.url); await new Promise((r) => setTimeout(r, 400))
await desktop.screenshot({ path: out + `home-${tag}-desktop.png` })
await desktop.screenshot({ path: out + `home-${tag}-desktop-full.png`, fullPage: true })
const mobile = await b.newPage(); await mobile.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await mobile.goto(s.url); await new Promise((r) => setTimeout(r, 400))
await mobile.screenshot({ path: out + `home-${tag}-mobile.png` })
await mobile.screenshot({ path: out + `home-${tag}-mobile-full.png`, fullPage: true })
const m = await mobile.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }))
console.log(tag, JSON.stringify(m))
await b.close(); await s.close()
