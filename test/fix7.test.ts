// Fix stage 7: R3's Lows (briefs/sealdrop-fix-7.md). Pages are tested the house way: source checks plus unit tests of what they call;
// the browser runs (mock screens, R3's stale.mjs) are in evidence/fix-7/.
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { explainError } from '../src/arkiv'
import { statusLine } from '../src/ui/dom'

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/newsroom.ts')
const css = read('../src/style.css')

/** Just enough of an element for h() and statusLine(): no DOM library is installed. */
class FakeEl {
  className = ''
  textContent = ''
  attrs: Record<string, string> = {}
  setAttribute(k: string, v: string) { this.attrs[k] = v }
  addEventListener() {}
  append() {}
}
afterEach(() => vi.unstubAllGlobals())

describe('R3-L6: the hidden tip note goes quiet when the status stops showing an error', () => {
  const make = () => {
    vi.stubGlobal('document', { createElement: () => new FakeEl() })
    const note = new FakeEl()
    return { note, status: statusLine('status', note as unknown as HTMLElement) }
  }
  const SAID = 'A new tip just arrived. 1 tip listed.' // what the page puts in the note while an error stays in the status

  it('keeps it while an error shows (885f5b2 behaviour), also across a second error', () => {
    const { note, status } = make()
    status.error('The inbox lease could not be checked or renewed.')
    note.textContent = SAID
    status.error('A second error.')
    expect(note.textContent).toBe(SAID)
  })
  it('empties it for info (Refresh, Keep, Burn, a renewal that worked), busy and clear', () => {
    for (const quiet of [(s: ReturnType<typeof make>['status']) => s.info('1 tip on Arkiv.'), (s: ReturnType<typeof make>['status']) => s.busy('Reading your inbox from Arkiv...'), (s: ReturnType<typeof make>['status']) => s.clear()]) {
      const { note, status } = make()
      status.error('An error.')
      note.textContent = SAID
      quiet(status)
      expect(note.textContent).toBe('')
    }
  })
  it('works without a note, as on the other pages', () => {
    vi.stubGlobal('document', { createElement: () => new FakeEl() })
    const status = statusLine()
    status.error('x')
    status.info('y')
    expect(status.el.textContent).toBe('y')
  })
  it('the console creates the note first and hands it to its status line', () => {
    expect(page).toMatch(/const tipNote = h\('p', \{ class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'tip-note' \}\)[^\n]*\n\s*const status = statusLine\('status', tipNote\)/)
  })
})

describe('R3-L1: a failed lease renewal gives one next step', () => {
  const lease = (e: unknown) => `The inbox lease could not be checked or renewed. ${explainError(e)}`
  const generic = new Error('Transaction failed: Execution error without revert data')
  const http500 = Object.assign(new Error('HTTP request failed.'), { status: 500 })

  it('says "try again" once for the generic failure (state 36 and 41) and for an HTTP 5xx (state 38)', () => {
    for (const e of [generic, http500]) expect(lease(e).match(/try again/gi)?.length).toBe(1)
  })
  it('the page adds no second "tries again" to the lease status or to the link-only paragraph (state 45)', () => {
    expect(page).not.toMatch(/under Lease tries again|Refresh tries again/)
    expect(page).toMatch(/If the inbox exists, this is its link\.'\)/)
  })
})

describe('R3-L3: the newsroom that cannot be read or backed up says what to do', () => {
  it('ends with state 70\'s next step', async () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"v":1', setItem: () => { throw new Error('QuotaExceededError') }, removeItem: () => {} })
    vi.resetModules()
    const store = await import('../src/store')
    const fresh = await import('../src/arkiv') // the module instance store.ts uses after resetModules
    let msg = ''
    try { store.saveIdentity(store.newLocalIdentity()) } catch (e) { msg = fresh.explainError(e) }
    expect(msg).toMatch(/could not be backed up, so it was not replaced\. Allow site data for this page or use another browser, then try again\.$/)
  })
})

