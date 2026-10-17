// From QA agent C (C3). FAILS on 3e4fd45 (src/codec.ts:27-37). Lead decision: bidi, zero-width and control characters are
// stripped from the name (not rejected), and a name that is empty after that and trimming is rejected.
import { describe, it, expect } from 'vitest'
import { decodeInbox, encodeInbox } from '../src/codec'
import { toB64 } from '../src/crypto'

const pk = toB64(new Uint8Array(32).fill(7))
const dec = (o: object) => decodeInbox(new TextEncoder().encode(JSON.stringify({ v: 1, name: 'SYNTHETIC TEST', description: '', pk, ...o })))

describe('decodeInbox rejects deceptive payloads from strangers', () => {
  it('whitespace-only name', () => expect(dec({ name: ' \n\t' })).toBeNull())
  it('zero-width-only name', () => expect(dec({ name: '​​' })).toBeNull())
  it('bidi override/isolate characters are stripped from the name', () => expect(dec({ name: '‮SYN⁦THETIC​' })?.name).toBe('SYNTHETIC'))
  it('non-canonical base64 pk (whitespace)', () => expect(dec({ pk: pk.slice(0, 8) + ' \n' + pk.slice(8) })).toBeNull())
  it('non-canonical base64 pk (missing padding)', () => expect(dec({ pk: pk.replace(/=+$/, '') })).toBeNull())
  it('control characters are stripped from the name', () => expect(dec({ name: 'a\u0000b' })?.name).toBe('ab'))
  it('a plain name is kept as it is', () => expect(dec({ name: 'SYNTHETIC TEST Desk' })?.name).toBe('SYNTHETIC TEST Desk'))
  it('encodeInbox applies the same rule, so a newsroom cannot publish a name its own console rejects', () => {
    const publicKey = new Uint8Array(32).fill(7)
    expect(() => encodeInbox({ name: '\u200b\u202e ', description: '', publicKey })).toThrow()
    expect(decodeInbox(encodeInbox({ name: '\u202eDesk', description: '', publicKey }))?.name).toBe('Desk')
  })
})
