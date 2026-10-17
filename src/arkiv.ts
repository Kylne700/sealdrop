// Everything Sealdrop does on Arkiv. Shared by the browser app and the Node scripts, so the
// integration test exercises exactly the code the UI runs. No environment access in here.
import { createPublicClient, createWalletClient, ExpirationTime, type PublicArkivClient, type WalletArkivClient } from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { key as keyAttr, u64 } from '@arkiv-network/sdk/attr'
import { and, eq, lt } from '@arkiv-network/sdk/query'
import { custom, http, parseEther, webSocket, type Address, type EIP1193Provider, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { APP, CHAIN_ID, FUND_AMOUNT_GLM, INBOX_LIFETIME_DAYS, PAGE_SIZE, RENEW_BELOW_DAYS, RPC_HTTP, RPC_WS, TIP_LIFETIME_CHOICES } from './config'
import { INBOX_CONTENT_TYPE, TIP_CONTENT_TYPE, daysToBlocks, decodeInbox, encodeInbox, inboxAttributes, inboxPublicKey, keyFingerprint, tipAttributes, type InboxPayload, type InboxRef, type Timing } from './codec'

// ---- clients ----------------------------------------------------------------------------------------

/** Cost units the public RPC reports for the queries this page has run (header `Arkiv-Cost`). */
export const budget = { spent: 0, queries: 0 }

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
  if (res.status === 429) throw new RateLimitedError(Number(res.headers.get('retry-after')) || 0)
  return res
}
const httpTransport = (url: string) => http(url, { fetchFn: failFast, timeout: 20_000, retryCount: 1 })

export type Reader = { http: PublicArkivClient; ws: () => PublicArkivClient; dropWs: () => void }

/** Queries go over HTTP; live events use a separate WebSocket client (created on first use). */
export function createReader(opts: { rpcUrl?: string; wsUrl?: string } = {}): Reader {
  const httpClient = createPublicClient({ chain: tiramisu, transport: httpTransport(opts.rpcUrl ?? RPC_HTTP) })
  let wsClient: PublicArkivClient | undefined
  return {
    http: httpClient,
    // viem retries a dropped socket five times and then gives up for good, silently (see watchHandovers), so it is switched off here.
    ws: () => (wsClient ??= createPublicClient({ chain: tiramisu, transport: webSocket(opts.wsUrl ?? RPC_WS, { reconnect: false }) })),
    // viem keeps a dead socket client in a module cache until it is closed, so the next ws() would reuse it.
    dropWs: () => {
      const old = wsClient as { transport: { getRpcClient?: () => Promise<{ close(): void }> } } | undefined
      wsClient = undefined
      old?.transport.getRpcClient?.().then((c) => c.close(), () => {})
    },
  }
}

export type Signer = { address: Address; client: WalletArkivClient; kind: 'local' | 'injected' }

export function localSigner(privateKey: Hex, rpcUrl: string = RPC_HTTP): Signer {
  const account = privateKeyToAccount(privateKey)
  return { address: account.address, client: createWalletClient({ chain: tiramisu, transport: httpTransport(rpcUrl), account }), kind: 'local' }
}

const CHAIN_HEX = '0x' + CHAIN_ID.toString(16)

/** Calls `onSent` when the wallet has answered a transaction request, i.e. the user confirmed it (or it threw). */
export function notifyOnSend(provider: EIP1193Provider, onSent: () => void): EIP1193Provider {
  return { ...provider, request: (async (args: { method: string }) => {
    const res = await provider.request(args as never)
    if (args.method === 'eth_sendTransaction') onSent()
    return res
  }) as EIP1193Provider['request'] }
}

/** Connects an injected EIP-1193 wallet (MetaMask etc.) and makes sure it is on Tiramisu. */
export async function injectedSigner(provider: EIP1193Provider, onSent?: () => void): Promise<Signer> {
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as Address[]
  const address = accounts[0]
  if (!address) throw new Error('The wallet returned no account. Unlock the wallet and allow this page to connect, then try again.')
  const chainId = async () => ((await provider.request({ method: 'eth_chainId' })) as string).toLowerCase()
  if ((await chainId()) !== CHAIN_HEX) {
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] })
    } catch (e) {
      if ((e as { code?: number })?.code === 4001) throw e // the user said no: do not ask again with a second prompt
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: CHAIN_HEX, chainName: 'Arkiv Tiramisu', nativeCurrency: { name: 'GLM', symbol: 'GLM', decimals: 18 }, rpcUrls: [RPC_HTTP], blockExplorerUrls: ['https://tiramisu.explorer.arkiv.network'] }],
      })
    }
    // Some wallets add the network without switching to it.
    if ((await chainId()) !== CHAIN_HEX) throw new Error(`Your wallet is on a different network. Switch it to Arkiv Tiramisu (chain id ${CHAIN_ID}) and try again.`)
  }
  return { address, client: createWalletClient({ chain: tiramisu, transport: custom(onSent ? notifyOnSend(provider, onSent) : provider), account: address }), kind: 'injected' }
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

