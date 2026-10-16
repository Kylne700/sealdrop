// B: a fresh clone WITHOUT .env.local.
//  dev    <clone>  `npm run dev` starts, serves 200, the home page renders, 0 console errors, no request leaves localhost (0 RPC)
//  nokey  <clone>  the built dist (clone/dist) answers "no demo key" for the throwaway newsroom, marks the shared-key option unavailable, and says "No browser wallet found." on Send (about 2 arkiv_query)
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { launch, watch, sleep, ledgerNote } from './lib.mjs'
import { startProxy } from './proxy.mjs'

const [mode, dir] = process.argv.slice(2)
const problems = []
const say = (s) => console.log(s)
let failed = 0
const check = (name, ok, detail = '') => { if (!ok) failed++; say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`) }
if (existsSync(`${dir}/.env.local`)) { say('REFUSING: the clone has a .env.local, this check is for a clone without one'); process.exit(2) }

if (mode === 'dev') {
  const dev = spawn('npm', ['run', 'dev'], { cwd: dir, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  dev.stdout.on('data', (d) => (log += d)); dev.stderr.on('data', (d) => (log += d))
  let url = null
  for (let i = 0; i < 150 && !url; i++) { await sleep(200); url = log.replace(/\x1b\[[0-9;]*m/g, '').match(/Local:\s+(http\S+)/)?.[1] ?? null }
  check('npm run dev prints a Local URL', url !== null, url ?? log.slice(-200))
  try {
    if (url) {
      const r = await fetch(url); const html = await r.text()
      check('GET / is 200 and is the app shell', r.status === 200 && /id="app"/.test(html) && /<title>/i.test(html), `status ${r.status}, ${html.length} bytes`)
      const m = await fetch(new URL('/src/main.ts', url)); check('GET /src/main.ts (dev module) is 200', m.status === 200, `status ${m.status}`)
      const browser = await launch('chromium')
      const page = await browser.newPage(); watch(page, 'dev-home', problems)
      const external = []
      page.on('request', (rq) => { const u = new URL(rq.url()); if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) && u.protocol.startsWith('http')) external.push(rq.url()) })
      await page.goto(url, { waitUntil: 'networkidle0' })
      const view = await page.evaluate(() => ({ title: document.title, h1: document.querySelector('h1')?.textContent, lang: document.documentElement.lang, primaryButtons: document.querySelectorAll('a.button').length }))
      check("home renders (h1, title, one primary button)", Boolean(view.h1) && Boolean(view.title) && view.primaryButtons === 1, `primary buttons ${view.primaryButtons}, title "${view.title}", h1 "${String(view.h1).slice(0, 60)}", lang ${view.lang}`)
      check('no request left localhost on the home page (0 RPC)', external.length === 0, external.join(' ') || '0 external requests')
      check('0 console/page errors on the home page', problems.length === 0, problems.join(' | ').slice(0, 300) || '0')
      await browser.close()
    }
  } finally { try { process.kill(-dev.pid, 'SIGTERM') } catch {} }
  await sleep(500)
}

if (mode === 'nokey') {
  const proxy = await startProxy(`${dir}/dist`)
  const browser = await launch('chromium')
  const page = await browser.newPage(); watch(page, 'nokey', problems)
  await page.evaluateOnNewDocument((rpc) => { window.__name = (f) => f; localStorage.setItem('sealdrop:rpc', rpc) }, proxy.origin)
  const statusText = (sel) => page.$eval(sel, (el) => el.textContent ?? '').catch(() => '')
  await page.goto(proxy.url + '#/newsroom')
  await page.click('[data-testid=create-newsroom]')
  await page.waitForSelector('[data-testid=create-inbox]')
  await page.click('[data-testid=create-inbox]')
  await page.waitForFunction(() => /no demo sender key/i.test(document.querySelector('[data-testid=status]')?.textContent ?? ''), { timeout: 30_000 }).catch(() => {})
  const t1 = await statusText('[data-testid=status]')
  check('throwaway newsroom, no .env.local: clear "no demo sender key" answer', /no demo sender key/i.test(t1), t1.replace(/0x[0-9a-fA-F]{40}/, '0x...').slice(0, 170))
  await page.goto(proxy.url + '#/demo')
  await page.waitForSelector('[data-testid=message]', { timeout: 60_000 })
  const hint = await page.$eval('fieldset', (el) => el.textContent ?? '')
  check('send page says "This build has no demo key." next to the shared-key option', /This build has no demo key\./.test(hint), '')
  await page.type('[data-testid=message]', 'SYNTHETIC TEST TIP (no demo key check, never sent)')
  // Without a demo key the shared-key option is disabled and "My wallet" is the selected one, so Send takes the wallet path.
  const radios = await page.evaluate(() => ({ demoDisabled: document.querySelector('[data-testid=mode-demo]').disabled, demoChecked: document.querySelector('[data-testid=mode-demo]').checked, walletChecked: document.querySelector('[data-testid=mode-wallet]').checked }))
  check('no demo key: the shared-key option is disabled and not selected', radios.demoDisabled && !radios.demoChecked && radios.walletChecked, JSON.stringify(radios))
  await page.click('[data-testid=send]')
  await page.waitForFunction(() => /No browser wallet found\./.test(document.querySelector('[data-testid=progress]')?.textContent ?? ''), { timeout: 15_000 }).catch(() => {})
  const prog = await page.$eval('[data-testid=progress]', (el) => ({ text: el.textContent ?? '', role: el.getAttribute('role'), btn: !document.querySelector('[data-testid=send]').disabled }))
  check('send, no .env.local and no wallet: clear alert "No browser wallet found.", button usable again, nothing sent', prog.text === 'No browser wallet found.' && prog.role === 'alert' && prog.btn && !proxy.st.methods.eth_sendRawTransaction, JSON.stringify(prog) + ' sent=' + (proxy.st.methods.eth_sendRawTransaction ?? 0))
  check('0 console/page errors', problems.length === 0, problems.join(' | ').slice(0, 300) || '0')
  say(`arkiv_query forwarded: ${proxy.st.forwarded} (${proxy.st.units} units)`)
  ledgerNote(`dev-check nokey ${dir}`, { queries: proxy.st.forwarded, units: proxy.st.units })
  await browser.close(); await proxy.close()
}

say(failed ? `FAILED: ${failed} check(s)` : 'ALL PASSED')
process.exit(failed ? 1 : 0)
