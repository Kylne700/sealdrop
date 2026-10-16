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
| F6 | Concurrent batches from one wallet | Medium | The docs' nonce fix stops the collision, but the second `predictEntityKeys` + `executeBatch` batch then reverts on chain (5 of 5 runs) because its predicted key is stale; the docs do not say a prediction holds for one batch in flight only |
| F7 | Public RPC anonymous budget | High | `arkiv_query` costs 100 units against an undocumented anonymous budget of 10,000; only the 429 says so, and the SDK (viem) sleeps through the `Retry-After` (about 30 min) instead of failing |
| F8 | Writes from an account with no GLM | Low | An entity write from an empty account fails as `out of gas: gas required exceeds: N` ("Execution error without revert data" on top), a plain transfer from the same account as geth's `insufficient funds`; an app matching only the usual wording misses the first |

---

## F1. `$createdAt` range filter: node accepts, SDK builder refuses, docs disagree

**Expected.** The docs I started from say `$createdAt` can be filtered on: the hackathon repo's `AGENTS.md`
(Arkiv-Network/global-tour-stop-pre-devcon, line 28:
"no server-side ordering ... sort on the client, **or range-filter on `$createdAt`**"), Start
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

**Actual.** The hackathon repo's `AGENTS.md` (line 33) says a real socket is opened "only with a WebSocket transport and no
`fromBlock`; over HTTP it silently polls". That is correct and matters for a live UI, but none of the
SDK pages say it. (The JSON-RPC Mutating Entities page says watching "rides on the standard `eth_getLogs` and
`eth_subscribe` methods" and that the SDK wraps this in `watchEntityEvents()`, but not that the transport you pass picks
between them.) Measured over 10 seconds, same code, only the transport changed:

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

**Reproduce.** `node -e 'fetch("https://hub.arkiv.network/api/faucet").then(async r=>console.log(r.status, await r.text()))'`
prints `401 {"error":"Unauthorized"}` (checked 2026-10-16). The claim itself needs a browser: sign in with an Ethereum
wallet at https://hub.arkiv.network/faucet and pass the human check; the page then sends the POST to `/api/faucet`.

**Suggested fix.** A documented, rate-limited faucet API (or CLI) for test automation, or a line in the
docs saying the Hub login and Cap widget are browser-only.

---

## F6. Concurrent create batches from one wallet: the documented nonce fix removes the collision, then the second batch reverts on chain

**What the docs say.** The TypeScript SDK *Mutating data* page has a section "Concurrent writes and nonces": two writes in
flight from one wallet fetch the same nonce and collide, "one of them is rejected, or silently replaces the other"; the
preferred fix is one batch, otherwise give the account viem's `nonceManager`, after which "the `Promise.all` above works".
Another section on the same page ("Reference an entity created in the same batch") says "a key is derived from the wallet,
its entity counter and the salt" and shows `predictEntityKeys()` followed by `executeBatch`. Sealdrop needs both: a tip is
created and handed to the inbox owner in one atomic batch, and with the shared demo key two visitors can send at once.

**Expected.** Read together, the two sections say that two concurrent `predictEntityKeys` + `executeBatch` batches from one
wallet both succeed once the account has the nonce manager.

**Actual.** `arkiv/repro/f6-concurrent-batches.mjs` starts two such batches with `Promise.all`.

* **Without the nonce manager** (the case the docs describe; 6 runs,
  [`evidence/f6-no-nonce-manager.txt`](../evidence/f6-no-nonce-manager.txt)): in 3 runs one call failed before broadcast
  with `EntityMutationError: Transaction failed: Execution error without revert data`, whose cause is `Missing or invalid
  parameters.` (no `txHash`, no mention of a nonce). In the other 3 runs **both calls resolved successfully with the same
  transaction hash and the same entity key**, so one caller was told its entity exists when its own write had been
  replaced. An earlier set of 6 runs gave the same two outcomes (5 failures, 1 shared hash,
  `0x049a0c7803ad264ea427d76be321628fbd2b5ec3623f6c8e390f8aa5d451c173`). In each of the 6 runs saved in `evidence/f6-no-nonce-manager.txt` exactly one entity was written; the output of the earlier runs is not in `evidence/`.
