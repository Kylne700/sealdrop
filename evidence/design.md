# Sealdrop design system

Stage: design polish (brief: briefs/sealdrop-design.md). Written before the CSS was changed; the CSS in `src/style.css` implements exactly these tokens. The "Contrast" section is recomputed from the real CSS by `evidence/design-scripts/contrast.mjs` (output pasted below, so a drift shows up as a diff).

## Direction

A calm, serious, editorial tool for people at risk. It should feel like a newsroom's own desk, not a crypto dashboard: warm paper, dark ink, one deep-teal accent, serif headlines, lots of air, no gradients, no glow, no coin imagery. The one picture on the home page explains the whole product: source's browser, sealed box, Arkiv with an expiry date, newsroom's browser.

Constraints that shaped it: the production build ships a strict CSP (`default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:`), so there are no web fonts, no inline `style` attributes and no inline scripts. Fonts are system stacks; bar widths are set with CSSOM (`el.style.setProperty`, allowed by the CSP) and read by CSS; the logo and diagram are inline SVG built with `createElementNS` (no `innerHTML`).

## Tokens

Copy-paste block (this is what `src/style.css` starts with; the video slides use the dark column).

```css
:root {
  color-scheme: light dark;
  --paper: #f6f3ec;   --surface: #fffdf8;  --surface-2: #eeeadf;
  --ink: #14171c;     --muted: #4a4f57;
  --line: #d9d3c4;    --line-strong: #85806f;
  --accent: #0b5a61;  --accent-hover: #084349;  --accent-fg: #ffffff;  --accent-soft: #dcebea;
  --danger: #a3221f;  --danger-soft: #f8e4e0;
  --track: #e2dccd;   --focus: #0b5a61;
}
@media (prefers-color-scheme: dark) {
  :root {
    --paper: #0e1113;   --surface: #161a1d;  --surface-2: #1d2327;
    --ink: #ecebe5;     --muted: #a7adb3;
    --line: #2b3338;    --line-strong: #6f7a82;
    --accent: #6ec3c8;  --accent-hover: #8fd3d7;  --accent-fg: #04191b;  --accent-soft: #15292b;
    --danger: #ff9f97;  --danger-soft: #2e1816;
    --track: #2a3236;   --focus: #6ec3c8;
  }
}
```

| Token | Role |
|---|---|
| paper | page background |
| surface | cards, inputs |
| surface-2 | inset areas: hex values, code, bar track neighbours |
| ink / muted | body text / secondary text, labels, hints |
| line / line-strong | decorative borders / borders of controls (need 3:1) |
| accent, accent-hover, accent-fg, accent-soft | the one brand colour: primary button, links, "Live"/"verified" chips, bar fill, focus ring |
| danger, danger-soft | destructive actions, errors, warnings (the only other hue) |
| track | empty part of a bar |

Only two hues exist: teal (accent) and red (danger). Everything else is neutral. Status never relies on colour alone (every chip carries words, "Live" also has a dot shape).

### Type

System stacks (no downloads).

- Serif (headlines, brand): `Charter, "Bitstream Charter", "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Noto Serif", serif`
- Sans (UI, body): `system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif`
- Mono (hex, bytes): `ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace`

| Token | Size | Line height | Used for |
|---|---|---|---|
| --fs-0 | 13 px (0.8125 rem) | 1.4 | chips, meta lines, footer, dt labels |
| --fs-1 | 15 px (0.9375 rem) | 1.5 | hints, buttons, nav |
| --fs-2 | 16 px (1 rem) | 1.55 | body, inputs (16 px stops iOS zoom) |
| --fs-3 | 18 px (1.125 rem) | 1.5 | lead paragraphs |
| --fs-4 | 22 px (1.375 rem) | 1.3 | h2 (serif) |
| --fs-5 | 28 px (1.75 rem) | 1.2 | h1 on inner pages (serif) |
| --fs-6 | clamp(32 px, 1.4 rem + 2.6 vw, 44 px) | 1.12 | home h1 (serif) |

Weights: 400 body, 600 labels and buttons, 700 headlines. Hex and byte counts use mono at 13-14 px with `font-variant-numeric: tabular-nums`.

