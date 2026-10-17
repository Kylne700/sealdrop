// Fix stage 8: QA W's Lows (briefs/sealdrop-fix-8.md). House style: source and CSS checks plus unit tests of what the pages call.
// The browser measurements (W-2 to W-6, Chromium and WebKit, before and after) are in evidence/fix-8/.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY_BLOCKED, copyButton } from '../src/ui/dom'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/newsroom.ts')
const home = read('../src/pages/home.ts')
const css = read('../src/style.css')

/** The text inside every `@media (pointer: coarse) { ... }` block of style.css, and the stylesheet without those blocks. */
function splitCoarse(sheet: string) {
  const open = '@media (pointer: coarse) {'
  let inside = '', outside = sheet
  for (let at = outside.indexOf(open); at !== -1; at = outside.indexOf(open)) {
    let depth = 1, end = at + open.length
    while (depth > 0 && end < outside.length) depth += outside[end] === '{' ? 1 : outside[end] === '}' ? -1 : 0, end++
    inside += outside.slice(at + open.length, end - 1) + '\n'
    outside = outside.slice(0, at) + outside.slice(end)
  }
  return { inside, outside }
}
const { inside: touch, outside: mouse } = splitCoarse(css)

/** Just enough of an element for h() and copyButton(): no DOM library is installed. */
class FakeEl {
  className = ''
  textContent = ''
  attrs: Record<string, string> = {}
  kids: unknown[] = []
  click: () => Promise<void> = async () => {}
  setAttribute(k: string, v: string) { this.attrs[k] = v }
  addEventListener(_type: string, fn: () => Promise<void>) { this.click = fn }
  append(...c: unknown[]) { for (const x of c) { this.kids.push(x); if (typeof x === 'string') this.textContent += x } }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('W-5: the copy button keeps its width and the row beside it keeps its place', () => {
  const LABEL = 'Copy inbox link'
  const make = (writeText: (s: string) => Promise<void>) => {
    vi.useFakeTimers()
    vi.stubGlobal('document', { createElement: () => new FakeEl() })
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const button = copyButton(() => 'https://example.test/#/send/0x1', LABEL, 'big') as unknown as FakeEl
    return { button, label: button.kids[0] as FakeEl }
  }

  it('puts the label in a span, hands the first label to the stylesheet and keeps the class it was given', () => {
    const { button, label } = make(async () => {})
    expect(button.className).toBe('big copy')
    expect(button.attrs['data-label']).toBe(LABEL)
    expect(label.textContent).toBe(LABEL)
    expect(button.kids).toHaveLength(1)
  })
  it('says "Copied ✓" in the span for 1.8 s, then goes back; the span stays the only child', async () => {
    const writeText = vi.fn(async () => {})
    const { button, label } = make(writeText)
    await button.click()
    expect(writeText).toHaveBeenCalledWith('https://example.test/#/send/0x1')
    expect(label.textContent).toBe('Copied ✓')
    vi.advanceTimersByTime(1799)
    expect(label.textContent).toBe('Copied ✓')
    vi.advanceTimersByTime(1)
    expect(label.textContent).toBe(LABEL)
    expect(button.textContent).toBe('') // a write to the button itself would replace the span and lose the sizer's partner
    expect(button.kids).toHaveLength(1)
  })
  it('a blocked clipboard shows the shorter fallback, then goes back', async () => {
    const { button, label } = make(async () => { throw new Error('NotAllowedError') })
    await button.click()
    expect(label.textContent).toBe(COPY_BLOCKED)
    vi.advanceTimersByTime(1800)
    expect(label.textContent).toBe(LABEL)
    expect(button.textContent).toBe('')
  })
  it('no clipboard API at all (an insecure page) takes the same fallback', async () => {
    const { button, label } = make(async () => {})
    vi.stubGlobal('navigator', {})
    await button.click()
    expect(label.textContent).toBe(COPY_BLOCKED)
  })
  it('the fallback is shorter than the label of the console link button, and it still says what to do', () => {
    expect(COPY_BLOCKED.length).toBeLessThan(LABEL.length)
    expect(COPY_BLOCKED).toMatch(/copy/i)
    expect(page).toContain(`copyButton(() => url, '${LABEL}', 'big')`)
  })
  it('the stylesheet gives every .copy button an invisible copy of its label in the same grid cell', () => {
    expect(css).toMatch(/button\.copy \{ display: inline-grid; place-items: center; \}/)
    expect(css).toMatch(/button\.copy > span, button\.copy::after \{ grid-area: 1 \/ 1; \}/)
    // the plain declaration first, then the one with empty alternative text so the copy stays out of the accessible name
    expect(css).toMatch(/button\.copy::after \{ content: attr\(data-label\); content: attr\(data-label\) \/ ''; height: 0; overflow: hidden; visibility: hidden; \}/)
  })
})

describe('W-2: nothing inside a details sticks out of its box', () => {
  it('the inset is the details padding, not a side margin on every child (which pushed a width: 100% field out by 15px)', () => {
    expect(css).not.toMatch(/details > :not\(summary\) \{[^}]*margin-inline/)
    expect(css).toMatch(/\ndetails \{ padding-inline: var\(--s-3\);/)
    expect(css).toMatch(/details > summary \{ margin-inline: calc\(-1 \* var\(--s-3\)\); \}/) // the summary keeps the full width of the box
  })
})

describe('W-3 and W-4: touch only', () => {
  it('read-only fields and the key-file field compute 16px on touch', () => {
    expect(touch).toMatch(/input\[readonly\], input\[type='file'\] \{ font-size: 1rem; \}/)
  })
  it('the mouse sizes are the ones before: 13px mono read-only fields, 15px file field', () => {
    expect(mouse).toMatch(/input\[readonly\] \{[^}]*font: var\(--fs-0\) \/ 1\.4 var\(--font-mono\)/)
    expect(mouse).toMatch(/input\[type='file'\] \{ padding: 0\.5rem 0\.75rem; font-size: var\(--fs-1\); \}/)
  })
  it('standalone links are 44px tall on touch: home, hex values, the Data Explorer link and the faucet link', () => {
    expect(touch).toMatch(/\.quiet-links a, \.tip \.hint > a, \.me dd > a, a\.hex-v \{ display: inline-flex; align-items: center; min-height: 44px; \}/)
    expect(touch).toMatch(/\.quiet-links \{ align-items: center; \}/)
  })
  it('no mouse rule gives a link a height', () => {
    expect(mouse).not.toMatch(/\.quiet-links a[^{]*\{[^}]*min-height/)
    expect(mouse).not.toMatch(/a\.hex-v[^{]*\{[^}]*min-height/)
    expect(mouse).not.toMatch(/\.me dd > a/)
  })
  it('the links the rule names exist where it expects them', () => {
    expect(home).toMatch(/h\('p', \{ class: 'quiet-links' \}[^\n]*data-testid': 'open-desk'/)
    expect(page).toMatch(/h\('dd', null, balanceEl, ' ', link\(FAUCET_URL, 'faucet'\)\)/)
    expect(page).toMatch(/h\('p', \{ class: 'hint' \},\n\s*'\$creator '[^]*?link\(entityUrl\(tip\.key\), 'entity on Data Explorer'\)/)
  })
})

describe('W-1 and I-2: words', () => {
  const clause = 'Safari can also delete the keys after 7 days without a visit.'
  it('both key hints say that Safari can delete the keys, right after the sentence about clearing the data', () => {
    const hints = page.match(/if you clear the browser data, or close Tor Browser, the keys are gone and so is the access to every tip\. [^']*'/g) ?? []
    expect(hints).toHaveLength(2)
    for (const hint of hints) expect(hint).toContain(`every tip. ${clause}`)
  })
  it('the console hint still starts the way fix stage 2 pinned it', () => {
    expect(page).toMatch(/Export the key file: if you clear the browser data/)
  })
  it('the home page says the inbox takes longer over Tor', () => {
    expect(home).toContain('and create an inbox (about 15 seconds, longer over Tor).')
  })
})
