// Fix stage 5: the last open items of fix stage 4 (briefs/sealdrop-fix-5.md).
import { readFileSync } from 'node:fs'
import { generatePrivateKey } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReader, explainError, localSigner, sendTip } from '../src/arkiv'
import { CHAIN_ID } from '../src/config'

const URL_ = 'http://fake-node.test'
const HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const UNKNOWN = 'it may have gone through, so trying again could do it twice'

type Fault = Response | Error | Promise<never> | { rpcError: string } | undefined
/** A node that answers what sendTip needs; `fault` gets the broadcast's number (1, 2, ...). Counts every broadcast (as fix4.test.ts). */
function fakeNode(fault: (method: string, broadcast: number, signal?: AbortSignal) => Fault) {
  const raws: string[] = []
  const answers: Record<string, unknown> = { eth_chainId: '0x' + CHAIN_ID.toString(16), eth_blockNumber: '0x10', eth_call: '0x' + '0'.repeat(64), eth_estimateGas: '0x100000',
    eth_getTransactionCount: '0x0', eth_maxPriorityFeePerGas: '0x1', eth_gasPrice: '0x2', eth_sendRawTransaction: HASH,
    eth_getBlockByNumber: { number: '0x10', hash: '0x' + '11'.repeat(32), parentHash: '0x' + '22'.repeat(32), timestamp: '0x1', baseFeePerGas: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', transactions: [] } }
  vi.stubGlobal('fetch', async (_url: string, init: { body: string; signal?: AbortSignal }) => {
    const { id, method, params } = JSON.parse(init.body)
    if (method === 'eth_sendRawTransaction') raws.push(params[0])
    const f = fault(method, raws.length, init.signal)
    if (f instanceof Error) throw f
    const json = (o: object) => new Response(JSON.stringify({ jsonrpc: '2.0', id, ...o }), { headers: { 'content-type': 'application/json' } })
    if (f && 'rpcError' in f) return json({ error: { code: -32000, message: f.rpcError } })
    if (f) return f
    if (!(method in answers)) throw new Error(`fake node: no answer for ${method}`)
    return json({ result: answers[method] })
  })
  return raws
}
/** The node took the transaction but its answer comes after viem's 20 s timeout, so viem aborts the request first. */
const late = (signal?: AbortSignal) => new Promise<never>((_, no) => signal?.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
const send = () => sendTip(createReader({ rpcUrl: URL_ }), localSigner(generatePrivateKey(), URL_), { key: HASH, owner: '0x000000000000000000000000000000000000dEaD' } as never, new Uint8Array(64), 7)
async function settle(p: Promise<unknown>) {
  let value: unknown, done = false
  p.then((v) => { value = v; done = true }, (v) => { value = v; done = true })
  for (let i = 0; i < 600 && !done; i++) await vi.advanceTimersByTimeAsync(500)
  expect(done).toBe(true)
  return value
}
const isSend = (m: string) => m === 'eth_sendRawTransaction'

describe('fix stage 5, item 4: no second broadcast after a lost answer', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  // Each case: the first broadcast reaches the node, its answer does not come back, and any later broadcast gets "nonce too low"
  // (the first one was mined). A re-broadcast by viem would end in "nonce too low", which sendTip re-signs: a second tip.
  for (const [name, first] of [
    ['answered after the timeout', (s?: AbortSignal) => late(s)],
    ['answered with HTTP 502', () => new Response('Bad Gateway', { status: 502 })],
    ['answered with HTTP 500', () => new Response('Internal Server Error', { status: 500 })],
    ['connection lost', () => new TypeError('fetch failed')],
  ] as const) {
    it(`first broadcast ${name}, then "nonce too low": one broadcast, outcome unknown`, async () => {
      const raws = fakeNode((m, n, signal) => (isSend(m) ? (n === 1 ? first(signal) : { rpcError: 'nonce too low' }) : undefined))
      vi.useFakeTimers()
      const e = await settle(send())
      expect(raws.length).toBe(1)
      expect(explainError(e)).toContain(UNKNOWN)
    })
  }

  it('"nonce too low" with no earlier broadcast of ours (another sender on the shared key) is still signed again', async () => {
    const raws = fakeNode((m) => (isSend(m) ? { rpcError: 'nonce too low' } : undefined))
    vi.useFakeTimers()
    const e = await settle(send())
    expect(raws.length).toBe(3)
    expect(explainError(e)).not.toContain(UNKNOWN)
  })
})

describe('fix stage 5: the console (source checks; the browser runs are in evidence/fix-5/)', () => {
  const page = readFileSync(new URL('../src/pages/newsroom.ts', import.meta.url), 'utf8')

  it('item 1: an unknown renewal outcome gets its own text, on open and on "Renew now"; real failures keep theirs', () => {
    const text = /const RENEWAL_UNKNOWN = '([^']+)'/.exec(page)?.[1] ?? ''
    expect(text).toMatch(/unknown/)
    expect(text).toMatch(/second renewal does no harm/)
    expect(text).toMatch(/Reload to see the expiry under Lease/) // the Lease line is stale after this error; a reload reads it again
    expect(text).not.toMatch(/twice|tries again|could not/)
    expect(page).toMatch(/status\.error\(mayHaveBeenSent\(leaseError\) \? RENEWAL_UNKNOWN : `The inbox lease could not be checked or renewed\. \$\{explainError\(leaseError\)\} "Renew now" under Lease tries again\.`\)/)
    expect(page).toMatch(/status\.error\(mayHaveBeenSent\(e\) \? RENEWAL_UNKNOWN : explainError\(e\)\)\n\s*showInbox\(live, true\)/) // fix 6 (R2-S9d): a new, enabled "Renew now"
  })
  it('item 2: the link-only view does not show "Waiting for tips."', () => {
    expect(page).toMatch(/function showLinkOnly\(\) \{\n\s*emptyEl\.hidden = true/)
  })
  // Fix 6 (R2-F5-1) took the doubling out again: the catch-up's first call (arkiv_getBlockTiming) has no Arkiv-Cost (evidence/fix-6/probe-cost.txt),
  // so a retry in an outage spends no query budget, and the doubling only kept a recovered RPC's tip hidden for up to 5 min.
  it('item 3 (as of fix 6): the catch-up retries every 20 s, its first call is the free block timing, and the 429 wait stays', () => {
    expect(page).toMatch(/retry \?\?= setTimeout\(\(\) => \{ retry = undefined; void catchUp\(\) \}, limited \? \(Math\.max\(60, limited\.retryAfterSeconds\) \+ 5\) \* 1000 : 20_000\)/)
    expect(page).toMatch(/const catchUp = async \(\) => \{\n\s*try \{\n\s*const t = await getTiming\(reader\)\n/)
    expect(page).not.toMatch(/failures/)
  })
})