describe('R3-I4: the faucet is pointed to one way', () => {
  const sources = ['../src/arkiv.ts', '../src/pages/send.ts', '../src/pages/newsroom.ts'].map(read).join('\n')
  it('every text that names the faucet URL says "the Arkiv faucet (URL)", and none uses the old forms', () => {
    const mentions = sources.match(/[^\n]*\$\{FAUCET_URL\}[^\n]*/g) ?? []
    expect(mentions.length).toBeGreaterThanOrEqual(5) // arkiv.ts (wallet out of GLM), newsroom.ts x3, send.ts (demo key out of GLM)
    for (const m of mentions) expect(m).toMatch(/the Arkiv faucet \(\$\{FAUCET_URL\}\)/)
    expect(sources).not.toMatch(/no testnet GLM left|from the faucet at|testnet faucet:|Get some at \$\{FAUCET_URL\}/)
  })
  it('a wallet that is out of GLM gets the same sentence in the console as from explainError', () => {
    expect(read('../src/arkiv.ts')).toMatch(/`This wallet has too little testnet GLM\. Get some at the Arkiv faucet \(\$\{FAUCET_URL\}\)\.`/)
    expect(page).toMatch(/`This wallet has too little testnet GLM\. Get some at the Arkiv faucet \(\$\{FAUCET_URL\}\), then try again\.`/)
  })
})

describe('R3-L2, R3-L4, R3-L5: layout (source checks; the pictures and measures are in evidence/fix-7/)', () => {
  it('L2: the label stays; the cards are at least 17rem wide and a lone last card spans the row', () => {
    expect(page).toContain("'Create a throwaway newsroom'")
    expect(css).toMatch(/\.cards \{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(min\(17rem, 100%\), 1fr\)\);/)
    expect(css).toMatch(/\.cards > \.card:last-child:nth-child\(odd\) \{ grid-column: 1 \/ -1; \}/)
  })
  it('L4: the no-JS notice has room above the footer rule', () => {
    expect(css).toMatch(/\.nojs \{ padding-bottom: var\(--s-4\); \}/)
  })
  it('L5: a summary label has vertical padding, like buttons since fix 6', () => {
    expect(css).toMatch(/summary \{[^}]*min-height: 44px; padding: var\(--s-2\) var\(--s-3\);/)
  })
})

describe('R2-S3: a failed Keep or Burn says so inside its row (source checks; the browser run is evidence/fix-7/row-note.mjs)', () => {
  it('every own tip row carries a hidden plain-text note, not a live region (the status already announces)', () => {
    expect(page).toMatch(/mine \? h\('p', \{ class: 'warn-text', 'data-testid': 'tip-action-error', hidden: true \}\) : null,/)
    expect(page).not.toMatch(/tip-action-error'[^\n]*(role|aria-live)/)
    expect(css).toMatch(/\.warn-text \{[^}]*overflow-wrap: anywhere;/) // the unknown-outcome text carries a 66-character hash
  })
  it('a failed Keep or Burn writes the action and the status text into its row; the next action on that row clears it', () => {
    expect(page).toMatch(/rowError\(tip, `\$\{did\} \$\{mayHaveBeenSent\(e\) \? 'may not have completed' : 'did not complete'\}\. \$\{why\}`\)\n\s*return status\.error\(why\)/)
    expect(page).toMatch(/actionFailed\(tip, e, 'Burn'\)/)
    expect(page).toMatch(/actionFailed\(tip, e, 'Keep'\)/)
    expect(page).toMatch(/async function pin\(tip: TipView\) \{\n\s*rowError\(tip\)/)
    expect(page).toMatch(/Arkiv deletes the entity[^\n]*\) return\n\s*rowError\(tip\) \/\/ the next action on this row clears its last failure\n\s*try \{/)
    expect(page).toMatch(/note\.textContent = text\n\s*note\.hidden = !text/)
  })
  it('a tip that is gone from Arkiv still drops its row with an info status, with no note', () => {
    expect(page).toMatch(/dropTip\(tip\.key\)\n\s*status\.info\('This tip is no longer on Arkiv: it expired, or it was burned already\.'\)/)
  })
})
