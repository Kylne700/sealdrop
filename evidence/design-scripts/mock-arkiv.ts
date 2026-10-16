// Design-screenshot harness only. build-mock.sh copies this file next to the app sources of a throwaway
// tree, where it stands in for src/arkiv.ts, so the before/after screens cost no RPC queries.
// The scenario comes from window.__MOCK (set by shoot.mjs). Tips are sealed for real with the app's own
// crypto, so the console decrypts them through the normal code path.
import { getAddress, parseEther, type Address, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DEMO_SENDER_ADDRESS } from './config'
import { daysToBlocks } from './codec'
import { fromB64, sealText, toB64 } from './crypto'
import { RateLimitedError, budget } from 'real-arkiv'
import type { InboxView, Reader, Signer, TipView } from 'real-arkiv'
export { budget, RateLimitedError, explainError, isOutOfFunds, retryHook, withRetry } from 'real-arkiv'

type MockTip = { text: string; ageMin: number; days: number; mine?: boolean; demo?: boolean; bad?: boolean; live?: boolean }
type Mock = { inbox?: 'ok' | 'none' | 'setup' | 'risky' | 'hang' | 'limited'; tips?: MockTip[]; live?: 'live' | 'reconnecting' | 'connecting'; sendMs?: number; sendFail?: string; budget?: [number, number] }
const cfg = () => ({ inbox: 'ok', tips: [] as MockTip[], live: 'live', sendMs: 700, ...((window as unknown as { __MOCK?: Mock }).__MOCK ?? {}) }) as Required<Pick<Mock, 'inbox' | 'tips' | 'live' | 'sendMs'>> & Mock
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const HEAD = 1_000_000n
const DAY = daysToBlocks(1)
const fake = (seed: number, bytes = 32): Hex => {
  let x = (seed * 2654435761) >>> 0 || 1
  let out = '0x'
  for (let i = 0; i < bytes; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out += (x & 255).toString(16).padStart(2, '0') }
  return out as Hex
}
const addr = (seed: number) => getAddress(fake(seed, 20))
const identity = () => { try { return JSON.parse(localStorage.getItem('sealdrop:newsroom:v1') ?? 'null') as { address: Address; boxPublicKey: string } | null } catch { return null } }
const INBOX_KEY = fake(1)
{ const b = cfg().budget; if (b) { budget.queries = b[0]; budget.spent = b[1] } }

export const createReader = (): Reader => ({ http: {}, ws: () => ({}), dropWs() {} }) as never
export const getTiming = async () => ({ head: HEAD, headTime: Math.floor(Date.now() / 1000), blockSeconds: 2 })

function inboxView(creator: Address, kind: string): InboxView {
  return {
    key: INBOX_KEY, creator, owner: kind === 'risky' ? addr(9) : creator, createdAt: HEAD - DAY, expiresAt: HEAD + (kind === 'risky' ? DAY / 3n : DAY * 6n + DAY / 2n),
    payload: { v: 1, name: 'Synthetic demo newsroom', description: 'Demo inbox. Please send made-up test messages only.', pk: identity()?.boxPublicKey ?? toB64(new Uint8Array(32).fill(7)) },
  }
}

export async function findInbox(_r: Reader, ref: { creator: Address; inboxId: string }) {
  const c = cfg()
  const query = `type = "inbox" && app = "sealdrop-v1" && inbox_id = "${ref.inboxId}" && $creator = ${ref.creator}`
  if (c.inbox === 'hang') await new Promise(() => {})
  if (c.inbox === 'limited') throw new RateLimitedError(1354)
  if (c.inbox === 'none' || c.inbox === 'setup') return { inbox: null, matches: 0, query }
  return { inbox: inboxView(ref.creator, c.inbox), matches: 1, query }
}
export const listInboxes = async () => ({ inboxes: [] as InboxView[], query: 'mock' })
export const inboxesDueForRenewal = async () => ({ inboxes: [] as InboxView[], query: 'type = "inbox" && app = "sealdrop-v1" && $creator = 0x... && $expiresAt < 1086400' })

function toView(t: MockTip, i: number): TipView {
  const id = identity()
  const pk = id ? fromB64(id.boxPublicKey) : new Uint8Array(32).fill(7)
  return {
    key: fake(100 + i), owner: t.mine === false ? addr(3) : (id?.address ?? addr(2)), creator: t.demo === false ? addr(40 + i) : (DEMO_SENDER_ADDRESS as Address),
    createdAt: HEAD - BigInt(Math.round((t.ageMin * 60) / 2)), expiresAt: HEAD + daysToBlocks(t.days),
    sealed: t.bad ? new Uint8Array(1024 + 73).map((_, k) => (k * 31 + i) & 255) : sealText(t.text, pk), inbox: INBOX_KEY,
  }
}
const allTips = () => cfg().tips.map((t, i) => ({ t, v: toView(t, i) }))
export async function sweepTips() {
  return { tips: allTips().filter((x) => !x.t.live).map((x) => x.v), query: 'type = "tip" && app = "sealdrop-v1" && inbox = "0x3a3e..." && $owner = 0x...', truncated: false, pages: 1 }
}
export const tipsSince = async () => ({ tips: [] as TipView[], query: 'type = "tip" && app = "sealdrop-v1" && $createdAtBlock >= 999998' })
export const getTip = async (_r: Reader, key: Hex) => allTips().find((x) => x.v.key === key)?.v ?? null

export function watchHandovers(_r: Reader, _n: Address, h: { onHandover: (k: Hex) => void; onState?: (s: 'live' | 'reconnecting') => void }) {
  const timer = setTimeout(() => {
    const live = cfg().live
    if (live !== 'connecting') h.onState?.(live)
    for (const x of allTips()) if (x.t.live) setTimeout(() => h.onHandover(x.v.key), 250)
  }, 150)
  return () => clearTimeout(timer)
}

const demoKey = import.meta.env.VITE_DEMO_SENDER_PRIVATE_KEY as string | undefined
export const localSigner = (key: Hex): Signer => ({ address: key === demoKey ? (DEMO_SENDER_ADDRESS as Address) : privateKeyToAccount(key).address, client: {} as never, kind: 'local' })
export const injectedSigner = async (): Promise<Signer> => ({ address: addr(5), client: {} as never, kind: 'injected' })
export async function sendTip(_r: Reader, _s: Signer, _i: InboxView, _sealed: Uint8Array, days: number) {
  await wait(cfg().sendMs)
  if (cfg().sendFail) throw new Error(cfg().sendFail)
  return { entityKey: fake(200), txHash: fake(201), expiresAt: HEAD + daysToBlocks(days) }
}
export const createInbox = async () => { await wait(300) }
export const renewInbox = async () => { await wait(300) }
export const burnTip = async () => { await wait(300) }
export const pinTip = async () => { await wait(300) }
export const fundAccount = async () => { await wait(300) }
export const balanceOf = async () => parseEther('0.0472')