### Spacing, shape, motion

- Grid: 8 px. Tokens `--s-1` 4 (hairline gaps only), `--s-2` 8, `--s-3` 16, `--s-4` 24, `--s-5` 32, `--s-6` 48, `--s-7` 64. Card padding 24 (16 on mobile), gap between blocks 24, between sections 48.
- Width: one reading column, `--w: 46rem` (736 px), header and footer on the same column. At 390 px wide the page padding is 16 px.
- Radius: `--r-1` 6 px (inset values), `--r-2` 10 px (controls), `--r-3` 16 px (cards), pills 999 px (chips).
- Elevation: one hairline border (`--line`) plus a very soft shadow on cards in light mode only; dark mode uses the border alone.
- Touch targets: buttons and inputs 44 px high at least; the copy and explorer icon buttons are 32 px visible with a 44 px hit area on touch.
- Focus: `outline: 3px solid var(--focus); outline-offset: 2px` on `:focus-visible` for every link, button, input, summary. The audit (`auditPage`) requires an outline of at least 2 px on every Tab stop.
- Motion: `--ease: cubic-bezier(.2, .7, .2, 1)`, 120 ms for hover, 200 ms for entrances and bar fills. Only `opacity`, `transform`, `width` and colours move. The "Live" dot pulses at 2 s. `@media (prefers-reduced-motion: reduce)` turns every animation and transition off.

## Rules

1. One primary button per view (filled teal). Everything else is `.secondary` (outlined) or a muted text link. The home page has exactly one `a.button`.
2. Never show a bare 0x value. Use `hex(value, opts)`: mono, middle-truncated (`0x3A3E…42c7`: 6 leading characters including `0x`, 4 trailing), `title` and `aria-label` hold the full value, a copy button follows, and the value itself is the explorer link. The full text stays in the DOM (hidden middle) so tools and assistive tech can read it. The send page shows the creator address in full, in two balanced lines of 21 characters, because that is the one value a source may compare against another channel.
3. Time is always shown as a chip: "Expires in 13 d 23 h" with a bar whose fill is the share of the lifetime that is left. Lease for the inbox: same chip, 7 d scale.
4. Live connection state is a chip: "Live" (teal, pulsing dot), "Reconnecting" (neutral, hollow dot), connecting/offline states in neutral text.
5. Verified facts get a teal "verified" chip (`Creator verified ✓`). Warnings and destructive controls use danger only.
6. Headlines serif, UI sans, data mono. No more than three type sizes in any card.
7. Cards never nest. Secondary blocks ("Got an inbox link?", the world panel, settings) are plain bordered blocks with muted headings.
8. Keep every testid and structural selector used by `scripts/smoke.ts`, `evidence/qa-scripts/*`: see "Markup contract".

## Components

| Component | Where | Notes |
|---|---|---|
| Brand | header | inline SVG mark (sealed envelope: rounded square, flap, teal seal dot) plus serif wordmark; the mark is decorative (`aria-hidden`), the link keeps the text "Sealdrop" |
| Nav | header | three quiet links; on mobile they wrap under the brand |
| Button | everywhere | primary, `.secondary`, `.danger`, `.quiet`; disabled = lowered contrast plus `not-allowed`, but the post-send state is "done", never "disabled-looking" |
| Field | forms | surface background, 1.5 px `--line-strong` border, 10 px radius, 16 px text; textarea 8 rows |
| Chip | status | pill, 13 px, 1 px border; variants live, ok, neutral, warn |
| Bar | expiry, byte meter | 6 px high track + fill, fill width via CSS variable `--fill`; decorative (`aria-hidden`), the text next to it carries the value |
| Hex | all hashes, addresses, keys | see rule 2; variants: truncated (default), full (creator on the send page) |
| Definition grid | inbox card, receipt, console | `dl` as two columns (label muted 13 px, value 15-16 px); one column on mobile |
| Stepper | home | numbered circles on a vertical rail |
| Flow diagram | home | inline SVG, horizontal at 640 px and wider, vertical below; `role="img"` with a full text alternative |
| Tip card | newsroom | time, size bucket, expiry chip with bar, creator hex, Keep/Burn actions |
| Empty state | newsroom | dashed card: "Waiting for tips. Share your inbox link." |
| Success card | send | "Sealed and sent ✓", compact receipt, expandable "What Arkiv stores" |
| Status line | forms | `statusLine()`: info (muted) and error (danger on danger-soft, with an icon-free left rule) |
| Disclosure | world panel, settings, receipt | `details/summary`, summary 44 px high, chevron drawn with CSS |

