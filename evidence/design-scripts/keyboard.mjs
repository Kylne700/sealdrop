// usage: node keyboard.mjs <mock dist dir> [chromium|firefox]
// The 60-second flow with the keyboard only (Tab, Shift+Tab, Enter, arrow keys), on the mock-backed build (see build-mock.sh, zero RPC):
// home -> "Start: open a newsroom" -> create a throwaway newsroom -> create the inbox -> open the inbox link as a source ->
// type a synthetic message -> pick a lifetime with the arrow keys -> "Seal and send". Every Tab stop must show a focus ring.
// Accessibility polish (A1-A8): the skip link is Tab stop 1 and moves focus to <main> without touching the hash; every route change
// (click, Enter, Back/Forward, the #/demo redirect) puts focus on the new h1 and the title names the page, the first load does not;
// in-page updates (a tip over the WebSocket, the connection chip, a lease renewal, the footer meter) never move focus while the user types.
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
    tag: el.tagName.toLowerCase(), name: name.trim().replace(/\s+/g, ' ').slice(0, 36), testid: el.dataset.testid ?? '', id: el.id,
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

/** Where focus is after a route change: on the page's only h1? Is the ring shown exactly when the browser says :focus-visible? */
const focusNow = (page) => page.evaluate(() => {
  const el = document.activeElement
  const cs = getComputedStyle(el)
  const h1s = document.querySelectorAll('h1')
  return {
    onH1: h1s.length === 1 && el === h1s[0], body: el === document.body, tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 44),
    hash: location.hash, title: document.title, ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, fv: el.matches(':focus-visible'),
  }
})
const where = (f) => `${f.body ? 'body' : `${f.tag}:${f.text}`}, title="${f.title}"`

// ---- 1. home -> Start ----------------------------------------------------------------------------
const mock = { budget: [6, 600], inbox: 'setup', tips: [] }
const home = await open(server.url + '#/', mock)
const firstLoad = await focusNow(home)
check('A1 first load: the page does not grab focus (it stays where the browser puts it) and the title names the page', firstLoad.body && /^Sealdrop: an anonymous tip line/.test(firstLoad.title), where(firstLoad))
let r = await tabTo(home, (s) => s.testid === 'open-newsroom')
check('K1 home: "Start: open a newsroom" reached with Tab', r.found && /Start: open a newsroom/.test(r.seen.at(-1).name), `${r.seen.length} Tab(s): ${names(r)}`)
check('K1 home: every stop on the way shows a focus ring and is on screen', r.rings)
check('A2 Tab stop 1 of the walk is the skip link ("Skip to content"), on screen, with a ring', Boolean(r.seen[0] && r.seen[0].tag === 'a' && r.seen[0].name === 'Skip to content' && r.seen[0].ring && r.seen[0].onScreen), r.seen[0] ? `${r.seen[0].tag}:${r.seen[0].name}` : 'body')
await home.keyboard.press('Enter')
await sleep(500)
check('K2 Enter on Start opens the newsroom page', (await home.evaluate(() => location.hash)) === '#/newsroom')
const afterNav = await here(home)
say(`INFO focus right after the page change: ${afterNav ? `${afterNav.tag}:${afterNav.name}` : 'body (the old link is gone)'}`)
const nav = await focusNow(home)
check('A4 Enter on a link: focus lands on the new page\'s h1 and the title names the page', nav.onH1 && nav.text === 'Open a newsroom' && /^Newsroom console/.test(nav.title), where(nav))
check('A4 the h1 shows a ring after a keyboard move, exactly when the browser says :focus-visible', nav.fv && nav.ring, `:focus-visible=${nav.fv}, ring=${nav.ring}`)
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

