// usage: node keyboard.mjs <mock dist dir> [chromium|firefox]
// The 60-second flow with the keyboard only (Tab, Shift+Tab, Enter, arrow keys), on the mock-backed build (see build-mock.sh, zero RPC):
// home -> "Start: open a newsroom" -> create a throwaway newsroom -> create the inbox -> open the inbox link as a source ->
// type a synthetic message -> pick a lifetime with the arrow keys -> "Seal and send". Every Tab stop must show a focus ring.
import { serve, launch, sleep } from '../qa-scripts/lib.mjs'

const [dist, kind = 'chromium'] = process.argv.slice(2)
const problems = []
const fails = []
const say = (s) => console.log(s)
const check = (name, ok, detail = '') => { say(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ': ' + detail : ''}`); if (!ok) fails.push(name) }

const server = await serve(dist)
const browser = await launch(kind)
const FIXED = Date.UTC(2026, 9, 17, 9, 30)

async function open(url, mock) {
  const page = await browser.newPage()
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text().slice(0, 200)}`) })
  await page.evaluateOnNewDocument((m, fixed) => {
    const RealDate = Date
    window.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(fixed); else super(...a) } static now() { return fixed } }
    window.__MOCK = m
  }, mock, FIXED)
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(url)
  await page.waitForSelector('h1')
  await sleep(600)
  return page
}

const here = (page) => page.evaluate(() => {
  const el = document.activeElement
  if (!el || el === document.body || el === document.documentElement) return null
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  const name = el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].textContent) || el.textContent || el.getAttribute('placeholder') || ''
  return {
    tag: el.tagName.toLowerCase(), name: name.trim().replace(/\s+/g, ' ').slice(0, 36), testid: el.dataset.testid ?? '',
    ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, inMain: Boolean(el.closest('main')), onScreen: r.bottom > 0 && r.top < innerHeight,
  }
})