## Markup contract (kept, so the smoke and QA scripts need no assertion changes)

testids: message, send, tip-text, tip, inbox, create-inbox, live-status, send-result, status, create-newsroom, inbox-link, mode-wallet, mode-demo, route-notice, open-newsroom, open-desk, progress, export, renew, use-wallet, counter, balance, refresh, no-tips, tips, budget, inbox-name, inbox-desc.
Structure: `.me dd a` (full address as textContent), `[data-testid=send-result] dd a` (0 = Tip entity, 1 = Transaction), the first `.result button` is "Send another", `button.danger`, `details.settings > summary`, `[role=alert], .status.error`, exactly one `a.button` on home, `main`, `h1` containing "anonymous tip line". Text: `Live: listening…` / `Reconnecting…` (the chip word, then the sentence; the colon stays in the text for readers and scripts but is not drawn) / `No tips yet.` (the status line after a sweep; the empty-state card has new words, see "UI words changed") / `free query budget` / `no demo sender key` / `No browser wallet found.` stay verbatim.

## Contrast

Token pairs, computed from the real `src/style.css` by `node evidence/design-scripts/contrast.mjs` (WCAG 2.x relative luminance; the script exits 1 if a pair is under its threshold or if the token block above drifts from the CSS; five pairs were also re-checked with a separate formula). Text needs 4.5:1; control borders, the focus ring and bar fills need 3:1. Every pair passes in both themes.

| Pair | Used for | Light | Dark | Needs | Result |
|---|---|---|---|---|---|
| ink on paper | body text on the page | 16.21 | 15.86 | 4.5 | pass |
| ink on surface | text in cards, inputs | 17.67 | 14.66 | 4.5 | pass |
| ink on surface-2 | hex values, code | 14.94 | 13.30 | 4.5 | pass |
| muted on paper | hints, labels, footer | 7.44 | 8.37 | 4.5 | pass |
| muted on surface | hints in cards | 8.11 | 7.73 | 4.5 | pass |
| muted on surface-2 | hints on inset areas | 6.86 | 7.01 | 4.5 | pass |
| accent on paper | links, secondary buttons | 7.15 | 9.30 | 4.5 | pass |
| accent on surface | links and buttons in cards | 7.80 | 8.59 | 4.5 | pass |
| accent-hover on paper | link hover | 9.92 | 11.25 | 4.5 | pass |
| accent-hover on surface | link hover in cards | 10.82 | 10.39 | 4.5 | pass |
| accent on accent-soft | Live / verified chips | 6.46 | 7.44 | 4.5 | pass |
| accent-fg on accent | primary button | 7.93 | 8.88 | 4.5 | pass |
| accent-fg on accent-hover | primary button hover | 11.00 | 10.75 | 4.5 | pass |
| danger on paper | warnings, destructive text | 6.75 | 9.62 | 4.5 | pass |
| danger on surface | warnings in cards | 7.36 | 8.88 | 4.5 | pass |
| danger on danger-soft | error status line, warn chip | 6.12 | 8.47 | 4.5 | pass |
| line-strong on paper | control borders against the page | 3.57 | 4.31 | 3 | pass |
| line-strong on surface | control borders against the field | 3.89 | 3.99 | 3 | pass |
| focus on paper | focus ring on the page | 7.15 | 9.30 | 3 | pass |
| focus on surface | focus ring in cards | 7.80 | 8.59 | 3 | pass |
| accent on track | bar fill against its track | 5.79 | 6.41 | 3 | pass |

