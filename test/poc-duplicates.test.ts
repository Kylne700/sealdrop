// C10 (QA agent C): a copied tip must be recognisable. Fails on 3e4fd45 (no sealedDigest). The digest ignores the one bit
// X25519 ignores (byte 32 bit 7, finding C17), so that flip does not hide a copy.
import { describe, expect, it } from 'vitest'
import { newBoxKeyPair, sealText, sealedDigest } from '../src/crypto'

describe('sealedDigest', () => {
  it('is the same for a copy, and for the copy with the ignored bit flipped', () => {
    const kp = newBoxKeyPair()
    const ct = sealText('SYNTHETIC TEST', kp.publicKey)
    const flipped = Uint8Array.from(ct); flipped[32]! ^= 0x80
    expect(sealedDigest(Uint8Array.from(ct))).toBe(sealedDigest(ct))
    expect(sealedDigest(flipped)).toBe(sealedDigest(ct))
    expect(sealedDigest(sealText('SYNTHETIC TEST', kp.publicKey))).not.toBe(sealedDigest(ct))
  })
})
