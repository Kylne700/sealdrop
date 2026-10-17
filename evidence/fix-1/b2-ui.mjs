// QA B2-1, B2-2, B2-5 on a mock build (zero RPC). usage: node b2-ui.mjs <mock dist dir> [chromium|firefox]
import { serve, launch, sleep } from '../qa-scripts/lib.mjs'
const [dist, kind = 'chromium'] = process.argv.slice(2)
const server = await serve(dist)
const browser = await launch(kind)
let fails = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); if (!ok) fails++ }
const page = await browser.newPage()
await page.goto(server.url + '#/')
await page.waitForSelector('#paste')
await page.type('#paste', 'not a link')
await page.keyboard.press('Enter')
await sleep(300)
const st = await page.$eval('[data-testid=status]', (el) => ({ text: el.textContent, role: el.getAttribute('role'), live: el.getAttribute('aria-live') }))
check('B2-1 Enter in the paste field opens the link (here: says it is not one)', /does not look like/.test(st.text ?? ''), JSON.stringify(st.text))
const btn = await page.evaluateHandle(() => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Open'))
await btn.click(); await sleep(300) // the Open button, so B2-2 is checked even where Enter does nothing
const st2 = await page.$eval('[data-testid=status]', (el) => ({ role: el.getAttribute('role'), live: el.getAttribute('aria-live') }))
check('B2-2 an error status is an alert that is not downgraded to polite', st2.role === 'alert' && st2.live !== 'polite', `role=${st2.role} aria-live=${st2.live}`)
const css = await page.evaluate(() => {
  const p = document.createElement('p'); p.className = 'tip-text'; p.textContent = '‮SYNTHETIC' + 'á́́́́́́́'
  document.querySelector('main')?.append(p)
  const cs = getComputedStyle(p); const r = { bidi: cs.unicodeBidi, overflow: cs.overflowY }; p.remove(); return r
})
check('B2-5 tip text isolates bidi and clips combining marks', css.bidi === 'isolate' && css.overflow !== 'visible', JSON.stringify(css))
await browser.close(); await server.close()
console.log(fails ? `${fails} FAIL` : 'ALL PASS'); process.exit(fails ? 1 : 0)
