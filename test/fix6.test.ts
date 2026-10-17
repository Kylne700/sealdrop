// Fix stage 6: R2's Medium (a browser re-send of our own broadcast) and Lows (briefs/sealdrop-fix-6.md).
import { readFileSync } from 'node:fs'
import { keccak256, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { budget, explainError, injectedSigner, localSigner } from '../src/arkiv'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const URL_ = 'http://fake-node.test'
const RAW = '0x02f8aabbcc' as Hex
const OURS = keccak256(RAW)
const json = (id: number, o: object, headers: Record<string, string> = {}) => new Response(JSON.stringify({ jsonrpc: '2.0', id, ...o }), { headers: { 'content-type': 'application/json', ...headers } })

type Lookup = 'holds' | 'none' | 'other-hash' | '429' | 'throw'
/** A node that refuses the broadcast with `message` and answers the lookup (eth_getTransactionByHash) as `lookup` says; only the lookup carries Arkiv-Cost. */
function node(message: string, lookup: Lookup, cost = 0) {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const { id, method } = JSON.parse(init.body)
    asked.push(method)
    if (method === 'eth_sendRawTransaction') return json(id, { error: { code: -32000, message } })
    const headers: Record<string, string> = cost ? { 'arkiv-cost': String(cost) } : {}
    if (lookup === 'throw') throw new TypeError('fetch failed')
    if (lookup === '429') return new Response('Too Many Requests', { status: 429, headers: { 'retry-after': '1800', ...headers } })
    const hash = lookup === 'holds' ? OURS : lookup === 'other-hash' ? keccak256('0x01') : undefined
    return json(id, { result: hash ? { hash, blockNumber: '0x11' } : null }, headers)
  })
  return asked
}
const broadcast = () => localSigner(generatePrivateKey(), URL_).client.sendRawTransaction({ serializedTransaction: RAW })

describe('fix stage 6, R2-D1: a browser re-send of our own broadcast', () => {
  afterEach(() => vi.unstubAllGlobals())
  for (const message of ['nonce too low: next nonce 701, tx nonce 700', 'already known']) {
    it(`"${message}" for a transaction the node holds is the success of the first copy`, async () => {
      const asked = node(message, 'holds')
      await expect(broadcast()).resolves.toBe(OURS)
      expect(asked).toEqual(['eth_sendRawTransaction', 'eth_getTransactionByHash'])
    })
  }
  it('the lookup counts in the query budget like every other call', async () => {
    node('nonce too low: next nonce 701, tx nonce 700', 'holds', 7)
    const before = { ...budget }
    await expect(broadcast()).resolves.toBe(OURS)
    expect([budget.spent - before.spent, budget.queries - before.queries]).toEqual([7, 1])
  })
  // Each way the lookup can fail keeps the node's answer, so sendTip signs again as before (another sender on the shared demo key took the nonce).
  for (const lookup of ['none', 'other-hash', '429', 'throw'] as const) {
    it(`lookup answered "${lookup}": the original "nonce too low" stands`, async () => {
      const asked = node('nonce too low: next nonce 701, tx nonce 700', lookup)
      await expect(broadcast()).rejects.toThrow(/nonce too low/)
      expect(asked).toEqual(['eth_sendRawTransaction', 'eth_getTransactionByHash'])
    })
  }
  it('any other refusal is not looked up', async () => {
    const asked = node('insufficient funds for gas * price + value', 'holds')
    await expect(broadcast()).rejects.toThrow(/insufficient funds/)
    expect(asked).toEqual(['eth_sendRawTransaction'])
  })
})

