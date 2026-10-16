// Everything Sealdrop does on Arkiv. Shared by the browser app and the Node scripts, so the
// integration test exercises exactly the code the UI runs. No environment access in here.
import { createPublicClient, createWalletClient, ExpirationTime, type PublicArkivClient, type WalletArkivClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { key as keyAttr, u64 } from '@arkiv-network/sdk/attr'
import { and, eq, lt } from '@arkiv-network/sdk/query'
import { custom, http, parseEther, webSocket, type Address, type EIP1193Provider, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { APP, CHAIN_ID, FUND_AMOUNT_GLM, INBOX_LIFETIME_DAYS, PAGE_SIZE, RENEW_BELOW_DAYS, RPC_HTTP, RPC_WS, TIP_LIFETIME_CHOICES } from './config'
import { INBOX_CONTENT_TYPE, TIP_CONTENT_TYPE, daysToBlocks, decodeInbox, encodeInbox, inboxAttributes, tipAttributes, type InboxPayload, type InboxRef, type Timing } from './codec'

// ---- clients ----------------------------------------------------------------------------------------

/** Cost units the public RPC reports for the queries this page has run (headers `Arkiv-Cost` and `RateLimit`). */
export const budget = { spent: 0, queries: 0, limit: 0, remaining: 0 }

/** Thrown instead of waiting: see failFast. */
export class RateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`RATE_LIMITED: the public RPC budget is spent, retry after ${retryAfterSeconds} s`)
  }
}

/**
 * Anonymous queries draw on a cost budget. When it is spent the node answers 429 with a Retry-After of
 * about half an hour, and viem honours that header, so every call would hang for that long (friction F7).
 * This fetch fails at once instead, so the UI can say what happened.
 */
const failFast: typeof fetch = async (input, init) => {
  const res = await fetch(input, init)
  const cost = Number(res.headers.get('arkiv-cost'))
  if (cost > 0) { budget.spent += cost; budget.queries++ }
  const m = /limit=(\d+), remaining=(\d+)/.exec(res.headers.get('ratelimit') ?? '')
  if (m && cost > 0) { budget.limit = Number(m[1]); budget.remaining = Number(m[2]) }
  if (res.status === 429) throw new RateLimitedError(Number(res.headers.get('retry-after')) || 0)
  return res
}
const httpTransport = (url: string) => http(url, { fetchFn: failFast, timeout: 20_000, retryCount: 1 })

export type Reader = { http: PublicArkivClient; ws: () => PublicArkivClient }

/** Queries go over HTTP; live events use a separate WebSocket client (created on first use). */
export function createReader(opts: { rpcUrl?: string; wsUrl?: string } = {}): Reader {
  const httpClient = createPublicClient({ chain: tiramisu, transport: httpTransport(opts.rpcUrl ?? RPC_HTTP) })
  let wsClient: PublicArkivClient | undefined
  return { http: httpClient, ws: () => (wsClient ??= createPublicClient({ chain: tiramisu, transport: webSocket(opts.wsUrl ?? RPC_WS) })) }
}

export type Signer = { address: Address; client: WalletArkivClient; kind: 'local' | 'injected' }

export function localSigner(privateKey: Hex, rpcUrl: string = RPC_HTTP): Signer {
  const account = privateKeyToAccount(privateKey)
  return { address: account.address, client: createWalletClient({ chain: tiramisu, transport: httpTransport(rpcUrl), account }), kind: 'local' }
}

const CHAIN_HEX = '0x' + CHAIN_ID.toString(16)

/** Connects an injected EIP-1193 wallet (MetaMask etc.) and makes sure it is on Tiramisu. */
export async function injectedSigner(provider: EIP1193Provider): Promise<Signer> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as Address[]
  const address = accounts[0]
  if (!address) throw new Error('The wallet returned no account.')
  const current = (await provider.request({ method: 'eth_chainId' })) as string
  if (current.toLowerCase() !== CHAIN_HEX) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] })
    } catch {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: CHAIN_HEX, chainName: 'Arkiv Tiramisu', nativeCurrency: { name: 'GLM', symbol: 'GLM', decimals: 18 }, rpcUrls: [RPC_HTTP], blockExplorerUrls: ['https://tiramisu.explorer.arkiv.network'] }],
      })
    }
  }
  return { address, client: createWalletClient({ chain: tiramisu, transport: custom(provider), account: address }), kind: 'injected' }
}

// ---- small utilities --------------------------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Several visitors share the demo key, so nonces (tx nonce and entity nonce) can collide. */
const RETRYABLE = /nonce|underpriced|replace|already known|not found|EntityNotFound|no entity|concurrent|timed out|timeout|429|rate limit|Missing or invalid parameters/i

