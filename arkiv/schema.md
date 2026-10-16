# Sealdrop data contract (`app = sealdrop-v1`)

Everything Sealdrop stores lives in two Arkiv entity types on the Tiramisu testnet (chain id 7738577). This file is the
contract: another team can read the data, send tips, or build a different newsroom UI from it without asking anyone and
without any Sealdrop server. A breaking change would ship under a new `app` value (`sealdrop-v2`), so `sealdrop-v1`
entities keep their meaning.

Block numbers: `$createdAt` and `$expiresAt` are block numbers (2 s blocks, 43,200 per day), not timestamps.

## Entity types

| | `inbox` | `tip` |
|---|---|---|
| Meaning | A newsroom's public mailbox: name, description, public key. | One sealed message from a source. |
| `$creator` | The newsroom address (its link names it). | The sender (a wallet, or the shared demo sender). |
| `$owner` | The newsroom. | The newsroom, after a hand-over in the same transaction. |
| Content type | `application/json` | `application/octet-stream` |
| Creation flags | none | `readonly` (the sealed bytes can never be rewritten) |
| Entity Expiration | **7 days**, renewed by Lifetime Extension | **chosen by the source: 1, 7, 14 or 30 days** (default 14) |
| Who may extend or delete | the owner (newsroom) | the owner (newsroom): "Keep 30 more days" or "Burn" |

### Attributes (typed, all lowercase: the engine rejects uppercase names)

Only what a query needs is an attribute; everything else is in the payload.

| Entity | Attribute | Type | Value |
|---|---|---|---|
| `inbox` | `type` | string | `inbox` |
| `inbox` | `app` | string | `sealdrop-v1` |
| `inbox` | `inbox_id` | string | `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$`, chosen by the newsroom; part of the inbox link |
| `tip` | `type` | string | `tip` |
| `tip` | `app` | string | `sealdrop-v1` |
| `tip` | `inbox` | entity key | the `inbox` entity this tip is for |

A tip has three attributes and nothing else. There is no sender field, no timestamp attribute (use the protocol's
`$createdAt`), no size or topic.

### Payloads

**Inbox payload** (public, UTF-8 JSON):

```json
{ "v": 1, "name": "Synthetic demo newsroom", "description": "Demo inbox. Please send made-up test messages only.", "pk": "<base64 of the 32-byte X25519 public key>" }
```

`name` is 1 to 80 characters, `description` 0 to 500. Both are public: anyone can read them in the Data Explorer.

**Tip payload** (opaque ciphertext, the "sealed box"):

```
offset  size  field
0       1     version, 0x01
1       32    ephemeral X25519 public key (fresh for every tip)
33      24    nonce (random)
57      n+16  nacl.box(padded plaintext, nonce, recipient public key, ephemeral secret key)
```

`nacl.box` is X25519 + XSalsa20-Poly1305 (tweetnacl `nacl.box`). The sender keeps no key, so it cannot read the tip
again after sending.

The plaintext is padded to a bucket of 1,024, 4,096, 16,384 or 65,536 bytes: `uint32 big-endian length` followed by the
message, then zeros. A sealed tip is therefore 1,097, 4,169, 16,457 or 65,609 bytes, so the length reveals only a size
class. The message itself is UTF-8 JSON `{ "v": 1, "text": "<the tip>" }` (at most 65,532 bytes with the JSON wrapper).

## Inbox links

`<site>/#/send/<creator address>/<inbox_id>`. The page looks the inbox up by `inbox_id` **and** `$creator`, so nobody
can publish a look-alike under a newsroom's link: `$creator` is set by the protocol and cannot be forged.

## What a reader must check

Anyone can create an entity with `app = sealdrop-v1`. A correct reader therefore applies these rules:

1. An **inbox** is the newest entity with `type = inbox`, the `inbox_id` from the link, **and `$creator` equal to the
   address in the link**. Its payload must parse as above (valid `pk`).
2. A **tip** for an inbox is an entity with `type = tip`, `inbox = <inbox key>` and **`$owner` equal to the inbox owner**.
   An entity that only mentions the inbox and was never handed over is spam: the newsroom cannot burn it, so it is
   ignored.
3. A tip counts only if its payload opens with the inbox's secret key. Anything else is shown as undecryptable.

## Queries the app runs

Every query string below is shown verbatim in the app's "Queries this page runs" panel.