* **With the nonce manager** (`NONCE_MANAGER=1`, 5 runs,
  [`evidence/f6-nonce-manager.txt`](../evidence/f6-nonce-manager.txt)): the collision is gone and two transactions with
  different hashes are broadcast, but **in 5 of 5 runs the second one reverted on chain**:
  `Reason: no entity 0x48ee0286…36ee7e — it may have been deleted, or have expired` (`"execute" reverted`). It cost gas and
  its write is lost. In every run the batch that landed first has `entity == predicted`; the reverted one names its own
  predicted key.

**Why (my reading, not verified in the contract).** `predictEntityKeys` is a plain `eth_call` that reads the wallet's entity
counter. Both batches predict while the counter is n. The batch that lands first creates at n and matches its prediction; the
second lands at n+1, so the entity it creates has a different key than the one it predicted, and its `ownershipChanges`
entry names a key that does not exist.

**Not in the docs.** That a prediction is only valid until another create from the same wallet lands, so batches that use
`predictEntityKeys` have to be sent one at a time even with a nonce manager. The revert text ("may have been deleted, or have
expired") does not hint at it. The docs also say the nonce manager covers one process only ("Two processes that write with
the same private key still collide"), which rules it out for Sealdrop's demo mode: the shared demo key is used from many
visitors' browsers.

**Reproduce.** `PRIVATE_KEY=0x... node arkiv/repro/f6-concurrent-batches.mjs`, and again with `NONCE_MANAGER=1` (a funded
Tiramisu key; the recipient needs no funds). Without the flag the mix of outcomes varies from run to run.

**What Sealdrop does about it.** `sendTip` re-predicts the key on every attempt, reads the entity back (4 tries, 400 ms
apart), compares its payload with the bytes it sent, treats a mismatch as "replaced by a concurrent transaction", and retries
with a bounded back-off. The integration run shows both failure modes in one send: attempt 1 failed before broadcast, attempt
2 reverted, a later attempt landed ([`evidence/integration.txt`](../evidence/integration.txt)). See `sendTip` in
[`src/arkiv.ts`](../src/arkiv.ts). A real deployment would put a relayer in front of the shared key, so that one process
sends one batch at a time.

**Suggested fix.** In the docs: say under "Concurrent writes and nonces" that a predicted key is valid only until another
create from the same wallet lands. In the SDK: either queue writes per wallet client, or let `executeBatch` compare the
prediction with the current counter and fail before broadcast with "predicted key is stale", which also saves the gas of the
reverting transaction; and when the receipt belongs to a replacement transaction, throw instead of returning it as the result.

---

## F7. The public RPC meters `arkiv_query` against an undocumented anonymous budget, and the SDK waits out the Retry-After instead of failing

**Expected.** The Access Keys page says a key "raises the rate limits on your calls to the Arkiv RPC", that "each key has a
monthly quota, measured in cost units", and that "you do not need a key to try Arkiv. The public RPC works without one, at the
default rate limit." The same page warns that "anyone can read a key from the network requests of your website", so a static
site has no safe place for a key. I read this as: anonymous use is limited by a requests-per-minute rate, which the `RateLimit`
header shows, and a static site can query within that rate.

**Actual.** There are two limits, and the headers describe only one.

* Every successful `arkiv_query` response carries `ratelimit: limit=600, remaining=599, reset=60`: a per-minute request limit.
* It also carries `arkiv-cost: 100`. The cost was 100 in all five shapes I tried (1 row or 16 rows, key only or with payload,
  `*` or a `$creator` filter; [`evidence/f7-anon-budget.txt`](../evidence/f7-anon-budget.txt)), and in every query the app
  made (its footer showed 6 queries = 600 units). `getEntity` is an `arkiv_query` and costs 100 as well. `eth_call` (which
  `predictEntityKeys` uses), `eth_blockNumber` and plain transfers carried no `arkiv-cost` header.
* Anonymous clients have a budget of 10,000 units, which is about 100 queries. That number appears **only on the 429**,
  which I hit on 2026-10-16 at about 17:31 UTC, after a few scripted test runs of about 19 queries each:

  ```
  HTTP 429   ratelimit: limit=10000, remaining=0, reset=1751   retry-after: 1751
  {"error":"ANON_COST_LIMITED","message":"unauthenticated query budget exhausted; get an API key at https://hub.arkiv.network for a monthly quota"}
  ```

  (Copied from my terminal at 17:32 UTC. Reproducing it takes the whole budget, so the repro script stops before that.)
  Queries worked again at about 18:01 UTC, as `Retry-After` had said. I hit the budget a second time at 18:38 UTC, 37 minutes
  after that reset, in the last step of an integration run (scripted runs of mine had been using it since the reset); my
  `failFast` wrapper reported `retry after 1354 s`, which is a reset at about 19:01:24 UTC. The first one was at about 18:01:22,
  so the window may be an hour long (two data points; not documented). The second limit did lift when its `Retry-After` said: runs
  started at 19:02 UTC went through (at least 3,900 units in the next four minutes, counted by the tab footers and the integration
  script). It is not a plain wall until then, though: at 18:41 UTC,
  three minutes after that second 429, one browser page load of the app saw the HTTP statuses 429, 200, 200 in that order, and
  one metered query (100 units) succeeded. I do not know why (I saw it once, with a throwaway script whose output I did not
  keep). No successful response says how much budget is left.
  `Arkiv-Quota-Used-Percent` is in the `Access-Control-Expose-Headers` list, but I never saw it on an anonymous response.
* None of the documentation pages I downloaded and searched mentions the anonymous budget, the cost per query, `ANON_COST_LIMITED`,
  `Arkiv-Cost` or `Retry-After`; two cookbook pages say only "Anonymous access to the RPC endpoint is rate limited."
* I do not know for certain how long the window is (the two resets above suggest an hour) or what identifies an anonymous
  client (I did not test whether it is the IP address), so I cannot say how many visitors a hosted demo supports.

**The SDK waits.** `client.query()` goes through viem's HTTP transport, which honours `Retry-After` on a 429 and retries
(default `retryCount` 3). The call therefore does not fail, it sleeps: a script of mine sat silent for about 27 minutes
before I killed it. `node arkiv/repro/f7-anon-budget.mjs --local` shows the mechanism without touching Arkiv: a local server
that answers `429` + `Retry-After: 2` makes `query()` reject after 6.0 s (three waits of 2 s); with the real header (1751 s)
that would be about 88 minutes.

**Unconfirmed.** Once, during an integration run, a query failed with `QueryError: Query rejected (cursor, -32005): Request
exceeds defined limit.` and the rerun worked. -32005 is "limit exceeded" in EIP-1474, but I could not reproduce it and do not
know whether it was this budget.

**Reproduce.** `node arkiv/repro/f7-anon-budget.mjs` sends five small queries to the public RPC, prints the `arkiv-*`,
`ratelimit` and `retry-after` headers, and stops at the first 429 without retrying (about 500 units). With `--local` it runs
the fake-429 server and makes no request to Arkiv.

**What Sealdrop does about it.** A custom `fetch` for the HTTP transport (`failFast` in [`src/arkiv.ts`](../src/arkiv.ts))
counts `arkiv-cost` and throws on a 429, so nothing sleeps; `explainError` turns that into "The free query budget of the
public Arkiv RPC is used up (it renews in about N min). Wait a little, or enter your own RPC URL under Settings." New tips
arrive over a WebSocket instead of polling (one entity read per tip); the inbox is swept only when a page opens or the user
presses refresh, and a reconnect asks only for `$createdAt >= <last seen block>` (F1). The footer shows how many queries the
tab has made and what they cost, and Settings (on the newsroom console and on the send page) accepts a custom RPC URL, https only
because the page's Content-Security-Policy blocks anything else. `npm run smoke` checks the message with a faked 429, which costs no
query budget ([`evidence/screens/rate-limited-send.png`](../evidence/screens/rate-limited-send.png)).

**Suggested fix.** Document the anonymous budget (units, cost per query, window, what identifies a client) next to the
Access Keys text; send the remaining budget on every response (for example `Arkiv-Quota-Used-Percent`, which the CORS list
already names); and make the SDK fail fast on a 429 whose `Retry-After` is longer than a few seconds, or expose the retry
options, so a script reports `ANON_COST_LIMITED` instead of hanging.

---

## F8. An entity write from an account with no GLM fails as "out of gas", a plain transfer as "insufficient funds"

**Expected.** One account, one balance, one failure text, whatever it tries to send: geth's `insufficient funds for gas * price
+ value: have 0 want N`. Then an app that wants to tell the user "this wallet has no GLM, use the faucet" needs one check. (This is
my expectation from other EVM nodes; I found no documented error text for this case, but I did not search every docs page for one.)

**Actual.** Throwaway key with 0 GLM on Tiramisu, `@arkiv-network/sdk` 0.8.1, `viem` 2.57.7, nothing is mined either way:

```
plain transfer
  #0 TransactionExecutionError: The total cost (gas * gas fee + value) of executing this transaction exceeds the balance of the account.
      details: insufficient funds for gas * price + value: have 0 want 1
  ...
  #4 TransactionRejectedRpcError: Transaction creation failed.
      details: insufficient funds for gas * price + value: have 0 want 1  (code -32003)
createEntity
  #0 EntityMutationError: Transaction failed: Execution error without revert data
  #1 ContractFunctionExecutionError: Transaction creation failed.
      details: out of gas: gas required exceeds: 0
  ...
  #4 TransactionRejectedRpcError: Transaction creation failed.
      details: out of gas: gas required exceeds: 0  (code -32003)
```

Both are code -32003 from `eth_estimateGas`. For the entity write the number after `exceeds:` is the balance divided by the gas price
(1 gwei), minus one: a key holding 0.000001 GLM got `exceeds: 999`, one holding 0.00002 GLM got `exceeds: 19999`, so a low but
non-zero balance reads like a gas problem as well. The top-level SDK message, "Execution error without revert data", reads like
a contract revert and says nothing about funds; only the deepest `cause` has the words. Sealdrop therefore matches both texts
(`isOutOfFunds` in [`src/arkiv.ts`](../src/arkiv.ts), tested with these captured shapes in `test/errors.test.ts`) and shows
"This wallet has no testnet GLM left" for either.

**Reproduce.** `node arkiv/repro/f8-unfunded-write.mjs` (no funded key; it makes a throwaway one, mines nothing, makes no
`arkiv_query`, so it costs no anonymous budget). Run on 2026-10-16.

**Suggested fix.** Return the same `insufficient funds ... have X want Y` text for entity operations when the balance cannot pay
for the estimate, or at least let `EntityMutationError` carry the deepest message instead of "Execution error without revert
data". The Fundamentals page could list this error next to the revert cases.

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
| WebSocket resilience | Tested on 2026-10-16 by dropping the socket of a newsroom console in headless Chromium 154, through a local proxy in front of the public node: the socket killed and new handshakes refused for 15 s; CDP `offline` for 15 s; the socket left open but silent. With viem 2.57.7's default `webSocket()` reconnect (5 attempts, 2 s apart) the 15 s outage outlasted the retries: the subscription ended with "The socket has been closed" (the page said "Live updates stopped"), and tips sent during and after the outage had not appeared 30 s later; the page does not poll, so only a reload or Refresh would show them. Events are not replayed after a reconnect, so a catch-up read is needed whatever the transport does; `watchEntityEvents` only has `onError`. Sealdrop therefore supervises the socket itself (reconnect off, backoff, a heartbeat, one `$createdAt` query after each reconnect) and passes all three scenarios ([evidence/qa.md](../evidence/qa.md)). Chromium's CDP `offline` did not close an already open socket, so that scenario is not a real drop. I did not test the old behaviour for an outage shorter than viem's retry window (viem may reconnect by itself, but nothing replays the events of the gap), and the drops were injected by a local proxy, not a real Wi-Fi change, sleep or node restart. |
| WebSocket push in a browser | `watchEntityEvents` over a WebSocket works from a page in headless Chromium 154: a tip sent from one browser context showed up in the newsroom tab 3.1 s after the Send click (the sender's own page confirmed after 5.6 s), and the app marks it as arrived by push ([`evidence/smoke.txt`](../evidence/smoke.txt)). Browser, Node and the standalone reader all talk to the same public node without a proxy. |
| Injected wallet | The SDK's wallet client works with an EIP-1193 provider on `window.ethereum`. This was tested with a scripted stand-in (`scripts/wallet-shim.ts`, signs with a Node-held key), not a real browser extension: the tip was created with the provider's address as `$creator`. |
