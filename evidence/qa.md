# QA pass, 2026-10-16

Checks A to J of the QA brief, run against the built site (`dist/`, production CSP) and the live Arkiv Tiramisu testnet
(chain 7738577). Testnet only, synthetic text only ("SYNTHETIC TEST TIP ..."). Anything that could not be run says
**NOT VERIFIED**. Nothing was published: no push, no repository, no Pages, no account, no message sent.

* Tested code: `387a52a`, the last commit that touches `src/`, `scripts/` or `test/`. Later commits change only evidence, docs and
  the `engines` field of `package.json`. The smoke, subpath smoke and Firefox runs were made before the `engines` change, so
  I rebuilt afterwards: `dist/` has the same content-hashed files as the build they ran against (`index-BHoWWcl2.js`,
  `index-BvNQ8wwd.css`, `native-BKj27wfc.js`, `ccip-CBZB9M-9.js`), and a new `BASE_PATH=/sealdrop/` build is byte-identical
  (`diff -r`) to the copy the subpath smoke served.
* Tools: node v24.18.0 (fresh clones also on 22.23.2 and 20.19.2), Chromium 154.0.8037.92 (`/usr/bin/chromium`), Firefox 153.4.0 (WebDriver BiDi through
  puppeteer-core 25.14.0), Linux x86_64, headless.
* Scripts: [qa-scripts/](qa-scripts/). `lib.mjs` and `anchors.mjs` find the repository from their own location; the other scripts use absolute paths (the repository is `/path/to/sealdrop` in these copies), scratch files are in `/tmp/qa`. `a-costs.mts` creates the throwaway
  newsroom ("fixture") that `d-ws.mts` and `e-tour.mts` reuse; the fixture holds that newsroom's keys, so it is not in the repo.
  Raw outputs: [qa-logs/](qa-logs/). Screenshots: [screens/](screens/).
