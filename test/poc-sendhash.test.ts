// Meant to be copied into the repo's test/ dir. FAILS on current code (src/codec.ts:61, isAddress strict:false), passes once a mixed-case address must carry a valid EIP-55 checksum.
import { describe, it, expect } from 'vitest'
import { getAddress } from 'viem'
import { formatSendHash, parseSendHash, parseInboxInput } from '../src/codec'

const good = getAddress('0x' + 'ab'.repeat(20))
const bad = '0x' + good.slice(2).replace(/[a-f]/i, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())) // one letter case flipped
describe('wrong-checksum mixed-case creator address', () => {
  it('sanity: bad differs from good and is mixed case', () => { expect(bad).not.toBe(good); expect(bad).not.toBe(bad.toLowerCase()) })
  it('parseSendHash rejects it', () => expect(parseSendHash(`#/send/${bad}/inbox-abc234`)).toBeNull())
  it('parseInboxInput rejects it', () => expect(parseInboxInput(`${bad}/inbox-abc234`)).toBeNull())
  it('still accepts all-lowercase and correct checksum', () => {
    expect(parseSendHash(`#/send/${good.toLowerCase()}/inbox-abc234`)?.creator).toBe(good)
    expect(parseSendHash(`#/send/${good}/inbox-abc234`)?.creator).toBe(good)
  })
})

describe('send link with the key fingerprint (C2)', () => {
  const fp = 'AAECAwQFBgcICQoLDA0ODw'
  it('formats and parses #/send/<creator>/<id>/<fp>', () => {
    const hash = formatSendHash({ creator: good, inboxId: 'inbox-abc234', fp })
    expect(hash).toBe(`#/send/${good}/inbox-abc234/${fp}`)
    expect(parseSendHash(hash)).toEqual({ creator: good, inboxId: 'inbox-abc234', fp })
    expect(parseInboxInput(`https://example.org/x/${hash}`)?.fp).toBe(fp)
  })
  it('an old link without fp still parses, with no fp', () => {
    expect(parseSendHash(`#/send/${good}/inbox-abc234`)).toEqual({ creator: good, inboxId: 'inbox-abc234' })
  })
  it('a malformed fp is not a valid link', () => {
    expect(parseSendHash(`#/send/${good}/inbox-abc234/short`)).toBeNull()
    expect(parseSendHash(`#/send/${good}/inbox-abc234/${fp}/x`)).toBeNull()
  })
})
