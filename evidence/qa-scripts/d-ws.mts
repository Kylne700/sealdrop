// D: WebSocket resilience. usage (from the repo dir): npx tsx /tmp/qa/d-ws.mts new|old s1,s2,s3
//  s1  the proxy kills the socket and refuses new ones for 15 s; a tip is sent during the outage and one after it
//  s2  CDP "offline" for 15 s (does Chromium close an established WebSocket?); a tip is sent after
//  s3  the socket goes silent (no close, nothing delivered): only the heartbeat can notice
//  s4  the tab is hidden for 31 s while the socket is silent, then shown again: the page must read what it missed (one catch-up query)
// The newsroom console runs with the fixture identity; tips are sent from Node with the demo key. All RPC goes through the counting proxy.
import { readFileSync, writeFileSync } from 'node:fs'
import { createReader, findInbox, localSigner, sendTip } from '/path/to/sealdrop/src/arkiv'
import { fromB64, sealText } from '/path/to/sealdrop/src/crypto'
import { parseIdentity } from '/path/to/sealdrop/src/store'
import { needKey } from '/path/to/sealdrop/scripts/load-env'
import { startProxy } from './proxy.mjs'
import { launch, watch, sleep, ledgerNote, PROJECT } from './lib.mjs'

const which = process.argv[2] ?? 'new'
const scenarios = (process.argv[3] ?? 's1,s2,s3').split(',')
const fx = JSON.parse(readFileSync('/tmp/qa/fixture.json', 'utf8'))
const id = parseIdentity(fx.identity)
const proxy = await startProxy(which === 'old' ? '/tmp/qa/old/dist' : PROJECT + '/dist')
const nodeReader = createReader({ rpcUrl: proxy.origin })
const demo = localSigner(needKey('VITE_DEMO_SENDER_PRIVATE_KEY'), proxy.origin)
const inbox = (await findInbox(nodeReader, { creator: id.address, inboxId: id.inboxId })).inbox!
const sendText = (text: string) => sendTip(nodeReader, demo, inbox, sealText(text, fromB64(id.boxPublicKey)), 1)

const problems: string[] = []
const browser = await launch('chromium')
const A = await (await browser.createBrowserContext()).newPage()
watch(A, 'newsroom', problems)
await A.evaluateOnNewDocument((identity: string, rpc: string) => { (window as any).__name = (f: unknown) => f; localStorage.setItem('sealdrop:newsroom:v1', identity); localStorage.setItem('sealdrop:rpc', rpc) }, fx.identity, proxy.origin)