/** Scripts set this to record which errors made a write retry (used as evidence in the integration test). */
export const retryHook: { onRetry?: (attempt: number, message: string) => void } = {}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const text = `${(e as Error)?.message ?? e} ${(e as { cause?: Error })?.cause?.message ?? ''}`
      if (i >= attempts || !RETRYABLE.test(text)) throw e
      retryHook.onRetry?.(i, text.split('\n')[0]?.slice(0, 200) ?? '')
      await sleep(400 * i + Math.random() * 600)
    }
  }
}

/** One line a person can act on. */
export function explainError(e: unknown): string {
  for (let cur: unknown = e, i = 0; cur && i < 8; i++, cur = (cur as { cause?: unknown }).cause) {
    if (cur instanceof RateLimitedError) {
      const mins = Math.max(1, Math.ceil(cur.retryAfterSeconds / 60))
      return `The free query budget of the public Arkiv RPC is used up${cur.retryAfterSeconds ? ` (it renews in about ${mins} min)` : ''}. Wait a little, or enter your own RPC URL under Settings.`
    }
  }
  const err = e as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number; message?: string } }
  const text = `${err?.shortMessage ?? ''} ${err?.message ?? ''} ${err?.cause?.message ?? ''}`
  if (err?.code === 4001 || err?.cause?.code === 4001 || /user rejected|denied/i.test(text)) return 'The request was rejected in the wallet.'
  if (/insufficient funds|exceeds the balance|have no (testnet )?GLM/i.test(text)) return 'This wallet has no testnet GLM left. Get some at the Arkiv faucet (hub.arkiv.network/faucet).'
  const first = (err?.shortMessage ?? err?.message ?? String(e)).split('\n')[0] ?? 'Unknown error'
  return first.length > 240 ? first.slice(0, 240) + '...' : first
}

export async function getTiming(reader: Reader): Promise<Timing> {
  const t = await reader.http.getBlockTiming()
  return { head: t.currentBlock, headTime: Number(t.currentBlockTime), blockSeconds: Number(t.blockDuration) }
}

// ---- inbox ------------------------------------------------------------------------------------------

export type InboxView = {
  key: Hex
  owner: Address
  creator: Address
  createdAt: bigint
  expiresAt: bigint
  payload: InboxPayload
}

type Row = { key?: Hex; owner?: Hex; creator?: Hex; createdAt?: bigint; expiresAt?: bigint; payload?: Uint8Array; attributes?: Record<string, { value: unknown }> }

function toInbox(row: Row): InboxView | null {
  if (!row.key || !row.owner || !row.creator || row.createdAt === undefined || row.expiresAt === undefined || !row.payload) return null
  const payload = decodeInbox(row.payload)
  return payload ? { key: row.key, owner: row.owner, creator: row.creator, createdAt: row.createdAt, expiresAt: row.expiresAt, payload } : null
}

const INBOX_SELECT = { key: true, owner: true, creator: true, createdAt: true, expiresAt: true, payload: true } as const

/**
 * Looks an inbox up by who created it. `$creator` is set by the protocol and cannot be forged, so a
 * stranger cannot publish an inbox under the newsroom's link. Returns the newest valid match.
 */
export async function findInbox(reader: Reader, ref: InboxRef): Promise<{ inbox: InboxView | null; matches: number; query: string }> {
  const builder = reader.http
    .select(INBOX_SELECT)
    .where(eq('type', 'inbox'), eq('app', APP), eq('inbox_id', ref.inboxId))
    .createdBy(ref.creator)
    .limit(20)
  const query = builder.toString()
  const page = await builder.fetch()
  const found = (page.entities as readonly Row[]).map(toInbox).filter((i): i is InboxView => i !== null).sort((a, b) => Number(b.createdAt - a.createdAt))
  return { inbox: found[0] ?? null, matches: found.length, query }
}

/** All inboxes this address created that are still alive. */
export async function listInboxes(reader: Reader, creator: Address): Promise<{ inboxes: InboxView[]; query: string }> {
  const builder = reader.http.select(INBOX_SELECT).where(eq('type', 'inbox'), eq('app', APP)).createdBy(creator).limit(50)
  const page = await builder.fetch()
  const inboxes = (page.entities as readonly Row[]).map(toInbox).filter((i): i is InboxView => i !== null)
  return { inboxes, query: builder.toString() }
}

/**
 * The lease check: which of my inboxes have less than RENEW_BELOW_DAYS left? A numeric range query on
 * `$expiresAt`, which the protocol sets, so no extra attribute is needed.
 */
