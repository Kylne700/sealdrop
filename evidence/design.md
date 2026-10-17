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
5. Verified facts get a teal "verified" chip (`Key matches this link ✓`, `Owner is the creator ✓`). Warnings and destructive controls use danger only.
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
| accent on surface-2 | hex values that link to the explorer | 6.59 | 7.79 | 4.5 | pass |
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

Rendered check (not only tokens): `A11Y=1 node evidence/design-scripts/shoot.mjs <mock dist> <out dir>` reads the computed colour of every visible text element in all 18 states, in both themes, over its real background. 782 text elements per theme (18 more than before the skip link existed: it is off screen until focused but counted in every state); lowest ratio 6.12 in light (the error status line on its pink ground) and 6.70 in dark (a hint in the send form); 0 below 4.5. The flow diagram's text is ink and muted on surface (17.67 / 8.11 light, 14.66 / 7.73 dark); its outlines use line-strong or accent, its arrows muted. Not measured: disabled buttons (WCAG exempts them; they exist only while a send is running) and Windows forced-colors mode.

## Keyboard, focus, labels, language, titles

- Focus: a 3 px ring (`outline: 3px solid var(--focus); outline-offset: 2px`) on every link, button, input and summary; ring contrast is in the table above. The audit (`auditPage` from the QA scripts, desktop, light) found 0 unlabeled or unnamed fields in all 18 states and 0 walked Tab stops without a ring (the `tabStops=walked/focusable` column of `design-logs/a11y-audit.txt`; states 12, 13 and 17 walked only 3, 9 and 6 stops; step 5 of the keyboard runs below walks and ring-checks the receipt, both disclosures and the links inside them). A heading or container that receives focus from script is not a Tab stop (`tabindex=-1` only while it holds focus): the success heading after a send and `main` after the skip link show no ring, and the page `h1` that gets focus after a route change shows the ring only when the browser reports `:focus-visible` (after a keyboard move, not after a mouse click).
- Page language and titles: `lang="en"` on every page; titles `Sealdrop: an anonymous tip line with no server`, `Newsroom console: Sealdrop`, `Send a tip: Sealdrop`; exactly one `h1` and one `main` per state.
- Keyboard path through the 60-second flow, `node evidence/design-scripts/keyboard.mjs <mock dist> chromium|firefox` (mock-backed, production CSP, 0 RPC; ALL PASS in Chromium and in Firefox):
  1. Home: Tab stop 1 is the skip link "Skip to content"; "Start: open a newsroom" is the 6th stop (skip link, brand, three nav links, Start); Enter opens the newsroom page.
  2. After the page change focus is on the new page's heading ("Open a newsroom") and the first Tab lands in the page content ("Create a throwaway newsroom"), not back in the header (the sequential focus position is the heading, which sits below the header); Enter creates the newsroom.
  3. "Create the inbox" is the 8th Tab stop on the console (address, "Copy newsroom address", faucet, "Export key file", "Forget this newsroom", Name, Description, then the button); Enter creates it; once the inbox exists, "Copy inbox link" is 2 Tab stops away.
  4. Send page: the message box is the 12th Tab stop (the skip link and 4 header links, then the creator, owner and inbox entity values, each followed by its copy button). After typing, the next Tab stop is the lifetime group (14 days preselected); ArrowRight and ArrowLeft move it 14 to 30 to 7 days; two more Tab stops reach "Seal and send" (the "Shared demo key" radio, then the button); Enter sends.
  5. After the send, focus moves to the heading "Sealed and sent ✓" (a screen reader announces it); the next Tab stop is "Send another". Tab on through the receipt (two explorer links, each with its copy button), "What Arkiv stores" (Enter opens it; the creator and owner links and copy buttons sit inside) and "What can anyone see on Arkiv for this inbox?" (Enter opens it; its explorer link) up to "Queries this page runs": a ring at every stop. Then Enter on "Send another" returns to the message box with focus in it.
  6. 0 console or page errors; the bar fills set through CSSOM take effect under the production CSP (the receipt bar fills its track in both browsers).
- Not built: a second shortcut to the message box on the send page. The skip link jumps the 4 header links; 6 stops (the creator, owner and inbox values, each with its copy button) remain before the message box. They are the content a careful source wants to read first, so they stay in the path.

## Accessibility polish

Added after the design stage. `src/arkiv.ts` and the design tokens are untouched, no dependency was added, and the bundle grows by 143 B gzipped (see Results).

