// Headless Chromium against the BUILT site and the live Tiramisu testnet: the 60-second judge path.
//   npm run build && npm run smoke        (run alone: never in parallel with `npm run integration`)
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
if (!existsSync(DIST + 'index.html')) throw new Error('dist/ is missing: run `npm run build` first')

const lines: string[] = []
const log = (s = '') => { console.log(s); lines.push(s) }
let failed = 0
const check = (ok: boolean, label: string, detail = '') => { log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`); if (!ok) failed++ }
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`

// ---- static server for dist/ -------------------------------------------------------------------------------
const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' }
const server = http.createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname))
  const file = join(DIST, path.endsWith('/') ? path + 'index.html' : path)
  if (!file.startsWith(DIST) || !existsSync(file)) return void res.writeHead(404).end('not found')
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file))
})
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`

const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const problems: string[] = []
const watch = (page: Page, name: string) => {
  page.setDefaultTimeout(90_000)
  page.on('pageerror', (e) => problems.push(`${name} pageerror: ${(e as Error).message}`))
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`${name} console.error: ${m.text().slice(0, 200)}`) })
}
const newPage = async (name: string) => { const page = await (await browser.createBrowserContext()).newPage(); watch(page, name); return page }
const textOf = (page: Page, sel: string) => page.$eval(sel, (el) => el.textContent ?? '')
const sendResultVisible = (page: Page) => page.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) })

let step = 'start'
try {
  log(`Sealdrop smoke run ${new Date().toISOString()}  Chromium ${await browser.version()}  served from dist/`)

  // ---- 1. the newsroom ---------------------------------------------------------------------------------------
  step = 'open the newsroom page and create a throwaway newsroom'
  const t0 = Date.now()
  const A = await newPage('newsroom')
  await A.goto(base + '#/newsroom')
  await A.click('[data-testid=create-newsroom]')
  await A.waitForSelector('[data-testid=create-inbox]')
  log(`  throwaway newsroom created in the browser after ${secs(Date.now() - t0)} (no network yet)`)

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
  const text1 = `SYNTHETIC TEST TIP (smoke run ${new Date().toISOString()}): a made-up message sent by the headless smoke test.`
  await B.type('[data-testid=message]', text1)
  const tSend = Date.now()
  await B.click('[data-testid=send]')

  step = 'the tip appears live in the newsroom tab and decrypts'
  await A.waitForSelector('[data-testid=tip]')
  const tLive = Date.now()
  const row = await A.$eval('[data-testid=tip]', (li) => ({ source: li.getAttribute('data-source'), text: li.querySelector('[data-testid=tip-text]')?.textContent ?? '' }))
  await sendResultVisible(B)
  const tSent = Date.now()
  check(row.text === text1, 'the tip decrypts in the newsroom tab to the exact text that was sent')
  check(row.source === 'live', 'it arrived through the WebSocket subscription (data-source=live), not through a sweep')
  log(`  tip visible in the newsroom ${secs(tLive - tSend)} after Send was clicked; the sender's own page confirmed after ${secs(tSent - tSend)}`)
  log(`  JUDGE PATH TOTAL: ${secs(tLive - t0)} from opening the newsroom page to the decrypted live tip`)
  const entity = await B.$eval('[data-testid=send-result] dd a', (a) => a.getAttribute('href') ?? '')
  const txs = await B.$$eval('[data-testid=send-result] dd a', (as) => as.map((a) => a.getAttribute('href') ?? ''))
  log(`  tip entity ${entity}\n  tx ${txs[1] ?? '?'}`)
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
  await W.click('[data-testid=send]')
  await sendResultVisible(W)
  check((await textOf(W, '[data-testid=send-result]')).includes(walletAccount.address), 'wallet mode: the result shows the wallet address as $creator')
  await A.waitForFunction((t) => [...document.querySelectorAll('[data-testid=tip-text]')].some((p) => p.textContent === t), {}, text2)
  const walletRow = await A.$$eval('[data-testid=tip]', (lis, t) => lis.filter((li) => li.querySelector('[data-testid=tip-text]')?.textContent === t).map((li) => ({ source: li.getAttribute('data-source'), who: li.textContent ?? '' }))[0], text2)
  check(walletRow?.source === 'live', 'wallet mode: the second tip also arrived live')

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
  server.close()
  log(failed ? `\nsmoke: ${failed} failure(s)` : '\nsmoke: all checks passed')
  writeFileSync(join(EVIDENCE, 'smoke.txt'), lines.join('\n') + '\n')
  process.exit(failed ? 1 : 0)
}
