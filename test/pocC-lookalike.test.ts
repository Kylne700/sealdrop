// PoC (agent C, look-alike inbox UX): copy into test/. Test 2 fails on 3e4fd45.
// An attacker creates their own inbox with the newsroom's name and inbox id and shares
// #/send/<attacker>/<same id>. The link parses, the honest RPC returns the attacker's inbox, and send.ts:46/49
// prints "Creator verified ✓" and "(matches the link you opened)" for it: the check is "the creator is whoever the
// link names", which a look-alike link satisfies by construction. Dynamic evidence: /tmp/fq-C/xss/harness/out/lookalike.png
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSendHash } from '../src/codec'

const ATTACKER = '0x9999999999999999999999999999999999999999'

describe('look-alike send link', () => {
  it('parses as a normal link (nothing marks it as a different creator)', () => {
    expect(parseSendHash(`#/send/${ATTACKER}/the-desk-id`)).not.toBeNull()
  })
  it('does not call an unknown creator "verified"', () => {
    const src = readFileSync(new URL('../src/pages/send.ts', import.meta.url), 'utf8')
    // Fix: reword to what is actually proven, e.g. "Created by the address in this link", plus a hint to compare
    // that address with one the newsroom publishes elsewhere (website, print, social profile).
    expect(src).not.toContain("'Creator verified ✓'")
  })
})
