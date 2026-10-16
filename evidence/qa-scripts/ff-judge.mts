// C (Firefox): the judge path in Firefox 153 via WebDriver BiDi, against the built dist/ with the production CSP and the public RPC (no proxy).
import { readFileSync, writeFileSync } from 'node:fs'
import { serve, launch, watch, countQueries, ledgerNote, sleep, secs, PROJECT } from './lib.mjs'

const problems: string[] = []
const ledger = { queries: 0, units: 0 }
const out: string[] = []
const say = (s: string) => { console.log(s); out.push(s) }
const srv = await serve(PROJECT + '/dist')
const browser = await launch('firefox')
say(`browser ${await browser.version()} (puppeteer-core ${JSON.parse(readFileSync(PROJECT + '/node_modules/puppeteer-core/package.json', 'utf8')).version}, WebDriver BiDi), served from dist/ with the production CSP, public RPC`)
const newPage = async (name: string) => { const p = await (await browser.createBrowserContext()).newPage(); watch(p, name, problems); countQueries(p, ledger); return p }
const check = (name: string, ok: boolean, detail = '') => say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
const t0 = Date.now()

const A = await newPage('newsroom')
await A.goto(srv.url)
await A.waitForSelector('[data-testid=open-newsroom]')
check('home: one primary button leads to the newsroom page', (await A.$$('a.button')).length === 1)
await A.click('[data-testid=open-newsroom]')
await A.click('[data-testid=create-newsroom]')
await A.waitForSelector('[data-testid=create-inbox]')
const tCreate = Date.now()
await A.click('[data-testid=create-inbox]')
await A.waitForSelector('[data-testid=inbox-link]', { timeout: 120_000 })
const link = await A.$eval('[data-testid=inbox-link]', (el: any) => el.value)
await A.waitForFunction(() => /^Live: listening/.test(document.querySelector('[data-testid=live-status]')?.textContent ?? ''), { timeout: 60_000 })
check('newsroom: funded, inbox created, live feed connected', true, `inbox ready in ${secs(Date.now() - tCreate)}`)
const B = await newPage('source')
await B.goto(link)
await B.waitForSelector('[data-testid=inbox]', { timeout: 60_000 })
const text = `SYNTHETIC TEST TIP (Firefox QA ${new Date().toISOString().slice(11, 19)}): made up.`
await B.type('[data-testid=message]', text)
const tSend = Date.now()
await B.click('[data-testid=send]')
await B.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) }, { timeout: 120_000 })
check('source: sealed and sent with the demo key', true, `send took ${secs(Date.now() - tSend)}`)
await A.waitForFunction((t: string) => [...document.querySelectorAll('[data-testid=tip]')].some((r) => r.querySelector('[data-testid=tip-text]')?.textContent === t), { timeout: 60_000 }, text)
const src = await A.evaluate((t: string) => [...document.querySelectorAll('[data-testid=tip]')].find((r) => r.querySelector('[data-testid=tip-text]')?.textContent === t)?.getAttribute('data-source'), text)
check('newsroom tab shows the tip, decrypted, with no refresh', true, `data-source=${src}`)
check('...and it came through the WebSocket', src === 'live')
const D = await newPage('desk')
await D.goto(srv.url)
await D.click('[data-testid=open-desk]')
await D.waitForSelector('[data-testid=inbox]', { timeout: 60_000 })
check('Demo Desk: inbox found by creator + id', (await D.$eval('[data-testid=inbox]', (el: any) => el.textContent ?? '')).includes('Demo Desk'))
await D.type('[data-testid=message]', `SYNTHETIC TEST TIP (Firefox QA ${new Date().toISOString().slice(11, 19)}) to the Demo Desk.`)
await D.click('[data-testid=send]')
await D.waitForFunction(() => { const r = document.querySelector('[data-testid=send-result]') as HTMLElement | null; return Boolean(r && !r.hidden) }, { timeout: 120_000 })
check('Demo Desk: tip sent', true)
check('Firefox console and page errors', problems.length === 0, problems.join(' | ').slice(0, 400))
say(`whole judge path in Firefox: ${secs(Date.now() - t0)}; arkiv_query calls ${ledger.queries} (${ledger.units} units)`)
ledgerNote('ff-judge', ledger)
writeFileSync('/tmp/qa/ff-judge.out', out.join('\n') + '\n')
await browser.close(); await srv.close()
