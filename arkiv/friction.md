# Arkiv friction report (Sealdrop)

Every entry below was observed while building Sealdrop on the Tiramisu testnet, with the scripts in
[`arkiv/repro/`](./repro) or the transaction hashes given. Nothing here is hypothetical. The log is
appended to as the build goes on; the last section lists what was checked and found smooth.

**Environment.** `@arkiv-network/sdk` 0.8.1, `viem` 2.57.7, Node v24.18.0, Tiramisu (chain id
7738577), public RPC without an access key, 2026-10-16. Faucet automation used Chromium 154 and
`puppeteer-core` 25.14.0.

| # | Where | Severity | One line |
|---|-------|----------|----------|
| F1 | SDK query builder vs node vs docs | Medium | `$createdAt` range filters work on the node, but the SDK builder refuses to build them and the docs contradict each other |
| F2 | Live Events docs | Medium | Docs describe only polling; a real WebSocket push is possible but the page never says how |
| F3 | SDK validator vs engine | Medium | The SDK accepts uppercase attribute names and its error text lists `A-Z` as valid; the engine rejects them |
| F4 | Fundamentals page | Low | "Every other transaction reverts" is not what happens for a plain GLM transfer |
| F5 | Faucet | Low | Only usable from an interactive browser session, no scriptable path for CI or agents |

---

## F1. `$createdAt` range filter: node accepts, SDK builder refuses, docs disagree