const T0 = Date.now()
const rel = () => `+${((Date.now() - T0) / 1000).toFixed(1).padStart(5)} s`
const out: string[] = []
const say = (s: string) => { const l = `[${rel()}] ${s}`; console.log(l); out.push(l) }
const liveText = () => A.$eval('[data-testid=live-status]', (el: any) => el.textContent ?? '').catch(() => '(no live-status element)')
let last = ''
const poll = setInterval(async () => { const t = await liveText(); if (t !== last) { last = t; say(`status line: "${t.slice(0, 70)}"`) } }, 200)
const waitText = async (re: RegExp, ms: number) => { const s = Date.now(); while (Date.now() - s < ms) { if (re.test(await liveText())) return (Date.now() - s) / 1000; await sleep(200) } return null }
const tipSource = (text: string) => A.evaluate((t: string) => { const row = [...document.querySelectorAll('[data-testid=tip]')].find((r) => r.querySelector('[data-testid=tip-text]')?.textContent === t); return row ? row.getAttribute('data-source') ?? 'present' : null }, text)
const waitTip = async (text: string, ms: number) => { const s = Date.now(); while (Date.now() - s < ms) { const src = await tipSource(text); if (src) return { src, sec: (Date.now() - s) / 1000 }; await sleep(300) } return null }
const stamp = new Date().toISOString().slice(11, 19)
const verdicts: string[] = []
const verdict = (name: string, ok: boolean, detail = '') => { verdicts.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); say(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail}`) }
const q0 = () => proxy.st.forwarded

say(`build under test: ${which}; fixture newsroom ${id.address}`)
await A.goto(proxy.url + '#/newsroom')
await A.waitForSelector('[data-testid=live-status]', { timeout: 60_000 })
await waitText(/^Live: listening/, 30_000)  // both builds use this wording once the page has called watchEntityEvents
for (let i = 0; i < 150 && proxy.openSockets() < 1; i++) await sleep(200)  // ...but the socket itself opens a moment later
say(`console loaded; sockets open at the proxy: ${proxy.openSockets()}; queries so far ${q0()}`)

if (scenarios.includes('s1')) {
  say('--- s1: socket killed, new sockets refused for 15 s')
  const tDrop = Date.now()
  proxy.ctl.refuseWs = true; proxy.drop()
  const seen = which === 'new' ? await waitText(/^Reconnecting/, 20_000) : null
  if (which === 'new') verdict('s1 status turned to "Reconnecting" after the drop', seen !== null, seen !== null ? `after ${seen.toFixed(1)} s` : 'never')
  const T1 = `SYNTHETIC TEST TIP D1 sent during the outage ${stamp}`
  await sendText(T1); say('tip D1 sent while the socket is down')
  await sleep(Math.max(0, 15_000 - (Date.now() - tDrop)))
  proxy.ctl.refuseWs = false; say('network restored (new sockets accepted again)')
  const qBefore = q0()
  const back = which === 'new' ? await waitText(/^Live: listening/, 60_000) : null
  if (which === 'new') verdict('s1 status is back to "Live" without any click', back !== null, back !== null ? `${back.toFixed(1)} s after restore` : 'never')
  const r1 = await waitTip(T1, which === 'new' ? 30_000 : 30_000)
  verdict('s1 tip sent DURING the outage shows up with no refresh', r1 !== null, r1 ? `data-source=${r1.src}, ${r1.sec.toFixed(1)} s after restore` : 'not shown within 30 s')
  say(`queries used by the catch-up: ${q0() - qBefore} (includes the tip read)`)
  const T2 = `SYNTHETIC TEST TIP D2 sent after the restore ${stamp}`
  await sendText(T2); say('tip D2 sent after the restore')
  const r2 = await waitTip(T2, 30_000)
  verdict('s1 tip sent AFTER the restore arrives', r2 !== null, r2 ? `data-source=${r2.src}, ${r2.sec.toFixed(1)} s` : 'not shown within 30 s')
}

if (scenarios.includes('s2')) {
  say('--- s2: CDP offline for 15 s')
  const cdp = await A.createCDPSession(); await cdp.send('Network.enable')
  const before = proxy.openSockets()
  await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  say(`offline on; sockets at the proxy ${before}`)
  await sleep(15_000)
  say(`still offline after 15 s; sockets at the proxy ${proxy.openSockets()}; wsOpened total ${proxy.st.wsOpened}`)
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  say('offline off')
  const T3 = `SYNTHETIC TEST TIP D3 after the CDP offline ${stamp}`
  await sendText(T3)
  const r3 = await waitTip(T3, 40_000)
  verdict('s2 tip sent after CDP offline appears with no refresh', r3 !== null, r3 ? `data-source=${r3.src}, ${r3.sec.toFixed(1)} s` : 'not shown within 40 s')
}

if (scenarios.includes('s3')) {
  say('--- s3: socket silently dead (open, but nothing is delivered)')
  const opened = proxy.st.wsOpened
  proxy.ctl.freeze = true
  const tFreeze = Date.now()
  const T4 = `SYNTHETIC TEST TIP D4 sent while the socket is silent ${stamp}`
  await sendText(T4); say('tip D4 sent while the socket is silent (the page cannot hear about it)')
  const seen = which === 'new' ? await waitText(/^Reconnecting/, 90_000) : null
  if (which === 'new') verdict('s3 heartbeat noticed the silent socket and showed "Reconnecting"', seen !== null, seen !== null ? `${((Date.now() - tFreeze) / 1000).toFixed(1)} s after the freeze` : 'never within 90 s')
  await sleep(3000)
  proxy.ctl.freeze = false; proxy.drop(); say('freeze lifted')
  const back = which === 'new' ? await waitText(/^Live: listening/, 90_000) : null
  if (which === 'new') verdict('s3 back to "Live" on its own', back !== null, back !== null ? `${back.toFixed(1)} s after the unfreeze` : 'never')
  const r4 = await waitTip(T4, which === 'new' ? 30_000 : 20_000)
  verdict('s3 tip sent while silent shows up with no refresh', r4 !== null, r4 ? `data-source=${r4.src}, ${r4.sec.toFixed(1)} s` : 'not shown')
  const T5 = `SYNTHETIC TEST TIP D5 after the silent socket ${stamp}`
  await sendText(T5)
  const r5 = await waitTip(T5, 30_000)
  verdict('s3 next tip arrives', r5 !== null, r5 ? `data-source=${r5.src}, ${r5.sec.toFixed(1)} s` : 'not shown')
  say(`sockets opened at the proxy during s3: ${proxy.st.wsOpened - opened}`)
}

if (scenarios.includes('s4')) {
  say('--- s4: tab hidden for 31 s with a silent socket, then visible again')
  await waitText(/^Live: listening/, 60_000)
  const T6 = `SYNTHETIC TEST TIP D6 sent while the tab is hidden ${stamp}`
  const setHidden = (hidden: boolean) => A.evaluate((hd: boolean) => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => hd }); document.dispatchEvent(new Event('visibilitychange')) }, hidden)
  proxy.ctl.freeze = true
  await setHidden(true)
  const tHide = Date.now()
  await sendText(T6); say('tip D6 sent while the tab is hidden and the socket is silent (the page cannot hear about it)')
  await sleep(Math.max(0, 31_000 - (Date.now() - tHide)))
  const before = await tipSource(T6)
  const qv = q0()
  await setHidden(false); say('tab visible again after 31 s')
  const r6 = await waitTip(T6, 20_000)
  verdict('s4 tip sent while hidden shows up after the tab is visible again, from the catch-up query', before === null && r6 !== null && r6.src === 'sweep', r6 ? `before unhide: ${before ?? 'not shown'}; data-source=${r6.src}, ${r6.sec.toFixed(1)} s after unhide; queries ${q0() - qv}` : `not shown within 20 s (before unhide: ${before ?? 'not shown'})`)
  proxy.ctl.freeze = false; proxy.drop(); say('freeze lifted')
  const back = await waitText(/^Live: listening/, 90_000)
  verdict('s4 back to "Live" on its own', back !== null, back !== null ? `${back.toFixed(1)} s after the unfreeze` : 'never')
}

clearInterval(poll)
const kinds = new Map<string, number>(); for (const q of problems) { const k = q.replace(/127\.0\.0\.1:\d+/g, 'proxy').slice(0, 170); kinds.set(k, (kinds.get(k) ?? 0) + 1) }
say(`console/page problems: ${problems.length ? [...kinds].map(([k, n]) => `${n}x ${k}`).join(' | ') : '0'}`)
say(`proxy: ${proxy.st.forwarded} arkiv_query forwarded (${proxy.st.units} units), ${proxy.st.wsOpened} sockets accepted, ${proxy.st.wsRefused} refused; notes: ${proxy.st.log.join(' ; ').slice(0, 300)}`)
ledgerNote(`d-ws ${which} ${scenarios.join(',')}`, { queries: proxy.st.forwarded, units: proxy.st.units })
writeFileSync(`/tmp/qa/d-ws-${which}.out`, out.join('\n') + '\n\n' + verdicts.join('\n') + '\n')
await browser.close(); await proxy.close()