Rendered check (not only tokens): `A11Y=1 node evidence/design-scripts/shoot.mjs <mock dist> <out dir>` reads the computed colour of every visible text element in all 18 states, in both themes, over its real background. 764 text elements per theme; lowest ratio 6.12 in light (the error status line on its pink ground) and 6.70 in dark (a hint in the send form); 0 below 4.5. The flow diagram's text is ink and muted on surface (17.67 / 8.11 light, 14.66 / 7.73 dark); its outlines use line-strong or accent, its arrows muted. Not measured: disabled buttons (WCAG exempts them; they exist only while a send is running) and Windows forced-colors mode.

## Keyboard, focus, labels, language, titles

- Focus: a 3 px ring (`outline: 3px solid var(--focus); outline-offset: 2px`) on every link, button, input and summary; ring contrast is in the table above. The audit (`auditPage` from the QA scripts, desktop, light) found 0 Tab stops without a ring and 0 unlabeled or unnamed fields in all 18 states. A heading that receives focus from script (the success heading after a send) is not a Tab stop and shows no ring.
- Page language and titles: `lang="en"` on every page; titles `Sealdrop: an anonymous tip line with no server`, `Newsroom console: Sealdrop`, `Send a tip: Sealdrop`; exactly one `h1` and one `main` per state.
- Keyboard path through the 60-second flow, `node evidence/design-scripts/keyboard.mjs <mock dist> chromium|firefox` (mock-backed, production CSP, 0 RPC; ALL PASS in Chromium and in Firefox):
  1. Home: "Start: open a newsroom" is the 5th Tab stop (brand, three nav links, Start); Enter opens the newsroom page.
  2. After the page change the first Tab lands in the page content ("Create a throwaway newsroom"), not back in the header (the browsers keep the sequential focus position where the removed link was); Enter creates the newsroom.
  3. "Create the inbox" is the 8th Tab stop on the console (address, "Copy newsroom address", faucet, "Export key file", "Forget this newsroom", Name, Description, then the button); Enter creates it; once the inbox exists, "Copy inbox link" is 2 Tab stops away.
  4. Send page: the message box is the 11th Tab stop (4 header links, then the creator, owner and inbox entity values, each followed by its copy button). After typing, the next Tab stop is the lifetime group (14 days preselected); ArrowRight and ArrowLeft move it 14 to 30 to 7 days; two more Tab stops reach "Seal and send" (the "Shared demo key" radio, then the button); Enter sends.
  5. After the send, focus moves to the heading "Sealed and sent ✓" (a screen reader announces it); the next Tab stop is "Send another"; Enter returns to the message box with focus in it.
  6. 0 console or page errors; the bar fills set through CSSOM take effect under the production CSP (the receipt bar fills its track in both browsers).
- Not built: a "skip to the message" shortcut on the send page (11 Tab stops before the message box). The creator, owner and entity values are the content a careful source wants to read first, so this was left as is.

## Decisions

- Why the creator address is shown in full on the send page: the "Creator verified ✓" chip says the app checked the link against Arkiv, but a source may also compare the address with one the newsroom published elsewhere; truncation would remove that option. All other hex values are truncated.
- Why `div` bars and not `<meter>`: identical result in Chromium and Firefox without vendor pseudo-elements; the bars are decorative and the text beside them is the accessible value.
- Why a radiogroup for the tip lifetime instead of the `<select>`: four choices (1, 7, 14, 30 days) are better as visible options, and the default (14 days) stays pre-selected. It is a `div[role=radiogroup]`, not a `fieldset`, so the first `fieldset` on the page is still "Send with".
- `src/crypto.ts` gains one exported function, `bucketFor(messageBytes)`; `pad()` now calls it and the size meter on the send page reads it, so the meter and the real padding cannot disagree. Behaviour is unchanged (the 23 unit tests pass without edits). `src/arkiv.ts`, `src/codec.ts` and `src/config.ts` are untouched.
- Design screens were produced with a stubbed data layer (`evidence/design-scripts/`: the page code is the real build, only `src/arkiv.ts` is swapped for a fixed-data module, time is frozen, zero RPC queries). Real-network screens are regenerated by the QA smoke scripts. `src/arkiv.ts` is untouched, so every `#L` anchor in SUBMISSION.md is unchanged.

## UI words changed

