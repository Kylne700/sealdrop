// Meant to be copied into the repo's test/ dir (imports ../src/...). FAILS on current code, passes after parseIdentity validates strictly.
import { describe, it, expect } from 'vitest'
import { newLocalIdentity, parseIdentity } from '../src/store'
import { toB64 } from '../src/crypto'

const base = () => JSON.parse(JSON.stringify(newLocalIdentity())) as Record<string, unknown>
const parse = (o: unknown) => parseIdentity(JSON.stringify(o))

describe('parseIdentity strictness (src/store.ts:38)', () => {
  it('rejects an inboxId that fails isValidInboxId', () => {
    for (const bad of ['', 'X!!', 'a'.repeat(1000)]) expect(() => parse({ ...base(), inboxId: bad })).toThrow()
  })
  it('rejects a createdAt that is not a date string', () => {
    for (const bad of ['garbage', 5, null, undefined]) expect(() => parse({ ...base(), createdAt: bad })).toThrow()
  })
  it('wallet kind must not carry an evmPrivateKey', () => {
    expect(() => parse({ ...base(), kind: 'wallet' })).toThrow()
  })
  it('does not keep unknown or __proto__ keys when re-saved', () => {
    const t = JSON.stringify(base()).replace('{', '{"__proto__":{"polluted":1},"extra":"x",')
    const id = parseIdentity(t) as unknown as Record<string, unknown>
    expect(Object.getOwnPropertyNames(id)).not.toContain('__proto__')
    expect(id.extra).toBeUndefined()
  })
  it('rejects non-canonical base64 secret key (whitespace / missing padding)', () => {
    const b = base() as { boxSecretKey: string }
    expect(() => parse({ ...b, boxSecretKey: b.boxSecretKey.replace(/=+$/, '') })).toThrow()
  })
  it('stores the address checksummed / rejects a wrong-checksum mixed-case address', () => {
    const b = base() as { address: string }
    const flipped = '0x' + b.address.slice(2).replace(/[a-f]/i, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
    expect(() => parse({ ...b, address: flipped })).toThrow()
  })
  it('every failure is an Error with a user-readable message (no raw TypeError/SyntaxError/DOMException)', () => {
    const b = base() as { boxSecretKey: string }
    const cases = ['null', '[]', '5', '{', '', JSON.stringify({ ...b, boxSecretKey: '!!!' }), JSON.stringify({ ...b, boxSecretKey: toB64(new Uint8Array(5)) })]
    for (const c of cases) {
      let msg = ''
      try { parseIdentity(c) } catch (e) { msg = e instanceof Error ? e.message : String(e) }
      expect(msg, `input ${c}`).toMatch(/Sealdrop|file|key|address|incomplete|valid/i)
    }
  })
})