/** Press Tab until `want(stop)` is true. Returns the stops visited (the last one is the match) and whether every stop had a ring. */
async function tabTo(page, want, max = 30, key = 'Tab') {
  const seen = []
  for (let i = 0; i < max; i++) {
    if (key === 'Shift+Tab') { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift') } else await page.keyboard.press('Tab')
    const s = await here(page)
    seen.push(s)
    if (s && want(s)) return { seen, found: true, rings: seen.every((x) => x && x.ring && x.onScreen) }
  }
  return { seen, found: false, rings: false }
}
const names = (r) => r.seen.map((s) => (s ? `${s.tag}:${s.name}` : 'body')).join(' > ')

// ---- 1. home -> Start ----------------------------------------------------------------------------
const mock = { budget: [6, 600], inbox: 'setup', tips: [] }
const home = await open(server.url + '#/', mock)
let r = await tabTo(home, (s) => s.testid === 'open-newsroom')
check('K1 home: "Start: open a newsroom" reached with Tab', r.found && /Start: open a newsroom/.test(r.seen.at(-1).name), `${r.seen.length} Tab(s): ${names(r)}`)
check('K1 home: every stop on the way shows a focus ring and is on screen', r.rings)
await home.keyboard.press('Enter')
await sleep(500)
check('K2 Enter on Start opens the newsroom page', (await home.evaluate(() => location.hash)) === '#/newsroom')
const afterNav = await here(home)
say(`INFO focus right after the page change: ${afterNav ? `${afterNav.tag}:${afterNav.name}` : 'body (the old link is gone)'}`)
r = await tabTo(home, (s) => s.testid === 'create-newsroom')
check('K2 newsroom page: "Create a throwaway newsroom" reached with Tab', r.found, `${r.seen.length} Tab(s): ${names(r)}`)
check('K2 the first Tab after the page change lands inside the page content, not the header', Boolean(r.seen[0] && r.seen[0].inMain), r.seen[0] ? `${r.seen[0].tag}:${r.seen[0].name}` : 'body')
check('K2 every stop shows a ring', r.rings)

// ---- 2. create the newsroom and its inbox ------------------------------------------------------------
await home.keyboard.press('Enter')
await home.waitForSelector('[data-testid=create-inbox]')
r = await tabTo(home, (s) => s.testid === 'create-inbox')
check('K3 "Create the inbox" reached with Tab', r.found, `${r.seen.length} Tab(s): ${names(r)}`)
check('K3 every stop shows a ring', r.rings)
await home.keyboard.press('Enter')
await home.waitForSelector('[data-testid=inbox-link]', { timeout: 15000 })
const inboxLink = await home.$eval('[data-testid=inbox-link]', (el) => el.value)
check('K3 the inbox link is shown', /#\/send\/0x[0-9a-fA-F]{40}\/inbox-/.test(inboxLink), inboxLink.replace(/0x([0-9a-fA-F]{4})[0-9a-fA-F]+/, '0x$1...'))
r = await tabTo(home, (s) => /Copy inbox link/.test(s.name), 12)
check('K3 "Copy inbox link" reachable by keyboard', r.found, `${r.seen.length} Tab(s)`)
await home.close()

// ---- 3. the source: compose and send ------------------------------------------------------------------
const src = await open(inboxLink, { budget: [6, 600], tips: [] })
r = await tabTo(src, (s) => s.testid === 'message')
check('K4 send page: the message box is reached with Tab', r.found, `${r.seen.length} Tab(s): ${names(r)}`)
check('K4 every stop shows a ring', r.rings)
await src.keyboard.type('SYNTHETIC TEST TIP: written with the keyboard only.')
check('K4 typing shows the byte count', /^\d+ \/ 65,532 bytes$/.test(await src.$eval('[data-testid=counter]', (el) => el.textContent ?? '')))
r = await tabTo(src, (s) => s.tag === 'input' && s.name === '14 days', 3)
check('K4 the lifetime group is the next stop (default 14 days)', r.found, names(r))
await src.keyboard.press('ArrowRight')
const picked = await src.$eval('input[name=days]:checked', (el) => el.value)
check('K4 ArrowRight moves the lifetime to 30 days', picked === '30', `checked=${picked}`)
await src.keyboard.press('ArrowLeft')
await src.keyboard.press('ArrowLeft')
const picked2 = await src.$eval('input[name=days]:checked', (el) => el.value)
check('K4 ArrowLeft x2 moves it to 7 days', picked2 === '7', `checked=${picked2}`)
r = await tabTo(src, (s) => s.testid === 'send', 6)
check('K4 "Seal and send" reached with Tab', r.found, `${r.seen.length} Tab(s): ${names(r)}`)
check('K4 every stop shows a ring', r.rings)
await src.keyboard.press('Enter')
await src.waitForFunction(() => { const x = document.querySelector('[data-testid=send-result]'); return Boolean(x && !x.hidden) }, { timeout: 15000 })
await sleep(200)
const done = await here(src)
say(`INFO focus after sending: ${done ? `${done.tag}:${done.name}` : 'body (the button disappeared with the form)'}`)
check('K5 after sending, focus is on the success heading (not lost)', Boolean(done && done.tag === 'h2' && /Sealed and sent/.test(done.name)), done ? `${done.tag}:${done.name}` : 'body')
await sleep(400)
const ratio = await src.evaluate(() => { const i = document.querySelector('[data-testid=send-result] .bar > i'); return i ? i.getBoundingClientRect().width / i.parentElement.getBoundingClientRect().width : -1 })
check('K7 bar fills set through CSSOM take effect under the production CSP', ratio > 0.9, `receipt bar fill / track = ${ratio.toFixed(2)}`)
r = await tabTo(src, (s) => s.tag === 'button' && s.name === 'Send another', 3)
check('K5 the next Tab is "Send another"', r.found, names(r))
check('K5 it shows a ring', r.rings)
// K8: on through the receipt and both disclosures (both open with Enter), a ring at every stop, then back to "Send another"
r = await tabTo(src, (s) => s.tag === 'summary' && /What Arkiv stores/.test(s.name), 8)
check('K8 the receipt links and copy buttons show a ring and "What Arkiv stores" is reachable', r.found && r.rings, names(r))
await src.keyboard.press('Enter')
check('K8 Enter opens "What Arkiv stores"', await src.$eval('[data-testid=send-result] details.stores', (d) => d.open))
r = await tabTo(src, (s) => s.tag === 'summary' && /What can anyone see/.test(s.name), 12)
check('K8 the stops inside it, up to "What can anyone see", show a ring', r.found && r.rings, names(r))
await src.keyboard.press('Enter')
await sleep(600)
check('K8 Enter opens "What can anyone see"', await src.$eval('details.world-panel', (d) => d.open))
r = await tabTo(src, (s) => s.tag === 'summary' && /Queries this page runs/.test(s.name), 12)
check('K8 the stops inside the open panel, up to "Queries this page runs", show a ring', r.found && r.rings, names(r))
await src.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Send another')?.focus())
await src.keyboard.press('Enter')
await sleep(200)
const back = await here(src)
check('K5 "Send another" returns to the message box with focus in it', Boolean(back && back.testid === 'message'), back ? `${back.tag}:${back.name}` : 'body')
await src.close()

check('K6 no console errors or page errors (production CSP active)', problems.length === 0, problems.slice(0, 3).join(' | '))
await browser.close(); await server.close()
say(fails.length ? `\n${fails.length} FAIL: ${fails.join('; ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
