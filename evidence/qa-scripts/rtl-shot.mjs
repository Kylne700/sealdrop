// No RPC. Renders the same Hebrew + emoji tip with the app's own CSS twice: as the console shows it today, and with dir="auto".
import { serve, launch, PROJECT } from '/tmp/qa/lib.mjs'
const srv = await serve(PROJECT + '/dist')
const browser = await launch('chromium')
const page = await browser.newPage()
await page.setViewport({ width: 700, height: 420, deviceScaleFactor: 2 })
await page.goto(srv.url)
await page.waitForSelector('h1')
const text = 'שלום עולם, זו הודעת בדיקה סינתטית (SYNTHETIC TEST TIP). האם זה נראה נכון?'
await page.evaluate((t) => {
  document.body.innerHTML = `<main style="max-width:640px;margin:1rem auto">
    <h2>Tip as shown today (no dir attribute)</h2><article class="tip" style="border:1px solid #ccc;padding:.5rem 1rem"><p class="tip-text" data-testid="a"></p></article>
    <h2>With dir="auto"</h2><article class="tip" style="border:1px solid #ccc;padding:.5rem 1rem"><p class="tip-text" dir="auto" data-testid="b"></p></article></main>`
  for (const id of ['a', 'b']) (document.querySelector(`[data-testid=${id}]`)).textContent = t
}, text)
const info = await page.evaluate(() => ['a', 'b'].map((id) => { const el = document.querySelector(`[data-testid=${id}]`); const cs = getComputedStyle(el); return `${id}: direction=${cs.direction} text-align=${cs.textAlign}` }))
console.log(info.join('\n'))
await page.screenshot({ path: '/tmp/qa/rtl-before-after.png' })
await browser.close(); await srv.close()