* Browser traffic to the public RPC went through a counting proxy that keeps the real CSP valid, or was counted from the
  page's own requests (`lib.mjs`, `proxy.mjs`). `arkiv_query` costs 100 units against about 10,000 per hourly window (friction F7);
  [qa-logs/queries.txt](qa-logs/queries.txt) lists every run the proxy or the page counted. Per hourly window (UTC, the node's window
  resets at about :01): 19:01 to 20:01 12 queries; 20:01 to 21:01 67; 21:01 to 22:01 about 54 (30 counted, plus about 24 estimated for
  the two smoke runs, which the proxy did not count: their tab footers plus `ops desk-read`); 22:01 to 23:01 37 at the end of the
  checks (16 counted by the proxy, 19 by the integration test's own summary, 2 for `ops desk-read`). No window reached the limit
  and no real 429 came from the node at any time (the 429 texts in E9 and in the smoke are injected). Queries other sessions sent
  from the same client are unknown.

## Result

| Check | Result |
|---|---|
| A Funds | PASS. Balances after the cost run: funder 3.999958, demo sender 2.913242, Demo Desk 2.999850 GLM. A throwaway newsroom costs the demo key 0.005021 GLM, a tip 0.000133, a renew 0.000025 (paid by the newsroom), one full judge run 0.005287, so the key covers 551 full runs (floor 150) and no top-up was needed. Drain risk and refill command are in HANDOFF. |
| B Fresh clone | PASS at `c362b24`, Node 24.18.0 (also 22.23.2, and 20.19.2, which is outside the declared range). In an empty clone with no `.env.local`: `npm ci`, `npm test` (23 tests), `npm run build` exit 0; `npm run dev` serves a working home page and nothing leaves localhost; `check:bundle` and `secret-scan` crashed before the fix and now print SKIP and exit 0; the README names the supported Node versions and what demo mode needs. |
| C Browsers | PASS. Chromium smoke 13 of 13 checks pass against the live testnet (judge path 20.4 s; served under `/sealdrop/`: 13 of 13, 19.2 s); Firefox 153.4 judge path 30.8 s, 0 errors; mobile 390x844 DPR 2 touch: no overflow on 6 states. Safari and a real phone NOT VERIFIED. |
| D WebSocket | The old build FAILED (tips sent during and after a 15 s outage never appeared); fixed in `61a8be2`: 11 of 11 scenario checks pass (socket killed and refused for 15 s, silent socket, hidden tab; tips sent during and after the outage appear with no refresh; status "Reconnecting" then "Live"; 1 catch-up query); the backoff doubles from 1 s to a 30 s cap. |
| E Error states | PASS, E1 to E10, 0 console or page errors (Chromium's own log line for an injected 429 aside). One real problem found and fixed (Hebrew-first tips laid out left-to-right). |
| F First impression | Done. One sentence, three numbered steps, one primary button, links to the Demo Desk and the repository, all above the fold at 1280x800 and 390x844. |
| G Accessibility | PASS. Inputs labelled, 0 controls without a name, every control reachable by keyboard (the two inside the closed Settings panel once it is opened) with a visible focus ring, `lang="en"`, a title per route, contrast above 4.5; 0 console errors. |
| H Performance | PASS. Fast 3G load 1.9 s (limit 3 s); gzip about 131 KB in total. No fix needed. |
| I Wallet mode | PASS, 5 of 5 scripted-wallet scenarios (switch prompt, add prompt, wrong chain after the add, rejected switch, rejected account request) give the expected wallet calls and a clear message. A real wallet extension NOT VERIFIED. |
| J Regression | PASS. Gate (`secret-scan`, `npm test` 23 tests, `npm run build`, `npm run check:bundle`) passes; Chromium smoke 13 of 13 and `/sealdrop/` base-path smoke 13 of 13; integration test against the live testnet 30 of 30 checks (59.2 s, 19 costed queries); 12 of 12 `src/arkiv.ts#L` anchors in SUBMISSION.md resolve; fresh clone on Node 24 passes; 0 secret values in the repo tree. |

## Fixes made (all committed locally)

| Problem | Fix | Where |
|---|---|---|
| `npm run check:bundle` crashed in a fresh clone (no `.env.local`) | prints SKIP and exits 0 | `scripts/check-bundle.mjs:8` (abc3aa3) |
| The same for `node scripts/secret-scan.mjs`, found while preparing the fresh-clone gate | prints SKIP and exits 0 | `scripts/secret-scan.mjs:4` (387a52a) |
| Home page did not make the 60-second path obvious; a mistyped link silently showed the start page | one sentence, three steps, one primary button "Start: open a newsroom", Demo Desk and source links; notices for a malformed link or an unknown page | `src/pages/home.ts`, `src/main.ts:26-29` (fb6add5) |
| The live feed died for good after a dropped WebSocket and the page never said so (D) | socket supervised by Sealdrop: viem reconnect off, backoff 1 s doubling to 30 s, heartbeat, "Live" / "Reconnecting" status, one `$createdAt` catch-up query after each reconnect | `src/arkiv.ts:41-55` and `:361-406`, `src/pages/newsroom.ts:227-278` (61a8be2) |
| Empty demo key: Arkiv writes fail with "out of gas: gas required exceeds: N", which the app showed as a raw error (E8) | `isOutOfFunds` recognises both node answers; the send page and the throwaway newsroom say who ran out and where to get GLM | `src/arkiv.ts:117,130`, `src/pages/newsroom.ts:139`, `src/pages/send.ts:132`, `test/errors.test.ts` (61a8be2, 53387e4) |
| A wallet that rejected the network switch got a second prompt (add chain); one that did not switch after add got no explanation (I) | stop on a rejection (code 4001); plain "switch your wallet to Arkiv Tiramisu" message | `src/arkiv.ts` `injectedSigner` (61a8be2) |
| Hebrew-first tips and messages were laid out left-to-right (second sentence on the wrong side, punctuation misplaced) (E6) | `dir="auto"` on the message field and on the tip text only | `src/pages/send.ts:58`, `src/pages/newsroom.ts:160` (fd03e9c); before/after: [screens/hebrew-rtl-before-after.png](screens/hebrew-rtl-before-after.png) |
| Inbox name field not marked required (an empty name failed only after the funding transfer, in `encodeInbox`) | `required` on the name input, so the browser stops an empty name first | `src/pages/newsroom.ts:299` (61a8be2) |
| `wallet-shim.ts` could not play a wrong chain or a rejecting wallet (test tooling) | optional quirks | `scripts/wallet-shim.ts:8-73` (3925068) |
| `package.json` said Node `>=20.12`, but vitest 5.0.5 declares `^22.12 \|\| ^24 \|\| >=26` (vite 8.3.4: `^20.19 \|\| >=22.12`), and the README named no Node version | `engines` set to vitest's range; the README names the supported versions, the two it ran on (22.23.2, 24.18.0), and says Node 20.19 also ran the steps, with `EBADENGINE` warnings | `package.json:8`, `README.md:149-151` (5514c03, cc5e303, 7fdb6d8) |

Docs kept in step: `README.md` (judge-in-a-fresh-clone paragraph with the supported Node versions, reconnect row, "Not verified",
this evidence), `arkiv/schema.md` (live updates, query 4), `arkiv/friction.md` (new F8, rewritten WebSocket row). No new runtime
dependency.

## A. Funds

Measured with `a-costs.mts`: a real throwaway newsroom, one tip to its own inbox, one renew, one tip to the Demo Desk
(browser, built site, demo key from the build). Balances read with `eth_getBalance` (not metered).

| | GLM |
|---|---|
| Funder, before / after | 3.999958 / 3.999958 |
| Demo sender (public key), before / after | 2.918529 / 2.913242 |
| Demo Desk, before / after | 2.999850 / 2.999850 |
| One throwaway newsroom, paid by the demo key (0.005 funding + transfer gas) | 0.005021 |
| ... then the newsroom pays for creating its inbox from that funding | 0.000098 |
| One tip (to its own inbox or to the Demo Desk), paid by the demo key | 0.000133 |
| One renew ("Renew now"), paid by the newsroom | 0.000025 |
| One full judge run (newsroom + tip to its own inbox + tip to the Demo Desk), paid by the demo key | 0.005287 |

At the time of measurement the demo key covered 2.913242 / 0.005287 = **551 full judge runs** (the brief's floor is 150), so no
top-up was needed. After all the later test runs (22:02 UTC) the balances were funder 3.99996, demo sender 2.87545 and Demo Desk 2.99985 GLM
(`npm run ops -- balances`), which still covers 2.87545 / 0.005287 = 543 full judge runs. The demo key is public by design (it ships in the
bundle), so anyone can drain it; the risk and the refill command (`npm run ops -- fund sender 1`) are in HANDOFF section 4, item 2. No timer or cron job was installed.
The balance check is `npm run ops -- balances`.

## B. Fresh clone

[qa-scripts/fresh.sh](qa-scripts/fresh.sh) does `git clone` of the repository into a new directory (committed state only), checks that there is no
`.env.local`, and runs the README's reproduce steps literally, timing each one. [qa-scripts/dev-check.mjs](qa-scripts/dev-check.mjs)
starts `npm run dev` and loads the page in Chromium, and also loads the built site; [qa-scripts/envcheck.mjs](qa-scripts/envcheck.mjs) prints only the
names and the file mode of `.env.local`. Final pass, Node 24.18.0, clone of `c362b24`
([qa-logs/fresh-final.out](qa-logs/fresh-final.out)):

| Step (no `.env.local`) | Result |
|---|---|
| `npm ci` | exit 0, 1.6 s |
| `npm test` | exit 0, 3 test files, 23 tests pass |
| `npm run build` | exit 0, main bundle 409.50 kB (128.35 kB gzip) |
| `node scripts/secret-scan.mjs`, `npm run check:bundle` | exit 0 each, with a SKIP line saying there is no `.env.local` and what creates it (`check:bundle` crashed here before the fix) |
| `npm run dev` | prints `http://localhost:5173/`; `GET /` is 200; the home page renders (one primary button, title, h1, `lang="en"`); no request leaves localhost; 0 console errors |
| the built site opened in Chromium | throwaway newsroom: "This build has no demo sender key. Send testnet GLM to 0x... from the faucet at https://hub.arkiv.network/faucet, then try again."; send page: the shared-key option is disabled ("This build has no demo key.") and Send says "No browser wallet found." in an alert, button usable again, no transaction sent; 0 console errors; 2 `arkiv_query` |
| `npm run keys`, `secret-scan`, `npm run build`, `npm run check:bundle` (demo mode as the README describes it) | all exit 0; `.env.local` has mode 600 and is git-ignored; the demo key is in the bundle by design, the funder key, the desk key and the desk box secret are not |

The first run of this final pass (22:02 UTC, [qa-logs/fresh-final-run1.out](qa-logs/fresh-final-run1.out)) printed one FAIL. It was my check, not the app:
it expected the demo-key error text after Send, but in a build without a demo key the shared-key option is disabled and "My wallet" is
selected, so Send takes the wallet path and says "No browser wallet found." I corrected the check (it now also asserts the radio
state, the alert role, the usable button and that no transaction was sent) and ran the whole pass again in a new clone: all checks pass.

Earlier passes with the same steps: Node 22.23.2 at `d221132` ([qa-logs/fresh-n22.out](qa-logs/fresh-n22.out)) and Node 20.19.2 at `7fdb6d8`
([qa-logs/fresh-n20.out](qa-logs/fresh-n20.out)), all steps exit 0. Node 20.19.2 is outside the declared `engines` range: `npm ci` prints `EBADENGINE` warnings
for `sealdrop`, `vitest` 5.0.5, `puppeteer-core` 25.14.0 and `@puppeteer/browsers` 3.2.5, and still installs, tests and builds
([qa-logs/n20-ci.out](qa-logs/n20-ci.out)). The README states this. A pass at `c797c65` ([qa-logs/fresh-b.out](qa-logs/fresh-b.out)) is superseded by these.

## C. Browsers

* Chromium 154, `npm run smoke` at `c797c65`: 13 of 13 checks PASS on the live testnet, served from `dist/` ([smoke.txt](smoke.txt)): the faked 429 message, the throwaway
  newsroom (0.7 s, no network), the inbox created in 15.0 s, a tip decrypted in the newsroom tab 3.1 s after Send through
  the WebSocket (`data-source=live`), wallet mode with a second live tip, a look-alike link, the Demo Desk found and read with
  `ops desk-read`, and 0 console or page errors in the three tabs. Judge path total 20.4 s. The same checks served under
  `/sealdrop/` (a `BASE_PATH=/sealdrop/` build, how GitHub Pages serves a project page): 13 of 13, 19.2 s
  ([smoke-subpath.txt](smoke-subpath.txt)). Both runs: `src/`, `scripts/` and `test/` as in `c797c65`. The design stage re-ran both on its final code and overwrote smoke.txt and smoke-subpath.txt with those runs (2026-10-16, 23:53 and 23:54 UTC: 13 of 13 each, judge path 20.1 s and 19.5 s); the figures above are the QA runs. The accessibility polish stage (2026-10-17) re-ran both after adding the skip-link, focus and title checks: 23 of 23 each, judge path 20.2 s (the subpath file says 20.9 s: it was recorded before the timers left the new checks out and includes about 1 s of them). The focus-after-re-render stage (2026-10-17) re-ran both once more on its final code: 23 of 23 each, `smoke.txt` at 04:34 UTC with judge path 19.9 s, `smoke-subpath.txt` at 04:36 UTC with 19.8 s (a `BASE_PATH=/sealdrop/` build). The three smoke screens in `screens/` (`demo-desk-sent.png`, `newsroom-live-tip.png`, `source-sent.png`) come from the second run, the sub-path one, so `newsroom-live-tip.png` shows a `127.0.0.1:.../sealdrop/` inbox link. `evidence/qa-scripts/subpath-smoke.mjs` cannot run from a clone as committed (`PROJECT` in `lib.mjs` is the anonymized placeholder `/path/to/sealdrop`); that run used its two steps (serve the build under `/sealdrop/`, then `SMOKE_URL=<url> npm run smoke`) with the real project directory.
* Firefox 153.4.0, the judge path against `dist/` with the production CSP and the public RPC ([qa-logs/ff-judge.out](qa-logs/ff-judge.out)):
  home has one primary button; throwaway newsroom funded and inbox created in 15.9 s; tip sealed and sent in 5.6 s; the
  newsroom tab showed it decrypted, with no refresh, through the WebSocket (`data-source=live`); Demo Desk found and a tip
  sent; 0 console or page errors; whole path 30.8 s, 9 `arkiv_query` calls (rerun at 21:21 UTC on the final code).
* Mobile, Chromium emulation of 390x844, DPR 2, touch, mobile user agent ([screens/mobile-*.png](screens/)): newsroom
  onboarding, newsroom console with tips (also with a live tip), send page, send result, "not found" page, home with a notice.
  No horizontal overflow in any of them (document width 390 = viewport, no element outside it); smallest button 46 px high.
  Long addresses, the inbox link field and the buttons wrap or scroll inside their boxes, so no CSS fix was needed.
  This is an emulation, not a phone: NOT VERIFIED on a real device, in Safari, or in Tor Browser.

## D. WebSocket resilience

`d-ws.mts` puts a proxy between the page and the node. The newsroom console runs with the fixture identity and tips are sent
from Node with the demo key.

* s1: the proxy kills the socket and refuses new handshakes for 15 s; one tip is sent during the outage and one after it.
* s2: CDP `Network.emulateNetworkConditions` offline for 15 s, then a tip. Chromium did **not** close the already open
  socket, so this is not a real drop; the tip arrived live, which shows nothing about reconnecting.
* s3: the socket stays open but nothing is delivered in either direction (a dead connection that never closed).
* s4: the tab is hidden for 31 s while the socket is silent, then shown again (the "tab was asleep" catch-up).

Old build (code before 61a8be2, `old/` copy), s1 only, run twice (the first run was invalid: the page's socket was not yet open
when the test dropped it; the test now waits for it): **FAIL**. The status line said "Live updates stopped (The socket has
been closed.", the tip sent during the outage and the tip sent after it had not appeared 30 s after the network came back
([qa-logs/d-ws-old.out](qa-logs/d-ws-old.out)). viem's default reconnect (5 attempts, 2 s apart) is shorter than the 15 s outage.

Current build:

Run 1 (20:06 to 20:08 UTC, s1 to s3): 9 of 9 PASS ([qa-logs/d-ws-new-run1.out](qa-logs/d-ws-new-run1.out)). I then added s4 and
repeated everything (21:02 to 21:04 UTC; [qa-logs/d-ws-new.out](qa-logs/d-ws-new.out)): **11 of 11 PASS**.

| Check | Result | Detail |
|---|---|---|
| s1 status turned to "Reconnecting" after the drop | PASS | after 0.0 s |
| s1 status is back to "Live" without any click | PASS | 0.6 s after restore |
| s1 tip sent DURING the outage shows up with no refresh | PASS | data-source=sweep, 0.6 s after restore |
| s1 tip sent AFTER the restore arrives | PASS | data-source=live, 0.0 s |
| s2 tip sent after CDP offline appears with no refresh | PASS | data-source=live, 0.0 s |
| s3 heartbeat noticed the silent socket and showed "Reconnecting" | PASS | 44.6 s after the freeze |
| s3 back to "Live" on its own | PASS | 2.2 s after the unfreeze |
| s3 tip sent while silent shows up with no refresh | PASS | data-source=sweep, 0.6 s |
| s3 next tip arrives | PASS | data-source=live, 0.0 s |
| s4 tip sent while hidden shows up after the tab is visible again, from the catch-up query | PASS | before unhide: not shown; data-source=sweep, 0.6 s after unhide; queries 1 |
| s4 back to "Live" on its own | PASS | 1.2 s after the unfreeze |

* The catch-up after an outage is one `arkiv_query` (`tipsSince`; `arkiv_getBlockTiming` is not metered). Live tips cost none.
* s3 (a socket that is open but silent): noticed 44.5 s (run 1) and 44.6 s (run 2) after the freeze. Only a failing heartbeat
  probe (every 30 s) reveals such a socket, so the delay depends on where the freeze falls in that cycle plus the probe's
  timeout; two measurements are not a bound. Until then the page keeps showing "Live".
* s2 proves little: CDP "offline" did not close the established socket, so the page never saw a drop. Only s1 (socket killed,
  new handshakes refused), s3 and s4 exercise reconnecting.
* Console: 15 lines, all Chromium's own "WebSocket connection to 'ws://proxy/' failed: Error during WebSocket handshake:
  Unexpected response code: 503", one per handshake the proxy refused in s1 (Chromium logs every failed handshake). 0 page errors.
* Proxy totals of run 2: 16 `arkiv_query` (1,600 units), 5 sockets accepted, 15 refused.

Backoff during a long outage ([qa-scripts/backoff.mts](qa-scripts/backoff.mts), [qa-logs/backoff.out](qa-logs/backoff.out); a local
server that answers every WebSocket handshake with 503 for 70 s, no public RPC): the page reported "reconnecting" at 0.1, 1.1, 3.1,
7.1, 15.1, 31.1 and 61.1 s, i.e. attempts 1, 2, 4, 8, 16 and 30 s apart (doubling, capped at 30 s); `onReconnect` was called 0
times while the node refused. The server counted 35 handshakes over those 7 attempts, 5 per attempt on average, so one attempt
is not one handshake (I did not trace why). Handshakes cost no `arkiv_query` units.

## E. Error states

All in Chromium against `dist/` ([qa-logs/e-tour-all.out](qa-logs/e-tour-all.out), [qa-logs/e-tour-c-e4.out](qa-logs/e-tour-c-e4.out)).
Console and page errors: 0 in every section, except that Chromium itself logs every non-2xx response, so the injected 429
shows as one console line per request (not an app error).

| | Case | Result |
|---|---|---|
| E1 | Forged link: right inbox id, other creator | PASS. "There is no live inbox with this id created by this address. The link may be wrong, or the newsroom stopped renewing it and it expired. Only trust links you got ...", no form |
| E2 | Missing or expired inbox | PASS. Same message (it names both causes) |
| E3 | Malformed hash: `#/send/0x123/abc`, a 39-hex address, `#/send//x`, spaces, non-hex, `#/nope` | PASS. Start page with a notice: "That inbox link is not valid. A Sealdrop link looks like ..." or "There is no such page." |
| E4 | Empty message; whitespace only | PASS. "Write a message first.", button stays usable |
| E5 | 32,767 Hebrew letters (65,534 text bytes, 65,551 with the JSON wrapper) | PASS. Counter "65,551 / 65,532 bytes", "The message is too long (limit 65532 bytes).", nothing sent |
| E5c | One byte over the limit (65,533) | PASS. Refused, nothing sent |
| E5b | At the limit: 65,515 text bytes = 65,532 with the wrapper | PASS. Sent in 5.8 s, decrypted in the newsroom, burned from the console |
| E6 | Hebrew + emoji round trip | PASS. The newsroom shows exactly the text sent, once, laid out right-to-left (`dir=auto`) |
| E7 | Double click on Send | PASS. Exactly one `eth_sendRawTransaction` |
| E8 | Demo key without GLM (a real node answer for an empty key) | PASS. Send page: "The shared demo key has run out of testnet GLM, so demo mode cannot send right now ..." and the button is usable again. E8b, throwaway newsroom: says the shared demo sender ran out and which address to send GLM to |
| E9 | 429 from the public RPC (injected) | PASS. "The free query budget of the public Arkiv RPC is used up (it renews in about 23 min). Wait a little, or enter your own RPC URL under Settings." |
| E10 | Wallet declines a send | PASS. "The request was rejected in the wallet.", nothing sent, button usable |

The size limit counts the JSON-wrapped plaintext `{"v":1,"text":"..."}`, which is 17 bytes more than the text, so the longest
ASCII message is 65,515 bytes (`arkiv/schema.md`: "at most 65,532 bytes with the JSON wrapper").

Two runs of the tour exist. Run 1 (`e-tour-all.out`) failed C, E5 and E5b because of bugs in my test script (the script used a
tsx name-wrapper inside the page, and it assumed raw text bytes where the app counts the wrapper); the app was right. The
script was fixed and run 2 (`e-tour-c-e4.out`) re-ran C and E4 to E7 with the corrected expectations; E1 to E3 and E8 to E10 are
from run 1. The `dir=auto` change landed between the two runs and does not touch E1 to E3 or E8 to E10.

## F. First impression

Before and after screenshots, desktop 1280x800 and mobile 390x844, viewport and full page:
[screens/home-before-desktop.png](screens/home-before-desktop.png), [screens/home-after-desktop.png](screens/home-after-desktop.png),
[screens/home-before-mobile.png](screens/home-before-mobile.png), [screens/home-after-mobile.png](screens/home-after-mobile.png)
(`-full` for the whole page). The after page: one sentence of what it is, "Try it in 60 seconds, no wallet needed" with three
numbered steps, one primary button ("Start: open a newsroom", the only `a.button`), and links to the Demo Desk and the source
repository, all above the fold at both sizes. Visual style unchanged, no new dependency. "Obvious in under 10 s" is a judgement
about the screenshot; I did not run a usability test.

## G. Accessibility

* Static pages (home, newsroom onboarding, malformed link, unknown page): `<html lang="en">`, one `<h1>` and one `<main>` each, every
  input labelled, every control named, no focusable element without a visible focus ring, and the Tab walk reaches every enabled
  control (a disabled button such as "No wallet found" is skipped, as it should be; `tabwalk.mjs`)
  ([qa-logs/a11y-static.out](qa-logs/a11y-static.out)). Contrast ratios (WCAG, computed): light text 17.0, muted 7.8, link 6.4,
  button 6.7, danger 7.6, ok 7.0; dark theme 16.6, 9.5, 8.7, 8.9, 7.5, 10.8; all above 4.5.
* Titles per route: "Sealdrop: an anonymous tip line with no server" (home and notices), "Newsroom console: Sealdrop",
  "Send a tip: Sealdrop".
* Send page and its "no live inbox" state: 5 fields labelled, 0 unnamed controls, no missing focus ring.
* Newsroom console: the fixture newsroom with 19 tips: 2 fields, all labelled; 93 buttons and links, all with a name. The Tab walk
  (re-run without the earlier cap of 80 presses) visits 93 stops, and every one shows a ring (`noRing=0`; the ring is one global
  rule, `:focus-visible` at `src/style.css:30`); 0 console or page errors, 3 `arkiv_query` ([qa-logs/e-tour-g.out](qa-logs/e-tour-g.out)).
  The 95 candidates minus the 93 stops are the custom RPC URL field and its "Save and reload" button, which sit in the closed
  "Settings" `<details>` (`src/ui/settings.ts:21-28`) and so cannot take focus yet. Enter on the "Settings" stop opens it, and the next
  two Tab stops are those two controls ([qa-logs/tabmiss.out](qa-logs/tabmiss.out), [qa-scripts/tabmiss.mts](qa-scripts/tabmiss.mts); 3 `arkiv_query` per run).

## H. Performance

`perf.mjs`: cold cache, Chromium, Chrome DevTools "Fast 3G" preset (180,000 B/s down, 84,375 B/s up, 562.5 ms latency), home page
from `dist/`, three runs each at CPU x1 and x4 slowdown ([qa-logs/perf.out](qa-logs/perf.out)).

| | |
|---|---|
| Main JS | 410,412 B raw, 127,607 B gzip as sent by the test server (Node zlib; `vite build` prints 128.65 kB for the same file, `gzip -6` gives 126,929 B) |
| Whole site, gzip (JS, CSS, html, two lazy chunks) | 131,237 B |
| Load event, CPU x1 | 1.88 to 1.90 s |
| Load event, CPU x4 | 1.92 to 1.95 s |
| First contentful paint | 1.18 to 1.22 s |
| Requests / bytes on the wire | 3 / 129,759 B |

Under the 3 s threshold, so nothing was changed. Not measured: a real mobile device, a real 3G link, a warm CDN (the build was
served from localhost with the throttle applied by the browser).

## I. Wallet mode

`wallet-checks.mts` with `scripts/wallet-shim.ts` (a scripted EIP-1193 wallet that signs in Node) on `#/newsroom`, "Use my wallet":

| Shim behaviour | Wallet calls the page made, in order | What the page did |
|---|---|---|
| wrong chain, switch works | eth_requestAccounts, eth_chainId, wallet_switchEthereumChain, eth_chainId | opened the console |
| wrong chain, unknown to the wallet (4902), add works | eth_requestAccounts, eth_chainId, wallet_switchEthereumChain, wallet_addEthereumChain, eth_chainId | opened the console |
| wrong chain, the add does not switch | the same five calls | stayed on the start page: "Your wallet is on a different network. Switch it to Arkiv Tiramisu (chain id 7738577) and try again." |
| user rejects the network switch | eth_requestAccounts, eth_chainId, wallet_switchEthereumChain | stayed on the start page: "The request was rejected in the wallet." |
| user rejects the account request | eth_requestAccounts | stayed on the start page: "The request was rejected in the wallet." |

5 of 5 PASS, 2 `arkiv_query` (200 units), 0 console or page errors ([qa-logs/wallet-checks.out](qa-logs/wallet-checks.out)).

Screenshots: `screens/wallet-*.png`. The send-page rejection is E10. NOT VERIFIED: a real wallet extension (MetaMask,
Rabby, ...); real wallets word their errors differently, and the shim only reproduces the EIP-1193 codes 4001 and 4902.

## J. Regression at the end

The last code change (`src/`, `scripts/`, `test/`) is `387a52a`; everything after it is evidence, docs and the `engines` field. Results on the final tree:

| Step | Result |
|---|---|
| `node scripts/secret-scan.mjs` | clean: 4 secrets checked against tracked and staged files (22:07 UTC) |
| `npm test` | 3 files, 23 tests pass |
| `npm run build` | exit 0; `index-BHoWWcl2.js` 410.41 kB, 128.65 kB gzip, the same content-hashed files the browser runs used |
| `npm run check:bundle` | all rules pass (the demo key is in the bundle by design; the funder key, desk key and desk box secret are not; no `.env` file in `dist/`) |
| `npm run smoke` (Chromium, live testnet) | 13 of 13, judge path 20.4 s, run at 21:13 UTC after the last code change ([smoke.txt](smoke.txt)) (the QA run; the file now holds the latest re-run, see section C) |
| the same smoke served under `/sealdrop/` | 13 of 13, 19.2 s ([smoke-subpath.txt](smoke-subpath.txt)); a rebuilt `BASE_PATH=/sealdrop/` build is byte-identical to the copy it served (the QA run; the file now holds the latest re-run, see section C) |
| `npm run integration` (live testnet) | 30 checks passed, 0 failed, 59.2 s, run at 22:01 UTC at `c362b24`, 19 costed queries (1,900 units) ([integration.txt](integration.txt)). Two concurrent sends from the shared demo key needed 2 retries (a failure before broadcast, then a revert on chain, then the send landed): the known concurrent-batch behaviour of friction F6, which `sendTip` handles. |
| `src/arkiv.ts` changed in this pass (`61a8be2`, `53387e4`), so the SUBMISSION.md anchors were recomputed | `anchors.mjs`: all 12 `src/arkiv.ts#L` links resolve to the declaration of the symbol they name ([qa-logs/anchors.out](qa-logs/anchors.out)); SUBMISSION.md is git-ignored, so this is not a commit. Re-run it if `src/arkiv.ts` changes before publishing. |
| fresh clone | section B; Node 24.18.0 at `c362b24`, all steps exit 0, all browser checks pass |
| Firefox judge path | rerun at 21:21 UTC on the final code: pass (section C) |
| secret leak scan | `leakscan.mjs` over the whole working tree except `node_modules`, `dist`, `.git` and `.env.local` itself: 10 secret values (the fixture newsroom's two keys and every secret-like value in `.env.local`), 165 files including the images, 0 hits |
| docs in step with behaviour | `README.md`, `arkiv/schema.md`, `arkiv/friction.md` and `SUBMISSION.md` searched for test counts, timings, Node versions, the live-feed behaviour and the out-of-GLM texts, and corrected (see "Docs kept in step") |

Friction: this pass added one new, real Arkiv finding, F8 in [`arkiv/friction.md`](../arkiv/friction.md) (an entity write from an account
with no GLM fails as `out of gas: gas required exceeds: N`, while a plain transfer says "insufficient funds"), with a repro script
(`arkiv/repro/f8-unfunded-write.mjs`), and the WebSocket row there now says what was tested. Nothing was invented to fill the list.

## NOT VERIFIED

* A real wallet extension; Safari; a real phone; Tor Browser; Firefox beyond the one judge path.
* A real network change, laptop sleep or node restart (the drops were injected by a local proxy); CDP "offline" does not close an
  open socket, so s2 proves nothing about reconnecting.
* Settings with a real second or access-key RPC (only a scripted fake RPC).
* What identifies an anonymous client to the public RPC, and the exact length of its window (friction F7).
* `ci.yml` and `pages.yml` running on GitHub (nothing is published): they only parse as YAML, use Node 24 (inside `engines`), and
  the four action versions they name exist as tags (`gh api`).
* Node 23, 25 and 26 or newer (not installed here). `engines` excludes 23 and 25 because vitest 5 does; the README steps ran on
  22.23.2 and 24.18.0, and on 20.19.2 (outside the range, with `EBADENGINE` warnings).
* How long the public node keeps a WebSocket open on its own. Every reconnect costs one `arkiv_query` (the catch-up), so a node
  that dropped sockets every few minutes would spend the hourly budget on catch-ups. The longest run here was about 2.5 minutes,
  with no drop that I did not cause.
* Exact per-window `arkiv_query` totals for the two smoke runs (they were not counted by the proxy; the ledger above estimates
  them), and any queries other sessions made from the same client.
* A dynamic XSS test. Static read only: `src/` has no `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `srcdoc` or
  `eval`; `src/ui/dom.ts` builds elements with `createElement` and text nodes, and every `href` comes from a constant or the
  `link()` helper.
