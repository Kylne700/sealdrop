// Pure encode/decode helpers: inbox payload, entity attributes, inbox links, block-time maths.
import { getAddress, isAddress, sha256, type Address, type Hex } from 'viem'
import { key } from '@arkiv-network/sdk/attr'
import { APP, BLOCKS_PER_DAY } from './config'
import { fromB64, toB64 } from './crypto'

export const INBOX_CONTENT_TYPE = 'application/json'
/** Tip payloads are opaque ciphertext. */
export const TIP_CONTENT_TYPE = 'application/octet-stream'

// ---- inbox payload (public by design: it is what a source reads before sending) -------------------

export type InboxPayload = { v: 1; name: string; description: string; pk: string }
export const INBOX_LIMITS = { name: 80, description: 500 } as const

/** Bidi controls, zero-width characters and C0/C1 controls: invisible, and able to make a name read as something else. */
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g
/** An inbox name as it may be shown: invisible characters removed, trimmed. Empty means "no name". */
export const cleanName = (name: string) => name.replace(INVISIBLE, '').trim()

export function encodeInbox(input: { name: string; description: string; publicKey: Uint8Array }): Uint8Array {
  const name = cleanName(input.name)
  const description = input.description.trim()
  if (!name || name.length > INBOX_LIMITS.name) throw new RangeError(`inbox name must be 1-${INBOX_LIMITS.name} characters`)
  if (description.length > INBOX_LIMITS.description) throw new RangeError(`description is limited to ${INBOX_LIMITS.description} characters`)
  if (input.publicKey.length !== 32) throw new RangeError('public key must be 32 bytes')
  const payload: InboxPayload = { v: 1, name, description, pk: toB64(input.publicKey) }
  return new TextEncoder().encode(JSON.stringify(payload))
}

/** The payload comes from a stranger's entity, so every field is checked. Returns null when invalid. */
export function decodeInbox(bytes: Uint8Array): InboxPayload | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(bytes)) as Partial<InboxPayload>
    if (p.v !== 1 || typeof p.name !== 'string' || typeof p.description !== 'string' || typeof p.pk !== 'string') return null
    const name = cleanName(p.name)
    if (!name || name.length > INBOX_LIMITS.name || p.description.length > INBOX_LIMITS.description) return null
    if (fromB64(p.pk).length !== 32 || toB64(fromB64(p.pk)) !== p.pk) return null // canonical base64 only, so one key has one spelling
    return { v: 1, name, description: p.description, pk: p.pk }
  } catch {
    return null
  }
}

export const inboxPublicKey = (p: InboxPayload) => fromB64(p.pk)

// ---- attributes (names are lowercase: the engine rejects uppercase, see arkiv/friction.md F3) -----

export const inboxAttributes = (inboxId: string) => ({ type: 'inbox', app: APP, inbox_id: inboxId })
export const tipAttributes = (inboxKey: Hex) => ({ type: 'tip', app: APP, inbox: key(inboxKey) })

// ---- inbox links: #/send/<creator>/<inboxId>/<fp> ----------------------------------------------

/** fp: the inbox key fingerprint the newsroom put in its link. Old links have none. */
export type InboxRef = { creator: Address; inboxId: string; fp?: string }

/** base64url of the first 16 bytes of sha256(inbox box public key): 22 characters. */
export const keyFingerprint = (publicKey: Uint8Array) =>
  toB64(sha256(publicKey, 'bytes').slice(0, 16)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export const isValidInboxId = (id: string) => /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(id)

export function newInboxId(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  return 'inbox-' + Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

export const formatSendHash = (ref: InboxRef) => `#/send/${ref.creator}/${ref.inboxId}${ref.fp ? `/${ref.fp}` : ''}`

export function parseSendHash(hash: string): InboxRef | null {
  const m = /^#?\/send\/(0x[0-9a-fA-F]{40})\/([^/?#]+)(?:\/([A-Za-z0-9_-]{22}))?$/.exec(hash)
  // isAddress is strict: a mixed-case address must carry a valid EIP-55 checksum, so a mistyped link is caught.
  if (!m || !m[1] || !m[2] || !isAddress(m[1]) || !isValidInboxId(m[2])) return null
  return m[3] ? { creator: getAddress(m[1]), inboxId: m[2], fp: m[3] } : { creator: getAddress(m[1]), inboxId: m[2] }
}

/** Accepts a full link, a bare "#/send/..." fragment or "<creator>/<inboxId>" pasted by a human. */
export function parseInboxInput(input: string): InboxRef | null {
  const text = input.trim()
  const i = text.indexOf('#')
  const hash = i >= 0 ? text.slice(i) : text.startsWith('/send/') ? '#' + text : '#/send/' + text.replace(/^\/+/, '')
  return parseSendHash(hash)
}

// ---- block time ---------------------------------------------------------------------------------

export type Timing = { head: bigint; headTime: number; blockSeconds: number }

export const blockToUnix = (block: bigint, t: Timing) => t.headTime + Number(block - t.head) * t.blockSeconds
export const secondsLeft = (expiresAt: bigint, t: Timing) => Number(expiresAt - t.head) * t.blockSeconds
export const daysToBlocks = (days: number) => BigInt(Math.round(days * BLOCKS_PER_DAY))

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'expired'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d} d ${h} h`
  if (h > 0) return `${h} h ${m} min`
  return `${Math.max(m, 1)} min`
}

export function formatUtc(unixSeconds: number) {
  const d = new Date(unixSeconds * 1000)
  return Number.isNaN(d.getTime()) ? 'an unknown time' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}
