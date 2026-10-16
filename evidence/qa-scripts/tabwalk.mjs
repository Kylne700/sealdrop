// Which interactive elements does the Tab walk skip, and why? (static pages, no RPC)
import { serve, launch, PROJECT } from './lib.mjs'
const srv = await serve(PROJECT + '/dist')
const browser = await launch('chromium')
for (const hash of ['#/', '#/newsroom']) {
  const page = await (await browser.createBrowserContext()).newPage()
  await page.goto(srv.url + hash)
  await new Promise((r) => setTimeout(r, 800))
  const cand = await page.evaluate(() => [...document.querySelectorAll('a[href], button, input, textarea, select, summary, [tabindex]')].map((el) => ({ tag: el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : ''), name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.name || '').trim().slice(0, 30), disabled: el.disabled === true, hidden: !(el.getClientRects().length), tabindex: el.getAttribute('tabindex'), radioGroup: el.type === 'radio' ? el.name : null })))
  const stops = []
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    const s = await page.evaluate(() => { const el = document.activeElement; return !el || el === document.body ? null : el.tagName.toLowerCase() + (el.type ? '[' + el.type + ']' : '') + ':' + (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.name || '').trim().slice(0, 30) })
    if (!s || stops.includes(s)) break
    stops.push(s)
  }
  console.log(hash, 'candidates', cand.length, 'stops', stops.length)
  console.log(' candidates:', JSON.stringify(cand.map((c) => `${c.tag}:${c.name}${c.disabled ? ' (disabled)' : ''}${c.hidden ? ' (hidden)' : ''}${c.radioGroup ? ' (radio group ' + c.radioGroup + ')' : ''}`)))
  console.log(' stops:', JSON.stringify(stops))
}
await browser.close(); await srv.close()
