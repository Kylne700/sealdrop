// PoC (agent C, finding C5): copy into test/. Fails on 3e4fd45.
// getTip turns every read error into "not a tip": once spam handovers have spent the anonymous RPC budget,
// a real tip pushed over the WebSocket is dropped silently (onHandover returns, no status, no retry).
import { describe, expect, it } from 'vitest'
import { RateLimitedError, getTip, type Reader } from '../src/arkiv'

describe('getTip under a spent RPC budget', () => {
  it('surfaces a rate limit instead of answering "no tip"', async () => {
    let calls = 0
    const reader = { http: { getEntity: async () => { calls++; throw new RateLimitedError(1800) } } } as unknown as Reader
    await expect(getTip(reader, '0x' + '11'.repeat(32) as `0x${string}`, ['0x' + '22'.repeat(32) as `0x${string}`], 2)).rejects.toBeInstanceOf(RateLimitedError)
    expect(calls).toBe(1) // and it must not spend more queries retrying a 429
  })
})
