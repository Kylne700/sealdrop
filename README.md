# Sealdrop

**An anonymous, self-expiring encrypted tip line. SecureDrop's idea, without the servers.**

A source seals a message in the browser. A newsroom opens it with a key only the newsroom holds. Everything in between
is ciphertext in Arkiv, the Web3 database, and every tip expires on the date its source chose. There is no backend, no
account, and no operator who holds the messages or the keys.

* Live app: {{LIVE_URL}}
* Demo video (3 minutes or less): {{VIDEO_URL}}
* Data contract (entity types, attributes, wire format, queries): [arkiv/schema.md](arkiv/schema.md)
* Friction report (real, with versions and repro scripts): [arkiv/friction.md](arkiv/friction.md)
* Evidence (real output from the Tiramisu testnet, committed so it survives Entity Expiration): [evidence/](evidence/)

Built for the Arkiv Global Tour Stop, entered in all four pillars: Privacy, Censorship Resistance, Security, Open Source.
Testnet only. **Send made-up messages only.**

## The problem

A source with something a newsroom should know needs a way to hand it over without being identified. The standard answer
is [SecureDrop](https://securedrop.org/directory/), "an open-source whistleblower submission system that media
organizations can install to securely accept documents from anonymous sources". It works, and it is expensive to run:
its [own installation guide](https://docs.securedrop.org/en/stable/admin/installation/hardware.html) requires an
application server, a monitor server, a dedicated network firewall, and air-gapped machines that boot to Tails, all as
physical hardware the organization hosts itself. It explains why: cloud servers are "trivially accessible and
manipulable by the provider", and a host can be compelled to give access, "potentially with a gag order attached". The
public directory lists 24 instances (checked 2026-10-16).

So a small newsroom, a student paper, or a freelancer without that budget has no safe channel to offer, and their
sources fall back to email, which tells a mail provider who wrote to whom. And every inbox that is run as a server is a
single place to seize, subpoena or switch off.

Sealdrop removes the server. What reaches the network is ciphertext only, so there is nothing for an operator to
read, hand over, or quietly stop serving, and a newsroom needs nothing but a browser.

What Sealdrop does *not* replace is the rest of SecureDrop's hardening: there is no air gap and no Tails workstation. See
the [threat model](#threat-model-read-this-before-sending-anything-real).

## Try it in 60 seconds (no wallet, no account)

1. Open the app and choose **Start: open a newsroom**, then **Create a throwaway newsroom**. The page makes a key in your
   browser and funds it with 0.005 testnet GLM from the shared demo key. Name the inbox; copy the inbox link.
2. Open that link in **another tab** (it is a different "source"). Write a made-up message and press **Seal and send**.
3. Switch back to the first tab. The tip appears within seconds, pushed over a WebSocket (the console does not poll),
   and is decrypted locally. The source's tab shows the entity and transaction links.

Or follow **Send a made-up tip to the Demo Desk** on the home page: a flagship inbox run by a separate address whose key is not part
of this repository or the build. Open the entity link on the Data Explorer to see what anyone can see: ciphertext and
three attributes.

Measured on 2026-10-16 by a headless Chromium run against the built site and the live testnet ([evidence/smoke.txt](evidence/smoke.txt)):
creating the newsroom takes under a second (no network), creating the inbox 15.0 s (two transactions and the first look-up),
and the decrypted tip appeared in the newsroom tab 3.1 s after Send was clicked. The whole path took 20.4 s.

## What is on Arkiv, and what is not

| On Arkiv (public) | Never on Arkiv |
|---|---|
| Inbox entity: name, description, the newsroom's **public** key, `inbox_id`. | Any private key (the newsroom's keys stay in its browser; export is a button). |
| Tip entity: sealed bytes, padded to a size class, and three attributes (`type`, `app`, `inbox`). | The message text (sealed in the sender's browser). |
| Protocol fields: `$creator`, `$owner`, `$createdAt`, `$expiresAt`. | A sender field, a name, an email, a topic, a timestamp of ours. |
| | Analytics, logs, accounts: there is no backend to hold them. |

Details and the exact byte layout: [arkiv/schema.md](arkiv/schema.md).

## Why Arkiv, and what each feature does for the user

The idea needs three things at once: a place anyone can write to without an account, a place only the newsroom can
read (by key), and data that disappears on a schedule nobody operating a server can quietly change. Take Arkiv away and
each of those becomes an operator you have to trust:

* **Own API or Postgres**: whoever runs it can read metadata, be compelled to hand over rows, drop tips silently, or
  keep "deleted" ones. Auto-deletion is a promise there. Here Entity Expiration is enforced by the protocol.
* **IPFS**: content stays as long as anyone pins it, there is no expiry, no query by creator or owner and no live
  notification, so you would need an indexing server to find an inbox's tips. That server is the operator again.
* **A subgraph or indexer**: you trust the indexer to be honest and online, and `$creator` (who really created an
  inbox) has to come from somewhere you can verify. The app queries the node directly and relies on the protocol's
  `$creator`.

| Arkiv feature | What the user sees | Code |
|---|---|---|
| Lookup by `$creator` (`createdBy`) | A source opens a newsroom's link and only that address's inbox loads. A look-alike inbox with the same id under another address never shows, and the page prints the creator. | `findInbox` in [src/arkiv.ts](src/arkiv.ts) |
| Atomic batch: create plus ownership change | One click makes the tip and hands it to the newsroom in one transaction. The shared demo key can no longer delete or extend anyone's tip; the newsroom can keep or burn it. | `sendTip` in [src/arkiv.ts](src/arkiv.ts) |
| Query by `$owner` | The console shows only tips handed to the newsroom. A stranger can create an entity that mentions the inbox, but it never appears. | `sweepTips` in [src/arkiv.ts](src/arkiv.ts) |
| Entity Expiration per type | The source picks 1, 7, 14 or 30 days and sees the exact expiry on the result screen. The inbox itself lives for 7 days. | `sendTip`, `createInbox` |
| Lifetime Extension as a lease | The console renews the inbox whenever the newsroom opens it, so an abandoned or seized inbox falls off by itself and sources see "no live inbox" instead of writing into it. "Keep 30 more days" extends a single tip. | `renewInbox`, `pinTip` |
| Range query on `$expiresAt` | One query finds every inbox of this creator that has less than 6 days left. | `inboxesDueForRenewal` |
| `watchEntityEvents` over WebSocket | The tip shows up in the open console within seconds, with no polling (the socket itself costs no queries; reading the new tip afterwards is one). If the connection drops the page says "Reconnecting", retries with a growing delay and, once it is back, makes one catch-up query, so a tip sent during the outage still appears without a refresh. | `watchHandovers` |
| Cursor pagination | The console loads inboxes with more than 200 tips. | `sweepTips` |
| Range query on `$createdAt` | When you return to the tab it fetches only tips created since the last sweep. | `tipsSince` |
| `readonly` creation flag | The sealed bytes of a tip cannot be rewritten by anyone, including the key that created it. | `sendTip` |
| Plain JSON-RPC (`arkiv_query`) | Anyone can read and decrypt a newsroom's tips with a 43-line script and no Sealdrop code. | [arkiv/examples/read-tips.mjs](arkiv/examples/read-tips.mjs) |

Every page has a **Queries this page runs** panel showing the exact query strings, and the footer shows how much of the
public RPC's anonymous query budget the tab has used (see [friction F7](arkiv/friction.md)). When that budget is spent the page
says so at once and offers Settings, where a visitor can paste their own RPC URL.

## Threat model (read this before sending anything real)

**What it protects**

* The text of a tip is sealed in the sender's browser (X25519 + XSalsa20-Poly1305, a fresh ephemeral key per tip) and
  padded to one of four size classes. Only the newsroom's secret key opens it. No server and no chain node sees plaintext.
* There is no operator holding messages or keys, so there is no one to compel and nothing to seize.
* The source chooses the retention limit; the protocol enforces it. An inbox that is no longer renewed disappears.
* Nobody can publish a look-alike under a newsroom's link: the page checks the inbox's on-chain `$creator`.

**What it does not protect**

* **Your network address.** The RPC node (and a WebSocket) sees your IP. Use Tor Browser if that matters.
* **History.** After Entity Expiration the entity is gone from queries, but the ciphertext stays in chain history. If the
  newsroom's key is ever stolen, anyone who archived the chain can open old tips. Expiry limits exposure; it does not
  erase history, and the encryption is what protects an expired tip. There is no forward secrecy for the newsroom key.
* **On-chain metadata.** The `inbox` attribute shows how many tips an inbox received and when, to anyone. The size class
  is visible. In demo mode every source shares one public testnet address, which hides *who* sent but not *that* a tip
  arrived. In wallet mode the tip's `$creator` is your wallet address: use a fresh wallet, funded in a way that cannot be
  tied to you.
* **Timing.** Someone watching the chain can correlate when a tip arrived with other events.
* **The demo key is public on purpose.** Demo mode ships a testnet-only sender key in the page so a visitor needs no
  wallet. Anyone can lift it out of the bundle and spend its faucet GLM or spam inboxes (the console ignores entities
  that were not handed to the newsroom, but the public view would show them). Production would use a relayer or a
  paymaster; the key holds nothing of value.
* **Retraction.** A source cannot retract a tip after it is handed over. The newsroom (the owner) can extend it, so
  "expiry the source controls" applies to the initial lifetime.
* **Public inbox text.** An inbox's name and description are public; the UI warns the newsroom.
* **Trust in the JavaScript you load.** The page's code comes from whoever hosts it, and a malicious host could serve
  modified code that reads a message before it is sealed. Mitigations: the code is open source, a strict Content
  Security Policy limits what the page can load, and you can run it yourself (`npm run dev`) or host your own copy.
  Signed releases and reproducible builds are not done.
* **The Demo Desk is not a real newsroom.** The builder holds its key and reads what arrives. Test messages only.
* **Your device.** Browser history, malware, screenshots, a stolen laptop, and clearing site data (which deletes an
  un-exported newsroom key) are outside this tool.

## Run it yourself

```sh
npm ci
npm run dev        # http://localhost:5173; without .env.local this is wallet mode only (see Demo mode)
npm test           # unit tests: crypto and codec
npm run build      # type check, then static dist/ for any static host
BASE_PATH=/sealdrop/ npm run build   # when served below a path, e.g. GitHub Pages /<repo>/
```

The app is plain static files plus the three dependencies `@arkiv-network/sdk`, `viem` and `tweetnacl`.

**Demo mode** (no wallet for the source) needs a funded testnet-only sender key *at build time*. The key is not in this
repository; it is injected from `.env.local` and exists only in the bundle you build.

*What a judge needs, exactly.* Node 22.12 or newer (run on 22.23 and 24.18; `package.json` `engines` follows what vite, vitest and
puppeteer-core declare) and npm. Without `.env.local`, `npm ci`, `npm test`, `npm run build` and `npm run dev` all work
(`npm run check:bundle` prints `SKIP`), but the site is wallet mode only: the shared-demo-key send and the throwaway
newsroom answer that the build has no demo key. (npm 11.16 prints an `allow-scripts` warning about esbuild's postinstall
during `npm ci`; ignore it, the install, tests and build pass without that script.) For demo mode put one line in
`.env.local` at the repository root and restart `npm run dev`:

```
VITE_DEMO_SENDER_PRIVATE_KEY=0x<64 hex characters>
```

Use the private key of a testnet account that holds a little testnet GLM (claim some at the faucet below) and nothing
else: the key ships in the bundle. Measured on 2026-10-16: a throwaway newsroom costs that key 0.005021 GLM (0.005
funding plus the transfer's gas) and each tip about 0.00013 GLM, so a full try-out is about 0.0053 GLM. The Demo Desk
needs nothing more (`VITE_DEMO_DESK_ADDRESS` is optional and defaults to the hosted one). `npm run keys` below writes
such a file with fresh keys.

```sh
npm run keys                  # writes .env.local (git-ignored, mode 600) with fresh testnet keys; prints addresses only
# Claim testnet GLM for the FUNDER address once at https://hub.arkiv.network/faucet, then:
npm run ops -- fund sender 1  # send 1 GLM from the funder to the demo sender
npm run ops -- desk-create    # optional: create your own Demo Desk inbox (point VITE_DEMO_DESK_ADDRESS at it)
npm run build && npm run check:bundle
```

`check:bundle` fails the build if any secret other than the demo sender key appears in `dist/`.

## Reproduce the evidence

| Check | Command | Output |
|---|---|---|
| Unit tests (crypto round trip, padding, tamper rejection, codec) | `npm test` | console |
| Integration against Tiramisu: create inbox, send, hand-over, WebSocket event, sweep, cursor, Lifetime Extension, pin, burn, forged-link refusal. Prints entity keys, tx hashes and explorer links. | `npm run integration` | [evidence/integration.txt](evidence/integration.txt) |
| Headless Chromium on the built site: the 60-second judge path, wallet mode with a test wallet, forged link, Demo Desk. | `npm run build && npm run smoke` (set `CHROMIUM=/path/to/chromium` if it is not `/usr/bin/chromium`) | [evidence/smoke.txt](evidence/smoke.txt), [evidence/screens/](evidence/screens/) |
| The same smoke checks against any served copy, here a `BASE_PATH=/sealdrop/` build behind a local static server rooted one level above `/sealdrop/` (how GitHub Pages serves it). The script writes `evidence/smoke-live.txt`; this run was renamed so that name stays free for the deployed site. | `SMOKE_URL=http://127.0.0.1:8765/sealdrop/ npm run smoke` | [evidence/smoke-subpath.txt](evidence/smoke-subpath.txt) |
| Independent reader: decrypts the Demo Desk with no Sealdrop code. | `INBOX=0x65a2… OWNER=0x6a3C… BOX_SECRET=… node arkiv/examples/read-tips.mjs` | [evidence/read-tips.txt](evidence/read-tips.txt) |
| Friction repro scripts | `arkiv/repro/*.mjs` | see [arkiv/friction.md](arkiv/friction.md) |
| QA pass: GLM costs, fresh clone, Firefox, a phone-sized screen, a dropped WebSocket, error states, keyboard and labels, Fast 3G load, wallet-mode failures. | the scripts in [evidence/qa-scripts/](evidence/qa-scripts/) (they use absolute paths of the author's machine and a git-ignored fixture identity) | [evidence/qa.md](evidence/qa.md), [evidence/qa-logs/](evidence/qa-logs/) |

Run the integration test and the smoke test one at a time: they share the demo sender key and the public RPC's
anonymous query budget.

Not verified: wallet mode with a real browser wallet extension (the smoke test and the QA wallet checks use a scripted EIP-1193
stand-in that signs in Node), Safari, a real phone (the mobile check is Chromium's 390x844 touch emulation), Tor Browser, and
a reconnect after a real network change, sleep or node restart (the drops were injected by a local proxy). Firefox 153
(WebDriver BiDi) ran the judge path once, Chromium 154 runs the smoke test. The Settings panel was checked only against a scripted fake RPC: the URL is saved
and the page sends its queries there, but I did not try a real second or access-key RPC node (the live-tip socket is derived
from the same URL, `https` to `wss`, which a given node may not serve). The QA pass (what was run, with numbers, and what was
not) is in [evidence/qa.md](evidence/qa.md).

## Addresses and roles (Tiramisu testnet, chain id 7738577)

| Role | Address | Notes |
|---|---|---|
| Funder | [`0x9606dB647383Bf71604B6C855aB3B3D92675cD64`](https://tiramisu.explorer.arkiv.network/address/0x9606dB647383Bf71604B6C855aB3B3D92675cD64) | Claimed the faucet once; funds the two wallets below with plain GLM transfers. Key not in the build. |
| Demo sender | [`0xa05d5Bd99440d95526120062364518ddfe11797F`](https://tiramisu.explorer.arkiv.network/address/0xa05d5Bd99440d95526120062364518ddfe11797F) | The shared sender in demo mode: `$creator` of demo-mode tips. Its key is in the deployed bundle by design. |
| Demo Desk newsroom | [`0x6a3C43407F58B11E871310cE296eb3bF1a3fdcF6`](https://tiramisu.explorer.arkiv.network/address/0x6a3C43407F58B11E871310cE296eb3bF1a3fdcF6) | Creator and owner of the Demo Desk inbox and `$owner` of tips sent to it. Key not in the build. |
| Throwaway newsrooms | generated in each visitor's browser | One per "Create a throwaway newsroom"; creates its inbox entity, owns the tips it receives. |
| Test wallets | generated per run by the integration and smoke scripts | Funded from the demo sender; visible in the evidence files. |

The Demo Desk inbox: entity [`0x65a2d0b9…25a1`](https://data.arkiv.network/entity/0x65a2d0b97fe693af3916c4a954564dda4d44a584ee4ec206454ac9c0148c25a1),
created in tx [`0xc9ca55aa…9acc`](https://tiramisu.explorer.arkiv.network/tx/0xc9ca55aab9c19049296890a80dbb518b0874daaa9c7358826c4d57cdf35c9acc).

## Repository map

| Path | What |
|---|---|
| `src/crypto.ts`, `src/codec.ts`, `src/config.ts` | Sealing, wire format, constants (no environment access, shared with the scripts). |
| `src/arkiv.ts` | Everything that talks to Arkiv: queries, writes, WebSocket, retries, budget tracking. |
| `src/pages/` | Home, newsroom console, send page. |
| `arkiv/schema.md`, `arkiv/friction.md`, `arkiv/repro/`, `arkiv/examples/` | Data contract, friction report with repro scripts, independent reader. |
| `scripts/` | Key generation, ops, integration test, smoke test, bundle check, secret scan. |
| `test/` | Unit tests. |

## AI use, pre-existing work, license

* Written with Claude (Claude Code, Sonnet 5.5) under the supervision of the builder, who is a team of one. Commits carry a
  `Co-Authored-By` trailer. The friction log comes from real runs of the code in this repository.
* No pre-existing work was reused. The repository history starts on 2026-10-16, inside the Oct 9-18 build window.
* MIT, see [LICENSE](LICENSE). Copyright 2026 Kylne700.
