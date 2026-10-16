// I: wallet mode with a scripted EIP-1193 wallet that misbehaves in the ways real wallets do.
// Run from the repo: npx tsx /tmp/qa/wallet-checks.ts
import { generatePrivateKey } from 'viem/accounts'
// @ts-expect-error plain .mjs helper
import { serve, launch, watch, countQueries, ledgerNote, sleep, PROJECT } from '/tmp/qa/lib.mjs'
import { installWallet, type WalletQuirks } from '/path/to/sealdrop/scripts/wallet-shim.ts'

const problems: string[] = []
const results: string[] = []
const ledger = { queries: 0, units: 0 }
const srv = await serve(PROJECT + '/dist')
const browser = await launch('chromium')

async function scenario(name: string, quirks: WalletQuirks, expect: (r: { calls: string[]; msg: string; created: boolean }) => string | null) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  watch(page, name, problems)
  countQueries(page, ledger)
  await installWallet(page, generatePrivateKey(), quirks)
  await page.evaluateOnNewDocument(() => {
    const w = window as unknown as { ethereum: { request: (a: { method: string }) => Promise<unknown> }; __calls: string[] }
    const orig = w.ethereum.request
    w.__calls = []
    w.ethereum.request = (a) => { w.__calls.push(a.method); return orig(a) }
  })
  await page.goto(srv.url + '#/newsroom')
  await page.click('[data-testid=use-wallet]')
  // outcome: either a status message or the console (inbox setup form / lookup) appears
  await page.waitForSelector('[data-testid=status].error, [data-testid=create-inbox], [data-testid=inbox]', { timeout: 60_000 })
  const out = await page.evaluate(() => ({
    calls: (window as unknown as { __calls: string[] }).__calls,
    msg: document.querySelector('[data-testid=status]')?.textContent ?? '',
    created: Boolean(document.querySelector('[data-testid=create-inbox]') || document.querySelector('[data-testid=inbox]')),
  }))
  const verdict = expect(out)
  results.push(`${verdict === null ? 'PASS' : 'FAIL'}  ${name}: calls=[${out.calls.join(', ')}] message="${out.msg}" console=${out.created ? 'opened' : 'not opened'}${verdict ? ' -> ' + verdict : ''}`)
  await page.screenshot({ path: `/tmp/qa/wallet-${name.replace(/\W+/g, '-')}.png` })
  await ctx.close()
}

await scenario('wrong chain, switch works', { chainId: '0x1' }, (r) => (r.created && r.calls.includes('wallet_switchEthereumChain') && !r.calls.includes('wallet_addEthereumChain') ? null : 'expected switch only, then the console'))
await scenario('wrong chain, chain unknown (4902), add works', { chainId: '0x1', switch: 'unknown' }, (r) => (r.created && r.calls.includes('wallet_addEthereumChain') ? null : 'expected switch then add, then the console'))
await scenario('wrong chain, add does not switch', { chainId: '0x1', switch: 'unknown', addWithoutSwitch: true }, (r) => (!r.created && /different network/i.test(r.msg) ? null : 'expected a plain message to switch networks'))
await scenario('user rejects the network switch', { chainId: '0x1', switch: 'reject' }, (r) => (!r.created && /rejected in the wallet/i.test(r.msg) && !r.calls.includes('wallet_addEthereumChain') ? null : 'expected "rejected" and no add prompt'))
await scenario('user rejects the account request', { rejectApprovals: true }, (r) => (!r.created && /rejected in the wallet/i.test(r.msg) ? null : 'expected "rejected in the wallet"'))

await browser.close()
await srv.close()
ledgerNote('wallet-checks', ledger)
console.log(results.join('\n'))
console.log(`queries ${ledger.queries}, units ${ledger.units}`)
console.log(problems.length ? 'PROBLEMS:\n' + problems.join('\n') : 'console/page errors: 0')
