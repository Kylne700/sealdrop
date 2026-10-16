// G follow-up: which focusable candidates did the Tab walk of the newsroom console NOT reach (93 walked of 95)? 3 public arkiv_query through the counting proxy.
import { readFileSync } from 'node:fs'
import { startProxy } from './proxy.mjs'
import { launch, watch, ledgerNote, PROJECT } from './lib.mjs'

const fx = JSON.parse(readFileSync('/tmp/qa/fixture.json', 'utf8'))
const proxy = await startProxy(PROJECT + '/dist')
const browser = await launch('chromium')
const problems: string[] = []
const p = await (await browser.createBrowserContext()).newPage()
watch(p, 'tabmiss', problems)
await p.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 })
await p.evaluateOnNewDocument('window.__name = (f) => f')
await p.evaluateOnNewDocument((rpc: string, ident: string) => { localStorage.setItem('sealdrop:rpc', rpc); localStorage.setItem('sealdrop:newsroom:v1', ident) }, proxy.origin, fx.identity)
await p.goto(proxy.url + '#/newsroom')
await p.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 60_000 })
await p.waitForSelector('[data-testid=tip]', { timeout: 60_000 })

const cand = await p.evaluate(() => {
  const vis = (el: Element) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const els = [...document.querySelectorAll('a[href], button, summary, [tabindex], input:not([type=hidden]), select, textarea')].filter(vis)
  els.forEach((el, i) => el.setAttribute('data-qa-i', String(i)))
  return els.map((el: any, i) => ({ i, tag: el.tagName.toLowerCase(), text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40), disabled: el.disabled === true, tabindex: el.getAttribute('tabindex'), type: el.getAttribute('type') }))
})
await p.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0) })
const reached = new Set<number>()
let presses = 0
for (let n = 0; n < 250; n++) {
  await p.keyboard.press('Tab'); presses++
  const i = await p.evaluate(() => { const el = document.activeElement; if (!el || el === document.body) return -1; const v = el.getAttribute('data-qa-i'); return v === null ? -2 : Number(v) })
  if (i === -1) break
  if (i >= 0 && reached.has(i)) break
  if (i >= 0) reached.add(i)
}
const missing = cand.filter((c) => !reached.has(c.i))
console.log(`candidates ${cand.length} (links/buttons/summaries/[tabindex]/fields), reached by Tab ${reached.size} in ${presses} presses`)
for (const m of missing) console.log(`  NOT REACHED: <${m.tag}${m.type ? ' type=' + m.type : ''}> "${m.text}" disabled=${m.disabled} tabindex=${m.tabindex}`)
// The two skipped controls sit in the closed Settings <details>: focus its summary, open it with Enter, then Tab twice.
await p.evaluate(() => { const s = document.querySelector('details.settings > summary') as HTMLElement; s.focus() })
await p.keyboard.press('Enter')
const opened = await p.evaluate(() => (document.querySelector('details.settings') as HTMLDetailsElement).open)
const names: string[] = []
for (let n = 0; n < 2; n++) {
  await p.keyboard.press('Tab')
  names.push(await p.evaluate(() => { const el = document.activeElement as HTMLElement; return `<${el.tagName.toLowerCase()}${el.getAttribute('type') ? ' type=' + el.getAttribute('type') : ''}> "${(el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 30)}"` }))
}
console.log(`Settings opened with Enter on the summary: ${opened}; the next two Tab stops: ${names.join(' then ')}`)
console.log(`console/page problems: ${problems.length}; queries: ${proxy.st.forwarded}`)
ledgerNote('tabmiss', { queries: proxy.st.forwarded, units: proxy.st.units })
await browser.close(); await proxy.close()