describe('fix stage 6, R2-S1 and R2-S8: messages', () => {
  const wallet = (answers: Record<string, unknown>) => ({ request: async ({ method }: { method: string }) => answers[method] ?? null }) as never
  it('R2-S1: a wallet with no account or on another network gets one next step, not the RPC tail', async () => {
    for (const provider of [wallet({ eth_requestAccounts: [] }), wallet({ eth_requestAccounts: ['0x000000000000000000000000000000000000dEaD'], eth_chainId: '0x1' })]) {
      const e = await injectedSigner(provider).catch((x: unknown) => x)
      expect(explainError(e)).toBe((e as Error).message)
      expect(explainError(e)).not.toMatch(/Try again; if it keeps failing/)
    }
  })
  it('R2-S1: the page messages that say what to do are PlainErrors', () => {
    for (const p of ['../src/pages/newsroom.ts', '../src/pages/send.ts']) expect(read(p)).not.toMatch(/throw new Error\(/)
    expect(read('../src/arkiv.ts')).toMatch(/throw new PlainError\('This tip was replaced by another transaction/)
  })
  it('R2-S8: an unknown outcome without a hash says how to check (states 21, 23, 35)', () => {
    const lost = Object.assign(new Error('HTTP request failed.'), { name: 'HttpRequestError', body: { method: 'eth_sendRawTransaction' } })
    expect(explainError(lost)).toMatch(/could do it twice\. Wait a minute, then reload the page to see whether it did\.$/)
    const onSend = 'reload this page and open "What can anyone see on Arkiv for this inbox?"'
    expect(explainError(lost, onSend)).toMatch(/Wait a minute, then reload this page and open "What can anyone see on Arkiv for this inbox\?" to see whether it did\.$/)
    expect(read('../src/pages/send.ts')).toContain(`explainError(e, '${onSend}')`)
    expect(explainError(Object.assign(lost, { txHash: '0x' + 'ab'.repeat(32) }))).toMatch(/Look up its hash 0xabab[0-9a-f]* on the Arkiv Data Explorer to see whether it did\.$/)
  })
})

describe('fix stage 6: page code (source checks; the browser runs and screens are in evidence/fix-6/)', () => {
  const page = read('../src/pages/newsroom.ts')
  it('R2-S4: a live tip does not overwrite an error, only the read failure it resolves', () => {
    expect(page).toMatch(/addTips\(\[tip\], 'live'\)\n\s*if \(!status\.el\.classList\.contains\('error'\) \|\| status\.el\.textContent === stale\) status\.info\('A new tip just arrived\.'\)/)
  })
  it('R2-S8 and state 53: a failed live read gives one next step and no write wording', () => {
    expect(page).toMatch(/: 'A new tip may have arrived, but the RPC did not answer properly, so it cannot be read yet\. It loads by itself once the RPC answers again\.'\)/)
    expect(page).not.toMatch(/cannot be read yet\. \$\{explainError/)
  })
  it('R2-S9a: one cost unit is singular', () => {
    const main = read('../src/main.ts')
    expect(main).not.toMatch(/cost units\)/)
    expect(main.match(/\$\{budget\.spent\} cost \$\{budget\.spent === 1 \? 'unit' : 'units'\}\)/g)?.length).toBe(2)
  })
  it('R2-S9b: the no-JS notice comes before the footer', () => {
    const html = read('../index.html')
    expect(html.indexOf('<noscript>')).toBeGreaterThan(html.indexOf('<main id="app">'))
    expect(html.indexOf('<noscript>')).toBeLessThan(html.indexOf('<footer>'))
  })
  it('R2-S9c: the faucet is written one way', () => {
    for (const p of ['../src/arkiv.ts', '../src/pages/send.ts', '../src/pages/newsroom.ts']) expect(read(p)).not.toMatch(/hub\.arkiv\.network\/faucet/)
    expect(read('../src/arkiv.ts')).toMatch(/Get some at the Arkiv faucet \(\$\{FAUCET_URL\}\)/)
    expect(read('../src/pages/send.ts')).toMatch(/\(testnet faucet: \$\{FAUCET_URL\}\)/)
  })
  it('R2-S9d: the Lease card does not promise a renewal next to a failed one', () => {
    expect(page).toMatch(/It expires after \$\{INBOX_LIFETIME_DAYS\} days\$\{renewFailed \? '' : '; opening this console renews it'\}\./)
    expect(page).toMatch(/showInbox\(inbox, leaseError !== undefined\)/)
    expect(page).toMatch(/status\.error\(mayHaveBeenSent\(e\) \? RENEWAL_UNKNOWN : explainError\(e\)\)\n\s*showInbox\(live, true\)/)
  })
  it('R2-S9e: the stock design mock exports what the pages import from arkiv', () => {
    expect(read('../evidence/design-scripts/mock-arkiv.ts')).toMatch(/export \{[^}]*\bPlainError\b[^}]*\bmayHaveBeenSent\b[^}]*\} from 'real-arkiv'/)
  })
  it('R2-S7 and R2-S2: wrapped button labels get vertical padding; a long hash in a status line wraps', () => {
    const css = read('../src/style.css')
    expect(css).toMatch(/button, \.button \{[^}]*min-height: 44px; padding: var\(--s-2\) var\(--s-3\);/)
    expect(css).toMatch(/\.choice \{[^}]*padding: var\(--s-2\) var\(--s-3\) var\(--s-2\) 0\.75rem;/)
    expect(css).toMatch(/\.status \{[^}]*overflow-wrap: anywhere;/)
  })
})

describe('lead after fix stage 6: a live tip is still announced while an error stays in the status', () => {
  it('the tip note is a polite live region next to the status, hidden on screen, and gets a new text per tip', () => {
    const page = read('../src/pages/newsroom.ts')
    expect(page).toMatch(/const tipNote = h\('p', \{ class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'tip-note' \}\)/)
    expect(page).toMatch(/status\.info\('A new tip just arrived\.'\)\n\s*else tipNote\.textContent = `A new tip just arrived\. \$\{tips\.size\} tip/)
    expect(page).toMatch(/status\.el,\n\s*tipNote,/)
    expect(read('../src/style.css')).toMatch(/\.sr-only \{[^}]*position: absolute;[^}]*clip-path: inset\(50%\);/)
  })
})
