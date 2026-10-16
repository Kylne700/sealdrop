// A: what does one judge run cost in GLM? Real UI flow in Chromium (throwaway newsroom auto-funded by the demo key, one tip to its inbox,
// one renew, one tip to the Demo Desk). Balances are read with unmetered eth_getBalance. No private key is printed; the newsroom
// identity is saved to /tmp/qa/fixture.json (mode 600) for the later tests.
import { chmodSync, writeFileSync } from 'node:fs'
import { formatEther } from 'viem'
import { createReader, balanceOf } from '/path/to/sealdrop/src/arkiv'
import { DEMO_DESK, DEMO_SENDER_ADDRESS } from '/path/to/sealdrop/src/config'
import { startProxy } from './proxy.mjs'
import { launch, watch, secs, ledgerNote, PROJECT } from './lib.mjs'

const FUNDER = '0x9606dB647383Bf71604B6C855aB3B3D92675cD64'
const reader = createReader()
const bal = (a: string) => balanceOf(reader, a as `0x${string}`)
const g = (wei: bigint) => `${formatEther(wei)} GLM`
const problems: string[] = []
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }

const proxy = await startProxy(PROJECT + '/dist')
const browser = await launch('chromium')
const setRpc = (page: any) => page.evaluateOnNewDocument((o: string) => localStorage.setItem('sealdrop:rpc', o), proxy.origin)
const newPage = async (name: string) => { const p = await (await browser.createBrowserContext()).newPage(); watch(p, name, problems); await setRpc(p); return p }
const sendResult = (p: any) => p.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) })

say(`funder ${await bal(FUNDER).then(g)} | demo sender ${await bal(DEMO_SENDER_ADDRESS).then(g)} | Demo Desk ${await bal(DEMO_DESK.address).then(g)}   (before)`)
const S0 = await bal(DEMO_SENDER_ADDRESS)

// 1. newsroom: create identity (no network), then create the inbox (auto-funding from the demo key)
const t0 = Date.now()
const A = await newPage('newsroom')
await A.goto(proxy.url + '#/newsroom')
await A.click('[data-testid=create-newsroom]')
await A.waitForSelector('[data-testid=create-inbox]')
await A.click('[data-testid=create-inbox]')
await A.waitForSelector('[data-testid=inbox-link]', { timeout: 120_000 })
const tCreated = Date.now() - t0
const inboxLink = await A.$eval('[data-testid=inbox-link]', (el: any) => el.value)
await A.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''))
await A.waitForFunction(() => /No tips yet\./.test(document.querySelector('[data-testid=status]')?.textContent ?? ''))
const address = await A.$eval('.me dd a', (el: any) => el.textContent ?? '')
const S1 = await bal(DEMO_SENDER_ADDRESS)
const N1 = await bal(address)
say(`1. throwaway newsroom ${address}: ready in ${secs(tCreated)}; demo sender paid ${g(S0 - S1)} (0.005 funding + the transfer's gas); the newsroom kept ${g(N1)}, so creating the inbox cost it ${g(5000000000000000n - N1)}`)
const identity = await A.evaluate(() => localStorage.getItem('sealdrop:newsroom:v1'))
const inboxId = new URL(inboxLink).hash.split('/').pop()
writeFileSync('/tmp/qa/fixture.json', JSON.stringify({ identity, link: inboxLink.replace(proxy.url, ''), address, inboxId, createdAt: new Date().toISOString() }), { mode: 0o600 })
chmodSync('/tmp/qa/fixture.json', 0o600)

// 2. a source sends a tip to that inbox with the shared demo key
const B = await newPage('source')
await B.goto(inboxLink)
await B.waitForSelector('[data-testid=inbox]')
const text = `SYNTHETIC TEST TIP (QA cost run ${new Date().toISOString()}): a made-up message.`
await B.type('[data-testid=message]', text)
const tSend = Date.now()
await B.click('[data-testid=send]')
await sendResult(B)
const tSent = Date.now() - tSend
const S2 = await bal(DEMO_SENDER_ADDRESS)
say(`2. one tip to the own inbox: demo sender paid ${g(S1 - S2)}; send took ${secs(tSent)}`)
await A.waitForFunction((t: string) => [...document.querySelectorAll('[data-testid=tip-text]')].some((e) => e.textContent === t), { timeout: 60_000 }, text)
say(`   the newsroom tab showed the tip live, text identical`)

// 3. renew from the newsroom console (the newsroom pays, not the demo key)
const leaseBefore = await A.$eval('[data-testid=inbox]', (el: any) => el.textContent.match(/alive for ([^(]+)/)?.[1]?.trim())
await A.click('[data-testid=renew]')
await A.waitForFunction(() => /Renewed\./.test(document.querySelector('[data-testid=status]')?.textContent ?? ''), { timeout: 90_000 })
const N2 = await bal(address)
const leaseAfter = await A.$eval('[data-testid=inbox]', (el: any) => el.textContent.match(/alive for ([^(]+)/)?.[1]?.trim())
say(`3. one renew (Renew now): the newsroom paid ${g(N1 - N2)}; lease "${leaseBefore}" -> "${leaseAfter}"`)

// 4. a tip to the Demo Desk with the shared demo key
const C = await newPage('desk')
await C.goto(proxy.url + '#/')
await C.click('[data-testid=open-desk]')
await C.waitForSelector('[data-testid=inbox]')
await C.type('[data-testid=message]', `SYNTHETIC TEST TIP (QA cost run ${new Date().toISOString()}) to the Demo Desk.`)
await C.click('[data-testid=send]')
await sendResult(C)
const S3 = await bal(DEMO_SENDER_ADDRESS)
say(`4. one tip to the Demo Desk: demo sender paid ${g(S2 - S3)}`)

const perRun = S0 - S3
const covers = (b: bigint) => Number(b / perRun)
say(`full judge run (newsroom + tip to own inbox + tip to Demo Desk) costs the demo key ${g(perRun)}; with ${g(S3)} left it covers ${covers(S3)} runs`)
say(`queries that reached the public RPC: ${proxy.st.forwarded} arkiv_query (${proxy.st.units} units); other calls: ${JSON.stringify(proxy.st.methods)}`)
say(problems.length ? `console/page problems: ${problems.join(' | ')}` : 'console/page errors: 0')
say(`demo sender after: ${g(S3)} | funder ${await bal(FUNDER).then(g)} | Demo Desk ${await bal(DEMO_DESK.address).then(g)}`)
ledgerNote('a-costs', { queries: proxy.st.forwarded, units: proxy.st.units })
writeFileSync('/tmp/qa/a-costs.out', out.join('\n') + '\n')
await browser.close(); await proxy.close()
