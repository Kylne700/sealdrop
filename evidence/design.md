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
8. Keep every testid and structural selector used by `scripts/smoke.mts`, `evidence/qa-scripts/*`: see "Markup contract".

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
Structure: `.me dd a` (full address as textContent), `[data-testid=send-result] dd a` (0 = Tip entity, 1 = Transaction), the first `.result button` is "Send another", `button.danger`, `details.settings > summary`, `[role=alert], .status.error`, exactly one `a.button` on home, `main`, `h1` containing "anonymous tip line". Text: `Live: listening…` / `Reconnecting…` / `No tips yet.` / `free query budget` / `no demo sender key` / `No browser wallet found.` stay verbatim.

## Contrast

PLACEHOLDER-CONTRAST

## Decisions

- Why the creator address is shown in full on the send page: the "Creator verified ✓" chip says the app checked the link against Arkiv, but a source may also compare the address with one the newsroom published elsewhere; truncation would remove that option. All other hex values are truncated.
- Why `div` bars and not `<meter>`: identical result in Chromium and Firefox without vendor pseudo-elements; the bars are decorative and the text beside them is the accessible value.
- Why a radiogroup for the tip lifetime instead of the `<select>`: four choices (1, 7, 14, 30 days) are better as visible options, and the default (14 days) stays pre-selected. It is a `div[role=radiogroup]`, not a `fieldset`, so the first `fieldset` on the page is still "Send with".
- Design screens were produced with a stubbed data layer (`evidence/design-scripts/`: the page code is the real build, only `src/arkiv.ts` is swapped for a fixed-data module, time is frozen, zero RPC queries). Real-network screens are regenerated by the QA smoke scripts. `src/arkiv.ts` is untouched, so every `#L` anchor in SUBMISSION.md is unchanged.

## UI words changed

PLACEHOLDER-WORDS

## Results

PLACEHOLDER-RESULTS
