// Fix stage 4: the L findings (evidence/final-qa/L/report.md) and two wording nits.
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { generatePrivateKey } from 'viem/accounts'
import { CHAIN_ID } from '../src/config'
import { createReader, explainError, getTip, localSigner, sendTip, watchHandovers, withRetry } from '../src/arkiv'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const URL_ = 'http://fake-node.test'
const HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`
const DEAD = '0x000000000000000000000000000000000000dEaD'
const UNKNOWN = 'it may have gone through, so trying again could do it twice'

type Fault = Response | Error | Promise<never> | { rpcError: string } | undefined
/** A node that answers what sendTip needs and counts the signed transactions it was sent (as fix3.test.ts). */
function fakeNode(fault: (method: string, signal?: AbortSignal) => Fault) {
  const raws: string[] = []
  const answers: Record<string, unknown> = { eth_chainId: '0x' + CHAIN_ID.toString(16), eth_blockNumber: '0x10', eth_call: '0x' + '0'.repeat(64), eth_estimateGas: '0x100000',
    eth_getTransactionCount: '0x0', eth_maxPriorityFeePerGas: '0x1', eth_gasPrice: '0x2', eth_sendRawTransaction: HASH,
    eth_getBlockByNumber: { number: '0x10', hash: '0x' + '11'.repeat(32), parentHash: '0x' + '22'.repeat(32), timestamp: '0x1', baseFeePerGas: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', transactions: [] } }
  vi.stubGlobal('fetch', async (_url: string, init: { body: string; signal?: AbortSignal }) => {
    const { id, method, params } = JSON.parse(init.body)
    if (method === 'eth_sendRawTransaction') raws.push(params[0])
    const f = fault(method, init.signal)
    if (f instanceof Error) throw f
    const json = (o: object) => new Response(JSON.stringify({ jsonrpc: '2.0', id, ...o }), { headers: { 'content-type': 'application/json' } })
    if (f && 'rpcError' in f) return json({ error: { code: -32000, message: f.rpcError } })
    if (f) return f
    if (!(method in answers)) throw new Error(`fake node: no answer for ${method}`)
    return json({ result: answers[method] })
  })
  return raws
}
/** No answer until viem gives up and aborts the request. */
const hang = (signal?: AbortSignal) => new Promise<never>((_, no) => signal?.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))))
const send = () => sendTip(createReader({ rpcUrl: URL_ }), localSigner(generatePrivateKey(), URL_), { key: HASH, owner: DEAD } as never, new Uint8Array(64), 7)
/** Runs fake time forward until the promise settles (viem and withRetry wait on timers). */
async function settle(p: Promise<unknown>) {
  let value: unknown, done = false
  p.then((v) => { value = v; done = true }, (v) => { value = v; done = true })
  for (let i = 0; i < 600 && !done; i++) await vi.advanceTimersByTimeAsync(500)
  expect(done).toBe(true)
  return value
}

describe('fix stage 4: one Send click, one tip (L-04)', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('"429" inside quoted hex is no reason to retry; "nonce too low" and "underpriced" still are', async () => {
    vi.useFakeTimers()
    let calls = 0
    const hexy = new Error(`HTTP request failed.\nRequest body: {"method":"eth_estimateGas","params":[{"data":"0x${'ab'.repeat(20)}429${'cd'.repeat(20)}"}]}\nDetails: socket hang up`)
    await settle(withRetry(async () => { calls++; throw hexy }))
    expect(calls).toBe(1)
    for (const m of ['nonce too low', 'replacement transaction underpriced']) {
      let n = 0
      await settle(withRetry(async () => { n++; throw new Error(m) }, 2))
      expect(n).toBe(2)
    }
  })

  it('the answer to the send times out after the node got it: one signed transaction, outcome unknown', async () => {
    const raws = fakeNode((m, signal) => (m === 'eth_sendRawTransaction' ? hang(signal) : undefined))
    vi.useFakeTimers()
    const e = await settle(send())
    expect(raws.length).toBe(1)
    expect(explainError(e)).toContain(UNKNOWN)
  })

  it('"already known" means the node holds this very transaction: not re-signed, outcome unknown', async () => {
    const raws = fakeNode((m) => (m === 'eth_sendRawTransaction' ? { rpcError: 'already known' } : undefined))
    vi.useFakeTimers()
    const e = await settle(send())
    expect(raws.length).toBe(1)
    expect(explainError(e)).toContain(UNKNOWN)
  })

  const batch = (getEntity: () => Promise<unknown>) => {
    const calls = { n: 0 }
    const reader = { http: { predictEntityKeys: async () => [{ key: HASH, salt: 1n }], getEntity } }
    const signer = { client: { executeBatch: async () => (calls.n++, { createdEntities: [HASH], txHash: HASH }) } }
    return { calls, p: sendTip(reader as never, signer as never, { key: HASH, owner: DEAD } as never, new Uint8Array(64), 7) }
  }

  it('the tip was written but the read-back fails (HTTP 502): not sent again, outcome unknown with the hash', async () => {
    vi.useFakeTimers()
    const { calls, p } = batch(async () => { throw Object.assign(new Error('HTTP request failed. Status: 502'), { name: 'HttpRequestError', status: 502 }) })
    const e = await settle(p)
    expect(calls.n).toBe(1)
    expect(explainError(e)).toContain(UNKNOWN)
    expect(explainError(e)).toContain(HASH)
  })

  it('a read-back with other bytes is still a replaced write, and is still sent again', async () => {
    vi.useFakeTimers()
    const { calls, p } = batch(async () => ({ payload: new Uint8Array(64).fill(1) }))
    expect(String(await settle(p))).toMatch(/replaced by another transaction/)
    expect(calls.n).toBe(3)
  })

  it('Nit 2: the unknown-outcome text reads right on the send page and in the console, with and without a hash', () => {
    const msg = explainError(Object.assign(new Error('x'), { txHash: HASH }))
    expect(msg).toContain(UNKNOWN)
    expect(msg).toContain(`Look up its hash ${HASH} on the Arkiv Data Explorer`)
    expect(msg).not.toMatch(/newsroom console|send it again/)
  })
})

describe('fix stage 4: reading and the live feed', () => {
  afterEach(() => { vi.useRealTimers() })

  it('L-01: a 5xx while reading a live tip is thrown, not turned into "no tip"; a missing entity is still null', async () => {
    const failing = { http: { getEntity: async () => { throw Object.assign(new Error('HTTP request failed. Status: 500'), { status: 500 }) } } }
    await expect(getTip(failing as never, HASH, [HASH], 2)).rejects.toThrow(/500/)
    const missing = { http: { getEntity: async () => { throw Object.assign(new Error('Entity not found'), { name: 'NoEntityFoundError' }) } } }
    await expect(getTip(missing as never, HASH, [HASH], 2)).resolves.toBeNull()
  })

  it('L-03: a WebSocket handshake that never answers counts as lost after 15 s, and is tried again', async () => {
    vi.useFakeTimers()
    let opened = 0
    const states: string[] = []
    const reader = { ws: () => { opened++; return { watchEntityEvents: () => () => {}, getBlockNumber: () => new Promise(() => {}) } }, dropWs: () => {} }
    const stop = watchHandovers(reader as never, DEAD, { onHandover: () => {}, onError: () => {}, onState: (s) => states.push(s) })
    await vi.advanceTimersByTimeAsync(16_000)
    expect(states).toEqual(['reconnecting'])
    await vi.advanceTimersByTimeAsync(1_500)
    expect(opened).toBe(2)
    stop()
  })

  it('L-03: refused WebSocket upgrades follow the backoff, one socket per attempt', async () => {
    let upgrades = 0
    const server = createServer((_q, r) => r.end()).on('upgrade', (_q, socket) => { upgrades++; socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n') })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const reader = createReader({ rpcUrl: 'http://127.0.0.1:9', wsUrl: `ws://127.0.0.1:${(server.address() as { port: number }).port}` })
    const stop = watchHandovers(reader, DEAD, { onHandover: () => {}, onError: () => {} })
    await new Promise((r) => setTimeout(r, 3_500))
    stop()
    server.close()
    expect(upgrades).toBeGreaterThan(0)
    expect(upgrades).toBeLessThanOrEqual(3) // attempts at 0, 1 and 3 s; 0982859 opened about 5 sockets per attempt
  })
})

