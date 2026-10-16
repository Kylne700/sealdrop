import { describe, expect, it } from 'vitest'
import { key } from '@arkiv-network/sdk/attr'
import { APP, BLOCKS_PER_DAY, DEMO_DESK } from '../src/config'
import { blockToUnix, daysToBlocks, decodeInbox, encodeInbox, formatDuration, formatSendHash, inboxAttributes, inboxPublicKey, isValidInboxId, newInboxId, parseInboxInput, parseSendHash, secondsLeft, tipAttributes } from '../src/codec'
import { newBoxKeyPair } from '../src/crypto'

const creator = '0x6a3C43407F58B11E871310cE296eb3bF1a3fdcF6'
const inboxKey = '0x' + 'ab'.repeat(32)

describe('inbox payload', () => {
  it('round-trips and exposes the public key', () => {
    const kp = newBoxKeyPair()
    const bytes = encodeInbox({ name: ' Desk ', description: 'Send tips here', publicKey: kp.publicKey })
    const decoded = decodeInbox(bytes)
    expect(decoded).toMatchObject({ v: 1, name: 'Desk', description: 'Send tips here' })
    expect(inboxPublicKey(decoded!)).toEqual(kp.publicKey)
  })

  it('validates on encode', () => {
    const publicKey = newBoxKeyPair().publicKey
    expect(() => encodeInbox({ name: '', description: '', publicKey })).toThrow(RangeError)
    expect(() => encodeInbox({ name: 'x'.repeat(81), description: '', publicKey })).toThrow(RangeError)
    expect(() => encodeInbox({ name: 'ok', description: 'x'.repeat(501), publicKey })).toThrow(RangeError)
    expect(() => encodeInbox({ name: 'ok', description: '', publicKey: new Uint8Array(31) })).toThrow(RangeError)
  })

  it('treats foreign payloads as untrusted and returns null', () => {
    const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))
    expect(decodeInbox(new TextEncoder().encode('not json'))).toBeNull()
    expect(decodeInbox(enc({ v: 2, name: 'a', description: '', pk: '' }))).toBeNull()
    expect(decodeInbox(enc({ v: 1, name: 'a', description: '', pk: 'AAAA' }))).toBeNull()
    expect(decodeInbox(enc({ v: 1, name: 'a', description: 5, pk: 'x' }))).toBeNull()
  })
})

describe('attributes', () => {
  it('keeps the on-chain footprint to a few lowercase attributes', () => {
    expect(inboxAttributes('demo-desk')).toEqual({ type: 'inbox', app: APP, inbox_id: 'demo-desk' })
    const tip = tipAttributes(inboxKey)
    expect(Object.keys(tip)).toEqual(['type', 'app', 'inbox'])
    expect(tip.inbox).toEqual(key(inboxKey))
    for (const name of [...Object.keys(tip), ...Object.keys(inboxAttributes('abc'))]) expect(name).toMatch(/^[a-z][a-z0-9_]*$/)
  })
})

describe('inbox links', () => {
  it('formats and parses', () => {
    const hash = formatSendHash({ creator, inboxId: 'demo-desk' })
    expect(hash).toBe(`#/send/${creator}/demo-desk`)
    expect(parseSendHash(hash)).toEqual({ creator, inboxId: 'demo-desk' })
  })

  it('normalises the address case and rejects bad input', () => {
    expect(parseSendHash(`#/send/${creator.toLowerCase()}/demo-desk`)?.creator).toBe(creator)
    expect(parseSendHash('#/send/0x123/demo-desk')).toBeNull()
    expect(parseSendHash(`#/send/${creator}/Bad_ID`)).toBeNull()
    expect(parseSendHash(`#/send/${creator}/a/b`)).toBeNull()
    expect(parseSendHash(`#/newsroom`)).toBeNull()
  })

  it('accepts a pasted full URL or creator/id pair', () => {
    expect(parseInboxInput(`https://example.org/sealdrop/#/send/${creator}/demo-desk`)?.inboxId).toBe('demo-desk')
    expect(parseInboxInput(`${creator}/demo-desk`)?.creator).toBe(creator)
    expect(parseInboxInput('hello')).toBeNull()
  })

  it('generates valid inbox ids and the demo desk constant is valid', () => {
    for (let i = 0; i < 50; i++) expect(isValidInboxId(newInboxId())).toBe(true)
    expect(isValidInboxId(DEMO_DESK.inboxId)).toBe(true)
    expect(parseSendHash(formatSendHash({ creator: DEMO_DESK.address, inboxId: DEMO_DESK.inboxId }))).not.toBeNull()
  })
})

describe('block time', () => {
  const t = { head: 1000n, headTime: 1_700_000_000, blockSeconds: 2 }
  it('converts blocks to time and remaining time', () => {
    expect(blockToUnix(1000n, t)).toBe(1_700_000_000)
    expect(blockToUnix(1050n, t)).toBe(1_700_000_100)
    expect(blockToUnix(900n, t)).toBe(1_699_999_800)
    expect(secondsLeft(1000n + BigInt(BLOCKS_PER_DAY), t)).toBe(86400)
    expect(daysToBlocks(7)).toBe(BigInt(7 * 43200))
  })
  it('formats durations', () => {
    expect(formatDuration(-5)).toBe('expired')
    expect(formatDuration(30)).toBe('1 min')
    expect(formatDuration(3 * 3600 + 600)).toBe('3 h 10 min')
    expect(formatDuration(6 * 86400 + 23 * 3600)).toBe('6 d 23 h')
  })
})