For the video stage: these are the words on screen after the design stage (state ids refer to `evidence/screens/design-after/<id>-<desktop|mobile>-<light|dark>.png`). Everything not listed is unchanged word for word: the visible text of all 18 states was diffed before and after (`TEXT=1 node evidence/design-scripts/shoot.mjs`), apart from the hex values, which are now shortened, and the footer line "Public RPC: this tab has made N queries ..." (an unchanged one-second timer in `src/main.ts` writes it, so a capture taken in the first second misses it). README.md, SUBMISSION.md, HANDOFF.md, `arkiv/*.md` and the video brief quote none of the changed strings (the strings they do quote, "WARNING: the owner is not the creator" and "Reconnecting", are unchanged), so none of them needed a wording edit; only the smoke timings were refreshed (see Results).

| Where (state ids) | Before | After |
|---|---|---|
| Home (01, 02): under the headline | nothing | value line: "Sealed in the browser. Stored on Arkiv. Expires on the date the source picks." |
| Home (01, 02): new picture | nothing | flow diagram, four boxes left to right: "Source's browser: writes and seals the tip", "Sealed box: only the newsroom's key opens it", "Arkiv: gone on the expiry date the source picks", "Newsroom's browser: opens it with its own key" (below 640 px the boxes stack with one-line captions). Screen readers get one sentence: "How a tip travels: the source's browser writes and seals it, the sealed box is stored on Arkiv until its expiry date, and the newsroom's browser opens it with its own key." |
| Home (01, 02): last line | "Short on time? Send a made-up tip to the Demo Desk or read the source code." | same words; the two links are quiet text links; the final period is gone |
| Console, before the inbox exists (04, 08) | "Live updates start once the inbox exists." | same words; "Live updates" is drawn as a chip |
| Console, empty state (04, 05, 08) | "No tips yet. Open your inbox link in another tab and send one." | "Waiting for tips." and "Share your inbox link. To try it yourself, open it in another tab and send one." ("No tips yet." is still the status line after a Refresh) |
| Console, inbox card (05 to 07) | button "Copy" | button "Copy inbox link" (filled: the one primary action once the inbox exists) |
| Console, live feed (05, 06) | "Live: listening for new tips on a WebSocket. This page does not poll." | chip "Live" (teal, pulsing dot) followed by "listening for new tips on a WebSocket. This page does not poll." (the colon is kept for screen readers and scripts, not drawn) |
| Console, dropped connection (07) | "Reconnecting: the live connection dropped and is being retried. Tips already on Arkiv are safe; Refresh reads the inbox now." | chip "Reconnecting" followed by "the live connection dropped and is being retried. Tips already on Arkiv are safe; Refresh reads the inbox now." |
| Console, lease (05 to 07) | "alive for 6 d 12 h (until 2026-10-23 21:30 UTC). It expires after 7 days; opening this console renews it." with "Renew now" in the sentence | same sentence with a bar under it; the "Renew now" button sits below |
| Console, tip card (06, 07) | "2026-10-17 09:27 UTC . 1.1 KiB sealed . deletes itself in 14 d 0 h" and a badge "owned by you" | the time; chip "1.1 KiB sealed (1 KiB bucket)"; chip "Expires in 14 d 0 h" with a bar (the chip turns red under one day); the line "owned by you" or "sender still owns it" |
| Send page (10 to 14, 17, 18): inbox card | nothing | chip "Creator verified ✓" at the top; "(matches the link you opened)" stays under the creator address |
| Send page (10 to 13, 17, 18): owner line | the owner address only | the owner address plus chip "Owner is the creator ✓"; the warning "WARNING: the owner is not the creator. Be careful." is unchanged (14) |
| Send page (10, 11): size meter | "617 / 65,532 bytes . Padded to 1, 4, 16 or 64 KiB before sealing, so the length reveals little." | "617 / 65,532 bytes", chip "Padded to 1.0 KiB" (4.0, 16.0 or 64.0 KiB for longer messages) with a bar, then "Padded to 1, 4, 16 or 64 KiB before sealing, so the length reveals little." |
| Send page, over the limit (18) | the counter "75,417 / 65,532 bytes" on one line with the static hint "Padded to 1, 4, 16 or 64 KiB before sealing, ...", nothing marks the message as too long until "Seal and send" is pressed | a red chip "Too long" beside the counter and a full bar; the hint and the refusal "The message is too long (limit 65532 bytes)." (shown on pressing "Seal and send") are unchanged |
| Send page (10, 11): lifetime | "Delete it after" with a drop-down list (1 day, 7 days, 14 days, 30 days) | "Delete it after" with four visible choices "1 day", "7 days", "14 days", "30 days" (radio buttons, "14 days" preselected); the hint "You choose the Entity Expiration. The newsroom can burn it earlier or keep it longer." is unchanged |
| Send page, after sending (13) | status line "Sent.", heading "Sent", "This is everything Arkiv stores about it:" with the full list, and the "Seal and send" button greyed out | one card: heading "Sealed and sent ✓" with the button "Send another"; "Your message was sealed in this browser and handed to the inbox owner. Only the newsroom's decryption key opens it." is unchanged; the receipt shows Tip entity, Transaction and Expires; "This is everything Arkiv stores about it:" with $creator, $owner, Attributes and Payload moved into a closed disclosure "What Arkiv stores"; no "Sent." line; the form is hidden until "Send another" |
| Every page: 0x values | the full value as a blue link | shortened in the middle (`0x19E7…ff2A`: 6 leading characters, 4 trailing), mono, with a copy button; the full value is in the tooltip and the accessible name. The creator address on the send page stays complete (two lines). |
| Header (every page) | the word "Sealdrop" | the word "Sealdrop" with a small envelope mark; the nav words "Open a newsroom", "Demo Desk", "Source" are unchanged |

