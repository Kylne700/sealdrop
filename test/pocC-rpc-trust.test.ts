// From QA agent C (C2). Tests 1 and 3 fail on 3e4fd45. Fix: findInbox checks $creator, and a link with a key fingerprint
// (#/send/<creator>/<id>/<fp>) refuses any key that does not match it. Test 2 documents what a link without fp still trusts.
// findInbox trusts whatever the RPC returns: it never checks that row.creator equals the creator in the link
// (src/arkiv.ts:165-175), and send.ts:49 prints "(matches the link you opened)" as a constant string.
// A custom RPC (Settings accepts any https URL) can therefore hand the source an attacker's box key under
// "Creator verified ✓", and the attacker reads the tip.
import { describe, expect, it } from 'vitest'
import nacl from 'tweetnacl'
import { findInbox, type Reader } from '../src/arkiv'
import { encodeInbox, keyFingerprint } from '../src/codec'

const LINK_CREATOR = '0x1111111111111111111111111111111111111111' as const
const OTHER = '0x2222222222222222222222222222222222222222' as const

function lyingRpc(creator: `0x${string}`, pk: Uint8Array): Reader {
  const row = { key: '0x' + '33'.repeat(32), owner: creator, creator, createdAt: 1n, expiresAt: 10n ** 9n,
    payload: encodeInbox({ name: 'SYNTHETIC TEST Desk', description: 'SYNTHETIC TEST', publicKey: pk }) }
  const builder: any = { select: () => builder, where: () => builder, createdBy: () => builder, limit: () => builder,
    toString: () => 'q', fetch: async () => ({ entities: [row] }) }
  return { http: builder } as unknown as Reader
}

describe('inbox lookup against a lying RPC', () => {
  it('rejects a row whose $creator differs from the link (cheap defence in depth)', async () => {
    const r = await findInbox(lyingRpc(OTHER, nacl.box.keyPair().publicKey), { creator: LINK_CREATOR, inboxId: 'qa-c-desk' })
    expect(r.inbox).toBeNull() // today: returns the OTHER creator's inbox, the page still says "matches the link you opened"
  })
  it('cannot tell a forged key under the right $creator (needs a documented trust note, not code)', async () => {
    const attacker = nacl.box.keyPair()
    const r = await findInbox(lyingRpc(LINK_CREATOR, attacker.publicKey), { creator: LINK_CREATOR, inboxId: 'qa-c-desk' })
    expect(r.inbox?.payload.pk).toBeTruthy() // accepted: the page shows "This link has no key check" for such links
  })
  it('a link with the key fingerprint refuses a forged key under the right $creator', async () => {
    const real = nacl.box.keyPair().publicKey
    const fp = keyFingerprint(real)
    expect(fp).toMatch(/^[A-Za-z0-9_-]{22}$/)
    const forged = await findInbox(lyingRpc(LINK_CREATOR, nacl.box.keyPair().publicKey), { creator: LINK_CREATOR, inboxId: 'qa-c-desk', fp })
    expect(forged.inbox).toBeNull()
    expect(forged.keyMismatch).toBe(true)
    const honest = await findInbox(lyingRpc(LINK_CREATOR, real), { creator: LINK_CREATOR, inboxId: 'qa-c-desk', fp })
    expect(honest.inbox).not.toBeNull()
    expect(honest.keyMismatch).toBe(false)
  })
})