const errorText = (e: unknown) => {
  const err = e as { shortMessage?: string; message?: string; cause?: { message?: string } }
  return `${err?.shortMessage ?? ''} ${err?.message ?? ''} ${err?.cause?.message ?? ''}`
}

/** The signer cannot pay the gas. The pages say whose GLM ran out: the visitor's wallet or the shared demo key. */
export const isOutOfFunds = (e: unknown) => /insufficient funds|exceeds the balance|out of gas|gas required exceeds|have no (testnet )?GLM/i.test(errorText(e))

/** The RateLimitedError somewhere in the cause chain (viem wraps the one failFast throws), if any. */
export function rateLimit(e: unknown): RateLimitedError | undefined {
  for (let cur: unknown = e, i = 0; cur && i < 8; i++, cur = (cur as { cause?: unknown }).cause) if (cur instanceof RateLimitedError) return cur
}

/** One line a person can act on. */
export function explainError(e: unknown): string {
  const limited = rateLimit(e)
  if (limited) {
    const mins = Math.max(1, Math.ceil(limited.retryAfterSeconds / 60))
    return `The free query budget of the public Arkiv RPC is used up${limited.retryAfterSeconds ? ` (it renews in about ${mins} min)` : ''}. Wait a little, or enter your own RPC URL under Settings.`
  }
  for (let cur: unknown = e, i = 0; cur && i < 8; i++, cur = (cur as { cause?: unknown }).cause) {
    const status = (cur as { status?: unknown }).status
    if (typeof status === 'number' && status >= 500 && status < 600) return `The Arkiv RPC is having trouble (HTTP ${status}). Try again in a minute, or use another RPC under Settings.`
  }
  const err = e as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number; message?: string } }
  const text = errorText(e)
  if (err?.code === 4001 || err?.cause?.code === 4001 || /user rejected|denied/i.test(text)) return 'The request was rejected in the wallet.'
  if (isOutOfFunds(e)) return 'This wallet has no testnet GLM left. Get some at the Arkiv faucet (hub.arkiv.network/faucet).'
  const first = (err?.shortMessage ?? err?.message ?? String(e)).split('\n')[0] ?? 'Unknown error'
  const cut = first.length > 240 ? first.slice(0, 240) + '...' : first
  return `${cut.replace(/\.?$/, '.')} Try again; if it keeps failing, reload the page or set your own RPC under Settings.`
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

const isHex = (v: unknown, bytes: number): v is Hex => typeof v === 'string' && new RegExp(`^0x[0-9a-fA-F]{${bytes * 2}}$`).test(v)
/** The RPC's answer is checked field by field, so one malformed row is skipped instead of breaking the whole list. */
const wellFormed = (row: Row): row is Row & Required<Omit<Row, 'attributes'>> => isHex(row.key, 32) && isHex(row.owner, 20) && isHex(row.creator, 20) && typeof row.createdAt === 'bigint' && typeof row.expiresAt === 'bigint' && row.payload instanceof Uint8Array

function toInbox(row: Row): InboxView | null {
  if (!wellFormed(row)) return null
  const payload = decodeInbox(row.payload)
  return payload ? { key: row.key, owner: row.owner, creator: row.creator, createdAt: row.createdAt, expiresAt: row.expiresAt, payload } : null
}

const INBOX_SELECT = { key: true, owner: true, creator: true, createdAt: true, expiresAt: true, payload: true } as const

/**
 * Looks an inbox up by who created it. `$creator` is set by the protocol and cannot be forged, so a
 * stranger cannot publish an inbox under the newsroom's link. Returns the newest valid match.
 * The RPC could still lie, so rows from another creator are dropped here, and a link that carries a key
 * fingerprint (`ref.fp`) only accepts an inbox whose key matches it: keyMismatch says one was refused.
 */
