// Anonymous sealed box on tweetnacl: ephemeral X25519 key + nacl.box (XSalsa20-Poly1305).
// Only the holder of the newsroom's secret key can open a tip; the sender keeps nothing.
import nacl from 'tweetnacl'

export type BoxKeyPair = { publicKey: Uint8Array; secretKey: Uint8Array }

/** Wire format: version(1) | ephemeral public key(32) | nonce(24) | nacl.box(padded plaintext). */
export const VERSION = 1
const PK = nacl.box.publicKeyLength
const NONCE = nacl.box.nonceLength
const HEADER = 1 + PK + NONCE
export const SEAL_OVERHEAD = HEADER + nacl.box.overheadLength

/** Plaintext is padded up to one of these sizes so the ciphertext length leaks little. */
const BUCKETS = [1024, 4096, 16384, 65536] as const
const LEN_BYTES = 4
export const MAX_MESSAGE_BYTES = BUCKETS[BUCKETS.length - 1] - LEN_BYTES

export const newBoxKeyPair = (): BoxKeyPair => nacl.box.keyPair()
export const boxKeyPairFromSecret = (secretKey: Uint8Array): BoxKeyPair => nacl.box.keyPair.fromSecretKey(secretKey)

export function pad(message: Uint8Array): Uint8Array {
  const need = message.length + LEN_BYTES
  const bucket = BUCKETS.find((b) => b >= need)
  if (bucket === undefined) throw new RangeError(`message too large (${message.length} bytes, max ${MAX_MESSAGE_BYTES})`)
  const out = new Uint8Array(bucket)
  new DataView(out.buffer).setUint32(0, message.length)
  out.set(message, LEN_BYTES)
  return out
}

export function unpad(padded: Uint8Array): Uint8Array | null {
  if (padded.length < LEN_BYTES) return null
  const len = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(0)
  if (len > padded.length - LEN_BYTES) return null
  return padded.slice(LEN_BYTES, LEN_BYTES + len)
}

export function seal(message: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
  if (recipientPublicKey.length !== PK) throw new RangeError('recipient public key must be 32 bytes')
  const ephemeral = nacl.box.keyPair()
  const nonce = nacl.randomBytes(NONCE)
  const box = nacl.box(pad(message), nonce, recipientPublicKey, ephemeral.secretKey)
  const out = new Uint8Array(HEADER + box.length)
  out[0] = VERSION
  out.set(ephemeral.publicKey, 1)
  out.set(nonce, 1 + PK)
  out.set(box, HEADER)
  return out
}

/** Returns null for anything that is not a valid box for this key (wrong key, corrupt, foreign data). */
export function open(sealed: Uint8Array, recipient: BoxKeyPair): Uint8Array | null {
  if (sealed.length < SEAL_OVERHEAD || sealed[0] !== VERSION) return null
  const ephemeralPublic = sealed.slice(1, 1 + PK)
  const nonce = sealed.slice(1 + PK, HEADER)
  const padded = nacl.box.open(sealed.slice(HEADER), nonce, ephemeralPublic, recipient.secretKey)
  return padded ? unpad(padded) : null
}

/** Tip plaintext. Versioned JSON so fields can be added later; nothing about the sender goes in. */
export type TipMessage = { v: 1; text: string }

export function sealText(text: string, recipientPublicKey: Uint8Array): Uint8Array {
  const message: TipMessage = { v: 1, text }
  return seal(new TextEncoder().encode(JSON.stringify(message)), recipientPublicKey)
}

export function openText(sealed: Uint8Array, recipient: BoxKeyPair): string | null {
  const plain = open(sealed, recipient)
  if (!plain) return null
  try {
    const message = JSON.parse(new TextDecoder().decode(plain)) as Partial<TipMessage>
    return message.v === 1 && typeof message.text === 'string' ? message.text : null
  } catch {
    return null
  }
}

/** Largest text that still fits a tip once JSON-wrapped; used for the UI byte counter. */
export const textBytes = (text: string) => new TextEncoder().encode(JSON.stringify({ v: 1, text })).length
export const fitsInTip = (text: string) => textBytes(text) <= MAX_MESSAGE_BYTES

export function toB64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