// ---- 2b. in-page updates never move focus: type in the Settings field, then a tip arrives, the chip flips, a lease is renewed and the footer meter ticks -----
r = await tabTo(home, (s) => s.tag === 'summary' && /Settings/.test(s.name), 30)
await home.keyboard.press('Enter')
const field = await tabTo(home, (s) => s.id === 'rpc', 3)
check('A7 the Settings field (RPC URL) is reachable by keyboard', r.found && field.found, names(field))
await home.waitForFunction(() => /^Live/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 5000 }) // the mock's own first "live" event (150 ms after the page starts listening) must be over
const typed = 'https://rpc.example.test/synthetic-key'
await home.keyboard.type(typed)
await home.evaluate(() => { window.__MOCK.tips = [{ text: 'SYNTHETIC TEST TIP: arrives while typing.', ageMin: 1, days: 14, live: true }] })
const typing = () => home.evaluate(() => { const el = document.activeElement; return { id: el.id || el.tagName.toLowerCase(), value: el.value ?? '', caretAtEnd: typeof el.value === 'string' && el.selectionStart === el.value.length } })
const stays = async (name, also = true) => { const t = await typing(); check(name, also && t.id === 'rpc' && t.value === typed && t.caretAtEnd, `focus is on ${t.id}`) }
await home.evaluate(() => window.__push.tip(0))
await home.waitForFunction(() => document.querySelectorAll('[data-testid=tip]').length === 1, { timeout: 5000 })
await stays('A7 a tip arrives over the WebSocket while typing: the tip appears and focus, text and caret stay in the field')
await home.evaluate(() => window.__push.state('reconnecting'))
await sleep(100)
const chip = await home.$$eval('[data-testid=live-status]', (els) => els.map((el) => el.textContent ?? '').join(' || '))
await home.evaluate(() => window.__push.state('live'))
await stays('A7 the connection chip flips to Reconnecting and back to Live without moving focus', /Reconnecting/.test(chip))
await home.evaluate(() => document.querySelector('[data-testid=renew]').click()) // script click: moves no focus, like an automatic lease renewal finishing
await home.waitForFunction(() => document.body.textContent.includes('Renewed.'), { timeout: 5000 })
await stays('A7 a lease renewal re-renders the inbox panel without moving focus')
await sleep(1300) // the footer meter updates once a second
await stays('A7 the footer meter ticks without moving focus')
await home.keyboard.type('/x')
check('A7 typing carries on where it was', (await typing()).value === typed + '/x')
await home.close()

// ---- 3. the source: compose and send ------------------------------------------------------------------
const src = await open(inboxLink, { budget: [6, 600], tips: [] })
const sendLoad = await focusNow(src)
check('A1 first load of the send page: focus stays with the browser and the title says "Send a tip"', sendLoad.body && /^Send a tip/.test(sendLoad.title), where(sendLoad))
r = await tabTo(src, (s) => s.testid === 'message')
check('K4 send page: the message box is reached with Tab', r.found, `${r.seen.length} Tab(s): ${names(r)}`)
check('K4 every stop shows a ring', r.rings)
await src.keyboard.type('SYNTHETIC TEST TIP: written with the keyboard only.')
check('K4 typing shows the byte count', /^\d+ \/ 65,532 bytes$/.test(await src.$eval('[data-testid=counter]', (el) => el.textContent ?? '')))
await sleep(1300) // the footer meter updates once a second
const stay = await src.evaluate(() => ({ id: document.activeElement.dataset.testid, value: document.activeElement.value }))
check('A8 focus and text stay in the message box while the page updates', stay.id === 'message' && stay.value === 'SYNTHETIC TEST TIP: written with the keyboard only.')
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

