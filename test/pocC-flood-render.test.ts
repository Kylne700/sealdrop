// PoC (agent C, C5 tip flood): copy into test/. Fails on 3e4fd45.
// Every new tip (live event, sweep page, burn) calls renderTips, which rebuilds every row, and tipRow re-runs openText
// (nacl.box.open) for every tip (src/pages/newsroom.ts:154-155, 184-193). With 2000 tips, 50 spam handovers blocked the
// main thread for 119.6 s in total (harness: bash /tmp/fq-C/xss/harness/run.sh flood). The repo has no DOM test env, so
// this guards the shape of the fix: add or remove single rows, and cache the plaintext by entity key.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const src = readFileSync(new URL('../src/pages/newsroom.ts', import.meta.url), 'utf8')

describe('newsroom console under a tip flood', () => {
  it('does not rebuild and re-decrypt every row for each new tip', () => {
    expect(src).not.toMatch(/tipList\.replaceChildren\(\.\.\.rows\.map\(/)
  })
})
