// Everything the app keeps lives in this browser's localStorage. Nothing is sent anywhere except through
// Arkiv transactions. If storage is blocked the app still works for the current tab (memory fallback).
import { isAddress, type Address, type Hex } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { boxKeyPairFromSecret, fromB64, newBoxKeyPair, toB64 } from './crypto'
import { newInboxId } from './codec'

const memory = new Map<string, string>()
const storage = {
  get(key: string): string | null {
    try { return localStorage.getItem(key) } catch { return memory.get(key) ?? null }
  },
  set(key: string, value: string) {
    memory.set(key, value)
    try { localStorage.setItem(key, value) } catch { /* memory fallback only */ }
  },
  del(key: string) {
    memory.delete(key)
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

export function parseIdentity(text: string): Identity {
  const raw = JSON.parse(text) as Partial<Identity>
  if (raw.v !== 1 || (raw.kind !== 'local' && raw.kind !== 'wallet')) throw new Error('This is not a Sealdrop newsroom file.')
  if (typeof raw.address !== 'string' || !isAddress(raw.address, { strict: false })) throw new Error('The file has no valid address.')
  if (typeof raw.boxSecretKey !== 'string' || typeof raw.boxPublicKey !== 'string' || typeof raw.inboxId !== 'string') throw new Error('The file is incomplete.')
  if (toB64(boxKeyPairFromSecret(fromB64(raw.boxSecretKey)).publicKey) !== raw.boxPublicKey) throw new Error('The decryption key does not match its public key.')
  if (raw.kind === 'local') {
    if (typeof raw.evmPrivateKey !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(raw.evmPrivateKey)) throw new Error('The file has no valid wallet key.')
    if (privateKeyToAccount(raw.evmPrivateKey as Hex).address.toLowerCase() !== raw.address.toLowerCase()) throw new Error('The wallet key does not match the address.')
  }
  return raw as Identity
}

export function loadIdentity(): Identity | null {
  const text = storage.get(IDENTITY)
  if (!text) return null
  try { return parseIdentity(text) } catch { return null }
}

export const saveIdentity = (identity: Identity) => storage.set(IDENTITY, JSON.stringify(identity))
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
export const setLastSeen = (inboxKey: string, block: bigint) => storage.set(`sealdrop:seen:${inboxKey}`, block.toString())

/** Optional RPC override (for example the user's own access-key URL). Stays on this device. */
export const getRpcOverride = () => storage.get('sealdrop:rpc') || undefined
export const setRpcOverride = (url: string) => (url ? storage.set('sealdrop:rpc', url) : storage.del('sealdrop:rpc'))
