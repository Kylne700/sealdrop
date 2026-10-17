// Meant to be copied into the repo's test/ dir. FAILS on current code (src/arkiv.ts:240 toTip does no type checks), passes once toTip validates field types.
import { describe, it, expect } from 'vitest'
import { getTip } from '../src/arkiv'

const key = ('0x' + '11'.repeat(32)) as `0x${string}`, ik = ('0x' + '22'.repeat(32)) as `0x${string}`
const addr = '0x' + 'ab'.repeat(20)
const row = (o: object = {}) => ({ key, owner: addr, creator: addr, createdAt: 1n, expiresAt: 2n, payload: new Uint8Array([1, 2, 3]), attributes: { type: { value: 'tip' }, inbox: { value: ik } }, ...o })
const get = (r: unknown) => getTip({ http: { getEntity: async () => r } } as never, key, [ik], 1)

describe('toTip (via getTip) type validation', () => {
  it('accepts a well-formed row', async () => expect(await get(row())).not.toBeNull())
  it('rejects payload that is not a Uint8Array', async () => { for (const p of ['abc', [1, 2], {}, 5]) expect(await get(row({ payload: p }))).toBeNull() })
  it('rejects createdAt / expiresAt that are not bigint', async () => { for (const v of ['1', 5, {}, true]) { expect(await get(row({ createdAt: v }))).toBeNull(); expect(await get(row({ expiresAt: v }))).toBeNull() } })
  it('rejects key/owner/creator that are not hex strings', async () => { for (const f of ['key', 'owner', 'creator']) for (const v of ['zz', 5, {}, true]) expect(await get(row({ [f]: v }))).toBeNull() })
})
