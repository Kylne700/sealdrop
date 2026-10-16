// E (error states), C (mobile 390x844 DPR 2 touch), G (accessibility on the RPC routes), one pass over shared page loads.
// usage (repo dir): npx tsx /tmp/qa/e-tour.mts [sections, comma separated]
// Everything goes through the counting proxy; read-only queries are cached for this run (the pages under test do not depend on fresh data).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { installWallet } from '/path/to/sealdrop/scripts/wallet-shim'
import { startProxy } from './proxy.mjs'
import { launch, watch, sleep, ledgerNote, PROJECT } from './lib.mjs'
import { auditPage } from './a11y-lib.mjs'

const only = process.argv[2]?.split(',')
const fx = JSON.parse(readFileSync('/tmp/qa/fixture.json', 'utf8'))
const SHOTS = PROJECT + '/evidence/screens'
mkdirSync(SHOTS, { recursive: true })
const proxy = await startProxy(PROJECT + '/dist')
proxy.ctl.cacheQueries = true
const browser = await launch('chromium')
const problems: string[] = []
const out: string[] = []
const results: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1 }
const rpcInit = (page: any, withIdentity: boolean) => page.evaluateOnNewDocument("window.__name = (f) => f").then(() => page.evaluateOnNewDocument((rpc: string, ident: string | null) => { localStorage.setItem('sealdrop:rpc', rpc); if (ident) localStorage.setItem('sealdrop:newsroom:v1', ident) }, proxy.origin, withIdentity ? fx.identity : null))
const newPage = async (name: string, o: { mobile?: boolean; identity?: boolean; track?: boolean } = {}) => {
  const p = await (await browser.createBrowserContext()).newPage()
  if (o.track !== false) watch(p, name, problems)
  await p.setViewport(o.mobile ? MOBILE : DESKTOP)
  await rpcInit(p, Boolean(o.identity))
  return p
}
const txt = (p: any, sel: string) => p.$eval(sel, (el: any) => el.textContent ?? '').catch(() => '(missing)')
const alertText = (p: any) => p.$$eval('[role=alert], .status.error', (els: any[]) => els.map((e) => e.textContent?.trim()).filter(Boolean).join(' | ')).catch(() => '')
const sentTx = () => proxy.st.methods['eth_sendRawTransaction'] ?? 0
const sendLink = fx.link as string // '#/send/<creator>/<inbox id>'
const overflow = (p: any) => p.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const clipped = (el: Element) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o !== 'visible' && a.getBoundingClientRect().right <= vw + 1) return true } return false }
  const off: string[] = []
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el)
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.position === 'fixed') continue
    if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) off.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent || '').trim().slice(0, 28)}"`)
  }
  const btns = [...document.querySelectorAll('button, a.button')].filter((b) => (b as HTMLElement).offsetParent).map((b) => Math.round(b.getBoundingClientRect().height))
  return { vw, docScroll: document.documentElement.scrollWidth, off: off.slice(0, 6), minButtonHeight: btns.length ? Math.min(...btns) : null }
})
async function section(name: string, key: string, fn: () => Promise<void>) {
  if (only && !only.includes(key)) return
  const before = problems.length; const q0 = proxy.st.forwarded
  try { await fn() } catch (e) { results.push(`FAIL  ${name}: threw ${(e as Error).message.split('\n')[0].slice(0, 200)}`); say(`FAIL ${name}: threw ${(e as Error).message.slice(0, 300)}`) }
  const mine = problems.slice(before)
  say(`   [${name}] console/page problems: ${mine.length ? mine.join(' | ').slice(0, 300) : '0'}; queries to the public RPC: ${proxy.st.forwarded - q0}`)
}
const verdict = (name: string, ok: boolean, detail = '') => { results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); say(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`) }

// ---------------------------------------------------------------------------------------------------------
await section('E1 forged link: right inbox id, other creator', 'e1', async () => {
  const other = privateKeyToAccount(generatePrivateKey()).address
  const p = await newPage('forged')
  await p.goto(`${proxy.url}#/send/${other}/${fx.inboxId}`)
  await p.waitForSelector('.status.error, [role=alert]', { timeout: 60_000 })
  const t = await alertText(p)
  verdict('E1 forged link (other creator) shows a clear message and no form', /no live inbox with this id created by this address/.test(t) && !(await p.$('[data-testid=message]')), t.slice(0, 120))
  const a = await auditPage(p); say(`   G send-not-found: title="${a.facts.title}" lang=${a.facts.lang} unlabeled=${a.facts.unlabeled.length} unnamed=${a.facts.unnamed.length} noRing=${a.noRing.length}`)
})
await section('E2 missing or expired inbox', 'e2', async () => {
  const p = await newPage('missing')
  await p.goto(`${proxy.url}#/send/${fx.address}/qa-no-such-inbox-1`)
  await p.waitForSelector('.status.error, [role=alert]', { timeout: 60_000 })
  const t = await alertText(p)
  verdict('E2 missing/expired inbox: message mentions the link and the expiry', /may be wrong/.test(t) && /expired/.test(t), t.slice(0, 160))
})
await section('E3 malformed hashes', 'e3', async () => {
  const p = await newPage('malformed')
  for (const h of ['#/send/0x123/abc', `#/send/${fx.address}/`, '#/send//x', '#/send/not-an-address/with spaces', '#/nope', '#/send/0x' + 'g'.repeat(40) + '/abc']) {
    await p.goto(proxy.url + h); await p.reload()
    await p.waitForSelector('h1')
    const n = await txt(p, '[data-testid=route-notice]')
    const home = (await txt(p, 'h1')).includes('anonymous tip line')
    verdict(`E3 ${h.slice(0, 44)} -> start page with a notice`, home && n.length > 20, n.slice(0, 70))
  }
})
await section('C mobile 390x844 DPR 2 touch: newsroom console and send page', 'c', async () => {
  proxy.ctl.cacheQueries = false // fresh data for the screenshots
  const shots: [string, any][] = []
  const N = await newPage('m-newsroom', { mobile: true, identity: true })
  await N.goto(proxy.url + '#/newsroom')
  await N.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 60_000 })
  await N.waitForSelector('[data-testid=tip]', { timeout: 60_000 })
  await sleep(500)
  await N.screenshot({ path: `${SHOTS}/mobile-newsroom-console.png`, fullPage: true }); shots.push(['newsroom console', N])
  const a1 = await auditPage(N); say(`   G newsroom console: title="${a1.facts.title}" lang=${a1.facts.lang} fields=${a1.facts.fields} unlabeled=${a1.facts.unlabeled.length}${a1.facts.unlabeled.length ? ' ' + a1.facts.unlabeled.join('|') : ''} unnamed=${a1.facts.unnamed.length}${a1.facts.unnamed.length ? ' ' + a1.facts.unnamed.join('|') : ''} stops=${a1.stops.length}/${a1.reachable} noRing=${a1.noRing.length}`)
  say(`   C newsroom console overflow: ${JSON.stringify(await overflow(N))}`)
  const S = await newPage('m-send', { mobile: true })
  await S.goto(proxy.url + sendLink)
  await S.waitForSelector('[data-testid=message]', { timeout: 60_000 })
  await S.screenshot({ path: `${SHOTS}/mobile-send.png`, fullPage: true })
  say(`   C send page overflow: ${JSON.stringify(await overflow(S))}`)
  await S.$eval('[data-testid=message]', (el: any) => { el.value = 'SYNTHETIC TEST TIP from a phone-sized screen with touch.'; el.dispatchEvent(new Event('input')) })
  await S.tap('[data-testid=send]')
  await S.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) }, { timeout: 120_000 })
  await S.screenshot({ path: `${SHOTS}/mobile-send-result.png`, fullPage: true })
  say(`   C send result overflow: ${JSON.stringify(await overflow(S))}`)
  await N.waitForFunction(() => [...document.querySelectorAll('[data-testid=tip-text]')].some((e) => /phone-sized/.test(e.textContent ?? '')), { timeout: 60_000 })
  await N.screenshot({ path: `${SHOTS}/mobile-newsroom-console-with-live-tip.png`, fullPage: true })
  const O = await newPage('m-onboarding', { mobile: true })
  await O.goto(proxy.url + '#/newsroom'); await O.waitForSelector('[data-testid=create-newsroom]')
  await O.screenshot({ path: `${SHOTS}/mobile-newsroom-onboarding.png`, fullPage: true })
  say(`   C onboarding overflow: ${JSON.stringify(await overflow(O))}`)
  const F = await newPage('m-notfound', { mobile: true })
  await F.goto(`${proxy.url}#/send/${privateKeyToAccount(generatePrivateKey()).address}/${fx.inboxId}`); await F.waitForSelector('.status.error')
  await F.screenshot({ path: `${SHOTS}/mobile-send-not-found.png`, fullPage: true })
  say(`   C not-found overflow: ${JSON.stringify(await overflow(F))}`)
  const H = await newPage('m-home-notice', { mobile: true })
  await H.goto(proxy.url + '#/send/0x123/abc'); await H.waitForSelector('[data-testid=route-notice]')
  await H.screenshot({ path: `${SHOTS}/mobile-home-with-notice.png`, fullPage: true })
  say(`   C home+notice overflow: ${JSON.stringify(await overflow(H))}`)
  proxy.ctl.cacheQueries = true
})
await section('G newsroom console keyboard walk (many tips)', 'g', async () => {
  const N = await newPage('g-console', { identity: true })
  await N.goto(proxy.url + '#/newsroom')
  await N.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 60_000 })
  await N.waitForSelector('[data-testid=tip]', { timeout: 60_000 })
  const a = await auditPage(N)
  const tips = await N.$$eval('[data-testid=tip]', (els: any[]) => els.length)
  say(`   G newsroom console with ${tips} tips: lang=${a.facts.lang} title="${a.facts.title}" fields=${a.facts.fields} unlabeled=${a.facts.unlabeled.length} actions=${a.facts.actions} unnamed=${a.facts.unnamed.length} tab stops walked=${a.stops.length} (focusable elements ${a.reachable}) noRing=${a.noRing.length}${a.noRing.length ? ' ' + a.noRing.join('|') : ''}`)
})
await section('E4-E7 desktop send page: empty, over the limit, Hebrew+emoji, double click', 'e4', async () => {
  const N = await newPage('newsroom-desktop', { identity: true })
  await N.goto(proxy.url + '#/newsroom')
  await N.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 60_000 })
  const S = await newPage('send-desktop')
  await S.goto(proxy.url + sendLink)
  await S.waitForSelector('[data-testid=message]', { timeout: 60_000 })
  // G on the real send page
  const a = await auditPage(S); say(`   G send page: title="${a.facts.title}" lang=${a.facts.lang} fields=${a.facts.fields} unlabeled=${a.facts.unlabeled.length} unnamed=${a.facts.unnamed.length} stops=${a.stops.length}/${a.reachable} noRing=${a.noRing.length}${a.facts.unlabeled.length ? ' ' + a.facts.unlabeled.join('|') : ''}`)
  // E4 empty and whitespace-only
  await S.click('[data-testid=send]')
  let t = await alertText(S)
  verdict('E4 empty message -> "Write a message first."', t.includes('Write a message first.'), t)
  await S.$eval('[data-testid=message]', (el: any) => { el.value = '   \n  '; el.dispatchEvent(new Event('input')) })
  await S.click('[data-testid=send]')
  t = await alertText(S)
  verdict('E4b whitespace-only message -> same message, button still usable', t.includes('Write a message first.') && (await S.$eval('[data-testid=send]', (b: any) => !b.disabled)), t)
  // E5 over the limit: 32767 Hebrew letters are 65534 bytes (2 bytes each) although only 32767 characters
  const tx0 = sentTx()
  await S.$eval('[data-testid=message]', (el: any) => { el.value = 'א'.repeat(32767); el.dispatchEvent(new Event('input')) })
  const counter = await txt(S, '[data-testid=counter]')
  await S.click('[data-testid=send]')
  t = await alertText(S)
  verdict('E5 over the limit (32,767 Hebrew letters = 65,534 text bytes, 65,551 with the JSON wrapper) -> clear message, nothing sent', /too long \(limit 65532 bytes\)/.test(t) && sentTx() === tx0 && /^65,551 /.test(counter), `counter "${counter}"; ${t}`)
  // E5c: one byte over the limit (wrapped size 65,533) is refused, nothing sent
  await S.$eval('[data-testid=message]', (el: any) => { el.value = 'x'.repeat(65532 - 17 + 1); el.dispatchEvent(new Event('input')) })
  const c1 = await txt(S, '[data-testid=counter]'); await S.click('[data-testid=send]'); t = await alertText(S)
  verdict('E5c one byte over the limit -> refused, nothing sent', /too long/.test(t) && sentTx() === tx0 && /^65,533 /.test(c1), `counter "${c1}"`)
  // E6 + E7: Hebrew/RTL + emoji, double click
  const stamp = new Date().toISOString().slice(11, 19)
  const he = `שלום עולם, זו הודעת בדיקה סינתטית ${stamp} 🌍👍 SYNTHETIC TEST TIP (Hebrew/RTL + emoji)`
  await S.$eval('[data-testid=message]', (el: any, v: string) => { el.value = v; el.dispatchEvent(new Event('input')) }, he)
  const before = sentTx()
  await S.click('[data-testid=send]', { count: 2 })
  await S.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) }, { timeout: 120_000 })
  await sleep(1500)
  verdict('E7 double click on Send -> exactly one transaction', sentTx() - before === 1, `${sentTx() - before} eth_sendRawTransaction`)
  await S.screenshot({ path: `${SHOTS}/desktop-send-result.png`, fullPage: true })
  const shown = await N.waitForFunction((v: string) => [...document.querySelectorAll('[data-testid=tip-text]')].filter((e) => e.textContent === v).length, { timeout: 60_000 }, he).then(() => true, () => false)
  const copies = await N.$$eval('[data-testid=tip-text]', (els: any[], v: string) => els.filter((e) => e.textContent === v).length, he)
  const dir = await N.evaluate((v: string) => { const el = [...document.querySelectorAll('[data-testid=tip-text]')].find((e) => e.textContent === v) as HTMLElement | undefined; if (!el) return null; const cs = getComputedStyle(el); return { direction: cs.direction, attrDir: el.getAttribute('dir'), unicodeBidi: cs.unicodeBidi, textAlign: cs.textAlign } }, he)
  verdict('E6 Hebrew/RTL + emoji round trip: the newsroom shows exactly the text sent, once, laid out right-to-left', shown && copies === 1 && dir?.direction === 'rtl', `copies ${copies}; ${JSON.stringify(dir)}`)
  const row = await N.evaluateHandle((v: string) => [...document.querySelectorAll('[data-testid=tip]')].find((r) => r.querySelector('[data-testid=tip-text]')?.textContent === v), he)
  await (row.asElement() as any).screenshot({ path: `${SHOTS}/desktop-newsroom-hebrew-tip.png` })
  const ta = await S.evaluate(() => { const t = document.querySelector('[data-testid=message]') as HTMLTextAreaElement; return t.getAttribute('dir') })
  say(`   E6 message field dir attribute: ${ta}`)
  // E5b at the limit: 65,532 ASCII bytes are accepted and arrive intact (a real 64 KiB transaction)
  await S.click('.result button')
  await S.$eval('[data-testid=message]', (el: any) => { el.value = 'SYNTHETIC TEST TIP at the size limit. ' + 'x'.repeat(65532 - 17 - 38); el.dispatchEvent(new Event('input')) })
  const full = await txt(S, '[data-testid=counter]')
  const tx1 = sentTx()
  const tSend = Date.now()
  await S.click('[data-testid=send]')
  const ok = await S.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; const e = document.querySelector('[role=alert], .status.error')?.textContent; return (r && !r.hidden) ? 'sent' : (e && /./.test(e) ? 'error:' + e : false) }, { timeout: 180_000 }).then((h) => h.jsonValue(), () => 'timeout')
  verdict('E5b message at the limit (65,515 text bytes = 65,532 with the JSON wrapper) is accepted and sent', ok === 'sent' && sentTx() - tx1 === 1, `counter "${full}", ${ok}, ${((Date.now() - tSend) / 1000).toFixed(1)} s`)
  const got = await N.waitForFunction(() => [...document.querySelectorAll('[data-testid=tip-text]')].some((e) => (e.textContent ?? '').length >= 65000), { timeout: 90_000 }).then(() => true, () => false)
  verdict('E5b the newsroom decrypts the 64 KiB tip', got)
  // burn it again: a 64 KiB tip makes every later page load of the shared test inbox heavy
  N.on('dialog', (d: any) => d.accept())
  const burned = await N.evaluate(async () => {
    const row = [...document.querySelectorAll('[data-testid=tip]')].find((r) => (r.querySelector('[data-testid=tip-text]')?.textContent ?? '').length >= 65000)
    ;(row?.querySelector('button.danger') as HTMLButtonElement | undefined)?.click()
    return Boolean(row)
  })
  const gone = burned && await N.waitForFunction(() => ![...document.querySelectorAll('[data-testid=tip]')].some((r) => (r.querySelector('[data-testid=tip-text]')?.textContent ?? '').length >= 65000), { timeout: 90_000 }).then(() => true, () => false)
  verdict('E5b burning the 64 KiB tip works from the console', Boolean(gone), await txt(N, '[data-testid=status]'))
  await N.close(); await S.close()
})
await section('E8 demo key without GLM (real node answer, unfunded key build)', 'e8', async () => {
  const p0 = await startProxy('/tmp/qa/dist-nofunds'); p0.ctl.cacheQueries = true
  try {
    const mk = async (name: string, ident: boolean) => { const p = await (await browser.createBrowserContext()).newPage(); watch(p, name, problems); await p.setViewport(DESKTOP); await p.evaluateOnNewDocument('window.__name = (f) => f'); await p.evaluateOnNewDocument((rpc: string, id: string | null) => { localStorage.setItem('sealdrop:rpc', rpc); if (id) localStorage.setItem('sealdrop:newsroom:v1', id) }, p0.origin, ident ? fx.identity : null); return p }
    const S = await mk('send-nofunds', false)
    await S.goto(p0.url + sendLink)
    await S.waitForSelector('[data-testid=message]', { timeout: 60_000 })
    await S.type('[data-testid=message]', 'SYNTHETIC TEST TIP from a demo key without GLM')
    await S.click('[data-testid=send]')
    await S.waitForFunction(() => /GLM|rejected|failed/i.test(document.querySelector('[role=alert], .status.error')?.textContent ?? ''), { timeout: 90_000 })
    const t = await alertText(S)
    verdict('E8 demo key without GLM on the send page -> clear message, button usable again', /shared demo key has run out of testnet GLM/.test(t) && (await S.$eval('[data-testid=send]', (b: any) => !b.disabled)), t.slice(0, 150))
    await S.screenshot({ path: `${SHOTS}/desktop-send-demo-key-empty.png` })
    // the newsroom path: a brand new throwaway newsroom cannot be funded
    const N = await mk('newsroom-nofunds', false)
    await N.goto(p0.url + '#/newsroom')
    await N.click('[data-testid=create-newsroom]')
    await N.waitForSelector('[data-testid=create-inbox]')
    await N.click('[data-testid=create-inbox]')
    await N.waitForFunction(() => /run out of testnet GLM|no demo/i.test(document.querySelector('[data-testid=status], [role=alert], .status.error')?.textContent ?? ''), { timeout: 90_000 })
    const t2 = await alertText(N)
    verdict('E8b throwaway newsroom with an empty demo key -> says who ran out and where to get GLM', /demo sender has run out of testnet GLM/.test(t2) && /faucet/.test(t2), t2.slice(0, 200))
    say(`   E8 queries through the second proxy: ${p0.st.forwarded}`)
    ledgerNote('e8-nofunds-proxy', { queries: p0.st.forwarded, units: p0.st.units })
  } finally { await p0.close() }
})
await section('E9 429 from the public RPC (injected by the proxy)', 'e9', async () => {
  const p = await newPage('budget', { track: false })
  const own: string[] = []
  p.on('pageerror', (e: Error) => own.push('pageerror: ' + e.message))
  p.on('console', (m: any) => { if (m.type() === 'error') own.push('console: ' + m.text().slice(0, 120)) })
  proxy.ctl.cacheQueries = false; proxy.ctl.fail429 = 50; proxy.ctl.retryAfter = 1354
  await p.goto(`${proxy.url}#/send/${fx.address}/qa-budget-test-1`)
  await p.waitForSelector('.status.error, [role=alert]', { timeout: 60_000 })
  const t = await alertText(p)
  proxy.ctl.fail429 = 0; proxy.ctl.cacheQueries = true
  verdict('E9 429 -> "free query budget used up", renewal time, Settings offered', /free query budget/.test(t) && /23 min/.test(t) && Boolean(await p.$('details.settings')), t.slice(0, 170))
  say(`   E9 console messages: ${own.length ? own.join(' | ') : 'none'} (Chromium itself logs every non-2xx response as a console error; the app threw nothing: ${own.filter((x) => x.startsWith('pageerror')).length} page errors)`)
})
await section('E10 wallet declines a send (send page, wallet mode)', 'e10', async () => {
  const p = await newPage('wallet-decline')
  await installWallet(p as any, generatePrivateKey(), { rejectApprovals: true })
  await p.goto(proxy.url + sendLink)
  await p.waitForSelector('[data-testid=message]', { timeout: 60_000 })
  await p.click('[data-testid=mode-wallet]')
  await p.type('[data-testid=message]', 'SYNTHETIC TEST TIP wallet declined')
  const tx0 = sentTx()
  await p.click('[data-testid=send]')
  await p.waitForFunction(() => /rejected/i.test(document.querySelector('[role=alert], .status.error')?.textContent ?? ''), { timeout: 60_000 })
  verdict('E10 wallet declines -> "The request was rejected in the wallet.", nothing sent, button usable', (await alertText(p)).includes('The request was rejected in the wallet.') && sentTx() === tx0 && (await p.$eval('[data-testid=send]', (b: any) => !b.disabled)), await alertText(p))
})

// ---------------------------------------------------------------------------------------------------------
say(`\nproxy: ${proxy.st.forwarded} arkiv_query reached the public RPC (${proxy.st.units} units), ${proxy.st.cached} served from the test cache, ${proxy.st.injected429} injected 429s; eth_sendRawTransaction ${sentTx()}`)
say(problems.length ? `ALL console/page problems: ${problems.join(' | ').slice(0, 600)}` : 'ALL console/page problems: 0')
ledgerNote('e-tour ' + (only?.join(',') ?? 'all'), { queries: proxy.st.forwarded, units: proxy.st.units })
writeFileSync('/tmp/qa/e-tour-' + (only?.join('-') ?? 'all') + '.out', out.join('\n') + '\n\n' + results.join('\n') + '\n')
await browser.close(); await proxy.close()
