// Everything the app keeps lives in this browser's localStorage. Nothing is sent anywhere except through
// Arkiv transactions. There is no memory fallback: newsroom keys that only live in a tab would be lost on reload,
// so when storage is full or blocked the caller is told (set returns false) before anything is written on chain.
import { getAddress, isAddress, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { boxKeyPairFromSecret, fromB64, newBoxKeyPair, toB64 } from './crypto'
import { isValidInboxId, newInboxId } from './codec'
import { PlainError } from './arkiv'

const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return null }
  },
  /** False when the browser did not keep the value (quota, blocked site data, a storage that drops writes). */
  set(key: string, value: string): boolean {
    try { localStorage.setItem(key, value); return localStorage.getItem(key) === value } catch { return false }
  },
  del(key: string) {
    try { localStorage.removeItem(key) } catch { /* nothing stored */ }
  },
}

/** A newsroom: where it signs from, the key that opens its tips, and which inbox is its. */
export type Identity = {
  v: 1
  kind: 'local' | 'wallet'
  address: Address
  /** Only for kind 'local'. A wallet newsroom signs in the wallet and never stores its EVM key. */
  evmPrivateKey?: Hex
  boxSecretKey: string
  boxPublicKey: string
  inboxId: string
  createdAt: string
}

const IDENTITY = 'sealdrop:newsroom:v1'
/** Where an unreadable stored newsroom is kept before a new one replaces it. */
export const IDENTITY_BACKUP = `${IDENTITY}:backup`

/** A message for the person importing the file; anything else that goes wrong becomes the generic one. */
class FileProblem extends Error {}

export function parseIdentity(text: string): Identity {
  try {
    const raw = JSON.parse(text) as Partial<Identity> | null
    if (!raw || typeof raw !== 'object' || raw.v !== 1 || (raw.kind !== 'local' && raw.kind !== 'wallet')) throw new FileProblem('This is not a Sealdrop newsroom file.')
    if (typeof raw.address !== 'string' || !isAddress(raw.address)) throw new FileProblem('The file has no valid address.')
    if (typeof raw.boxSecretKey !== 'string' || typeof raw.boxPublicKey !== 'string' || typeof raw.inboxId !== 'string' || typeof raw.createdAt !== 'string') throw new FileProblem('The file is incomplete.')
    if (!isValidInboxId(raw.inboxId)) throw new FileProblem('The file has no valid inbox id.')
    if (Number.isNaN(Date.parse(raw.createdAt))) throw new FileProblem('The file has no valid creation date.')
    const secret = fromB64(raw.boxSecretKey)
    if (secret.length !== 32 || toB64(secret) !== raw.boxSecretKey) throw new FileProblem('The file has no valid decryption key.')
    if (toB64(boxKeyPairFromSecret(secret).publicKey) !== raw.boxPublicKey) throw new FileProblem('The decryption key does not match its public key.')
    if (raw.kind === 'local') {
      if (typeof raw.evmPrivateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw.evmPrivateKey)) throw new FileProblem('The file has no valid wallet key.')
      if (privateKeyToAccount(raw.evmPrivateKey as Hex).address.toLowerCase() !== raw.address.toLowerCase()) throw new FileProblem('The wallet key does not match the address.')
    } else if (raw.evmPrivateKey !== undefined) throw new FileProblem('A wallet newsroom file must not hold a wallet key.')
    // Only the known fields, so nothing else from the file (extra or __proto__ keys) is saved again.
    const identity: Identity = { v: 1, kind: raw.kind, address: getAddress(raw.address), boxSecretKey: raw.boxSecretKey, boxPublicKey: raw.boxPublicKey, inboxId: raw.inboxId, createdAt: raw.createdAt }
    return raw.kind === 'local' ? { ...identity, evmPrivateKey: raw.evmPrivateKey } : identity
  } catch (e) {
    const problem = e instanceof FileProblem ? e.message : 'This is not a Sealdrop newsroom file.'
    throw new FileProblem(`${problem} Choose the key file Sealdrop exported for this newsroom (sealdrop-newsroom-<inbox id>.json), unchanged.`)
  }
}

export function loadIdentity(): Identity | null {
  const text = storage.get(IDENTITY)
  if (!text) return null
  try { return parseIdentity(text) } catch { return null }
}

/** Something is stored as the newsroom, but it does not read as one (a damaged or hand-edited value). */
export const hasUnreadableIdentity = () => Boolean(storage.get(IDENTITY)) && loadIdentity() === null

/** Throws, with a message for the page, when the browser will not keep the keys. Call it before any write on chain. */
export function saveIdentity(identity: Identity) {
  const old = storage.get(IDENTITY)
  if (old && loadIdentity() === null && !storage.set(IDENTITY_BACKUP, old)) throw new PlainError('The newsroom stored in this browser cannot be read, and it could not be backed up, so it was not replaced.')
  if (!storage.set(IDENTITY, JSON.stringify(identity))) {
    throw new PlainError('This browser would not store the newsroom keys (its storage is full, or site data is blocked, as in some private windows), so nothing was created. Allow site data for this page or use another browser, then try again.')
  }
}
export const forgetIdentity = () => storage.del(IDENTITY)

export function newLocalIdentity(): Identity {
  const evmPrivateKey = generatePrivateKey()
  const box = newBoxKeyPair()
  return { v: 1, kind: 'local', address: privateKeyToAccount(evmPrivateKey).address, evmPrivateKey, boxSecretKey: toB64(box.secretKey), boxPublicKey: toB64(box.publicKey), inboxId: newInboxId(), createdAt: new Date().toISOString() }
}

export function newWalletIdentity(address: Address): Identity {
  const box = newBoxKeyPair()
  return { v: 1, kind: 'wallet', address, boxSecretKey: toB64(box.secretKey), boxPublicKey: toB64(box.publicKey), inboxId: newInboxId(), createdAt: new Date().toISOString() }
}

/** Starts a download of the newsroom file (it contains the secret keys: the page says so). */
export function downloadIdentity(identity: Identity) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(identity, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `sealdrop-newsroom-${identity.inboxId}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Last block a newsroom has swept, so a return visit asks only for tips created since then.
export const getLastSeen = (inboxKey: string): bigint | null => {
  const v = storage.get(`sealdrop:seen:${inboxKey}`)
  return v && /^\d+$/.test(v) ? BigInt(v) : null
}
export const setLastSeen = (inboxKey: string, block: bigint) => { storage.set(`sealdrop:seen:${inboxKey}`, block.toString()) } // a miss only costs a longer catch-up

/** Optional RPC override (for example the user's own access-key URL). Stays on this device. False if it could not be stored. */
export const getRpcOverride = () => storage.get('sealdrop:rpc') || undefined
export const setRpcOverride = (url: string): boolean => (url ? storage.set('sealdrop:rpc', url) : (storage.del('sealdrop:rpc'), true))