**Expected.** The docs I started from say `$createdAt` can be filtered on: the repo `AGENTS.md`
("no server-side ordering ... sort on the client, **or range-filter on `$createdAt`**"), Start
here > Fundamentals ("`$owner`, `$creator`, `$createdAt`, `$updatedAt`, and `$expiresAt` ... You can
query them") and the JSON-RPC Querying Data page (table of synthetic attributes: `$createdAt | u64 |
Filterable: Yes`). A "tips since my last visit" query is the obvious use.

**Actual.** The TypeScript builder throws before the request leaves the process:

```
InvalidPredicateError: "$createdAt" is returned in query results but carries no index, so it cannot
be filtered on. Select it and filter the results in JavaScript instead.
```

The TypeScript SDK > Querying Data page agrees with the SDK ("The other system fields, `$createdAt`,
`$updatedAt`, `$creationFlags`, `$contentType` and `$payload`, carry no index and cannot be filtered
on"), so three pages say it works and one says it does not. The node itself accepts the filter: the same
predicate sent as a raw query string through `client.query(...)` (the SDK's documented escape hatch)
returns correct results in 150 to 170 ms (4 runs each; plain `$createdAt >= u64(head-20)`,
`$creator = addr(..) AND $createdAt >= ..`, and `type = str(..) AND $createdAt >= ..`). The JSON-RPC
page also lists `$contentType` as filterable; that works the same way.

**Reproduce.** `node arkiv/repro/f1-createdat-filter.mjs` (read-only, no key). Output on 2026-10-16:

```
builder : InvalidPredicateError - "$createdAt" is returned in query results but carries no index ...
raw query string via client.query(): 5 entities, first createdAt = 660338
```

**Impact on Sealdrop.** The incremental "new tips since block N" query uses the raw-string form,
because `$createdAt` is set by the protocol and cannot be forged, unlike a self-reported timestamp
attribute. A full paginated sweep is the fallback if the node ever stops accepting it.

**Suggested fix.** Either let the builder emit `$createdAt` / `$contentType` predicates (the node
supports them), or correct the JSON-RPC table, Fundamentals and `AGENTS.md` so that all four sources
say the same thing.

## F2. `watchEntityEvents`: docs describe polling, the real socket is undocumented

**Expected.** From the Live Events page: "It polls the chain for new events", every example uses
`transport: http()`, and the options table has `pollingInterval` ("Defaults to half a block"). I
expected to build a live inbox with polling and no way to avoid it.

**Actual.** `AGENTS.md` says a real socket is opened "only with a WebSocket transport and no
`fromBlock`; over HTTP it silently polls". That is correct and matters for a live UI, but none of the
SDK pages say it. Measured over 10 seconds, same code, only the transport changed:

```
http      10s: 6 events; RPC calls sent: {"eth_newFilter":1,"eth_blockNumber":3,"eth_getLogs":1}
websocket 10s: 8 events; RPC calls sent: {"eth_subscribe":1,"eth_unsubscribe":1}
```

With `webSocket()` the SDK subscribes once to the Arkiv operation address
(`0x4400000000000000000000000000000000000044`) and the node pushes; events arrive in one batch per
2 s block.

**Reproduce.** `node arkiv/repro/f2-watch-transport.mjs`.

**Suggested fix.** One sentence and one `transport: webSocket()` example on the Live Events page,
including that `fromBlock` switches back to polling.

## F3. Attribute names: the SDK allows uppercase, the engine rejects it

**Expected.** The SDK's own client-side check (`InvalidAttributeNameError`) says: "Names must be 1-32
bytes, start with a letter, and contain only A-Z, a-z, 0-9, ".", "-" or "_". Names are
case-sensitive." The JSON-RPC Mutating Entities page says the same ("a letter, then letters, digits,
`.`, `-`, or `_`. Names are case-sensitive"). So I wrote `sentAt`.

**Actual.** `createEntity` passes the SDK check and then fails at the engine with
`Ident32InvalidByte(4, 0x41)`, and the SDK explains the failure with the contradiction that "A" "is
outside the name charset ("A"-"Z", "a"-"z", ...)":

```
sent_at  OK     tx 0x34b5c672a3864b3854360215ca96c2c6be6a4416d09807ddcedf881caab1be65
sentAt   FAILED EntityMutationError txHash: (none, rejected before broadcast)
         Transaction failed: an attribute name holds "A" (0x41) at byte 4, which is outside the name
         charset ("A"-"Z", "a"-"z", "0"-"9", ".", "-" and "_", with a letter first)
```

Only the TypeScript SDK > Mutating Data page is right ("a lowercase letter first ... Uppercase letters
are rejected, so write names in snake_case"; its error table also lists `Ident32InvalidByte` for an
uppercase letter). Three sources (SDK validator, SDK revert text, JSON-RPC page) disagree with the
engine and with one page.

**Reproduce.** `PRIVATE_KEY=0x... node arkiv/repro/f3-uppercase-attribute-name.mjs` (needs a funded
Tiramisu key; the failing call is rejected before broadcast, so it costs nothing).

**Cost to me.** One failed batch and a lookup through three pages. The failure showed up only on the
first on-chain write, after the whole attribute schema had been designed.

**Suggested fix.** Make `InvalidAttributeNameError` reject uppercase (it would then fail before any
network call) and correct the charset in the revert text and the JSON-RPC page.

## F4. "Every other transaction reverts": a plain GLM transfer succeeds

**Expected.** Start here > Fundamentals: "No smart contracts, by construction. A transaction is
accepted only if its `to` address is a known Arkiv operation address. Every other transaction
reverts." I read that as: wallets cannot send each other GLM, so a funder wallet could not top up the
demo wallets and I planned for a faucet claim per wallet.

**Actual.** A plain value transfer between two externally owned accounts is mined and succeeds
(21,000 gas, ordinary EIP-1559 transaction):

| from | to | value | tx | block |
|------|----|-------|----|-------|
| `0x9606dB647383Bf71604B6C855aB3B3D92675cD64` | `0xa05d5Bd99440d95526120062364518ddfe11797F` | 3 GLM | `0x812389f2cad62267681aee52dd1cc82866555c5697728f843926096b46cd6e00` | 660047 |
| `0x9606dB647383Bf71604B6C855aB3B3D92675cD64` | `0x6a3C43407F58B11E871310cE296eb3bF1a3fdcF6` | 3 GLM | `0x446a3355972dd5d1bd21d7b1e81a7fdc8e79a47d15ced9cfa357ce8ee8cb769d` | 660064 |

This is good news (an app can fund a fresh browser wallet, which Sealdrop does), but the sentence is
wrong or at least ambiguous. Presumably it means contract calls and deployments.

**Reproduce.** `viem` `walletClient.sendTransaction({ to, value })` on chain 7738577 from any funded
key; view either hash on `https://tiramisu.explorer.arkiv.network/tx/<hash>`.

**Suggested fix.** "Calls to any other contract address revert" (or whatever is actually enforced),
and say that plain GLM transfers are supported.

## F5. The faucet needs an interactive browser session

**Expected.** A way for scripts and agents to fund a throwaway key, e.g. an HTTP endpoint with the
access key.

**Actual.** `GET https://hub.arkiv.network/api/faucet` answers 401 without a session. A claim needs a
Sign-In-With-Ethereum login through the Hub UI (RainbowKit wallet picker) and a proof-of-work "Verify
you're human" widget (Cap), then `POST /api/faucet`. There is no documented API route, so a headless
build had to drive a real browser. What worked (Chromium 154 + `puppeteer-core`): an EIP-1193 test
wallet injected via EIP-6963 that answers `personal_sign` with the funder key. Announcing it as
MetaMask (`io.metamask`) made RainbowKit wait forever on "Opening MetaMask...", so the shim has to use
a generic `rdns`.

**Result.** One claim for the funder wallet: 10 GLM per claim, "Cooldown: 1 hour per wallet", the
POST returned 202, `delivered: true` after about 5 s, tx
`0x33de0cc6473a8325538252243687c653878e01d9c38775ca457ea5aedb29975f`. No e-mail step was shown in
this flow. I claimed once and did not retry.

**Suggested fix.** A documented, rate-limited faucet API (or CLI) for test automation, or a line in the
docs saying the Hub login and Cap widget are browser-only.

---

## Checked and found smooth

These were verified with the same rigour as the problems above, so they count as documented paths.

| Area | Result |
|------|--------|
| Public RPC without an access key | `eth_chainId`, `eth_blockNumber`, `eth_gasPrice`, `arkiv_query` and the WebSocket all work unauthenticated, as the Access Keys page says. Responses carry `ratelimit: limit=600, remaining=598, reset=48` and `access-control-allow-origin: *`, so a static site can call the RPC directly from the browser. |
| Read-after-write | `getEntity` returned the entity 147 ms after the receipt of the creating transaction; one `createEntity` or `executeBatch` call takes about 5 s end to end (receipt wait included) with 2 s blocks. |
| Cost | One create with a 1 KiB payload and one attribute used 101,768 gas, 0.000102 GLM at 1 gwei (tx `0x818b4da076f3b4f8fccafd3cd1c2a5523948bf97e973175a00a43743ef6be8aa`). A 10 GLM faucet claim funds roughly 100,000 such writes, so cost never limited the design. |
| Create and hand over in one atomic batch | `predictEntityKeys` + `executeBatch({ creates: [{ salt, flags: { readonly: true } }], ownershipChanges: [{ entityKey: predicted, newOwner }] })` worked first try (tx `0xa69fd26e434600191c138f956896f8c63fab3e9e8c3629ab5daa7eb6dfb09c9f`). `$creator` stayed the sender, `$owner` became the recipient. |
| Revert messages for ownership and read-only entities | Specific and actionable: "entity 0x66ad0703...bfee11 is owned by 0x6a3C..., not 0xa05d...", and "was created readonly, so its contents can never change. Its expiry can still be extended, and it can be transferred or deleted". Behaviour matched: after the hand-over the old owner could not patch, delete or extend; the new owner could extend and delete but not patch. |
| Deleted entity | `getEntity` throws "No live entity with key ... It was never created, or it has been deleted or has expired." |
| Documented query limits | `!=` and `exists(...)` fail with a clear JSON-RPC error (-32002, "write NOT (attr = value)" / "the index has no per-attribute presence set in this version"), exactly as the Querying Data pages say the network behaves. |
| Explorer deep links | `https://tiramisu.explorer.arkiv.network/tx/<hash>`, `/address/<addr>`, `https://data.arkiv.network/entity/<key>` and `/owner/<addr>` all render the object from the hash alone. |
| WebSocket resilience | viem's `webSocket()` transport reconnects by default (5 attempts, 2 s delay, 30 s keep-alive) and re-subscribes after a reconnect. |