export async function findInbox(reader: Reader, ref: InboxRef): Promise<{ inbox: InboxView | null; matches: number; query: string; keyMismatch: boolean }> {
  const builder = reader.http
    .select(INBOX_SELECT)
    .where(eq('type', 'inbox'), eq('app', APP), eq('inbox_id', ref.inboxId))
    .createdBy(ref.creator)
    .limit(20)
  const query = builder.toString()
  const page = await builder.fetch()
  const found = (page.entities as readonly Row[]).map(toInbox)
    .filter((i): i is InboxView => i !== null && i.creator.toLowerCase() === ref.creator.toLowerCase())
    .sort((a, b) => Number(b.createdAt - a.createdAt))
  const keyed = ref.fp ? found.filter((i) => keyFingerprint(inboxPublicKey(i.payload)) === ref.fp) : found
  return { inbox: keyed[0] ?? null, matches: found.length, query, keyMismatch: found.length > 0 && keyed.length === 0 }
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
  if (!wellFormed(row)) return null
  if (row.attributes?.type?.value !== 'tip') return null
  const inbox = row.attributes?.inbox?.value
  return { key: row.key, owner: row.owner, creator: row.creator, createdAt: row.createdAt, expiresAt: row.expiresAt, sealed: row.payload, inbox: isHex(inbox, 32) ? inbox : undefined }
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
    let stored: { payload?: Uint8Array; expiresAt?: bigint } | null = null
    for (let i = 0; i < 4 && !stored; i++) {
      if (i) await sleep(400)
      stored = (await reader.http.getEntity(entityKey).catch(() => null)) as { payload?: Uint8Array; expiresAt?: bigint } | null
    }
    if (!stored?.payload || stored.payload.length !== sealed.length || !stored.payload.every((b, i) => b === sealed[i])) {
      throw new Error('This tip was replaced by another transaction from the same sender key, so it was not sent. Send it again.')
    }
    return { entityKey, txHash: result.txHash, expiresAt: stored.expiresAt }
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

/** The tip query for one inbox. With `owner` it only matches tips already handed to that address ($owner). */
const tipQuery = (reader: Reader, inboxKey: Hex, owner?: Address) => {
  const builder = reader.http.select(TIP_SELECT).where(tipFilter(inboxKey))
  return owner ? builder.ownedBy(owner) : builder
}

/**
 * Full sweep: every tip that references this inbox, cursor-paginated 200 at a time. The newsroom console
 * passes `owner`, so entities that merely point at the inbox without being handed over never show up.
 */
export function sweepTips(reader: Reader, inboxKey: Hex, opts: { maxPages?: number; pageSize?: number; owner?: Address } = {}): Promise<{ tips: TipView[]; query: string; truncated: boolean; pages: number }> {
  const { maxPages = 10, pageSize = PAGE_SIZE, owner } = opts
  const builder = tipQuery(reader, inboxKey, owner).limit(pageSize)
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
export function tipsSince(reader: Reader, inboxKey: Hex, sinceBlock: bigint, opts: { maxPages?: number; owner?: Address } = {}): Promise<{ tips: TipView[]; query: string }> {
  const query = `${tipQuery(reader, inboxKey, opts.owner).toString()} AND $createdAt >= u64(${sinceBlock})`
  return restartOnCursorError(async () => {
    const { rows } = await allPages(
      () => reader.http.query(query, { select: TIP_SELECT, limit: PAGE_SIZE }),
      (cursor) => reader.http.query(query, { select: TIP_SELECT, limit: PAGE_SIZE, cursor }),
      opts.maxPages ?? 10,
    )
    return { tips: rows.map(toTip).filter((t): t is TipView => t !== null), query }
  })
}

/**
 * Reads one entity and returns it only if it is a tip for one of the given inboxes. A pushed event can
 * arrive a moment before the indexer serves the entity, so a miss is retried briefly. A spent query budget
 * is thrown at once (no retry: each one would cost more), so the caller can say so and read the tip later.
 */
export async function getTip(reader: Reader, entityKey: Hex, inboxKeys: Hex[], tries = 4): Promise<TipView | null> {
  for (let i = 0; i < tries; i++) {
    const entity = (await reader.http.getEntity(entityKey).catch((e) => { if (rateLimit(e)) throw e; return null })) as Row | null
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
 *
 * A socket drops (Wi-Fi change, sleep, node restart) and events during the gap are not replayed, so this
 * reconnects with backoff (1 s doubling to 30 s), reports 'live' / 'reconnecting', and calls `onReconnect`
 * once the subscription is back so the caller can read what it missed with one query. A heartbeat over
 * the same socket (eth_blockNumber every 30 s, not an arkiv_query) notices a socket that died silently.
 */
export function watchHandovers(reader: Reader, newsroom: Address, h: {
  onHandover: (entityKey: Hex, blockNumber: bigint) => void
  onError: (e: Error) => void
  onState?: (state: 'live' | 'reconnecting') => void
  onReconnect?: () => void
}): () => void {
  let stopped = false
  let dropped = false
  let failures = 0
  let unwatch = () => {}
  let retry: ReturnType<typeof setTimeout> | undefined
  let beat: ReturnType<typeof setInterval> | undefined
  const connect = () => {
    if (stopped) return
    const ws = reader.ws()
    let down = false
    const lost = () => {
      if (down || stopped) return
      down = true
      clearInterval(beat)
      void Promise.resolve().then(unwatch).catch(() => {})
      reader.dropWs()
      dropped = true
      h.onState?.('reconnecting')
      retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** failures++))
    }
    unwatch = ws.watchEntityEvents({
      onOwnershipTransferred: (e) => {
        if (e.newOwner.toLowerCase() !== newsroom.toLowerCase()) return
        try { h.onHandover(e.entityKey, e.blockNumber) } catch (err) { h.onError(err as Error) }
      },
      onError: lost, // the SDK only reports socket and subscription failures here
    })
    // Answers once the socket is open (after the subscribe request on it) and fails when it is not.
    const probe = () => ws.getBlockNumber({ cacheTime: 0 }).then(() => undefined, lost)
    void probe().then(() => {
      if (down || stopped) return
      failures = 0
      h.onState?.('live')
      if (dropped) h.onReconnect?.()
      beat = setInterval(probe, 30_000)
    })
  }
  connect()
  return () => { stopped = true; clearTimeout(retry); clearInterval(beat); void Promise.resolve().then(unwatch).catch(() => {}) }
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