| # | Where | Query | Notes |
|---|---|---|---|
| 1 | Send page, newsroom console | `type = str('inbox') AND app = str('sealdrop-v1') AND inbox_id = str('<id>') AND $creator = addr(<creator>)` | Finds the inbox by on-chain creator. Limit 20, newest valid match wins. |
| 2 | Newsroom console, on open | `type = str('inbox') AND app = str('sealdrop-v1') AND $expiresAt < u64(<head + 6 days>) AND $creator = addr(<newsroom>)` | Lease check: a range query on the protocol's `$expiresAt` finds every inbox of this creator that needs a Lifetime Extension. |
| 3 | Newsroom console, on open and Refresh | `type = str('tip') AND app = str('sealdrop-v1') AND inbox = key(<inbox key>) AND $owner = addr(<newsroom>)` | Cursor-paginated, 200 per page. |
| 4 | Newsroom console, tab visible again after 30 s or more, and once after the live feed has reconnected | query 3 `AND $createdAt >= u64(<last swept block - 2>)` | Incremental: only tips created since the last sweep. |
| 5 | Send page, "What can anyone see" | `type = str('tip') AND app = str('sealdrop-v1') AND inbox = key(<inbox key>)` | Limit 5, without the owner filter: the public view. |

Live updates are not queries: the console opens `watchEntityEvents` over a WebSocket and reacts to
`onOwnershipTransferred` where `newOwner` is the newsroom (the last step of the sender's batch). Events carry no
attributes, so the handler then reads the entity by key. Events are not replayed, so when the socket drops the console says
"Reconnecting", retries on its own with a growing delay (1 s, 2 s, 4 s ... at most 30 s) and, once the new socket is
subscribed, runs query 4 once to pick up the tips it missed. A 30-second heartbeat (`eth_blockNumber`) notices a socket that
is still open but no longer delivers anything.

## Writes

* **Create inbox**: one `createEntity` by the newsroom (payload, attributes above, Entity Expiration 7 days).
* **Renew inbox**: `extendEntity` with 7 days. Lifetime Extension *sets* a new expiry: it counts from the moment of the
  call, it is not added to the time that is left, and it reverts if the new expiry is not later than the current one.
* **Send tip**: one atomic `executeBatch` by the sender containing a `create` (sealed payload, three attributes, Entity
  Expiration 1 to 30 days, `readonly`) and an `ownershipChange` of the new entity to the inbox owner. The entity key is
  predicted first (`predictEntityKeys`) so both operations can sit in one batch. Either both happen or neither does.
* **Keep / burn**: the newsroom (now `$owner`) calls `extendEntity` (30 days) or `deleteEntity`.

## Read it without Sealdrop

Plain JSON-RPC, no SDK, no Sealdrop server:

```sh
curl -s https://rpc.tiramisu.db-chain.testnet.arkiv.network -H 'content-type: application/json' -d '{
  "jsonrpc":"2.0","id":1,"method":"arkiv_query",
  "params":["type = str('"'"'tip'"'"') AND app = str('"'"'sealdrop-v1'"'"') AND inbox = key(0x65a2d0b97fe693af3916c4a954564dda4d44a584ee4ec206454ac9c0148c25a1)",
            {"limit":"0xc8","select":{"key":true,"owner":true,"creator":true,"payload":true}}]}'
```

The result is `{ "data": [{ "key", "owner", "creator", "payload": "0x..." }], "cursor": ... }`; pass the cursor back as
`params[1].cursor` for the next page. `arkiv/examples/read-tips.mjs` is a short reader that shares no code with the app:
it queries as above and decrypts with tweetnacl from this document alone.

The entities are also browsable without any code: `https://data.arkiv.network/entity/<key>` and
`https://data.arkiv.network/owner/<address>`.

## Building on it

* **A different newsroom UI or a notifier**: run queries 1 and 3, and subscribe to ownership events for the newsroom.
* **Another sender** (a CLI, a browser extension, a relayer that pays the gas): seal as above, then send the batch from
  "Writes". Anyone who follows this file produces tips the existing consoles open.
* **Fan-out tools** (one newsroom, several inboxes): query 2 shows how to find every inbox of a creator that is due.

## What is deliberately not on Arkiv

* Private keys: the newsroom's decryption key and signing key stay in its browser (an exported key file is the only copy).
* Plaintext: a message is sealed in the sender's browser; no server and no chain node ever sees it.
* The source's identity: there is no account, no wallet requirement and no sender field. In demo mode every source shares
  one testnet address; in wallet mode the source's address is public as `$creator` (the page says so before sending).
* Analytics: none. The app has no backend to log anything.

## Known limits of the format

* The `inbox` attribute shows how many tips an inbox has and when they arrived, to anyone.
* Ciphertext stays in chain history after Entity Expiration. Expiry removes the entity from queries; it does not erase
  history. Strong encryption is what protects an expired tip.
* A tip cannot be retracted by its sender once it is handed over; the newsroom (owner) may burn it or keep it longer.
* The inbox name and description are public.