export async function inboxesDueForRenewal(reader: Reader, creator: Address, timing: Timing, belowDays: number = RENEW_BELOW_DAYS): Promise<{ inboxes: InboxView[]; query: string }> {
  const threshold = timing.head + daysToBlocks(belowDays)
  const builder = reader.http
    .select(INBOX_SELECT)
    .where(eq('type', 'inbox'), eq('app', APP), lt('$expiresAt', u64(threshold)))
    .createdBy(creator)
    .limit(50)
  const page = await builder.fetch()
  return { inboxes: (page.entities as readonly Row[]).map(toInbox).filter((i): i is InboxView => i !== null), query: builder.toString() }
}

export function createInbox(signer: Signer, p: { inboxId: string; name: string; description: string; publicKey: Uint8Array }) {
  return signer.client.createEntity({
    payload: encodeInbox(p),
    contentType: INBOX_CONTENT_TYPE,
    attributes: inboxAttributes(p.inboxId),
    expires: ExpirationTime.fromDays(INBOX_LIFETIME_DAYS),
  })
}

/** Lifetime Extension: the new expiry counts from now, it is not added to what is left. */
export function renewInbox(signer: Signer, entityKey: Hex) {
  return signer.client.extendEntity({ entityKey, expires: ExpirationTime.fromDays(INBOX_LIFETIME_DAYS) })
}

// ---- tips -------------------------------------------------------------------------------------------

/** A cursor can expire between two pages (docs: "restart from page one"); walk again, at most twice. */
async function restartOnCursorError<T>(walk: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await walk()
    } catch (e) {
      if (attempt >= 3 || (e as { kind?: string }).kind !== 'cursor') throw e
      retryHook.onRetry?.(attempt, 'pagination cursor rejected (-32005), walking the pages again')
    }
  }
}

export type TipView = {
  key: Hex
  owner: Address
  creator: Address
  createdAt: bigint
  expiresAt: bigint
  sealed: Uint8Array
  inbox: Hex | undefined
}

const TIP_SELECT = { key: true, owner: true, creator: true, createdAt: true, expiresAt: true, payload: true, attributes: true } as const

function toTip(row: Row): TipView | null {
  if (!row.key || !row.owner || !row.creator || row.createdAt === undefined || row.expiresAt === undefined || !row.payload) return null
  if (row.attributes?.type?.value !== 'tip') return null
  const inbox = row.attributes?.inbox?.value
  return { key: row.key, owner: row.owner, creator: row.creator, createdAt: row.createdAt, expiresAt: row.expiresAt, sealed: row.payload, inbox: typeof inbox === 'string' ? (inbox as Hex) : undefined }
}

/**
 * Sends a sealed tip. One atomic batch: create the tip (readonly) and hand it to the inbox owner.
 * `$creator` stays the sender, `$owner` becomes the newsroom, so the shared demo key can no longer
 * delete or extend anyone's tip, and the newsroom can burn or pin it.
 */
export function sendTip(reader: Reader, signer: Signer, inbox: InboxView, sealed: Uint8Array, lifetimeDays: (typeof TIP_LIFETIME_CHOICES)[number]) {
  return withRetry(async () => {
    // Re-predicted on every attempt: another sender using the same key moves the entity nonce.
    const [predicted] = await reader.http.predictEntityKeys({ owner: signer.address, count: 1 })
    const result = await signer.client.executeBatch({
      creates: [{ payload: sealed, contentType: TIP_CONTENT_TYPE, attributes: tipAttributes(inbox.key), expires: ExpirationTime.fromDays(lifetimeDays), flags: { readonly: true }, salt: predicted.salt }],
      ownershipChanges: [{ entityKey: predicted.key, newOwner: inbox.owner }],
    })
    const entityKey = result.createdEntities[0] as Hex
    // Two sends with the same nonce can replace each other and both callers get the survivor's receipt.
    // Reading the tip back and comparing the bytes catches a write that was silently dropped.
    let stored: { payload?: Uint8Array } | null = null
    for (let i = 0; i < 4 && !stored; i++) {
      if (i) await sleep(400)
      stored = (await reader.http.getEntity(entityKey).catch(() => null)) as { payload?: Uint8Array } | null
    }
    if (!stored?.payload || stored.payload.length !== sealed.length || !stored.payload.every((b, i) => b === sealed[i])) {
      throw new Error('This tip was replaced by a concurrent transaction from the same sender key')
    }
    return { entityKey, txHash: result.txHash }
  })
}

async function allPages(first: () => Promise<{ entities: readonly unknown[]; cursor: string | undefined }>, next: (cursor: string) => Promise<{ entities: readonly unknown[]; cursor: string | undefined }>, maxPages: number) {
  const rows: Row[] = []
  let page = await first()
  for (let i = 0; ; i++) {
    rows.push(...(page.entities as readonly Row[]))
    if (!page.cursor || i + 1 >= maxPages) return { rows, truncated: Boolean(page.cursor) }
    page = await next(page.cursor)
  }
}