- Skip link: `<a class="skip" href="#app">Skip to content</a>` is the first element of `<body>`, so it is Tab stop 1 on every page. It sits off screen (`transform: translateY(-200%)`) and moves into the top-left corner on `:focus`, drawn with the existing pairs "accent-fg on accent" (7.93 light, 8.88 dark) and "accent-fg on accent-hover" (11.00, 10.75) plus the global focus ring. A click handler (`preventDefault`, then focus on `<main id="app">`) replaces the anchor jump, so `location.hash` does not change, no `hashchange` fires, the history gets no entry and the page is not rendered again. The next Tab lands on the first stop inside the page.
- Route changes: the end of `route()` moves focus to the page's `h1` (`tabindex=-1`, removed again on blur). The first render of a page load does not (a `#/demo` redirect on a first load counts as part of it), so the browser keeps its own start point. The `h1` shows the ring only when the browser reports `:focus-visible` (after a keyboard move, not after a mouse click); `main` and the success heading never show one. The three page titles already existed (see above); the checks now assert the right one after each route change they exercise.
- In-page updates never move focus: the polish adds focus moves only in `route()`, and `route()` runs only on a hash change and once at load (`src/main.ts:42-43`). A tip arriving over the WebSocket, the connection chip, a lease renewal and the 1 s footer meter do not call it. (The restores added below by `keepFocus` act only when an update dropped focus to the page start; they never move focus that is anywhere else.) The two focus moves that already existed are unchanged and are triggered by the user's own action: the "Sealed and sent ✓" heading after a send (`src/pages/send.ts:163`) and "Send another" putting focus back in the message box (`src/pages/send.ts:143`).
- Checks: `keyboard.mjs` A1 to A8 (56 checks in both browsers) and 10 more PASS lines in `smoke.ts`; no earlier assertion was loosened. They fail on the pre-polish build (A2, A4) and on a mutant build in which an arriving tip moves focus to the `h1` (5 FAIL lines in A7). `evidence/design-scripts/mock-arkiv.ts` gained `window.__push` so the keyboard walk can deliver a tip or flip the connection chip while it types; `smoke.ts` leaves the accessibility checks out of its judge-path timers.
- Focus after a re-render (the former "known limit", fixed): an update that removed or disabled the focused control used to drop focus to the page start. `keepFocus(region, fallback)` (`src/ui/dom.ts:154`) notes the focused control before the update (its tip row by `data-key`, tag, id, accessible name, and which of equals it is) and, after the update, puts focus back on the same control only if focus fell to the page start and `region` is still on the page; focus that is on nothing or anywhere else is left alone, so nothing is stolen (a live tip never moves focus, A1 to A8 unchanged). A tip that is gone (burned) hands focus to the same control on the next tip, then the previous tip, then the "Tips" heading (`tabindex=-1` only while it holds focus). `focusFromScript` (`src/ui/dom.ts:133`) moved there from `src/main.ts` (imports at `:6`, uses at `:15` and `:38`) and now also survives the window blur of a closing `confirm()`, which in Chromium removed the heading's `tabindex` before the browser could give it focus. Used at: a live tip, "Keep until 30 days from now" and "Burn now" (`src/pages/newsroom.ts:186`, heading at `:107`), "Refresh (full sweep)" (`:224`), "Create the inbox" (`:325`), "Renew now" (`:348`), "Forget this newsroom" and "Create a throwaway newsroom" (`again`, `:26`) and "Seal and send" after an error (`src/pages/send.ts:117`). No word on screen changed and no accessible name was added; the existing status lines ("Burned.", "Kept:", "Renewed.") still announce the result. After a mouse click the restored button has focus but no ring (`:focus-visible` stays off), as before.
- Checks for it, `keyboard.mjs` A9 to A13 (23 new checks, 79 PASS in Chromium and in Firefox, `design-logs/keyboard-chromium.txt`, `keyboard-firefox.txt`): A9 a live tip while focus is on each of the 5 stops of a tip row (address link, copy button, explorer link, "Keep until 30 days from now", "Burn now"), Enter and a mouse click on "Keep until 30 days from now", and two never-steal checks (focus on nothing, focus outside the list); A10 "Burn now" on the middle, the last and the only tip, and when the next tip is not the newsroom's; A11 "Renew now" after success and after a failed renewal; A12 "Send another" with the space bar (a regression guard: this case already worked); A13 "Refresh (full sweep)", "Seal and send" after an error, "Forget this newsroom" and "Create a throwaway newsroom"; "Create the inbox" is checked in step 3. They fail on a build of 3b99951 (same mock, `design-logs/keyboard-focus-before-chromium.txt`, `keyboard-focus-before-firefox.txt`): 16 FAIL in each browser, the 3 that pass there are A12 and the two never-steal checks, and the later 4 stops of the A9 walk are not reached because focus is lost at the first. On a mutant in which every update moves focus to the heading, both never-steal checks and 5 A7 checks FAIL (13 FAIL in all, Chromium). `mock-arkiv.ts` gained `sweepMs` and `renewFail` for them.
- Audit of every `replaceChildren`, `hidden =`, `remove()` and `again()` in `src/` (30 sites; there is no `remove()` call): fixed are `newsroom.ts:26,41,53,66,419` (`again`: import file, wallet, throwaway newsroom, Forget; focus goes to the new page's h1), `:187` (tip list), `:225,237` (Refresh), `:326,334` (Create the inbox) and `:349,358,364` (Renew), and `send.ts:118,169` (Seal and send). Safe: `main.ts:20` (a route change, which focuses the new h1), `dom.ts:97,98` (only the icon inside the copy button is swapped; the button keeps focus), `newsroom.ts:102` and `send.ts:68` (status chips with nothing focusable in them), `newsroom.ts:188` (the empty-state text has no focusable child), `:339` and `:389` (the setup form and the key-mismatch notice are drawn from `load()` before the user can focus anything in that panel), `send.ts:137,138,140` (the result replaces the form and `done.focus()` at `:163` moves focus there on purpose), `:143` ("Send another" focuses the message box, guarded by A12) and `:182,186,191` (the public-view list is filled once by the `toggle` event of its `details`, while focus is on the `summary`).
- Limits that remain: after "Create the inbox" focus returns to the new inbox heading when the first sweep has finished, because `load()` includes it (one live round trip); a focus the user moved meanwhile is left alone. Not run: a real screen reader (NVDA, JAWS, VoiceOver) and Safari; the checks use real key presses and `document.activeElement` in Chromium and Firefox. `send.ts:163` still focuses the success heading unconditionally (unchanged).

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
| Every page: 0x values | the full value as a blue underlined link to the Data Explorer | shortened in the middle (`0x19E7…ff2A`: 6 leading characters, 4 trailing), mono, in a grey chip; the value is still the link to the Data Explorer (new tab, underlined on hover) and a copy button follows; the full value is in the tooltip and the accessible name. The creator address on the send page stays complete (two lines). |
| Header (every page) | the word "Sealdrop" | the word "Sealdrop" with a small envelope mark; the nav words "Open a newsroom", "Demo Desk", "Source" are unchanged |
| Console, tip card (fix stage 2, A-W2) | button "Keep 30 more days" (it set the expiry to 30 days from now, not +30) | button "Keep until 30 days from now" (the status lines already said "30 days from now") |
| Console, key file (fix stage 2, A-W4) | nothing next to "Export key file" | hint under the buttons: "Export the key file: if you clear the browser data, or close Tor Browser, the keys are gone and so is the access to every tip." |
| Send page, wallet mode (fix stage 2, A-W5) | status "Writing to Arkiv: create the tip and hand it to the newsroom in one batch (about 5 s)..." while the wallet still waited | "Confirm in your wallet..." until the wallet answers, then the writing status (demo key: the writing status as before) |
| No-JavaScript page (fix stage 2, T1) | "Sealdrop needs JavaScript: the message is sealed in your browser." (full page width) | "Sealdrop needs JavaScript. In Tor Browser, set the security level to Standard or Safer (shield icon), then reload." (in the page column) |
| Error, RPC answers HTTP 5xx (fix stage 2, N1) | "HTTP request failed. Try again; if it keeps failing, reload the page or set your own RPC under Settings." | "The Arkiv RPC is having trouble (HTTP 500). Try again in a minute, or use another RPC under Settings." (the real status code) |
| Error, browser will not store the newsroom keys (fix stage 3, R1) | "This browser would not store the newsroom keys (its storage is full, or site data is blocked, as in some private windows), so nothing was created. Allow site data for this page or use another browser, then try again. Try again; if it keeps failing, reload the page or set your own RPC under Settings." (the same RPC tail after "The newsroom stored in this browser cannot be read, and it could not be backed up, so it was not replaced.") | the same sentences without the RPC tail |
| Error, outcome of a write unknown: the connection dropped after the signed transaction left, or no receipt came back (fix stage 3, R4) | for example "Transaction failed: Execution error without revert data. Try again; if it keeps failing, reload the page or set your own RPC under Settings.", or for an HTTP 5xx while waiting for the receipt "The Arkiv RPC is having trouble (HTTP 502). Try again in a minute, or use another RPC under Settings.", or for a spent query budget (429) while waiting for the receipt "The free query budget of the public Arkiv RPC is used up (it renews in about 30 min). Wait a little, or enter your own RPC URL under Settings." (a 429 to the send itself keeps that text) | "The result of this transaction (0x…) is unknown. It may have been sent. Check the newsroom console, or the Data Explorer link, before you send it again." (the part in brackets only when a hash came back; every action that writes on chain) |
| Send page, no receipt within 180 s (fix stage 3, A-W5) | the tip was sent again, up to 3 tries: a new "Confirm in your wallet..." prompt for the same tip (with the demo sender key, a second transaction) | no new try; the R4 message above |
| Error, outcome of a write unknown, send page and console (fix stage 4, L-05 and nit 2; replaces the fix stage 3 R4 words) | "The result of this transaction (0x...) is unknown. It may have been sent. Check the newsroom console, or the Data Explorer link, before you send it again." | "The result of this transaction is unknown: it may have gone through, so trying again could do it twice." With a hash it goes on: "Look up its hash 0x... on the Arkiv Data Explorer to see whether it did." Also shown now when the answer to the send times out, when the node answers "already known", and when a written tip cannot be read back (L-04): those were sent again before |
| Console, a live tip arrives while the RPC fails with 5xx (fix stage 4, L-01) | nothing: the tip was dropped until a manual Refresh | "A new tip may have arrived, but it cannot be read yet." + the RPC error (for example "The Arkiv RPC is having trouble (HTTP 500). Try again in a minute, or use another RPC under Settings.") + "It loads by itself once the RPC answers again." |
| Console, status line after a catch-up that worked (fix stage 4, L-02) | the last read error stayed, or "No tips yet." next to listed tips | "1 tip on Arkiv." / "N tips on Arkiv.", or "No tips yet." when there are none |
| Console, Keep or Burn on an expired tip (fix stage 4, L-06) | Keep: "Transaction failed: entity 0x... expired at block N. Try again; ..."; Burn: "Burned." | "This tip has expired, so it is no longer on Arkiv." and the row goes (Refresh also drops expired rows). If the chain refuses for a missing entity: "This tip is no longer on Arkiv: it expired, or it was burned already." |
| Console, opening it when the lease check or renewal fails (fix stage 4, L-07) | the error only: no inbox card, no link, Refresh did nothing | the inbox card, the link and the tips as usual, then "The inbox lease could not be checked or renewed." + the reason + ""Renew now" under Lease tries again." |
| Console, opening it when Arkiv cannot be read (429, 5xx) (fix stage 4, L-08) | the error only: no link, Refresh did nothing | heading "Inbox not read yet", "Arkiv could not be read, so the inbox, its lease and the tips are not shown yet. If the inbox exists, this is its link. Refresh tries again.", then the usual "Your inbox link: give it to sources" field and "Copy inbox link"; the status line gives the reason; Refresh reads everything again |
| Budget line under the page (fix stage 4, nit 1) | "This tab has made 1 queries" | "This tab has made 1 query" (2 and more: "queries") |
| Console, the outcome of a lease renewal is unknown, on open (two tabs) or after "Renew now" (fix stage 5, item 1) | on open: "The inbox lease could not be checked or renewed. The result of this transaction is unknown: it may have gone through, so trying again could do it twice. "Renew now" under Lease tries again."; after "Renew now": the unknown-outcome sentence alone | "Whether the lease was renewed is unknown. Reload to see the expiry under Lease. If needed, "Renew now" renews it again, and a second renewal does no harm." ("Reload" because after this error the Lease line still shows the expiry read before the renewal; a reload reads it again, Refresh does not). A real failure, such as no GLM, keeps the fix stage 4 words |
| Console, Arkiv could not be read on open (fix stage 5, item 2) | the "Waiting for tips." card under "Inbox not read yet" | no card until a read works |

Unchanged on purpose (so captions can keep using them): the headlines "An anonymous tip line with no server to seize", "Newsroom console", "Tips" and "Send a tip"; the lead paragraph; the three 60-second steps and the button "Start: open a newsroom"; "Got an inbox link?"; "Create a throwaway newsroom", "Create the inbox", "Export key file", "Forget this newsroom", "Refresh (full sweep)", "Keep until 30 days from now", "Burn now", "Seal and send", "Send another"; the sentence "Everyone in demo mode shares one public testnet address, so it cannot identify you. ..."; "What can anyone see on Arkiv for this inbox?", "Queries this page runs", "Settings"; the footer.

### Fix stage 1 (2026-10-17, security and browser QA)

Words and screens changed by the first fix stage (findings C2-C15, B1-B12, A1 of the final QA). The video must be re-recorded against these.

| Where | Before | After |
|---|---|---|
| Inbox link (console, Copy inbox link; Demo Desk link; #/demo redirect) | `#/send/<creator>/<inbox id>` | `#/send/<creator>/<inbox id>/<key check>`: 22 more characters, the base64url of the first 16 bytes of SHA-256 of the inbox public key |
| Send page, inbox card heading chip | "Creator verified ✓" (teal) | link with key check: "Key matches this link ✓" (teal); old link: "No key check" (danger colour) |
| Send page, under the inbox card (old link only) | nothing | alert, danger colour: "This link has no key check. Ask the newsroom for its current link." Sending stays possible |
| Send page, key does not match the link | the inbox loaded | no inbox card; alert: "The key of this inbox does not match the key check in your link, so you cannot send to it from here. Someone may be answering in the newsroom's place, for example a dishonest RPC. Do not send anything; ask the newsroom for its current link." followed by the queries and Settings |
| Send page, detail labels (A1) | "Created by ($creator)", "Owned by ($owner)" | "Created by", "Owned by" |
| Send page, under the creator address | "(matches the link you opened)" | "(the address in this link)" and a new hint line: "Compare this address with the one the newsroom publishes elsewhere, for example on its website. A look-alike link has a different address." |
| Send page and console, inbox name | plain text | wrapped in `<bdi dir="auto">`; bidi and zero-width characters are removed from names, and an inbox whose name is empty after that does not load |
| Send page, error while showing an inbox (B10) | "Something went wrong: <raw message>" | "Something went wrong while showing this inbox: <explained error>" (see the last rows: every explained error now ends with a next step) |
| Send page, while sending (B7) | nothing | the browser's own "Leave site?" prompt on reload or close |
| Invalid link notice | "... looks like https://.../#/send/0x<40 hex characters>/<inbox-id>. ..." | "... looks like https://.../#/send/0x<40 hex characters>/<inbox-id>/<key check>. ..." |
| Home, how-it-works step 3 | "The page finds the inbox by its on-chain creator ($creator), so nobody can publish a look-alike under the newsroom's link." | "The page finds the inbox created by the address in the link and refuses it if its key does not match the key check in the link." |
| Settings (every page that has it) | nothing | warning hint (danger colour): "Use only an RPC you trust. It sees your IP address and answers every inbox lookup, so a dishonest one could show you a different inbox key. A link with a key check refuses such a key; a link without one cannot tell." |
| Settings, save fails | the page reloaded with the setting lost | alert: "This browser would not store the setting (its storage is full or blocked). Allow site data for this page, then try again." |
| Footer, while a custom RPC is set | "Public RPC: this tab has made N queries ..." (only after a query) | always: "Custom RPC: <host>. Change it under Settings." plus "This tab has made N queries (M cost units)." once it has queried |
| Any page inside a frame (C14) | the app ran | only "Sealdrop does not run inside another page. Open it in its own tab." |
| Console, Create a throwaway newsroom when storage is blocked or full (C6, B1) | nothing visible, or keys kept in memory only | alert before anything is written on chain: "This browser would not store the newsroom keys (its storage is full, or site data is blocked, as in some private windows), so nothing was created. Allow site data for this page or use another browser, then try again." |
| Console start, stored newsroom unreadable (B2) | the new-user screen, and Create overwrote the old value | alert: "The newsroom stored in this browser cannot be read. Creating or importing a newsroom keeps a copy of it in this browser's local storage under "sealdrop:newsroom:v1:backup"." |
| Console, key file import errors (C8, B2-3) | raw parser messages | "This is not a Sealdrop newsroom file." or a named problem ("The file has no valid address.", "The file is incomplete.", "The file has no valid creation date.", "The file has no valid inbox id.", "The file has no valid decryption key.", "The decryption key does not match its public key.", "The wallet key does not match the address.", "A wallet newsroom file must not hold a wallet key."), always followed by "Choose the key file Sealdrop exported for this newsroom (sealdrop-newsroom-<inbox id>.json), unchanged." |
| Console, tip list | the whole list re-rendered on each new tip; one bad row emptied it | rows are added in place (newest first) and a bad row is skipped (C5, C9); a tip whose sealed bytes repeat an earlier one shows "Same sealed bytes as tip <short key>: a copy, not a second source." (C10) |
| Console, live tip while the RPC budget is spent (C4) | nothing | status: "A new tip may have arrived, but the free query budget of the public Arkiv RPC is used up, so it cannot be read yet. It loads by itself when the budget renews (in about N min)." |
| Console, countdowns (B6) | device clock | the chain's latest block time |
| Console, Create the inbox (B4) | focus fell to the page body for the whole creation (about 20 s live) | focus moves to the status line at once, then to the inbox heading when it appears; back to the button on error |
| Console, onboarding hint | "The key file holds secrets, keep it private." | "The key file holds secrets; keep it private." |
| Expiry and padding bars, forced-colors mode (B3) | invisible | track outlined in CanvasText, fill in Highlight |
| Video slide 3 ("$creator and $owner") | "Reject look-alike inboxes; hand each tip over." | "Load only the linked address's inbox; hand each tip over." |
| Narration, verify and Arkiv lines | "first verifies the inbox on Arkiv: its creator, its owner, and its lease."; "uses the creator to reject look-alike inboxes" | "first checks the inbox on Arkiv: its key against the link, then its creator, owner and lease."; "loads only the inbox made by the address in the link" |
| Home, "Got an inbox link?" (B2-1) | Enter in the paste field did nothing | Enter opens the link, like the Open button (the field and button are now a form) |
| Home, paste error | "That does not look like a Sealdrop inbox link." | "That does not look like a Sealdrop inbox link. Paste the whole link the newsroom gave you, starting with https://." |
| Every error status line (B2-2) | role=alert with aria-live=polite | role=alert with aria-live=assertive (no visible change) |
| Settings, URL not https | "The RPC URL must start with https://." | "The RPC URL must start with https://. Copy the full URL your RPC provider gave you." |
| Any unexplained error (B2-4) | the raw first line only | the first line, then "Try again; if it keeps failing, reload the page or set your own RPC under Settings." |
| No browser wallet (send page; console "Use my wallet") | "No browser wallet found." | send page: "No browser wallet found. Install a wallet extension such as MetaMask, or choose the shared demo key." (the last part only in a build with the demo key); console: "No browser wallet found. Install a wallet extension such as MetaMask, or create a throwaway newsroom instead." |
| Wallet gives no account | "The wallet returned no account." | "The wallet returned no account. Unlock the wallet and allow this page to connect, then try again." |
| Throwaway newsroom without its wallet key | "The key file has no wallet key." | "This newsroom has no wallet key, so it cannot sign. Import its key file again, or create a new newsroom." |
| Send replaced by a concurrent transaction | "This tip was replaced by a concurrent transaction from the same sender key" | "This tip was replaced by another transaction from the same sender key, so it was not sent. Send it again." |
| Console, tip text (B2-5) | a U+202E in a tip could reverse text past it, and stacked combining marks painted over the next row | the text is bidi-isolated and clipped to its own box |

### Fix stage 6 (2026-10-17, QA R2)

Words and screens changed by fix stage 6 (findings R2-D1, S1, S2, S4, S7, S8 and S9a-d of QA R2). State ids are those of R2's screens harness (`evidence/final-qa/R2/scripts/screens/shoot-r2.mjs`); the shots of this stage are in `evidence/fix-6/screens/`. Video impact: only R2-S7 can show in the video (the "Create a throwaway newsroom" button on the onboarding screen at 1280 px, states 03, 70, 71: it still wraps to 3 lines, only its padding changed, so the button is taller). README.md, SUBMISSION.md, HANDOFF.md, `arkiv/*.md`, `scripts/video/` and the video brief quote none of the changed strings.

| Where (states) | Before | After |
|---|---|---|
| Send, Burn, Keep, Create the inbox, when the browser sent the signed transaction a second time after its answer was lost (R2-D1; live runs with the fault proxy, not in the mock) | the second copy was refused with "nonce too low" (or "already known"): Send signed the tip again, so one click could make two tips; Burn, Keep and Create the inbox showed a "Transaction failed" error although the first copy had gone through ("already known": the unknown-outcome text) | the page asks the node whether it holds this very transaction; if it does, the normal success follows ("Sealed and sent ✓", "Burned.", "Kept: this tip now expires 30 days from now.", the new inbox). Another sender's "nonce too low" on the shared demo key is still signed again, as before |
| Errors that already say what to do (R2-S1; 72 to 78): wallet without an account, wallet on another network, tip replaced, no browser wallet, no demo key, newsroom without a wallet key, wallet on another account, too little GLM, demo sender out of GLM | the message, then "Try again; if it keeps failing, reload the page or set your own RPC under Settings." | the message alone |
| Outcome of a write unknown and no hash came back (R2-S8; 21, 23 on the send page, 35 in the console) | "The result of this transaction is unknown: it may have gone through, so trying again could do it twice." | the same, then on the send page "Wait a minute, then reload this page and open "What can anyone see on Arkiv for this inbox?" to see whether it did.", in the console "Wait a minute, then reload the page to see whether it did." (with a hash: unchanged) |
| Console, a live tip that cannot be read, not a spent budget (R2-S8, state 53; 51, 53) | "A new tip may have arrived, but it cannot be read yet." + the explained error (53: "Transaction failed: Execution error without revert data. Try again; if it keeps failing, reload the page or set your own RPC under Settings.") + "It loads by itself once the RPC answers again." | "A new tip may have arrived, but the RPC did not answer properly, so it cannot be read yet. It loads by itself once the RPC answers again." (the spent-budget text is unchanged) |
| Console, a live tip while an error is shown (R2-S4; 41) | "A new tip just arrived." replaced the error, for example the failed lease renewal | the error stays; "A new tip just arrived." replaces only a non-error line, or the line of the latest failed read (the tip list, the catch-up or a live tip), which the new tip shows is over |
| Console, Lease card while the lease check or renewal failed, on open or after "Renew now" (R2-S9d; 36 to 41) | "... It expires after 7 days; opening this console renews it." | "... It expires after 7 days." |
| Out of GLM (R2-S9c; 39) | "Get some at the Arkiv faucet (hub.arkiv.network/faucet)." and, demo mode, "(testnet faucet: hub.arkiv.network/faucet)" | the whole URL "https://hub.arkiv.network/faucet", as in the other faucet texts |
| Footer budget line (R2-S9a) | "(1 cost units)" | "(1 cost unit)"; 2 and more: "units" |
| No-JavaScript notice (R2-S9b) | after the footer | between the page and the footer; same words |
| Buttons whose label wraps (R2-S7; 03, 70, 71) | the lines touched the top and bottom edge | the label still wraps (3 lines for "Create a throwaway newsroom" at 1280 px), now with 0.5 rem padding above and below; single-line buttons keep their 44 px height |
| A hash or address in a status line at 390 px (R2-S2; 20, 22, 34, 75, 78) | ran past the right edge (5 to 228 px) | wraps |
| Live tip while an error shows in the console status (lead, after R2-S4) | not announced to screen readers (fix stage 6 kept the error) | the error stays; a hidden polite note says "A new tip just arrived. N tip(s) listed." (screen readers only) |

## Results

Rows marked "polish" were run on the final code of the accessibility polish (nothing under `src/` changed after the last gate run); the other rows are from the design stage and were not repeated. Local commits only, nothing pushed. Public RPC use: design stage 63 queries (6,300 units) in about 30 minutes, under the 70 queries/hour limit (ledger: smoke 10, final smoke 10, subpath smoke 10, Firefox 9, QA tour 22, unfunded-key run 2); polish 40 queries (4,000 units: four smoke runs of 6 + 2 + 2 tab queries each; the keyboard walks, the audit and the screen comparison use the stub data layer and cost 0). All message text is synthetic.

| Check | Result | Where |
|---|---|---|
| Gate (polish): `node scripts/secret-scan.mjs && npm test && npm run build && npm run check:bundle` | exit 0: secret scan clean, 3 test files with 23 tests passed, build ok, bundle check all rules pass | `design-logs/gate.txt` |
| Smoke, judge path, Chromium, live Tiramisu testnet (polish) | 23 PASS (13 before, plus 10 new: skip link, focus after route changes, titles, focus kept while live tips arrive); 20.2 s from opening the newsroom to the decrypted live tip (the timers leave the new checks out); tabs made 6, 2 and 2 queries | `smoke.txt` |
| Smoke served under the `/sealdrop/` subpath (polish) | 23 PASS, same assertions; 20.9 s, recorded one script revision earlier (its timers include about 1 s of the new checks) | `smoke-subpath.txt` |
| Firefox 153, judge path, production CSP | 8 PASS, 30.6 s, 9 queries, 0 console errors | `design-logs/ff-judge.out` |
| Mobile 390x844, DPR 2, touch, live testnet (QA tour, section C) | no horizontal overflow in 6 states; every button at least 44 px high | `design-logs/e-tour.out` |
| QA tour on the live testnet: error states E1 to E10, a 64 KiB tip, Hebrew + emoji, injected 429, wallet declines, unfunded demo key | 21 PASS, 0 FAIL (19 in `e-tour.out`, 2 in `e-tour-e8.out`) | `design-logs/e-tour*.out` |
| Keyboard path through the 60-second flow (`keyboard.mjs`) (polish) | 79 checks (29 before, plus A1 to A8 for the skip link, focus after route changes, titles and focus kept during in-page updates, plus A9 to A13 and "Create the inbox" for focus kept after a re-render), ALL PASS in Chromium and in Firefox (0 FAIL); every Tab stop of the flow, the receipt and both disclosures shows a ring | `design-logs/keyboard-chromium.txt`, `keyboard-firefox.txt`; before the fix 16 FAIL: `keyboard-focus-before-*.txt` |
| Accessibility audit, 18 states, light desktop (polish) | `lang="en"`, one `h1`, one `main`, a title, 0 unlabeled or unnamed fields, 0 walked Tab stops without a ring, one more focusable stop per state (the skip link; states 12, 13 and 17 still walked only 3, 9 and 6 stops, see "Keyboard, focus"); live testnet console with 20 tips: 121 stops walked, 0 without a ring (design stage) | `design-logs/a11y-audit.txt`, `e-tour.out` |
| Contrast, both themes (polish) | 22 token pairs pass (table above; the design.md token block equals `src/style.css`); rendered scan of 782 text elements per theme: lowest 6.12 light, 6.70 dark, 0 below AA | `design-logs/contrast.out`, `design-logs/a11y-audit.txt` |
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

Accessibility polish, same method (`gzip -9` per file; before = the build of the design-stage commit 0a986e8): `index.js` 129,071 B to 129,149 B (+78), `index.css` 4,492 B to 4,538 B (+46), `index.html` 1,140 B to 1,160 B (+20), `ccip.js` 1,327 B to 1,326 B (-1), `native.js` 192 B unchanged; total 136,222 B to 136,365 B, +143 B (limit 1,000 B). Raw: `index.js` +260 B, `index.css` +362 B, `index.html` +52 B.

Focus after re-renders, same method (before = the build of 3b99951): `index.js` 129,149 B to 129,579 B (+430), `ccip.js` 1,326 B to 1,328 B (+2, same 2,835 raw bytes), `index.css`, `index.html` and `native.js` unchanged; total 136,365 B to 136,797 B, +432 B (0.3 %). Raw: `index.js` +1,007 B.

Screens:

- `evidence/screens/design-before/` and `design-after/`: 72 PNGs each (18 states, desktop 1280x800 and mobile 390x844, light and dark), taken by `shoot.mjs` from the 5f83e23 build and from the final tree with the same stub data and zero RPC queries. For the after set the script reports 0 horizontal overflows and 0 console errors in all 72 captures. State 18 (`18-send-toolong`) is the only state over the size limit.
- `evidence/screens/compare-home.png`, `compare-newsroom-tips.png`, `compare-send-typed.png`, `compare-send-sent.png`: four side-by-side images, before on the left, after on the right.
- Refreshed from the live smoke run: `demo-desk-sent.png`, `newsroom-live-tip.png`, `rate-limited-send.png`, `source-sent.png`. The polish run refreshed them again (new addresses and tip text; `rate-limited-send.png` is byte-identical). `newsroom-live-tip.png` was taken 0 ms after the smoke script closed Settings again, so the chevron of the "Settings" row is caught mid-turn (200 ms transition); the script now waits 400 ms before that shot, which was not run live (see NOT VERIFIED).
- Pixel check of the polish: the 72 design screens were shot again from the pre-polish and the polish build on one fixed port with the same stub data: 68 are byte-identical; the 4 of state 17 (`17-send-world`, both viewports and themes) differ in a few anti-aliased pixels, and they also differ between two runs of the same build (before against before, polish against polish), so the polish changes no pixel (the skip link is off screen until focused). `design-after/` was not regenerated.
- Not refreshed: the other live-testnet screens from the QA stage (`desktop-*`, `mobile-*`, `home-before-*`, `home-after-*`, `hebrew-rtl-before-after.png`, `wallet-*`) show the earlier design; `evidence/qa.md` cites them as QA evidence. This stage's live-testnet tour screens stayed in scratch space.

Documents: `README.md` (the smoke paragraph now quotes the 20.2 s polish run in `smoke.txt`) and `evidence/qa.md` (two parentheticals and one note saying that the smoke files hold the design-stage and polish re-runs) are tracked. `HANDOFF.md` and `SUBMISSION.md` are gitignored and were edited in place (smoke counts and timings only). No claim in README.md, SUBMISSION.md or the video brief quotes a changed UI word (see "UI words changed").

Reproduce: `bash evidence/design-scripts/build-mock.sh HEAD|worktree <out>` builds the stub-backed app; `node evidence/design-scripts/shoot.mjs <dist> <out> [ids]` takes the screens (`A11Y=1` adds the label, focus-ring and rendered-contrast audit, `TEXT=1` writes the visible words); `node evidence/design-scripts/keyboard.mjs <dist> chromium|firefox`; `node evidence/design-scripts/contrast.mjs` (exits 1 on a failing pair or when the token block above drifts from `src/style.css`).

NOT VERIFIED:

- Motion (the pulsing dot on "Live", bar and chip transitions) was not watched in a recording. Every screenshot is taken with `prefers-reduced-motion: reduce`; the motion lives in one reduced-motion block and short (120 and 200 ms) transitions in `src/style.css`.
- No screen reader was run. Labels, accessible names, headings, `lang`, titles and the flow diagram's `role="img"` text were checked programmatically only; so was the announcement of the `h1` after a route change and the skip link.
- The 400 ms wait that `smoke.ts` now makes before the live-tip screenshot was type-checked but not run live (the RPC budget of the polish was spent), and `smoke-subpath.txt` comes from one script revision earlier (same 23 assertions).
- Safari and WebKit, Windows forced-colors mode and a real phone were not tested; "mobile" is Chromium emulation (390x844, DPR 2, touch). Firefox was tested on desktop only.
- Contrast of disabled buttons (WCAG exempts them).
