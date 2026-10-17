// usage: node keyboard.mjs <mock dist dir> [chromium|firefox]
// The 60-second flow with the keyboard only (Tab, Shift+Tab, Enter, arrow keys), on the mock-backed build (see build-mock.sh, zero RPC):
// home -> "Start: open a newsroom" -> create a throwaway newsroom -> create the inbox -> open the inbox link as a source ->
// type a synthetic message -> pick a lifetime with the arrow keys -> "Seal and send". Every Tab stop must show a focus ring.
// Accessibility polish (A1-A8): the skip link is Tab stop 1 and moves focus to <main> without touching the hash; every route change
// (click, Enter, Back/Forward, the #/demo redirect) puts focus on the new h1 and the title names the page, the first load does not;
// in-page updates (a tip over the WebSocket, the connection chip, a lease renewal, the footer meter) never move focus while the user types.
// Re-renders (A9-A13): when a rebuild removes the focused control, or a disabled button drops focus, focus goes back to the same control of the same tip
// (a live tip, "Keep N more days", Refresh, Renew now, Seal and send after an error), to the next tip, the previous tip and then the "Tips" heading after
// "Burn now", to a heading when the whole panel or page is replaced (Create the inbox, Forget / Create a newsroom), and to the message box after
// "Send another". Focus that is anywhere else stays where it is.
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
  page.on('dialog', (d) => d.accept()) // "Burn now" and "Forget this newsroom" ask confirm(); the user says yes
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
  const tip = el.closest('[data-testid=tip]') // the tip row the control sits in: its key (first 10 characters) and its position in the list
  return {
    tag: el.tagName.toLowerCase(), name: name.trim().replace(/\s+/g, ' ').slice(0, 36), testid: el.dataset.testid ?? '', id: el.id,
    ring: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2, inMain: Boolean(el.closest('main')), onScreen: r.bottom > 0 && r.top < innerHeight,
    key: tip ? tip.dataset.key.slice(0, 10) : '', row: tip ? [...document.querySelectorAll('[data-testid=tip]')].indexOf(tip) : -1, tabindex: el.getAttribute('tabindex'), fv: el.matches(':focus-visible'),
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
await sleep(300) // the first read of the new inbox ends a moment after its panel appears
const madeInbox = await focusNow(home)
check('A13 "Create the inbox": the form is replaced by the inbox panel and focus goes to its heading (it was on the button that went away)', madeInbox.tag === 'h2' && madeInbox.text === 'Synthetic demo newsroom', where(madeInbox))
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

// ---- 5. a re-render keeps the user's place (A9-A13) ------------------------------------------------------------------
// Rebuilding a list or a panel removes the control that has focus, and disabling a focused button drops focus too: document.activeElement falls back to
// <body> and a keyboard or screen-reader user starts again from the top. Each check drives the real key presses and then asks where focus is. The browser
// profile still holds the newsroom made in step 2, so #/newsroom is its console.
const consoleUrl = server.url + '#/newsroom'
const room = (n, over = {}) => ({ budget: [6, 600], inbox: 'ok', tips: Array.from({ length: n }, (_, i) => ({ text: `SYNTHETIC TEST TIP ${i + 1}`, ageMin: 10 * (i + 1), days: 14 })), ...over })
const count = (page) => page.$$eval('[data-testid=tip]', (els) => els.length)
const keysOf = (page) => page.$$eval('[data-testid=tip]', (els) => els.map((e) => e.dataset.key.slice(0, 10)))
const statusOf = (page) => page.$eval('[data-testid=status]', (el) => el.textContent ?? '')
const remember = (page) => page.evaluate(() => { window.__was = document.activeElement }) // the control that has focus now: was it replaced?
const replaced = (page) => page.evaluate(() => !window.__was.isConnected)
const spot = (f) => (f ? `${f.tag}:${f.name} (tip ${f.key || '-'}, row ${f.row})` : 'body')
/** The console with n tips on screen and the connection chip on Live (the mock's own first event is over). */
async function opened(mock, n) {
  const page = await open(consoleUrl, mock)
  await page.waitForFunction((k) => document.querySelectorAll('[data-testid=tip]').length === k && /^Live/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 8000 }, n)
  return page
}
let newer = 0
/** A tip arrives over the WebSocket, newer than every tip on screen, so its row lands at the top of the list. */
async function liveTip(page) {
  const n = await count(page)
  await page.evaluate((age) => { const t = window.__MOCK.tips; t.push({ text: 'SYNTHETIC TEST TIP: live', ageMin: age, days: 14, live: true }); window.__push.tip(t.length - 1) }, 9 - newer++)
  await page.waitForFunction((k) => document.querySelectorAll('[data-testid=tip]').length === k, { timeout: 5000 }, n + 1)
}
const KEEP = /^Keep \d+ more days$/

