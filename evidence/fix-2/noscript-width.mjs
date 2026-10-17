// usage: DISPLAY=:94 node noscript-width.mjs <dist>   Renders index.html with JavaScript off; prints box widths.
import { serve, launch } from '../qa-scripts/lib.mjs'
const server = await serve(process.argv[2])
const browser = await launch('chromium')
const page = await browser.newPage()
await page.setJavaScriptEnabled(false)
await page.setViewport({ width: 1400, height: 800 })
await page.goto(server.url ?? `http://127.0.0.1:${server.port}/`)
console.log(JSON.stringify(await page.evaluate(() => ({ nojs: document.querySelector('.nojs')?.getBoundingClientRect().width, top: document.querySelector('.top').getBoundingClientRect().width }))))
await browser.close(); await server.close?.()