const tipFilter = (inboxKey: Hex) => and(eq('type', 'tip'), eq('app', APP), eq('inbox', keyAttr(inboxKey)))

/** Full sweep: every tip that references this inbox, cursor-paginated 200 at a time. */
export function sweepTips(reader: Reader, inboxKey: Hex, opts: { maxPages?: number; pageSize?: number } = {}): Promise<{ tips: TipView[]; query: string; truncated: boolean; pages: number }> {
  const { maxPages = 10, pageSize = PAGE_SIZE } = opts
  const builder = reader.http.select(TIP_SELECT).where(tipFilter(inboxKey)).limit(pageSize)
  const query = builder.toString()
  return restartOnCursorError(async () => {
    const rows: Row[] = []
    let page = await builder.fetch()
    let pages = 1
    let truncated = false
    for (;;) {
      rows.push(...(page.entities as readonly Row[]))
      if (!page.hasNextPage()) break
      if (pages >= maxPages) { truncated = true; break }
      page = await page.next()
      pages++
    }
    return { tips: rows.map(toTip).filter((t): t is TipView => t !== null), query, truncated, pages }
  })
}

/**
 * Incremental query: tips created at or after a block. `$createdAt` is set by the protocol, so a
 * sender cannot hide a tip from this query by lying in an attribute. The node accepts the filter but
 * the SDK builder refuses it (friction F1), so the clause is appended to the builder's query string
 * and sent through client.query().
 */
export function tipsSince(reader: Reader, inboxKey: Hex, sinceBlock: bigint, maxPages = 10): Promise<{ tips: TipView[]; query: string }> {
  const query = `${tipFilter(inboxKey).toString()} AND $createdAt >= u64(${sinceBlock})`
  return restartOnCursorError(async () => {
    const { rows } = await allPages(
      () => reader.http.query(query, { select: TIP_SELECT, limit: PAGE_SIZE }),
      (cursor) => reader.http.query(query, { select: TIP_SELECT, limit: PAGE_SIZE, cursor }),
      maxPages,
    )
    return { tips: rows.map(toTip).filter((t): t is TipView => t !== null), query }
  })
}

/**
 * Reads one entity and returns it only if it is a tip for one of the given inboxes. A pushed event can
 * arrive a moment before the indexer serves the entity, so a miss is retried briefly.
 */
export async function getTip(reader: Reader, entityKey: Hex, inboxKeys: Hex[], tries = 4): Promise<TipView | null> {
  for (let i = 0; i < tries; i++) {
    const entity = (await reader.http.getEntity(entityKey).catch(() => null)) as Row | null
    if (entity) {
      const tip = toTip(entity)
      return tip && tip.inbox && inboxKeys.some((k) => k.toLowerCase() === tip.inbox!.toLowerCase()) ? tip : null
    }
    await sleep(400)
  }
  return null
}

/**
 * Live: the sender's batch ends with an OwnershipTransferred to the newsroom, so that is the event to
 * wait for. Events carry no attributes, so the handler reads the entity with getEntity. Needs the
 * WebSocket transport and no fromBlock (friction F2), otherwise the SDK silently polls.
 */
export function watchHandovers(reader: Reader, newsroom: Address, h: { onHandover: (entityKey: Hex, blockNumber: bigint) => void; onError: (e: Error) => void }): () => void {
  return reader.ws().watchEntityEvents({
    onOwnershipTransferred: (e) => {
      if (e.newOwner.toLowerCase() === newsroom.toLowerCase()) h.onHandover(e.entityKey, e.blockNumber)
    },
    onError: h.onError,
  })
}

/** Burn after reading: only the owner (the newsroom after the hand-over) can delete. */
export const burnTip = (signer: Signer, entityKey: Hex) => signer.client.deleteEntity({ entityKey })

/** Keep a tip longer than the source asked for: the owner may extend. */
export const pinTip = (signer: Signer, entityKey: Hex, days: number) => signer.client.extendEntity({ entityKey, expires: ExpirationTime.fromDays(days) })

// ---- funding (plain GLM transfer; Tiramisu accepts them, see friction F4) ---------------------------

export function fundAccount(from: Signer, to: Address, amountGlm: string = FUND_AMOUNT_GLM) {
  return withRetry(async () => {
    const hash = await from.client.sendTransaction({ to, value: parseEther(amountGlm), chain: tiramisu, account: from.client.account! })
    await from.client.waitForTransactionReceipt({ hash })
    return hash
  })
}

export const balanceOf = (reader: Reader, address: Address) => reader.http.getBalance({ address })