// A9: the list is rebuilt when a tip arrives and when one is kept; focus stays on the same control of the same tip, and moves nowhere it was not
const a = await opened(room(3), 3)
let now
r = await tabTo(a, (s) => s.row === 1, 60)
let at = r.seen.at(-1)
const rowKey = at.key
const walked = []
while (at && at.key === rowKey && walked.length < 8) { // every control of the row in turn: address link, its copy button, explorer link, pin, burn
  await remember(a)
  await liveTip(a)
  now = await here(a)
  check(`A9 a tip arrives while focus is on ${at.tag}:${at.name}: the row stays (fix stage 1 adds rows in place) or is rebuilt, focus stays on that control of that tip and keeps its ring`, Boolean(now && now.key === at.key && now.tag === at.tag && now.name === at.name && now.ring), `now ${spot(now)}`)
  walked.push(at.name)
  await a.keyboard.press('Tab')
  at = await here(a)
}
check('A9 the walk covered the whole row: address link, copy button, explorer link, "Keep 30 more days", "Burn now"', walked.length === 5 && walked.some((n) => /^Copy/.test(n)) && walked.some((n) => /Data Explorer/.test(n)) && walked.some((n) => KEEP.test(n)) && walked.includes('Burn now'), walked.join(' > '))
r = await tabTo(a, (s) => s.key === rowKey && KEEP.test(s.name), 4, 'Shift+Tab')
if (r.found) { // Enter anywhere else could open an explorer link in a new tab, which hides this page
  await remember(a)
  await a.keyboard.press('Enter')
  await a.waitForFunction(() => /^Kept:/.test(document.querySelector('[data-testid=status]')?.textContent ?? ''), { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
}
now = await here(a)
check('A9 Enter on "Keep 30 more days": the row stays or is rebuilt, focus is on that tip\'s button again with its ring and the status line says "Kept:"', Boolean(r.found && now && now.key === rowKey && KEEP.test(now.name) && now.ring), `now ${spot(now)}`)
await a.evaluate(() => document.activeElement.blur())
await liveTip(a)
check('A9 nothing has focus: a tip that arrives gives focus to nothing', (await here(a)) === null)
await a.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy inbox link').focus())
await liveTip(a)
now = await here(a)
check('A9 focus is on "Copy inbox link", outside the tip list: a tip that arrives leaves it there', Boolean(now && now.name === 'Copy inbox link'), `now ${spot(now)}`)
const mouseRow = (await keysOf(a))[1]
await a.evaluate((k) => { window.__was = document.querySelector(`[data-key^="${k}"] button.secondary`) }, mouseRow)
await a.click(`[data-key^="${mouseRow}"] button.secondary`) // a mouse user: the rebuilt row must not grow a ring out of nowhere
await a.waitForFunction(() => !window.__was.isConnected, { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
now = await here(a)
check('A9 a mouse click on "Keep 30 more days": the list is rebuilt, focus is on that tip\'s button again and no ring appears (:focus-visible stays off)', Boolean(now && now.key === mouseRow && KEEP.test(now.name) && !now.fv && !now.ring), `now ${spot(now)}, :focus-visible=${now && now.fv}`)
await a.close()

// A10: "Burn now" removes the tip that has focus: the same button on the next tip, else on the previous tip, else the "Tips" heading
const b = await opened(room(3), 3)
const ids = await keysOf(b)
r = await tabTo(b, (s) => s.row === 1 && s.name === 'Burn now', 60)
const burnOne = async (left) => { // Enter on the focused "Burn now" (confirm() is accepted), then wait until `left` tips are shown
  await b.keyboard.press('Enter')
  await b.waitForFunction((k) => document.querySelectorAll('[data-testid=tip]').length === k, { timeout: 5000 }, left).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
  await sleep(100)
  return [await here(b), await statusOf(b)]
}
let [fb, st] = await burnOne(2)
check('A10 burn the middle tip: focus goes to "Burn now" of the next tip and the status line says "Burned."', Boolean(r.found && fb && fb.key === ids[2] && fb.name === 'Burn now' && fb.ring && /^Burned\./.test(st)), `now ${spot(fb)}; status "${st}"`);
[fb, st] = await burnOne(1)
check('A10 burn the last tip in the list: there is no next tip, so focus goes to "Burn now" of the previous tip', Boolean(fb && fb.key === ids[0] && fb.name === 'Burn now' && fb.ring && /^Burned\./.test(st)), `now ${spot(fb)}; status "${st}"`);
[fb, st] = await burnOne(0)
const empty = await b.$eval('[data-testid=no-tips]', (el) => !el.hidden)
check('A10 burn the only tip left: focus goes to the "Tips" heading (tabindex=-1 while it has focus), the empty state shows and the status line says "Burned."', Boolean(fb && fb.tag === 'h2' && fb.name === 'Tips' && fb.tabindex === '-1' && empty && /^Burned\./.test(st)), `now ${spot(fb)} tabindex=${fb && fb.tabindex}; status "${st}"`)
await b.keyboard.press('Tab')
check('A10 the heading is not a Tab stop: tabindex is gone once focus leaves it, and Tab goes on to "Refresh (full sweep)"', (await b.$eval('.tips-head h2', (el) => !el.hasAttribute('tabindex'))) && (await here(b))?.testid === 'refresh')
await b.close()
const mixed = room(3)
mixed.tips[2].mine = false // the next tip is not the newsroom's: it has no "Burn now" button
const b2 = await opened(mixed, 3)
const ids2 = await keysOf(b2)
r = await tabTo(b2, (s) => s.row === 1 && s.name === 'Burn now', 60)
await b2.keyboard.press('Enter')
await b2.waitForFunction(() => document.querySelectorAll('[data-testid=tip]').length === 2, { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(100)
fb = await here(b2)
check('A10 the next tip has no "Burn now" (the sender still owns it): focus goes to "Burn now" of the previous tip', Boolean(r.found && fb && fb.key === ids2[0] && fb.name === 'Burn now'), `now ${spot(fb)}`)
await b2.close()

// A11: "Renew now" rebuilds the whole inbox panel, and the button is disabled for the length of the renewal
const rn = await opened(room(0), 0)
r = await tabTo(rn, (s) => s.testid === 'renew', 40)
await remember(rn)
await rn.keyboard.press('Enter')
await rn.waitForFunction(() => document.body.textContent.includes('Renewed.'), { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(100)
fb = await here(rn)
check('A11 Enter on "Renew now": the inbox panel is rebuilt and focus is on the new "Renew now" button, with its ring', Boolean(r.found && fb && fb.testid === 'renew' && fb.ring) && (await replaced(rn)), `now ${spot(fb)}`)
await rn.close()
const rn2 = await opened(room(0, { renewFail: 'SYNTHETIC renewal failure' }), 0)
r = await tabTo(rn2, (s) => s.testid === 'renew', 40)
await remember(rn2)
await rn2.keyboard.press('Enter')
await rn2.waitForFunction(() => document.querySelector('[data-testid=status]')?.getAttribute('role') === 'alert', { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(100)
fb = await here(rn2)
check('A11 a renewal that fails: "Renew now" is enabled again and keeps focus (same button), and the status line shows the error', Boolean(r.found && fb && fb.testid === 'renew') && (await rn2.evaluate(() => document.activeElement === window.__was && !document.activeElement.disabled)), `now ${spot(fb)}`)
await rn2.close()

// A12: "Send another" hides the result that holds the focused button, then focus goes to the message box (the code already did this: a regression guard)
const sp = await open(inboxLink, { budget: [6, 600], tips: [], sendMs: 200 })
await tabTo(sp, (s) => s.testid === 'message')
await sp.keyboard.type('SYNTHETIC TEST MESSAGE: A12.')
r = await tabTo(sp, (s) => s.testid === 'send', 8)
await sp.keyboard.press('Enter')
await sp.waitForFunction(() => { const x = document.querySelector('[data-testid=send-result]'); return Boolean(x && !x.hidden) }, { timeout: 15000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(200)
r = await tabTo(sp, (s) => s.tag === 'button' && s.name === 'Send another', 3)
await sp.keyboard.press(' ')
await sleep(200)
fb = await here(sp)
const sent = await sp.evaluate(() => ({ resultHidden: document.querySelector('[data-testid=send-result]').hidden, formShown: !document.querySelector('form.compose').hidden, text: document.querySelector('[data-testid=message]').value }))
check('A12 the space bar on "Send another": the result is hidden, the form is back and focus is in the empty message box, with its ring', Boolean(r.found && fb && fb.testid === 'message' && fb.ring && sent.resultHidden && sent.formShown && sent.text === ''), `now ${spot(fb)}; ${JSON.stringify(sent)}`)
await sp.close()

// A13: the other places the audit found where a re-render or a disabled button used to drop focus
const rs = await opened(room(2, { sweepMs: 500 }), 2)
r = await tabTo(rs, (s) => s.testid === 'refresh', 60)
await rs.keyboard.press('Enter')
await rs.waitForFunction(() => !document.querySelector('[data-testid=refresh]').disabled, { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(100)
fb = await here(rs)
check('A13 "Refresh (full sweep)" is disabled while it reads Arkiv: when it is enabled again, focus is on it', Boolean(r.found && fb && fb.testid === 'refresh' && fb.ring), `now ${spot(fb)}`)
await rs.close()
const sf = await open(inboxLink, { budget: [6, 600], tips: [], sendMs: 300, sendFail: 'SYNTHETIC send failure' })
await tabTo(sf, (s) => s.testid === 'message')
await sf.keyboard.type('SYNTHETIC TEST MESSAGE: A13.')
r = await tabTo(sf, (s) => s.testid === 'send', 8)
await sf.keyboard.press('Enter')
await sf.waitForFunction(() => document.querySelector('[data-testid=progress]')?.getAttribute('role') === 'alert', { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(100)
fb = await here(sf)
check('A13 "Seal and send" fails: the button is enabled again, focus is on it and the error is announced', Boolean(r.found && fb && fb.testid === 'send' && fb.ring) && (await sf.evaluate(() => !document.querySelector('[data-testid=send]').disabled)), `now ${spot(fb)}`)
await sf.close()
const ag = await open(consoleUrl, room(0))
r = await tabTo(ag, (s) => /^Forget this newsroom/.test(s.name), 40)
await ag.keyboard.press('Enter')
await ag.waitForFunction(() => document.querySelector('h1')?.textContent === 'Open a newsroom', { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(100)
let g = await focusNow(ag)
check('A13 "Forget this newsroom": the page is rebuilt as "Open a newsroom" and focus goes to its h1', Boolean(r.found && g.onH1 && g.text === 'Open a newsroom'), where(g))
r = await tabTo(ag, (s) => s.testid === 'create-newsroom', 12)
await ag.keyboard.press('Enter')
await ag.waitForFunction(() => document.querySelector('h1')?.textContent === 'Newsroom console', { timeout: 5000 }).catch(() => {}) // a wait that times out shows up as a failed check below, not as a crash
await sleep(300)
g = await focusNow(ag)
check('A13 "Create a throwaway newsroom": the page is rebuilt as the console and focus goes to its h1', Boolean(r.found && g.onH1 && g.text === 'Newsroom console'), where(g))
await ag.close()

check('K6 no console errors or page errors (production CSP active)', problems.length === 0, problems.slice(0, 3).join(' | '))
await browser.close(); await server.close()
say(fails.length ? `\n${fails.length} FAIL: ${fails.join('; ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
