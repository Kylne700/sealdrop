// PoC (agent C, C6 storage): copy into test/. Both tests fail on 3e4fd45.
// storage.set (src/store.ts:13-16) swallows a failing setItem and keeps the value in memory only, and saveIdentity says nothing.
// - Quota (setItem throws, getItem works and returns null): get() never reads the memory copy, so "Create a throwaway
//   newsroom" silently does nothing (seen in Chromium by the harness, scenario quota-create-newsroom).
// - Blocked (getItem and setItem both throw): the identity works from memory in this tab, the newsroom can publish its
//   inbox on chain, and a reload loses the keys and with them every tip sealed to that inbox.
import { describe, expect, it, vi } from 'vitest'

const err = (name: string) => Object.assign(new Error(name), { name })

async function storeWith(ls: object) {
  vi.stubGlobal('localStorage', ls)
  vi.resetModules()
  return import('../src/store')
}

describe('saving the newsroom when storage does not work', () => {
  it('quota exceeded: tells the caller the keys were not stored', async () => {
    const s = await storeWith({ getItem: () => null, setItem: () => { throw err('QuotaExceededError') }, removeItem: () => {} })
    expect(() => s.saveIdentity(s.newLocalIdentity())).toThrow() // or: returns false and the page shows a message
    vi.unstubAllGlobals()
  })
  it('storage blocked: does not let a memory-only identity look saved', async () => {
    const blocked = { getItem: () => { throw err('SecurityError') }, setItem: () => { throw err('SecurityError') }, removeItem: () => {} }
    const s = await storeWith(blocked)
    let threw = false
    try { s.saveIdentity(s.newLocalIdentity()) } catch { threw = true }
    const survivesReload = (await storeWith(blocked)).loadIdentity() !== null
    expect(threw || survivesReload).toBe(true) // today: no error, and after a "reload" the keys are gone
    vi.unstubAllGlobals()
  })
})

describe('a stored newsroom that cannot be read (B2)', () => {
  it('is kept under a backup key before a new newsroom overwrites it', async () => {
    const data = new Map<string, string>([['sealdrop:newsroom:v1', '{bad']])
    const s = await storeWith({ getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v) }, removeItem: (k: string) => { data.delete(k) } })
    expect(s.loadIdentity()).toBeNull()
    expect(s.hasUnreadableIdentity()).toBe(true)
    s.saveIdentity(s.newLocalIdentity())
    expect(data.get('sealdrop:newsroom:v1:backup')).toBe('{bad')
    expect(s.loadIdentity()).not.toBeNull()
    vi.unstubAllGlobals()
  })
})