Unchanged on purpose (so captions can keep using them): the headlines "An anonymous tip line with no server to seize", "Newsroom console", "Tips" and "Send a tip"; the lead paragraph; the three 60-second steps and the button "Start: open a newsroom"; "Got an inbox link?"; "Create a throwaway newsroom", "Create the inbox", "Export key file", "Forget this newsroom", "Refresh (full sweep)", "Keep 30 more days", "Burn now", "Seal and send", "Send another"; the sentence "Everyone in demo mode shares one public testnet address, so it cannot identify you. ..."; "What can anyone see on Arkiv for this inbox?", "Queries this page runs", "Settings"; the footer.

## Results

Run on the final code (nothing under `src/` changed after the last gate run). Local commits only, nothing pushed. Public RPC use for the whole stage: 63 queries (6,300 units) in about 30 minutes, under the 70 queries/hour limit (ledger: smoke 10, final smoke 10, subpath smoke 10, Firefox 9, QA tour 22, unfunded-key run 2). All message text is synthetic.

| Check | Result | Where |
|---|---|---|
| Gate: `node scripts/secret-scan.mjs && npm test && npm run build && npm run check:bundle` | exit 0: secret scan clean, 3 test files with 23 tests passed, build ok, bundle check all rules pass | `design-logs/gate.txt` |
| Smoke, judge path, Chromium, live Tiramisu testnet | 13 PASS, 20.1 s from opening the newsroom to the decrypted live tip | `smoke.txt` |
| Smoke served under the `/sealdrop/` subpath | 13 PASS, 19.5 s | `smoke-subpath.txt` |
| Firefox 153, judge path, production CSP | 8 PASS, 30.6 s, 9 queries, 0 console errors | `design-logs/ff-judge.out` |
| Mobile 390x844, DPR 2, touch, live testnet (QA tour, section C) | no horizontal overflow in 6 states; every button at least 44 px high | `design-logs/e-tour.out` |
| QA tour on the live testnet: error states E1 to E10, a 64 KiB tip, Hebrew + emoji, injected 429, wallet declines, unfunded demo key | 21 PASS, 0 FAIL (19 in `e-tour.out`, 2 in `e-tour-e8.out`) | `design-logs/e-tour*.out` |
| Keyboard path through the 60-second flow (`keyboard.mjs`) | ALL PASS in Chromium and in Firefox; every Tab stop shows a ring | `design-logs/keyboard-*.txt` |
| Accessibility audit, 18 states, light desktop | `lang="en"`, one `h1`, one `main`, a title, 0 unlabeled or unnamed fields, 0 Tab stops without a ring; live testnet console with 20 tips: 121 Tab stops, 0 without a ring | `design-logs/a11y-audit.txt`, `e-tour.out` |
| Contrast, both themes | 21 token pairs pass (table above); rendered scan of 764 text elements per theme: lowest 6.12 light, 6.70 dark, 0 below AA | `design-logs/contrast.out`, `design-logs/a11y-audit.txt` |
| Console and page errors | 0 in every run above (the injected 429 of E9 shows up as a failed resource load in the browser log; the tour does not count that deliberate fault) | all logs |
| New runtime dependencies | none (`package.json` and `package-lock.json` are unchanged) | `git diff` |

