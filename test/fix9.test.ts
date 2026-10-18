// Fix stage 9 (briefs/sealdrop-fix-9.md): R5-I2, the copy buttons' reset timers. R5-L1 (the status line after a sweep) lives inside the console page and
// no DOM library is installed, so it is checked in a browser instead: evidence/fix-9/extras-r5.mjs and extras-r5c.mjs (X2a, X2c, X3a).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { COPY_BLOCKED, copyButton, hex } from '../src/ui/dom'

/** Just enough of an element for h(), svg(), copyButton() and hex(): no DOM library is installed. */
class FakeEl {
  className = ''
  textContent = ''
  attrs: Record<string, string> = {}
  kids: unknown[] = []
  click: () => Promise<void> = async () => {}
  setAttribute(k: string, v: string) { this.attrs[k] = v }
  addEventListener(_type: string, fn: () => Promise<void>) { this.click = fn }
  append(...c: unknown[]) { for (const x of c) { this.kids.push(x); if (typeof x === 'string') this.textContent += x } }
  replaceChildren(...c: unknown[]) { this.kids = c }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

const ok = async () => {}
const refused = async () => { throw new Error('NotAllowedError') }
function browser(writeText: () => Promise<void>) {
  vi.useFakeTimers()
  vi.stubGlobal('document', { createElement: () => new FakeEl(), createElementNS: () => new FakeEl() })
  vi.stubGlobal('navigator', { clipboard: { writeText } })
}

describe('R5-I2: a second click on the copy button restarts the 1.8 s reset', () => {
  const LABEL = 'Copy inbox link'
  const make = (writeText: () => Promise<void>) => {
    browser(writeText)
    const button = copyButton(() => 'https://example.test/#/send/0x1', LABEL, 'big') as unknown as FakeEl
    return { button, label: button.kids[0] as FakeEl }
  }
  // Both clicks 1 s apart. The first timer would go back at 1.8 s, 0.8 s into the wait below, so a label that is still shown at 1799 ms proves it was cleared.
  it.each([
    ['"Copied ✓"', ok, 'Copied ✓'],
    ['the blocked-clipboard text', refused, COPY_BLOCKED],
  ])('%s stays until 1.8 s after the second click, then the label goes back', async (_name, writeText, shown) => {
    const { button, label } = make(writeText)
    await button.click()
    expect(label.textContent).toBe(shown)
    vi.advanceTimersByTime(1000)
    await button.click()
    vi.advanceTimersByTime(1799)
    expect(label.textContent).toBe(shown)
    vi.advanceTimersByTime(1)
    expect(label.textContent).toBe(LABEL)
  })
})

describe('R5-I2: a second click on the hex copy button restarts the 1.8 s reset', () => {
  const make = (writeText: () => Promise<void>) => {
    browser(writeText)
    const [, copy, done] = (hex(`0x${'ab'.repeat(20)}`) as unknown as FakeEl).kids as [unknown, FakeEl, FakeEl] // the value, the button, the hidden status
    const shape = () => ((copy.kids[0] as FakeEl).kids.length === 1 ? 'check' : 'copy') // the check icon has one path, the copy icon two
    return { copy, done, shape }
  }
  it.each([
    ['"Copied" and the check icon', ok, 'Copied', 'check'],
    ['the blocked-clipboard text and the copy icon', refused, 'Select and copy manually', 'copy'],
  ])('%s stay until 1.8 s after the second click, then both go back', async (_name, writeText, said, icon) => {
    const { copy, done, shape } = make(writeText)
    await copy.click()
    expect([done.textContent, shape()]).toEqual([said, icon])
    vi.advanceTimersByTime(1000)
    await copy.click()
    vi.advanceTimersByTime(1799)
    expect([done.textContent, shape()]).toEqual([said, icon])
    vi.advanceTimersByTime(1)
    expect([done.textContent, shape()]).toEqual(['', 'copy'])
  })
})
