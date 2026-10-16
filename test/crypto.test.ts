import { describe, expect, it } from 'vitest'
import { MAX_MESSAGE_BYTES, SEAL_OVERHEAD, boxKeyPairFromSecret, fitsInTip, fromB64, newBoxKeyPair, open, openText, pad, seal, sealText, toB64, unpad } from '../src/crypto'

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)

describe('sealed box', () => {
  it('round-trips text, including multi-byte characters', () => {
    const kp = newBoxKeyPair()
    const text = 'The minutes of 3 March are wrong. Ünïcödé ✓ 🕵️'
    expect(openText(sealText(text, kp.publicKey), kp)).toBe(text)
  })

  it('round-trips raw bytes of every size class', () => {
    const kp = newBoxKeyPair()
    for (const n of [0, 1, 1019, 1020, 1021, 4092, 4093, 16380, 16381, MAX_MESSAGE_BYTES]) {
      const msg = bytes(n)
      expect(open(seal(msg, kp.publicKey), kp)).toEqual(msg)
    }
  })

  it('pads ciphertext to buckets so length leaks only a size class', () => {
    const kp = newBoxKeyPair()
    expect(seal(bytes(10), kp.publicKey).length).toBe(SEAL_OVERHEAD + 1024)
    expect(seal(bytes(900), kp.publicKey).length).toBe(SEAL_OVERHEAD + 1024)
    expect(seal(bytes(1021), kp.publicKey).length).toBe(SEAL_OVERHEAD + 4096)
    expect(seal(bytes(MAX_MESSAGE_BYTES), kp.publicKey).length).toBe(SEAL_OVERHEAD + 65536)
    // the largest tip must stay under the 128 KiB entity payload limit
    expect(SEAL_OVERHEAD + 65536).toBeLessThan(128 * 1024)
  })

  it('rejects messages over the maximum', () => {
    const kp = newBoxKeyPair()
    expect(() => seal(bytes(MAX_MESSAGE_BYTES + 1), kp.publicKey)).toThrow(RangeError)
    expect(fitsInTip('x'.repeat(MAX_MESSAGE_BYTES))).toBe(false)
    expect(fitsInTip('x'.repeat(1000))).toBe(true)
  })

  it('cannot be opened with another key', () => {
    const [a, b] = [newBoxKeyPair(), newBoxKeyPair()]
    expect(open(seal(bytes(50), a.publicKey), b)).toBeNull()
  })

  it('detects tampering anywhere in the box', () => {
    const kp = newBoxKeyPair()
    const sealed = seal(bytes(50), kp.publicKey)
    for (const i of [0, 1, 33, 57, 60, sealed.length - 1]) {
      const bad = sealed.slice()
      bad[i] = (bad[i] ?? 0) ^ 1
      expect(open(bad, kp), `byte ${i}`).toBeNull()
    }
  })

  it('returns null for garbage and truncated input instead of throwing', () => {
    const kp = newBoxKeyPair()
    expect(open(new Uint8Array(0), kp)).toBeNull()
    expect(open(bytes(40), kp)).toBeNull()
    expect(open(seal(bytes(5), kp.publicKey).slice(0, 80), kp)).toBeNull()
    expect(openText(seal(new TextEncoder().encode('not json'), kp.publicKey), kp)).toBeNull()
  })

  it('uses a fresh ephemeral key and nonce every time', () => {
    const kp = newBoxKeyPair()
    const [x, y] = [seal(bytes(5), kp.publicKey), seal(bytes(5), kp.publicKey)]
    expect(x).not.toEqual(y)
    expect(x.slice(1, 33)).not.toEqual(y.slice(1, 33))
    expect(x.slice(1, 33)).not.toEqual(kp.publicKey)
  })

  it('rebuilds the same key pair from a stored secret', () => {
    const kp = newBoxKeyPair()
    const again = boxKeyPairFromSecret(fromB64(toB64(kp.secretKey)))
    expect(again.publicKey).toEqual(kp.publicKey)
    expect(openText(sealText('hello', kp.publicKey), again)).toBe('hello')
  })
})

describe('padding and base64', () => {
  it('pad/unpad are inverse and reject a corrupt length prefix', () => {
    const msg = bytes(300, 9)
    expect(unpad(pad(msg))).toEqual(msg)
    const bad = pad(msg)
    new DataView(bad.buffer).setUint32(0, 5000)
    expect(unpad(bad)).toBeNull()
  })

  it('base64 round-trips large arrays without overflowing the stack', () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 251)
    expect(fromB64(toB64(big))).toEqual(big)
  })
})