Bundle, gzip -9 per file of `dist/` (same `.env.local`, same Vite; `design-logs/bundle-sizes.txt`):

| File | Before (5f83e23) | After | Growth |
|---|---|---|---|
| `index.js` | 126,769 B | 129,071 B | +2,302 B |
| `index.css` | 1,407 B | 4,492 B | +3,085 B |
| `index.html` | 783 B | 1,140 B | +357 B |
| `ccip.js`, `native.js` | 1,520 B | 1,519 B | -1 B |
| Total | 130,479 B | 136,222 B | +5,743 B (4.4 %), limit 10,000 B |

Screens:

- `evidence/screens/design-before/` and `design-after/`: 72 PNGs each (18 states, desktop 1280x800 and mobile 390x844, light and dark), taken by `shoot.mjs` from the 5f83e23 build and from the final tree with the same stub data and zero RPC queries. For the after set the script reports 0 horizontal overflows and 0 console errors in all 72 captures. State 18 (`18-send-toolong`) is the only state over the size limit.
- `evidence/screens/compare-home.png`, `compare-newsroom-tips.png`, `compare-send-typed.png`, `compare-send-sent.png`: four side-by-side images, before on the left, after on the right.
- Refreshed from the live smoke run: `demo-desk-sent.png`, `newsroom-live-tip.png`, `rate-limited-send.png`, `source-sent.png`.
- Not refreshed: the other live-testnet screens from the QA stage (`desktop-*`, `mobile-*`, `home-before-*`, `home-after-*`, `hebrew-rtl-before-after.png`, `wallet-*`) show the earlier design; `evidence/qa.md` cites them as QA evidence. This stage's live-testnet tour screens stayed in scratch space.

Documents: `README.md` (the smoke paragraph now quotes the 20.1 s run in `smoke.txt`) and `evidence/qa.md` (two parentheticals and one note saying that the smoke files hold the design-stage re-runs) are tracked. `HANDOFF.md` and `SUBMISSION.md` are gitignored and were edited in place (smoke timings only). No claim in README.md, SUBMISSION.md or the video brief quotes a changed UI word (see "UI words changed").

Reproduce: `bash evidence/design-scripts/build-mock.sh HEAD|worktree <out>` builds the stub-backed app; `node evidence/design-scripts/shoot.mjs <dist> <out> [ids]` takes the screens (`A11Y=1` adds the label, focus-ring and rendered-contrast audit, `TEXT=1` writes the visible words); `node evidence/design-scripts/keyboard.mjs <dist> chromium|firefox`; `node evidence/design-scripts/contrast.mjs` (exits 1 on a failing pair or when the token block above drifts from `src/style.css`).

NOT VERIFIED:

- Motion (the pulsing dot on "Live", bar and chip transitions) was not watched in a recording. Every screenshot is taken with `prefers-reduced-motion: reduce`; the motion lives in one reduced-motion block and short (120 and 200 ms) transitions in `src/style.css`.
- No screen reader was run. Labels, accessible names, headings, `lang`, titles and the flow diagram's `role="img"` text were checked programmatically only.
- Safari and WebKit, Windows forced-colors mode and a real phone were not tested; "mobile" is Chromium emulation (390x844, DPR 2, touch). Firefox was tested on desktop only.
- Contrast of disabled buttons (WCAG exempts them).
