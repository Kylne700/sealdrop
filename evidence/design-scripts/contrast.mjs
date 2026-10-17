// usage: node evidence/design-scripts/contrast.mjs
// Reads the colour tokens from src/style.css (light :root and the prefers-color-scheme: dark override), computes the WCAG 2.x
// contrast ratio of every pair the UI uses, prints a markdown table (pasted into evidence/design.md) and exits 1 if a pair is
// below its threshold (4.5 text, 3 for borders, focus ring and bar fills). It also checks that the token block in design.md
// still equals the CSS.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const css = readFileSync(join(root, 'src/style.css'), 'utf8')
const doc = readFileSync(join(root, 'evidence/design.md'), 'utf8')

const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2].toLowerCase()]))
const darkAt = css.indexOf('prefers-color-scheme: dark')
const light = tokens(css.slice(css.indexOf(':root'), darkAt))
const dark = { ...light, ...tokens(css.slice(darkAt, css.indexOf('\n}\n', darkAt)).replace(/--shadow[^;]*;/, '')) }

const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
const lum = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

// [foreground, background, needed ratio, where it is used]
const PAIRS = [
  ['ink', 'paper', 4.5, 'body text on the page'],
  ['ink', 'surface', 4.5, 'text in cards, inputs'],
  ['ink', 'surface-2', 4.5, 'hex values, code'],
  ['muted', 'paper', 4.5, 'hints, labels, footer'],
  ['muted', 'surface', 4.5, 'hints in cards'],
  ['muted', 'surface-2', 4.5, 'hints on inset areas'],
  ['accent', 'paper', 4.5, 'links, secondary buttons'],
  ['accent', 'surface', 4.5, 'links and buttons in cards'],
  ['accent', 'surface-2', 4.5, 'hex values that link to the explorer'],
  ['accent-hover', 'paper', 4.5, 'link hover'],
  ['accent-hover', 'surface', 4.5, 'link hover in cards'],
  ['accent', 'accent-soft', 4.5, 'Live / verified chips'],
  ['accent-fg', 'accent', 4.5, 'primary button'],
  ['accent-fg', 'accent-hover', 4.5, 'primary button hover'],
  ['danger', 'paper', 4.5, 'warnings, destructive text'],
  ['danger', 'surface', 4.5, 'warnings in cards'],
  ['danger', 'danger-soft', 4.5, 'error status line, warn chip'],
  ['line-strong', 'paper', 3, 'control borders against the page'],
  ['line-strong', 'surface', 3, 'control borders against the field'],
  ['focus', 'paper', 3, 'focus ring on the page'],
  ['focus', 'surface', 3, 'focus ring in cards'],
  ['accent', 'track', 3, 'bar fill against its track'],
]

let bad = 0
const rows = PAIRS.map(([fg, bg, need, where]) => {
  const l = ratio(light[fg], light[bg]), d = ratio(dark[fg], dark[bg])
  const ok = l >= need && d >= need
  if (!ok) bad++
  return `| ${fg} on ${bg} | ${where} | ${l.toFixed(2)} | ${d.toFixed(2)} | ${need} | ${ok ? 'pass' : 'FAIL'} |`
})
console.log('| Pair | Used for | Light | Dark | Needs | Result |\n|---|---|---|---|---|---|')
console.log(rows.join('\n'))

// design.md must carry the same token values as the CSS (first ```css block of the document).
const block = doc.match(/```css\n([\s\S]*?)\n```/)?.[1] ?? ''
const at = block.indexOf('prefers-color-scheme: dark')
const darkOwn = tokens(css.slice(darkAt, css.indexOf('\n}\n', darkAt)))
const same = (a, b) => Object.keys(a).length > 0 && Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v)
const lightOk = same(tokens(block.slice(0, at)), light), darkOk = same(tokens(block.slice(at)), darkOwn)
console.log(`\ndesign.md token block equals src/style.css: light ${lightOk ? 'yes' : 'NO'}, dark ${darkOk ? 'yes' : 'NO'}`)
if (bad || !lightOk || !darkOk) { console.error(`${bad} pair(s) below threshold or token drift`); process.exit(1) }