describe('fix stage 4: the console (source checks; the browser runs are in evidence/design.md)', () => {
  const page = read('../src/pages/newsroom.ts')

  it('L-01: a live tip that cannot be read schedules a catch-up for any error, not only a spent budget', () => {
    expect(page).not.toMatch(/if \(!limited\) return status\.error/)
    expect(page).toMatch(/catchUpLater\(e\)\n\s*const limited = rateLimit\(e\)/)
    expect(page).toMatch(/It loads by itself once the RPC answers again\./)
  })
  it('L-02: a successful catch-up replaces a stale read error or "No tips yet."', () => {
    expect(page).toMatch(/if \(\[stale, 'No tips yet\.'\]\.includes\(status\.el\.textContent \?\? ''\)\) status\.info/)
  })
  it('L-06: Refresh drops expired rows; Keep and Burn check the expiry first and say so', () => {
    expect(page).toMatch(/if \(tip\.expiresAt <= t\.head\) dropTip\(key\)/)
    expect(page.match(/if \(await expired\(tip\)\) return/g)?.length).toBe(2)
    expect(page.match(/actionFailed\(tip, e\)/g)?.length).toBe(2)
  })
  it('L-07: a failed lease check or renewal still shows the inbox, then says what to do', () => {
    expect(page).toMatch(/inbox = await leaseCheck\(read\)\.catch/)
    expect(page).toMatch(/The inbox lease could not be checked or renewed\./)
  })
  it('L-08: every way into the console goes through open(), which leaves the link and a working Refresh', () => {
    expect(page.match(/await load\(\)/g)?.length).toBe(1) // inside open()
    expect(page.match(/await open\(\)/g)?.length).toBe(2)
    expect(page).toMatch(/showLinkOnly\(\)\n\s*refreshBtn\.onclick = \(\) => open\(\)/)
  })
  it('Nit 1: "1 query", not "1 queries"', () => {
    const main = read('../src/main.ts')
    expect(main).not.toMatch(/\$\{budget\.queries\} queries/)
    expect(main.match(/budget\.queries === 1 \? 'query' : 'queries'/g)?.length).toBe(2)
  })
})
