// Headless Chromium against the BUILT site and the live Tiramisu testnet: the 60-second judge path.
//   npm run build && npm run smoke        (run alone: never in parallel with `npm run integration`)
//   SMOKE_URL=https://<host>/<path>/ npm run smoke   the same checks against a deployed copy (writes evidence/smoke-live.txt)
import http from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import puppeteer, { type Page } from 'puppeteer-core'
import { generatePrivateKey } from 'viem/accounts'
import { fundAccount, localSigner } from '../src/arkiv'
import { needKey } from './load-env'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist') + '/'
const EVIDENCE = join(ROOT, 'evidence')
const SHOTS = join(EVIDENCE, 'screens')
mkdirSync(SHOTS, { recursive: true })
const REMOTE = process.env.SMOKE_URL
if (!REMOTE && !existsSync(DIST + 'index.html')) throw new Error('dist/ is missing: run `npm run build` first')

const lines: string[] = []
const log = (s = '') => { console.log(s); lines.push(s) }
let failed = 0
const check = (ok: boolean, label: string, detail = '') => { log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failed++ }
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

// ---- static server for dist/ -------------------------------------------------------------------------------
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }
const server = REMOTE ? null : http.createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
  const file = join(DIST, path.endsWith('/') ? path + 'index.html' : path)
  if (!file.startsWith(DIST) || !existsSync(file)) return void res.writeHead(404).end('not found')
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
if (server) await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = REMOTE ? (REMOTE.endsWith('/') ? REMOTE : REMOTE + '/') : `http://127.0.0.1:${(server!.address() as { port: number }).port}/`

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const problems: string[] = []
const watch = (page: Page, name: string) => {
  page.setDefaultTimeout(90_000)
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${(e as Error).message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console.error: ${m.text().slice(0, 200)}`) })
}
const newPage = async (name: string) => { const page = await (await browser.createBrowserContext()).newPage(); watch(page, name); return page }
const textOf = (page: Page, sel: string) => page.$eval(sel, (el) => el.textContent ?? '')
const pause = (ms = 400) => new Promise((r) => setTimeout(r, ms))
/** Where keyboard focus is, for the accessibility checks (none of them sends a query). */
const focusOf = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement
  const h1s = document.querySelectorAll('h1')
  return { body: el === document.body, main: el === document.getElementById('app'), onH1: h1s.length === 1 && el === h1s[0], tag: el.tagName.toLowerCase(), id: el.id, text: (el.textContent ?? '').trim().slice(0, 40), hash: location.hash, title: document.title }
})
const where = (f: Awaited<ReturnType<typeof focusOf>>) => `focus on ${f.body ? 'body' : f.main ? 'main' : `${f.tag}${f.id ? '#' + f.id : ''}`}, hash ${f.hash}, title "${f.title}"`
const sendResultVisible = (page: Page) => page.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) })

let asideMs = 0 // time the accessibility checks take; taken off the judge-path timings so those still measure only the judge's path
let step = 'start'
try {
  log(`Sealdrop smoke run ${new Date().toISOString()}  Chromium ${await browser.version()}  served from ${REMOTE ? base : 'dist/'}`)

  // ---- 0. the anonymous query budget is spent (friction F7): every RPC query is answered with a faked 429, so this costs nothing ----
  step = 'a spent query budget shows a message and the Settings panel instead of hanging'
  const R = await (await browser.createBrowserContext()).newPage() // not watch()ed: the 429 is logged as a console error on purpose
  R.setDefaultTimeout(30_000)
  await R.setRequestInterception(true)
  R.on('request', (req) => {
    if (req.url().includes('rpc.tiramisu') && req.method() === 'POST') {
      return void req.respond({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'retry-after': '1354' }, body: '{"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted"}' })
    }
    void req.continue()
  })
  const tBudget = Date.now()
  await R.goto(base + '#/demo')
  await R.waitForFunction(() => /free query budget/.test(document.querySelector('[data-testid=status]')?.textContent ?? ''))
  check((await R.$('details.settings')) !== null, `faked 429 on every query: the send page says the free budget is used up and offers Settings, after ${secs(Date.now() - tBudget)}`, (await textOf(R, '[data-testid=status]')).slice(0, 80))
  await R.screenshot({ path: join(SHOTS, 'rate-limited-send.png'), fullPage: true })
  await R.close()

  // ---- 1. the newsroom ---------------------------------------------------------------------------------------
  step = 'open the newsroom page and create a throwaway newsroom'
  const t0 = Date.now()
  const A = await newPage('newsroom')
  await A.goto(base + '#/newsroom')
  const tA = Date.now()
  // accessibility, on the page that has no identity yet (these pages query nothing): a first load leaves focus alone, the skip link is Tab stop 1 and lands in <main>
  // without touching the hash, and every route change puts focus on the new h1 with a title that names the page.
  let fo = await focusOf(A)
  check(fo.body && /^Newsroom console/.test(fo.title), 'first load of #/newsroom: the page does not grab focus and the title names the page', where(fo))
  await A.keyboard.press('Tab')
  const skip = await A.evaluate(() => { const el = document.activeElement as HTMLElement; return { name: el.textContent, top: el.getBoundingClientRect().top } })
  check(skip.name === 'Skip to content' && skip.top >= 0, 'the skip link is Tab stop 1 and is on screen once it has focus', `${skip.name}, top ${Math.round(skip.top)} px`)
  await A.keyboard.press('Enter')
  fo = await focusOf(A)
  check(fo.main && fo.hash === '#/newsroom', 'Enter on the skip link puts focus on <main> and leaves the location alone', where(fo))
  await A.evaluate(() => { location.hash = '#/' })
  await A.waitForFunction(() => location.hash === '#/'); await pause()
  fo = await focusOf(A)
  check(fo.onH1 && /^An anonymous tip line/.test(fo.text) && /^Sealdrop: an anonymous tip line/.test(fo.title), 'route change to the start page: focus is on its h1 and the title names the page', where(fo))
  await A.evaluate(() => history.back())
  await A.waitForFunction(() => location.hash === '#/newsroom'); await pause()
  fo = await focusOf(A)
  check(fo.onH1 && fo.text === 'Open a newsroom' && /^Newsroom console/.test(fo.title), 'Back: focus is on the newsroom h1 and the title names the page', where(fo))
  asideMs += Date.now() - tA
  await A.click('[data-testid=create-newsroom]')
  await A.waitForSelector('[data-testid=create-inbox]')
  log(`  throwaway newsroom created in the browser after ${secs(Date.now() - t0 - asideMs)} (no network yet)`)

  step = 'fund the throwaway key and create the inbox'
  const tCreate = Date.now()
  await A.click('[data-testid=create-inbox]')
  await A.waitForSelector('[data-testid=inbox-link]')
  const inboxLink = await A.$eval('[data-testid=inbox-link]', (el) => (el as HTMLInputElement).value)
  log(`  inbox created in ${secs(Date.now() - tCreate)}: ${inboxLink.replace(base, '<site>/')}`)
  await A.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''))
  await A.waitForFunction(() => /No tips yet\./.test(document.querySelector('[data-testid=status]')?.textContent ?? ''))
  check(inboxLink.startsWith(base + '#/send/0x'), 'the inbox link points at #/send/<creator>/<inbox id>')
  check((await A.$('[data-testid=export]')) !== null, 'the key file can be exported')
  const address = await A.$eval('.me dd a', (el) => el.textContent ?? '')

  // ---- 2. the source (a different browser context: no shared storage) -------------------------------------
  step = 'a source opens the link and sends a tip with the shared demo key'
  const B = await newPage('source')
  await B.goto(inboxLink)
  await B.waitForSelector('[data-testid=inbox]')
  check((await B.$eval('[data-testid=inbox]', (el) => el.textContent ?? '')).includes(address), 'the send page shows the newsroom as $creator (found by creator, not by a writable field)')
  const tB = Date.now()
  fo = await focusOf(B)
  check(fo.body && /^Send a tip/.test(fo.title), 'first load of the send page: the page does not grab focus and the title says "Send a tip"', where(fo))
  // a tip that arrives while the newsroom types in Settings must leave focus and text where they are (checked as soon as the tip shows below)
  const typedRpc = 'https://rpc.example.test/synthetic-key'
  await A.click('details.settings > summary')
  await A.type('#rpc', typedRpc)
  asideMs += Date.now() - tB
  const text1 = `SYNTHETIC TEST TIP (smoke run ${new Date().toISOString()}): a made-up message sent by the headless smoke test.`
  await B.type('[data-testid=message]', text1)
  const tSend = Date.now()
  await B.click('[data-testid=send]')

  step = 'the tip appears live in the newsroom tab and decrypts'
  await A.waitForSelector('[data-testid=tip]')
  const tLive = Date.now()
  const row = await A.$eval('[data-testid=tip]', (li) => ({ source: li.getAttribute('data-source'), text: li.querySelector('[data-testid=tip-text]')?.textContent ?? '' }))
  const typing = () => A.evaluate(() => { const el = document.activeElement as HTMLInputElement; return { id: el.id, value: el.value } })
  let kept = await typing()
  check(kept.id === 'rpc' && kept.value === typedRpc, 'a live tip arrives while the newsroom types in Settings: focus and text stay in the field', `focus on ${kept.id || 'something else'}`)
  await sendResultVisible(B)
  const tSent = Date.now()
  await pause(200)
  fo = await focusOf(B)
  check(fo.tag === 'h2' && /^Sealed and sent/.test(fo.text), 'after sending, focus is on the success heading (not lost, not moved to the page h1)', where(fo))
  check(row.text === text1, 'the tip decrypts in the newsroom tab to the exact text that was sent')
  check(row.source === 'live', 'it arrived through the WebSocket subscription (data-source=live), not through a sweep')
  log(`  tip visible in the newsroom ${secs(tLive - tSend)} after Send was clicked; the sender's own page confirmed after ${secs(tSent - tSend)}`)
  log(`  JUDGE PATH TOTAL: ${secs(tLive - t0 - asideMs)} from opening the newsroom page to the decrypted live tip`)
  const entity = await B.$eval('[data-testid=send-result] dd a', (a) => a.getAttribute('href') ?? '')
  const txs = await B.$$eval('[data-testid=send-result] dd a', (as) => as.map((a) => a.getAttribute('href') ?? ''))
  log(`  tip entity ${entity}\n  tx ${txs[1] ?? '?'}`)
  await A.click('details.settings > summary') // Settings closed again, so the screenshot shows the console the way a user first sees it
  await pause() // the chevron turns for 200 ms
  await A.screenshot({ path: join(SHOTS, 'newsroom-live-tip.png'), fullPage: true })
  await B.screenshot({ path: join(SHOTS, 'source-sent.png'), fullPage: true })

  // ---- 3. injected wallet mode ----------------------------------------------------------------------------------
  step = 'wallet mode: send with an injected EIP-1193 wallet'
  const { installWallet } = await import('./wallet-shim')
  const walletKey = generatePrivateKey()
  const W = await newPage('wallet')
  const walletAccount = await installWallet(W, walletKey)
  await fundAccount(localSigner(needKey('VITE_DEMO_SENDER_PRIVATE_KEY')), walletAccount.address, '0.003')
  await W.goto(inboxLink)
  await W.waitForSelector('[data-testid=inbox]')
  check(await W.$eval('[data-testid=mode-wallet]', (el) => !(el as HTMLInputElement).disabled), 'wallet mode is offered when an EIP-1193 wallet is injected')
  await W.click('[data-testid=mode-wallet]')
  const text2 = `SYNTHETIC TEST TIP (smoke run, wallet mode ${new Date().toISOString()}): sent through an injected wallet.`
  await W.type('[data-testid=message]', text2)
  await A.click('details.settings > summary') // open Settings again (the typed text is still in the field) and put the cursor back in it before the second tip arrives
  await A.focus('#rpc')
  await W.click('[data-testid=send]')
  await sendResultVisible(W)
  check((await textOf(W, '[data-testid=send-result]')).includes(walletAccount.address), 'wallet mode: the result shows the wallet address as $creator')
  await A.waitForFunction((t) => [...document.querySelectorAll('[data-testid=tip-text]')].some((p) => p.textContent === t), {}, text2)
  const walletRow = await A.$$eval('[data-testid=tip]', (lis, t) => lis.filter((li) => li.querySelector('[data-testid=tip-text]')?.textContent === t).map((li) => ({ source: li.getAttribute('data-source'), who: li.textContent ?? '' }))[0], text2)
  check(walletRow?.source === 'live', 'wallet mode: the second tip also arrived live')
  kept = await typing()
  check(kept.id === 'rpc' && kept.value === typedRpc, 'the second live tip leaves focus and text in the Settings field as well', `focus on ${kept.id || 'something else'}`)

  // ---- 4. forged link ----------------------------------------------------------------------------------------------
  step = 'a link with the right inbox id but another creator finds nothing'
  const F = await newPage('forged')
  await F.goto(inboxLink.replace(address, walletAccount.address))
  await F.waitForFunction(() => /no live inbox/i.test(document.querySelector('[data-testid=status]')?.textContent ?? ''))
  check(true, 'a look-alike link (same inbox id, different creator) shows "no live inbox"')

  // ---- 5. the flagship Demo Desk ------------------------------------------------------------------------------------
  step = 'Demo Desk: send to the flagship inbox through #/demo'
  const D = await newPage('desk')
  await D.goto(base + '#/demo')
  await D.waitForSelector('[data-testid=inbox]')
  check((await textOf(D, '[data-testid=inbox]')).includes('Demo Desk'), 'the Demo Desk inbox is found on Arkiv by its creator and inbox id')
  fo = await focusOf(D)
  check(fo.body && fo.hash.startsWith('#/send/') && /^Send a tip/.test(fo.title), 'first load of #/demo: the redirect does not grab focus, the title says "Send a tip"', where(fo))
  const text3 = `SYNTHETIC TEST TIP (smoke run, Demo Desk ${new Date().toISOString()}): a made-up message for the demo inbox.`
  await D.type('[data-testid=message]', text3)
  await D.click('[data-testid=send]')
  await sendResultVisible(D)
  const deskEntity = await D.$eval('[data-testid=send-result] dd a', (a) => a.getAttribute('href') ?? '')
  log(`  Demo Desk tip entity ${deskEntity}`)
  await D.screenshot({ path: join(SHOTS, 'demo-desk-sent.png'), fullPage: true })
  let deskOk = false
  for (let i = 0; i < 4 && !deskOk; i++) {
    const out = execFileSync('npx', ['tsx', 'scripts/ops.ts', 'desk-read'], { cwd: ROOT, encoding: 'utf8' })
    deskOk = out.includes(text3)
    if (!deskOk) await new Promise((r) => setTimeout(r, 3000))
  }
  check(deskOk, 'the desk operator (key not in the build) decrypts the Demo Desk tip with `ops desk-read`')

  // ---- 6. bookkeeping -------------------------------------------------------------------------------------------------
  await new Promise((r) => setTimeout(r, 1200))
  for (const [name, page] of [['newsroom tab', A], ['source tab', B], ['desk tab', D]] as const) log(`  ${name}: ${await textOf(page, '#budget') || '(no budget header seen)'}`)
  check(problems.length === 0, 'no uncaught errors or console errors in any tab', problems.length ? problems.join(' | ').slice(0, 600) : '')
} catch (e) {
  failed++
  log(`FAIL  step "${step}": ${(e as Error).message.split('\n')[0]}`)
} finally {
  await browser.close()
  server?.close()
  log(failed ? `\nsmoke: ${failed} failure(s)` : '\nsmoke: all checks passed')
  writeFileSync(join(EVIDENCE, `${REMOTE ? 'smoke-live' : 'smoke'}${failed ? '.failed' : ''}.txt`), lines.join('\n') + '\n') // a failed run must not overwrite good evidence
  process.exit(failed ? 1 : 0)
}