// ---- 4. the skip link, then mouse, Back/Forward and the #/demo redirect ------------------------------------------
const skipPage = await open(server.url + '#/', { budget: [6, 600], inbox: 'ok', tips: [] })
const box = await skipPage.$eval('.skip', (el) => { const q = el.getBoundingClientRect(); return { bottom: q.bottom, visible: getComputedStyle(el).visibility === 'visible' && getComputedStyle(el).display !== 'none' } })
check('A2 the skip link is hidden until focused (above the viewport, but not display:none or visibility:hidden)', box.bottom <= 0 && box.visible, `bottom=${Math.round(box.bottom)}px`)
await skipPage.keyboard.press('Tab')
const skip = await here(skipPage)
const inView = await skipPage.$eval('.skip', (el) => { const q = el.getBoundingClientRect(); return q.top >= 0 && q.left >= 0 && q.bottom <= innerHeight && q.right <= innerWidth })
check('A2 focused, the skip link is fully on screen with a ring', Boolean(skip && skip.name === 'Skip to content' && skip.ring && inView))
await skipPage.evaluate(() => {
  window.__h1 = document.querySelector('h1'); window.__changes = 0; window.__len = history.length; window.__href = location.href
  addEventListener('hashchange', () => window.__changes++)
})
const skipState = () => skipPage.evaluate(() => ({
  main: document.activeElement === document.getElementById('app'), sameUrl: location.href === window.__href, changes: window.__changes,
  sameLen: history.length === window.__len, sameH1: document.querySelector('h1') === window.__h1 && window.__h1.isConnected,
}))
await skipPage.keyboard.press('Enter')
await sleep(300)
let sk = await skipState()
check('A3 Enter on the skip link puts focus on <main>', sk.main)
check('A3 ... without changing the location: same URL, no hashchange, no new history entry', sk.sameUrl && sk.changes === 0 && sk.sameLen, `hashchange events=${sk.changes}`)
check('A3 ... and without rendering the page again (same h1 node)', sk.sameH1)
await skipPage.keyboard.press('Tab')
const afterSkip = await here(skipPage)
check('A3 the next Tab lands in the page content, not back in the header, with a ring', Boolean(afterSkip && afterSkip.inMain && afterSkip.ring), afterSkip ? `${afterSkip.tag}:${afterSkip.name}` : 'body')
check('A3 <main> keeps no tabindex once focus has left it (never a Tab stop or click target)', (await skipPage.$eval('#app', (el) => el.getAttribute('tabindex'))) === null)
await skipPage.$eval('.skip', (el) => el.click()) // a screen reader's click (no key press) takes the same path
await sleep(200)
sk = await skipState()
check('A3 a script click on the skip link does the same: focus on <main>, location untouched', sk.main && sk.sameUrl && sk.changes === 0 && sk.sameH1)
await skipPage.close()

const nav2 = await open(server.url + '#/', { budget: [6, 600], inbox: 'ok', tips: [] }) // this browser profile already holds the newsroom made in step 2, so its page is the console
const hashIs = (h) => nav2.waitForFunction((x) => location.hash === x, { timeout: 5000 }, h).then(() => sleep(300))
await nav2.click('[data-testid=open-newsroom]')
await hashIs('#/newsroom')
let f = await focusNow(nav2)
check('A5 mouse click on a link: focus lands on the new h1 and the title names the page', f.onH1 && f.text === 'Newsroom console' && /^Newsroom console/.test(f.title), where(f))
check('A5 after a mouse click the h1 shows no ring (the browser says :focus-visible is off)', !f.fv && !f.ring, `:focus-visible=${f.fv}, ring=${f.ring}`)
await nav2.evaluate(() => history.back())
await hashIs('#/')
f = await focusNow(nav2)
check('A5 Back: focus lands on the home h1 and the title is the home title', f.onH1 && /^An anonymous tip line/.test(f.text) && /^Sealdrop: an anonymous tip line/.test(f.title), where(f))
await nav2.evaluate(() => history.forward())
await hashIs('#/newsroom')
f = await focusNow(nav2)
check('A5 Forward: focus lands on the newsroom h1 again', f.onH1 && f.text === 'Newsroom console' && /^Newsroom console/.test(f.title), where(f))
check('A5 the ring and :focus-visible agree after Back/Forward too', f.ring === f.fv, `:focus-visible=${f.fv}, ring=${f.ring}`)
await nav2.evaluate(() => { location.hash = '#/demo' })
await nav2.waitForFunction(() => /^#\/send\/0x[0-9a-fA-F]{40}\/./.test(location.hash), { timeout: 5000 })
await sleep(400)
f = await focusNow(nav2)
check('A6 #/demo (a redirect) from inside the app: focus lands on the send page\'s h1, the title says "Send a tip"', f.onH1 && f.text === 'Send a tip' && /^Send a tip/.test(f.title), where(f))
await nav2.close()

const demo = await open(server.url + '#/demo', { budget: [6, 600], inbox: 'ok', tips: [] })
f = await focusNow(demo)
check('A6 loading #/demo directly is still a first load: the redirect does not grab focus', f.body && /^#\/send\//.test(f.hash) && /^Send a tip/.test(f.title), `hash=${f.hash.slice(0, 12)}..., ${where(f)}`)
await demo.close()

check('K6 no console errors or page errors (production CSP active)', problems.length === 0, problems.slice(0, 3).join(' | '))
await browser.close(); await server.close()
say(fails.length ? `\n${fails.length} FAIL: ${fails.join('; ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
