// Fix stage 3: R1 (storage error without RPC advice) and R4 (a send whose outcome is unknown).
import { EntityMutationError } from '@arkiv-network/sdk'
import { WaitForTransactionReceiptTimeoutError } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createReader, explainError, localSigner, sendTip, withRetry } from '../src/arkiv'
import { CHAIN_ID } from '../src/config'

const URL_ = 'http://fake-node.test'
const HASH = ('0x' + 'ab'.repeat(32)) as `0x${string}`

/** A fake JSON-RPC node behind fetch, as in R's faults.mjs F4. `fault` decides what happens to one method. */
function fakeNode(fault: (method: string) => Response | Error | undefined) {
  const raws: string[] = []
  const answers: Record<string, unknown> = {
    eth_chainId: '0x' + CHAIN_ID.toString(16), eth_blockNumber: '0x10', eth_call: '0x' + '0'.repeat(64), eth_estimateGas: '0x100000',
    eth_getTransactionCount: '0x0', eth_maxPriorityFeePerGas: '0x1', eth_gasPrice: '0x2', eth_sendRawTransaction: HASH,
    eth_getBlockByNumber: { number: '0x10', hash: '0x' + '11'.repeat(32), parentHash: '0x' + '22'.repeat(32), timestamp: '0x1', baseFeePerGas: '0x1', gasLimit: '0x1c9c380', gasUsed: '0x0', transactions: [] },
    // pending, so viem's receipt wait goes on to eth_getTransactionReceipt (without it the wait fails on this call)
    eth_getTransactionByHash: { hash: HASH, blockHash: null, blockNumber: null, nonce: '0x0', input: '0x' },
  }
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    const { id, method, params } = JSON.parse(init.body)
    if (method === 'eth_sendRawTransaction') raws.push(params[0])
    const f = fault(method)
    if (f instanceof Error) throw f
    if (f) return f
    if (!(method in answers)) throw new Error(`fake node: no answer for ${method}`)
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: answers[method] }), { headers: { 'content-type': 'application/json' } })
  })
  return raws
}

const send = () => sendTip(createReader({ rpcUrl: URL_ }), localSigner(generatePrivateKey(), URL_),
  { key: HASH, owner: '0x000000000000000000000000000000000000dEaD' } as never, new Uint8Array(64), 7)

const UNKNOWN = 'It may have been sent. Check the newsroom console, or the Data Explorer link, before you send it again.'

describe('fix stage 3', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('R1: a storage error does not end with the RPC advice', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => {} })
    vi.resetModules()
    const s = await import('../src/store')
    const fresh = await import('../src/arkiv') // the module instance store.ts uses after resetModules
    let msg = ''
    try { s.saveIdentity(s.newLocalIdentity()) } catch (e) { msg = fresh.explainError(e) }
    expect(msg).toMatch(/would not store the newsroom keys/)
    expect(msg).not.toMatch(/RPC/)
  })

  it('R4: the connection drops after the signed tip left (F4 "after"): the user is told it may have been sent', async () => {
    const raws = fakeNode((m) => (m === 'eth_sendRawTransaction' ? new TypeError('fetch failed') : undefined))
    const e = await send().catch((x) => x)
    expect(new Set(raws).size).toBe(1) // one signed transaction, no second tip from a retry
    expect(explainError(e)).toContain(UNKNOWN)
    expect(explainError(e)).not.toMatch(/Execution error without revert data/)
  })

  it('R4: a 429 answer to the send is a refusal, not a lost answer: the rate-limit advice stays', async () => {
    fakeNode((m) => (m === 'eth_sendRawTransaction' ? new Response('', { status: 429, headers: { 'retry-after': '1800' } }) : undefined))
    const msg = explainError(await send().catch((x) => x))
    expect(msg).toMatch(/free query budget/)
    expect(msg).not.toContain(UNKNOWN)
  })

  it.each([
    ['HTTP 502', () => new Response('bad gateway', { status: 502 })],
    ['429, query budget spent', () => new Response('', { status: 429, headers: { 'retry-after': '1800' } })],
  ])('R4: the hash came back but the receipt answer is lost (%s): no "try again" or "wait a little"', async (_why, fault) => {
    const raws = fakeNode((m) => (m === 'eth_getTransactionReceipt' ? fault() : undefined))
    vi.useFakeTimers() // viem polls and retries the receipt for about 30 s before it gives up
    let e: unknown, settled = false
    send().catch((x) => x).then((x) => { e = x; settled = true })
    for (let i = 0; i < 600 && !settled; i++) await vi.advanceTimersByTimeAsync(500)
    vi.useRealTimers()
    expect(settled).toBe(true)
    expect(new Set(raws).size).toBe(1)
    expect(explainError(e)).toContain(UNKNOWN)
    expect(explainError(e)).toContain(HASH)
  })

  it('W5/R4: a receipt timeout (viem waits 180 s) is not retried, because a retry sends the tip a second time', async () => {
    let calls = 0
    const timedOut = new EntityMutationError(`Transaction failed: Timed out while waiting for transaction with hash "${HASH}" to be confirmed.`, { cause: new WaitForTransactionReceiptTimeoutError({ hash: HASH }), txHash: HASH })
    const e = await withRetry(async () => { calls++; throw timedOut }).catch((x) => x)
    expect(calls).toBe(1)
    expect(explainError(e)).toContain(UNKNOWN)
  })

  it('R4: errors the node answered (nothing was sent) are still retried and explained as before', async () => {
    let calls = 0
    await withRetry(async () => { calls++; throw new Error('nonce too low') }, 2).catch(() => {})
    expect(calls).toBe(2)
    expect(explainError(new Error('Transaction 0xab reverted. Reason: EntityNotFound'))).not.toContain(UNKNOWN)
  })
})
